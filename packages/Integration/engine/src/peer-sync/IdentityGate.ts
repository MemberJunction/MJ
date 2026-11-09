import { IMetadataProvider, IRunViewProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type { ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap } from '../entity-types.js';
import { MatchEngine, ParseMatchStrategy } from '../MatchEngine.js';
import type { MappedRecord } from '../types.js';
import type {
    CoalescedRecordChange,
    IPeerSyncDuplicateCandidateFinder,
    PeerIdentityResolution,
} from './types.js';

/**
 * Options for resolving a single inbound record's identity on the local MJ peer.
 */
export interface PeerIdentityResolveOptions {
    /** Local `CompanyIntegration.ID` for this peer pairing. */
    CompanyIntegrationID: string;
    /** Entity ID on the local MJ instance. */
    EntityID: string;
    /** Entity name on the local MJ instance. */
    EntityName: string;
    /** Primary key field name on the local MJ entity (typically `'ID'`). */
    PrimaryKeyFieldName: string;
    /** Inbound coalesced change from the remote peer. */
    Change: CoalescedRecordChange;
    /** Mapped field values keyed by local destination field name. */
    DestinationValues: Record<string, string | number | boolean | null>;
    /** Active field maps for this entity map (used for `IsKeyField` matching). */
    FieldMaps: ICompanyIntegrationFieldMap[];
    /** Optional entity map configuration on the local MJ instance. */
    EntityMap?: ICompanyIntegrationEntityMap;
    /** JSON string from `CompanyIntegrationEntityMap.MatchStrategy` (nullable). */
    MatchStrategyJSON: string | null;
    /** Pre-loaded `SourceRecordID -> DestinationRecordID` lookup map (keys normalized via `NormalizeUUID`). */
    RecordMapLookup: Map<string, string>;
    /** Whether to check primary key presence on the local entity when `'PrimaryKey'` is in cascade. */
    PreservePrimaryKeys: boolean;
    /** Duplicate score threshold at or above which an inbound record is auto-linked (default `0.92`). */
    DuplicateThreshold: number;
    /** Duplicate score threshold at or above which an inbound record is quarantined for review (default `0.75`). */
    PotentialMatchThreshold: number;
    /** Optional duplicate candidate finder (vector similarity over `MJ: Duplicate Runs` / `EntityVectorSyncer`). */
    DuplicateFinder?: IPeerSyncDuplicateCandidateFinder;
    /** Optional EntityDocumentID for duplicate detection. */
    EntityDocumentID?: string;
    /** Context user for server-side queries. */
    ContextUser: UserInfo;
    /** Optional metadata provider override for testing. */
    MetadataProvider?: IMetadataProvider;
    /** Optional RunView provider override for testing. */
    RunViewProvider?: IRunViewProvider;
}

/**
 * Implements the 5-step Hybrid Identity Gate for inbound MJ Peer Sync records:
 *
 * 1. `CompanyIntegrationRecordMap` lookup (fast path for previously linked records)
 * 2. Primary Key match (when `PreservePrimaryKeys` is enabled)
 * 3. Deterministic `IsKeyField` match via `MatchEngine` (with `AmbiguousMatch` quarantine)
 * 4. Semantic vector duplicate detection via `IPeerSyncDuplicateCandidateFinder`
 *    (`>= DuplicateThreshold` auto-links; `[PotentialMatchThreshold, DuplicateThreshold)` quarantines)
 * 5. `CreateNew` (preserving source UUID when `PreservePrimaryKeys` is true)
 */
export class PeerIdentityGate {
    private readonly matchEngine = new MatchEngine();

    /**
     * Resolves the local identity of an inbound record change through the 5-step cascade.
     */
    public async ResolveIdentity(options: PeerIdentityResolveOptions): Promise<PeerIdentityResolution> {
        const normSourceID = NormalizeUUID(options.Change.SourceRecordID);

        // Step 1: CompanyIntegrationRecordMap fast path
        const mappedLocalID = options.RecordMapLookup.get(normSourceID);
        if (mappedLocalID) {
            return {
                Outcome: 'Matched',
                MatchedBy: 'RecordMap',
                LocalRecordID: mappedLocalID,
                SimilarityScore: 1.0,
                CandidateIDs: [mappedLocalID],
                QuarantineReason: null,
            };
        }

        // Parse configured MatchStrategy (supports both Mode and optional Cascade array)
        const parsedStrategy = ParseMatchStrategy(options.MatchStrategyJSON);
        const duplicateThreshold = parsedStrategy.DuplicateThreshold ?? options.DuplicateThreshold ?? 0.92;
        const potentialThreshold = parsedStrategy.PotentialMatchThreshold ?? options.PotentialMatchThreshold ?? 0.75;
        const onAmbiguous =
            options.MatchStrategyJSON && options.MatchStrategyJSON.trim().length > 0
                ? parsedStrategy.OnAmbiguousMatch
                : 'SkipAndQuarantine';

        const cascade = this.buildCascade(
            parsedStrategy.Mode,
            options.PreservePrimaryKeys,
            Boolean(options.DuplicateFinder)
        );

        for (const step of cascade) {
            if (step === 'RecordMap') {
                continue;
            }

            if (step === 'PrimaryKey') {
                const pkMatch = await this.tryMatchByPrimaryKey(options);
                if (pkMatch) {
                    return pkMatch;
                }
                continue;
            }

            if (step === 'KeyFields') {
                const keyMatch = await this.tryMatchByKeyFields(options, onAmbiguous);
                if (keyMatch) {
                    return keyMatch;
                }
                continue;
            }

            if (step === 'DuplicateDetection') {
                const dupeMatch = await this.tryMatchByDuplicateDetection(
                    options,
                    duplicateThreshold,
                    potentialThreshold,
                    parsedStrategy.EntityDocumentID ?? options.EntityDocumentID
                );
                if (dupeMatch) {
                    return dupeMatch;
                }
                continue;
            }
        }

        // Step 5: CreateNew
        return {
            Outcome: 'CreateNew',
            MatchedBy: 'NewRecord',
            LocalRecordID: null,
            SimilarityScore: null,
            CandidateIDs: [],
            QuarantineReason: null,
        };
    }

    private buildCascade(
        mode: 'KeyFields' | 'DuplicateDetection' | 'Hybrid',
        preservePKs: boolean,
        hasDuplicateFinder: boolean
    ): Array<'RecordMap' | 'PrimaryKey' | 'KeyFields' | 'DuplicateDetection' | 'NewRecord'> {
        const steps: Array<'RecordMap' | 'PrimaryKey' | 'KeyFields' | 'DuplicateDetection' | 'NewRecord'> = [
            'RecordMap',
        ];
        if (preservePKs) {
            steps.push('PrimaryKey');
        }
        if (mode === 'KeyFields' || mode === 'Hybrid') {
            steps.push('KeyFields');
        }
        if ((mode === 'DuplicateDetection' || mode === 'Hybrid' || hasDuplicateFinder) && hasDuplicateFinder) {
            steps.push('DuplicateDetection');
        }
        steps.push('NewRecord');
        return steps;
    }

    private async tryMatchByPrimaryKey(
        options: PeerIdentityResolveOptions
    ): Promise<PeerIdentityResolution | null> {
        const sourceID = options.Change.SourceRecordID;
        if (!sourceID) return null;

        const rv = new RunView(options.RunViewProvider ?? null);
        const pkField = options.PrimaryKeyFieldName || 'ID';
        const escapedID = sourceID.replace(/'/g, "''");

        const result = await rv.RunView<Record<string, string | number | boolean | null>>({
            EntityName: options.EntityName,
            ExtraFilter: `${pkField} = '${escapedID}'`,
            Fields: [pkField],
            MaxRows: 1,
            ResultType: 'simple',
        }, options.ContextUser);

        if (result.Success && result.Results.length > 0) {
            const matchedID = String(result.Results[0][pkField] ?? sourceID);
            return {
                Outcome: 'Matched',
                MatchedBy: 'PrimaryKey',
                LocalRecordID: matchedID,
                SimilarityScore: 1.0,
                CandidateIDs: [matchedID],
                QuarantineReason: null,
            };
        }

        return null;
    }

    private async tryMatchByKeyFields(
        options: PeerIdentityResolveOptions,
        onAmbiguous: 'SkipAndQuarantine' | 'FirstMatch' | 'PickHighestScore'
    ): Promise<PeerIdentityResolution | null> {
        const hasKeyFields = options.FieldMaps.some(
            fm => fm.IsKeyField && fm.Status === 'Active'
        );
        if (!hasKeyFields) return null;

        const mappedRecord: MappedRecord = {
            ExternalRecord: {
                ExternalID: options.Change.SourceRecordID,
                ObjectType: options.EntityName,
                Fields: options.Change.RecordData,
                IsDeleted: options.Change.Operation === 'Delete',
            },
            MJEntityName: options.EntityName,
            MappedFields: options.DestinationValues,
            ChangeType: options.Change.Operation === 'Delete' ? 'Delete' : 'Create',
        };

        const syntheticEntityMap: ICompanyIntegrationEntityMap = options.EntityMap ?? {
            ID: 'peer-sync-entity-map',
            CompanyIntegrationID: options.CompanyIntegrationID,
            ExternalObjectName: options.EntityName,
            ExternalObjectLabel: options.EntityName,
            EntityID: options.EntityID,
            SyncDirection: 'Bidirectional',
            SyncEnabled: true,
            MatchStrategy:
                options.MatchStrategyJSON ??
                JSON.stringify({ Mode: 'Hybrid', OnAmbiguousMatch: onAmbiguous }),
            ConflictResolution: 'SourceWins',
            Priority: 1,
            DeleteBehavior: 'SoftDelete',
            Status: 'Active',
            Configuration: null,
            Entity: options.EntityName,
            Get: () => null,
        };

        const resolvedBatch = await this.matchEngine.Resolve(
            [mappedRecord],
            syntheticEntityMap,
            options.FieldMaps,
            options.ContextUser,
            options.MetadataProvider ?? Metadata.Provider
        );

        const resolved = resolvedBatch[0];
        if (!resolved) return null;

        if (resolved.AmbiguousMatch && onAmbiguous === 'SkipAndQuarantine') {
            const candidateIDs = resolved.AmbiguousCandidateIDs ?? [];
            return {
                Outcome: 'Quarantined',
                MatchedBy: 'AmbiguousKey',
                LocalRecordID: null,
                SimilarityScore: null,
                CandidateIDs: candidateIDs,
                QuarantineReason:
                    `Ambiguous key-field match on '${options.EntityName}' for source record ` +
                    `'${options.Change.SourceRecordID}': ${candidateIDs.length} local candidates (${candidateIDs.join(', ')})`,
            };
        }

        if (resolved.MatchedMJRecordID) {
            return {
                Outcome: 'Matched',
                MatchedBy: 'KeyFields',
                LocalRecordID: resolved.MatchedMJRecordID,
                SimilarityScore: 1.0,
                CandidateIDs: [resolved.MatchedMJRecordID],
                QuarantineReason: null,
            };
        }

        return null;
    }

    private async tryMatchByDuplicateDetection(
        options: PeerIdentityResolveOptions,
        duplicateThreshold: number,
        potentialThreshold: number,
        entityDocumentID?: string | null
    ): Promise<PeerIdentityResolution | null> {
        if (!options.DuplicateFinder || options.Change.Operation === 'Delete') {
            return null;
        }

        const candidates = await options.DuplicateFinder.FindCandidatesForValues(
            options.EntityName,
            options.DestinationValues,
            options.ContextUser,
            {
                PotentialMatchThreshold: potentialThreshold,
                AbsoluteMatchThreshold: duplicateThreshold,
                EntityDocumentID: entityDocumentID ?? undefined,
                TopK: 5,
            }
        );

        if (candidates.length === 0) {
            return null;
        }

        const sorted = [...candidates].sort((a, b) => b.ProbabilityScore - a.ProbabilityScore);
        const top = sorted[0];

        if (top.ProbabilityScore >= duplicateThreshold) {
            return {
                Outcome: 'Matched',
                MatchedBy: 'DuplicateDetection',
                LocalRecordID: top.RecordID,
                SimilarityScore: top.ProbabilityScore,
                CandidateIDs: sorted.map(c => c.RecordID),
                QuarantineReason: null,
            };
        }

        if (top.ProbabilityScore >= potentialThreshold) {
            return {
                Outcome: 'Quarantined',
                MatchedBy: 'DuplicateDetection',
                LocalRecordID: null,
                SimilarityScore: top.ProbabilityScore,
                CandidateIDs: sorted.map(c => c.RecordID),
                QuarantineReason:
                    `Potential duplicate detected on '${options.EntityName}' for source record ` +
                    `'${options.Change.SourceRecordID}' (top score ${top.ProbabilityScore.toFixed(3)} in ` +
                    `[${potentialThreshold}, ${duplicateThreshold}); candidate=${top.RecordID})`,
            };
        }

        return null;
    }
}
