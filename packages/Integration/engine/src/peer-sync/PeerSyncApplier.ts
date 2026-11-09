import {
    BaseEntity,
    CompositeKey,
    EntityInfo,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import type { MJCompanyIntegrationRecordMapEntity } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap } from '../entity-types.js';
import { ComputeThreeWayFieldMerge } from '../ThreeWayMerge.js';
import type { ThreeWayFieldMapping } from '../ThreeWayMerge.js';
import { PeerIdentityGate } from './IdentityGate.js';
import { OrderChangesBySelfReference } from './ChangeSetPlanner.js';
import type {
    CoalescedRecordChange,
    IPeerSyncDuplicateCandidateFinder,
    IPeerSyncVectorIndexer,
    PeerApplyBatchRequest,
    PeerApplyBatchResponse,
    PeerApplyRecordResult,
    PeerDeferredFKUpdate,
} from './types.js';

/**
 * Options for applying an inbound Peer Sync batch on the local MJ instance.
 */
export interface PeerSyncApplyContext {
    /** Local `CompanyIntegration.ID` for this peer pairing. */
    CompanyIntegrationID: string;
    /** Local entity map configuration for the entity being synced (optional when applying via direct RPC). */
    EntityMap?: ICompanyIntegrationEntityMap;
    /** Active field maps for this entity map (optional; defaults to 1:1 same-name field mapping). */
    FieldMaps?: ICompanyIntegrationFieldMap[];
    /** Nullable FK field names on this entity that should be deferred to Pass 2 if unmapped in Pass 1. */
    DeferredFieldNames?: string[];
    /** Whether to preserve source UUID primary keys on new record creation. */
    PreservePrimaryKeys: boolean;
    /** Duplicate score threshold for automatic record linking (default `0.92`). */
    DuplicateThreshold: number;
    /** Duplicate score threshold for quarantining ambiguous matches (default `0.75`). */
    PotentialMatchThreshold: number;
    /** Optional duplicate candidate finder. */
    DuplicateFinder?: IPeerSyncDuplicateCandidateFinder;
    /** Optional incremental vector indexer called after batch apply. */
    VectorIndexer?: IPeerSyncVectorIndexer;
    /** Context user for server-side database operations. */
    ContextUser: UserInfo;
    /** Optional metadata provider override for testing. */
    MetadataProvider?: IMetadataProvider;
    /** Optional RunView provider override for testing. */
    RunViewProvider?: IRunViewProvider;
}

/**
 * Applies inbound `PeerApplyBatchRequest` batches onto the local MJ instance with:
 * - 5-step Hybrid Identity Gate (`RecordMap` -> `PrimaryKey` -> `KeyFields` -> `DuplicateDetection` -> `NewRecord`)
 * - Foreign key translation across `CompanyIntegrationRecordMap`
 * - Two-pass nullable FK cycle breaking (defers unresolved nullable FKs in Pass 1, populates in Pass 2)
 * - Field-level 3-way merge (`ComputeThreeWayFieldMerge` in `'destination'` mode)
 * - `entity.SetSyncContext(...)` provenance tagging (`RecordChange.Source = 'Sync'`) to prevent echo loops
 * - Post-batch incremental vector indexing via `IPeerSyncVectorIndexer.VectorizeRecords`
 */
export class PeerSyncApplier {
    private readonly identityGate = new PeerIdentityGate();

    /**
     * Applies a batch of coalesced changes for a single entity on the local MJ peer.
     */
    public async ApplyBatch(
        request: PeerApplyBatchRequest,
        context: PeerSyncApplyContext
    ): Promise<{
        Response: PeerApplyBatchResponse;
        DeferredFKUpdates: PeerDeferredFKUpdate[];
    }> {
        const md = context.MetadataProvider ?? Metadata.Provider;
        const entityInfo = md.Entities.find(
            e => e.Name.toLowerCase() === request.EntityName.toLowerCase()
        );
        if (!entityInfo) {
            throw new Error(`Entity '${request.EntityName}' not found in local MemberJunction metadata.`);
        }

        const pkFieldName = entityInfo.FirstPrimaryKey?.Name ?? 'ID'; // first-pk-ok: Peer Sync target entities use single-column UUID primary keys
        const selfRefFields = entityInfo.Fields
            .filter(f => f.RelatedEntityID && UUIDsEqual(f.RelatedEntityID, entityInfo.ID))
            .map(f => f.Name);

        const orderedChanges = OrderChangesBySelfReference(
            request.Changes,
            pkFieldName,
            selfRefFields
        );

        const recordMapLookup = await this.loadEntityRecordMapLookup(
            context.CompanyIntegrationID,
            entityInfo.ID,
            context.ContextUser,
            context.RunViewProvider
        );

        const fkTargetEntityLookup = await this.loadRelatedEntityRecordMaps(
            context.CompanyIntegrationID,
            entityInfo,
            context.ContextUser,
            md,
            context.RunViewProvider
        );

        const fieldMaps = context.FieldMaps ?? this.buildDefaultFieldMaps(entityInfo);
        const deferredFieldSet = new Set<string>(
            (context.DeferredFieldNames ?? []).map(n => n.toLowerCase())
        );

        const results: PeerApplyRecordResult[] = [];
        const deferredFKUpdates: PeerDeferredFKUpdate[] = [];
        const touchedLocalRecordIDs: string[] = [];

        let createdCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;
        let skippedCount = 0;
        let quarantinedCount = 0;
        let conflictCount = 0;
        let errorCount = 0;

        for (const change of orderedChanges) {
            try {
                const { destinationValues, deferredForRecord } = this.mapAndTranslateFields(
                    change,
                    entityInfo,
                    fieldMaps,
                    recordMapLookup,
                    fkTargetEntityLookup,
                    deferredFieldSet
                );

                const resolution = await this.identityGate.ResolveIdentity({
                    CompanyIntegrationID: context.CompanyIntegrationID,
                    EntityID: entityInfo.ID,
                    EntityName: entityInfo.Name,
                    PrimaryKeyFieldName: pkFieldName,
                    Change: change,
                    DestinationValues: destinationValues,
                    FieldMaps: fieldMaps,
                    EntityMap: context.EntityMap,
                    MatchStrategyJSON: context.EntityMap?.MatchStrategy ?? null,
                    RecordMapLookup: recordMapLookup,
                    PreservePrimaryKeys: context.PreservePrimaryKeys,
                    DuplicateThreshold: context.DuplicateThreshold,
                    PotentialMatchThreshold: context.PotentialMatchThreshold,
                    DuplicateFinder: context.DuplicateFinder,
                    ContextUser: context.ContextUser,
                    MetadataProvider: md,
                    RunViewProvider: context.RunViewProvider,
                });

                if (resolution.Outcome === 'Quarantined') {
                    quarantinedCount++;
                    results.push({
                        SourceRecordID: change.SourceRecordID,
                        DestinationRecordID: null,
                        Status: 'Quarantined',
                        MatchedBy: resolution.MatchedBy,
                        ErrorMessage: resolution.QuarantineReason,
                        ConflictingFields: [],
                    });
                    continue;
                }

                if (change.Operation === 'Delete') {
                    const deleteResult = await this.applyDelete(
                        change,
                        resolution.LocalRecordID,
                        entityInfo,
                        pkFieldName,
                        request,
                        context,
                        md
                    );
                    if (deleteResult.Status === 'Deleted') deletedCount++;
                    else if (deleteResult.Status === 'Skipped') skippedCount++;
                    else errorCount++;
                    results.push(deleteResult);
                    continue;
                }

                const upsertResult = await this.applyUpsert(
                    change,
                    destinationValues,
                    resolution,
                    entityInfo,
                    pkFieldName,
                    fieldMaps,
                    request,
                    context,
                    md,
                    recordMapLookup
                );

                if (upsertResult.Status === 'Created') {
                    createdCount++;
                    if (upsertResult.DestinationRecordID) {
                        touchedLocalRecordIDs.push(upsertResult.DestinationRecordID);
                    }
                } else if (upsertResult.Status === 'Updated') {
                    updatedCount++;
                    if (upsertResult.DestinationRecordID) {
                        touchedLocalRecordIDs.push(upsertResult.DestinationRecordID);
                    }
                } else if (upsertResult.Status === 'Skipped') {
                    skippedCount++;
                } else if (upsertResult.Status === 'Conflict') {
                    conflictCount++;
                } else if (upsertResult.Status === 'Quarantined') {
                    quarantinedCount++;
                } else {
                    errorCount++;
                }

                if (
                    upsertResult.DestinationRecordID &&
                    deferredForRecord.length > 0 &&
                    (upsertResult.Status === 'Created' || upsertResult.Status === 'Updated')
                ) {
                    for (const def of deferredForRecord) {
                        deferredFKUpdates.push({
                            EntityName: entityInfo.Name,
                            LocalRecordID: upsertResult.DestinationRecordID,
                            SourceRecordID: change.SourceRecordID,
                            FieldName: def.fieldName,
                            RelatedEntityID: def.relatedEntityID,
                            SourceForeignKeyValue: def.sourceFKValue,
                        });
                    }
                }

                results.push(upsertResult);
            } catch (err) {
                errorCount++;
                const msg = err instanceof Error ? err.message : String(err);
                results.push({
                    SourceRecordID: change.SourceRecordID,
                    DestinationRecordID: null,
                    Status: 'Error',
                    MatchedBy: null,
                    ErrorMessage: msg,
                    ConflictingFields: [],
                });
            }
        }

        // Trigger incremental vector re-indexing for newly created/updated records
        if (context.VectorIndexer && touchedLocalRecordIDs.length > 0) {
            await context.VectorIndexer.VectorizeRecords(
                entityInfo.ID,
                touchedLocalRecordIDs,
                context.ContextUser
            );
        }

        return {
            Response: {
                PairingID: request.PairingID,
                EntityName: entityInfo.Name,
                Results: results,
                CreatedCount: createdCount,
                UpdatedCount: updatedCount,
                DeletedCount: deletedCount,
                SkippedCount: skippedCount,
                QuarantinedCount: quarantinedCount,
                ConflictCount: conflictCount,
                ErrorCount: errorCount,
            },
            DeferredFKUpdates: deferredFKUpdates,
        };
    }

    /**
     * Pass 2 of Two-Pass Nullable FK Cycle Breaking: populates deferred nullable
     * foreign keys after all entities in the strongly connected component have
     * completed Pass 1 and populated their `CompanyIntegrationRecordMap` entries.
     */
    public async ApplyDeferredForeignKeys(
        deferredUpdates: PeerDeferredFKUpdate[],
        requestMeta: {
            PairingID: string;
            OriginInstanceID: string;
            RunID: string;
        },
        context: PeerSyncApplyContext
    ): Promise<number> {
        if (deferredUpdates.length === 0) return 0;

        const md = context.MetadataProvider ?? Metadata.Provider;
        let updatedCount = 0;

        // Group lookups by RelatedEntityID
        const mapByRelatedEntity = new Map<string, Map<string, string>>();
        for (const item of deferredUpdates) {
            const normEntityID = NormalizeUUID(item.RelatedEntityID);
            if (!mapByRelatedEntity.has(normEntityID)) {
                const lookup = await this.loadEntityRecordMapLookup(
                    context.CompanyIntegrationID,
                    item.RelatedEntityID,
                    context.ContextUser,
                    context.RunViewProvider
                );
                mapByRelatedEntity.set(normEntityID, lookup);
            }
        }

        for (const item of deferredUpdates) {
            const entityInfo = md.Entities.find(
                e => e.Name.toLowerCase() === item.EntityName.toLowerCase()
            );
            if (!entityInfo) continue;

            const lookup = mapByRelatedEntity.get(NormalizeUUID(item.RelatedEntityID));
            const translatedFK =
                lookup?.get(NormalizeUUID(item.SourceForeignKeyValue)) ??
                (context.PreservePrimaryKeys ? item.SourceForeignKeyValue : null);

            if (!translatedFK) continue;

            const entity = await md.GetEntityObject<BaseEntity>(entityInfo.Name, context.ContextUser);
            const pkFieldName = entityInfo.FirstPrimaryKey?.Name ?? 'ID'; // first-pk-ok: Peer Sync target entities use single-column UUID primary keys
            const key = new CompositeKey([{ FieldName: pkFieldName, Value: item.LocalRecordID }]);
            const loaded = await entity.InnerLoad(key);
            if (!loaded) continue;

            this.setEntityFieldValue(entity, item.FieldName, translatedFK);
            entity.SetSyncContext({
                OriginDeploymentID: requestMeta.OriginInstanceID,
                PairingID: requestMeta.PairingID,
                RunID: requestMeta.RunID,
                OriginChangeIDs: [],
                OriginUserEmail: context.ContextUser.Email ?? '',
                IntegrationID: context.CompanyIntegrationID,
            });
            try {
                const saved = await entity.Save();
                if (saved) {
                    updatedCount++;
                }
            } finally {
                entity.ClearSyncContext();
            }
        }

        return updatedCount;
    }

    private async applyDelete(
        change: CoalescedRecordChange,
        localRecordID: string | null,
        entityInfo: EntityInfo,
        pkFieldName: string,
        request: PeerApplyBatchRequest,
        context: PeerSyncApplyContext,
        md: IMetadataProvider
    ): Promise<PeerApplyRecordResult> {
        if (!localRecordID) {
            return {
                SourceRecordID: change.SourceRecordID,
                DestinationRecordID: null,
                Status: 'Skipped',
                MatchedBy: null,
                ErrorMessage: null,
                ConflictingFields: [],
            };
        }

        if (context.EntityMap?.DeleteBehavior === 'DoNothing') {
            return {
                SourceRecordID: change.SourceRecordID,
                DestinationRecordID: localRecordID,
                Status: 'Skipped',
                MatchedBy: 'RecordMap',
                ErrorMessage: null,
                ConflictingFields: [],
            };
        }

        const entity = await md.GetEntityObject<BaseEntity>(entityInfo.Name, context.ContextUser);
        const key = new CompositeKey([{ FieldName: pkFieldName, Value: localRecordID }]);
        const loaded = await entity.InnerLoad(key);
        if (!loaded) {
            return {
                SourceRecordID: change.SourceRecordID,
                DestinationRecordID: localRecordID,
                Status: 'Skipped',
                MatchedBy: 'RecordMap',
                ErrorMessage: null,
                ConflictingFields: [],
            };
        }

        entity.SetSyncContext({
            OriginDeploymentID: request.SenderInstanceID,
            PairingID: request.PairingID,
            RunID: request.RunID,
            OriginChangeIDs: [change.LatestChangeID],
            OriginUserEmail: context.ContextUser.Email ?? '',
            IntegrationID: context.CompanyIntegrationID,
        });
        try {
            const deleted = await entity.Delete();
            if (!deleted) {
                return {
                    SourceRecordID: change.SourceRecordID,
                    DestinationRecordID: localRecordID,
                    Status: 'Error',
                    MatchedBy: 'RecordMap',
                    ErrorMessage: entity.LatestResult?.CompleteMessage ?? 'Delete failed',
                    ConflictingFields: [],
                };
            }
            return {
                SourceRecordID: change.SourceRecordID,
                DestinationRecordID: localRecordID,
                Status: 'Deleted',
                MatchedBy: 'RecordMap',
                ErrorMessage: null,
                ConflictingFields: [],
            };
        } finally {
            entity.ClearSyncContext();
        }
    }

    private async applyUpsert(
        change: CoalescedRecordChange,
        destinationValues: Record<string, string | number | boolean | null>,
        resolution: {
            Outcome: 'Matched' | 'CreateNew' | 'Quarantined';
            MatchedBy: 'RecordMap' | 'PrimaryKey' | 'KeyFields' | 'DuplicateDetection' | 'NewRecord' | 'AmbiguousKey';
            LocalRecordID: string | null;
        },
        entityInfo: EntityInfo,
        pkFieldName: string,
        fieldMaps: ICompanyIntegrationFieldMap[],
        request: PeerApplyBatchRequest,
        context: PeerSyncApplyContext,
        md: IMetadataProvider,
        recordMapLookup: Map<string, string>
    ): Promise<PeerApplyRecordResult> {
        const entity = await md.GetEntityObject<BaseEntity>(entityInfo.Name, context.ContextUser);
        const isUpdate = resolution.Outcome === 'Matched' && resolution.LocalRecordID != null;

        let fieldsToApply: Record<string, string | number | boolean | null> = destinationValues;

        if (isUpdate && resolution.LocalRecordID) {
            const key = new CompositeKey([{ FieldName: pkFieldName, Value: resolution.LocalRecordID }]);
            const loaded = await entity.InnerLoad(key);
            if (!loaded) {
                // Local record recorded in RecordMap was deleted; create new record instead
                entity.NewRecord();
                if (context.PreservePrimaryKeys && change.SourceRecordID) {
                    this.setEntityFieldValue(entity, pkFieldName, change.SourceRecordID);
                }
            } else if (change.AncestorData) {
                // 3-way field-level merge using shared ComputeThreeWayFieldMerge
                const currentDestSnapshot = this.extractEntityFieldSnapshot(entity);
                const mergeFieldMappings: ThreeWayFieldMapping[] = fieldMaps
                    .filter(fm => fm.Status === 'Active' && fm.Direction !== 'DestToSource')
                    .map(fm => ({
                        SourceFieldName: fm.SourceFieldName,
                        DestinationFieldName: fm.DestinationFieldName,
                    }));

                const resolutionMode = context.EntityMap?.ConflictResolution ?? 'SourceWins';
                const sourceModifiedAt = new Date(change.LatestChangedAt);
                const destModifiedAt = this.extractEntityUpdatedAt(entity);
                const mostRecentWinner =
                    !Number.isNaN(sourceModifiedAt.getTime()) && destModifiedAt
                        ? sourceModifiedAt >= destModifiedAt
                            ? 'external'
                            : 'mj'
                        : 'external';

                // Build Base keyed by DestinationFieldName from change.AncestorData
                const baseByDest: Record<string, string | number | boolean | null> = {};
                for (const fm of mergeFieldMappings) {
                    if (fm.SourceFieldName in change.AncestorData) {
                        baseByDest[fm.DestinationFieldName] = change.AncestorData[fm.SourceFieldName];
                    }
                }

                const mergeResult = ComputeThreeWayFieldMerge({
                    Base: baseByDest,
                    Ours: currentDestSnapshot,
                    Theirs: change.RecordData,
                    FieldMappings: mergeFieldMappings,
                    ConflictResolution: resolutionMode,
                    MostRecentWinner: mostRecentWinner,
                    OutputKeyMode: 'destination',
                });

                if (mergeResult.ManualConflict || mergeResult.Action === 'skip') {
                    return {
                        SourceRecordID: change.SourceRecordID,
                        DestinationRecordID: resolution.LocalRecordID,
                        Status: 'Conflict',
                        MatchedBy: resolution.MatchedBy,
                        ErrorMessage: `Manual conflict on fields: ${mergeResult.ConflictFields.join(', ')}`,
                        ConflictingFields: mergeResult.ConflictFields,
                    };
                }

                fieldsToApply = {};
                for (const [k, v] of Object.entries(mergeResult.MergedFields)) {
                    // Overlay translated FK values from destinationValues when remote won
                    const coercedVal: string | number | boolean | null =
                        v === null
                            ? null
                            : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                                ? v
                                : String(v);
                    if (k in destinationValues && coercedVal === change.RecordData[k]) {
                        fieldsToApply[k] = destinationValues[k];
                    } else {
                        fieldsToApply[k] = coercedVal;
                    }
                }
            }
        } else {
            entity.NewRecord();
            if (context.PreservePrimaryKeys && change.SourceRecordID) {
                this.setEntityFieldValue(entity, pkFieldName, change.SourceRecordID);
            }
        }

        // Populate entity fields (excluding primary key if already set or read-only system columns)
        for (const [fieldName, value] of Object.entries(fieldsToApply)) {
            if (fieldName.toLowerCase() === pkFieldName.toLowerCase()) continue;
            if (fieldName.startsWith('__mj_')) continue;
            this.setEntityFieldValue(entity, fieldName, value);
        }

        entity.SetSyncContext({
            OriginDeploymentID: request.SenderInstanceID,
            PairingID: request.PairingID,
            RunID: request.RunID,
            OriginChangeIDs: [change.LatestChangeID],
            OriginUserEmail: context.ContextUser.Email ?? '',
            IntegrationID: context.CompanyIntegrationID,
        });

        try {
            const saved = await entity.Save();
            if (!saved) {
                return {
                    SourceRecordID: change.SourceRecordID,
                    DestinationRecordID: resolution.LocalRecordID,
                    Status: 'Error',
                    MatchedBy: resolution.MatchedBy,
                    ErrorMessage: entity.LatestResult?.CompleteMessage ?? 'Entity.Save() returned false',
                    ConflictingFields: [],
                };
            }

            const savedLocalID = String(
                this.getEntityFieldValue(entity, pkFieldName) ??
                    resolution.LocalRecordID ??
                    change.SourceRecordID
            );

            // Upsert CompanyIntegrationRecordMap entry and update in-memory lookup for intra-batch self-references
            await this.upsertRecordMapEntry(
                context.CompanyIntegrationID,
                entityInfo.ID,
                change.SourceRecordID,
                savedLocalID,
                context.ContextUser,
                md,
                context.RunViewProvider
            );
            recordMapLookup.set(NormalizeUUID(change.SourceRecordID), savedLocalID);

            return {
                SourceRecordID: change.SourceRecordID,
                DestinationRecordID: savedLocalID,
                Status: isUpdate ? 'Updated' : 'Created',
                MatchedBy: resolution.MatchedBy,
                ErrorMessage: null,
                ConflictingFields: [],
            };
        } finally {
            entity.ClearSyncContext();
        }
    }

    private mapAndTranslateFields(
        change: CoalescedRecordChange,
        entityInfo: EntityInfo,
        fieldMaps: ICompanyIntegrationFieldMap[],
        sameEntityRecordMap: Map<string, string>,
        fkTargetEntityLookup: Map<string, Map<string, string>>,
        deferredFieldSet: Set<string>
    ): {
        destinationValues: Record<string, string | number | boolean | null>;
        deferredForRecord: Array<{
            fieldName: string;
            relatedEntityID: string;
            sourceFKValue: string;
        }>;
    } {
        const destinationValues: Record<string, string | number | boolean | null> = {};
        const deferredForRecord: Array<{
            fieldName: string;
            relatedEntityID: string;
            sourceFKValue: string;
        }> = [];

        const fieldInfoByLower = new Map(
            entityInfo.Fields.map(f => [f.Name.toLowerCase(), f])
        );

        for (const fm of fieldMaps) {
            if (fm.Status !== 'Active' || fm.Direction === 'DestToSource') continue;
            if (!(fm.SourceFieldName in change.RecordData)) continue;

            const rawValue = change.RecordData[fm.SourceFieldName];
            const destFieldInfo = fieldInfoByLower.get(fm.DestinationFieldName.toLowerCase());
            if (!destFieldInfo) {
                destinationValues[fm.DestinationFieldName] = rawValue;
                continue;
            }

            // Foreign key translation across CompanyIntegrationRecordMap
            if (destFieldInfo.RelatedEntityID && rawValue != null && String(rawValue).length > 0) {
                const sourceFK = String(rawValue);
                const normSourceFK = NormalizeUUID(sourceFK);
                const isSelfRef = UUIDsEqual(destFieldInfo.RelatedEntityID, entityInfo.ID);
                const targetLookup = isSelfRef
                    ? sameEntityRecordMap
                    : fkTargetEntityLookup.get(NormalizeUUID(destFieldInfo.RelatedEntityID));

                const mappedTargetID = targetLookup?.get(normSourceFK);
                if (mappedTargetID) {
                    destinationValues[fm.DestinationFieldName] = mappedTargetID;
                } else if (
                    destFieldInfo.AllowsNull &&
                    (deferredFieldSet.has(destFieldInfo.Name.toLowerCase()) || isSelfRef)
                ) {
                    // Defer unresolved nullable FK to Pass 2
                    destinationValues[fm.DestinationFieldName] = null;
                    deferredForRecord.push({
                        fieldName: destFieldInfo.Name,
                        relatedEntityID: destFieldInfo.RelatedEntityID,
                        sourceFKValue: sourceFK,
                    });
                } else {
                    destinationValues[fm.DestinationFieldName] = rawValue;
                }
            } else {
                destinationValues[fm.DestinationFieldName] = rawValue;
            }
        }

        return { destinationValues, deferredForRecord };
    }

    private buildDefaultFieldMaps(entityInfo: EntityInfo): ICompanyIntegrationFieldMap[] {
        return entityInfo.Fields.filter(
            f => !f.IsPrimaryKey && !f.ReadOnly && !f.Name.startsWith('__mj_')
        ).map((f, idx) => ({
            ID: `default-fm-${idx}`,
            EntityMapID: 'default-em',
            SourceFieldName: f.Name,
            SourceFieldLabel: f.DisplayNameOrName,
            DestinationFieldName: f.Name,
            DestinationFieldLabel: f.DisplayNameOrName,
            Direction: 'Both',
            TransformPipeline: null,
            IsKeyField: false,
            IsRequired: !f.AllowsNull && !f.HasDefaultValue,
            DefaultValue: f.DefaultValue ?? null,
            Priority: idx,
            Status: 'Active',
            Get: () => null,
        }));
    }

    private async loadEntityRecordMapLookup(
        companyIntegrationID: string,
        entityID: string,
        contextUser: UserInfo,
        runViewProvider?: IRunViewProvider
    ): Promise<Map<string, string>> {
        const rv = new RunView(runViewProvider ?? null);
        const res = await rv.RunView<{
            ExternalSystemRecordID: string;
            EntityRecordID: string;
        }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND EntityID='${entityID}'`,
            Fields: ['ExternalSystemRecordID', 'EntityRecordID'],
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);

        const lookup = new Map<string, string>();
        if (res.Success) {
            for (const row of res.Results) {
                if (row.ExternalSystemRecordID && row.EntityRecordID) {
                    lookup.set(NormalizeUUID(row.ExternalSystemRecordID), row.EntityRecordID);
                }
            }
        }
        return lookup;
    }

    private async loadRelatedEntityRecordMaps(
        companyIntegrationID: string,
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        md: IMetadataProvider,
        runViewProvider?: IRunViewProvider
    ): Promise<Map<string, Map<string, string>>> {
        const relatedEntityIDs = new Set<string>();
        for (const f of entityInfo.Fields) {
            if (f.RelatedEntityID && !UUIDsEqual(f.RelatedEntityID, entityInfo.ID)) {
                const exists = md.Entities.some(e => UUIDsEqual(e.ID, f.RelatedEntityID!));
                if (exists) {
                    relatedEntityIDs.add(f.RelatedEntityID);
                }
            }
        }

        const result = new Map<string, Map<string, string>>();
        for (const relatedID of relatedEntityIDs) {
            const lookup = await this.loadEntityRecordMapLookup(
                companyIntegrationID,
                relatedID,
                contextUser,
                runViewProvider
            );
            result.set(NormalizeUUID(relatedID), lookup);
        }
        return result;
    }

    private async upsertRecordMapEntry(
        companyIntegrationID: string,
        entityID: string,
        externalRecordID: string,
        localRecordID: string,
        contextUser: UserInfo,
        md: IMetadataProvider,
        runViewProvider?: IRunViewProvider
    ): Promise<void> {
        const rv = new RunView(runViewProvider ?? null);
        const escapedExternal = externalRecordID.replace(/'/g, "''");
        const existing = await rv.RunView<{ ID: string; EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${companyIntegrationID}' ` +
                `AND EntityID='${entityID}' ` +
                `AND ExternalSystemRecordID='${escapedExternal}'`,
            Fields: ['ID', 'EntityRecordID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);

        if (
            existing.Success &&
            existing.Results.length > 0 &&
            UUIDsEqual(existing.Results[0].EntityRecordID, localRecordID)
        ) {
            return;
        }

        const recordMap = await md.GetEntityObject<MJCompanyIntegrationRecordMapEntity>(
            'MJ: Company Integration Record Maps',
            contextUser
        );
        if (existing.Success && existing.Results.length > 0) {
            await recordMap.InnerLoad(CompositeKey.FromID(existing.Results[0].ID));
        } else {
            recordMap.NewRecord();
            recordMap.CompanyIntegrationID = companyIntegrationID;
            recordMap.EntityID = entityID;
            recordMap.ExternalSystemRecordID = externalRecordID;
        }
        recordMap.EntityRecordID = localRecordID;
        await recordMap.Save();
    }

    private setEntityFieldValue(
        entity: BaseEntity,
        fieldName: string,
        value: string | number | boolean | null
    ): void {
        const targetField = entity.Fields.find(
            f => f.Name.toLowerCase() === fieldName.toLowerCase()
        );
        if (targetField) {
            targetField.Value = value;
        }
    }

    private getEntityFieldValue(
        entity: BaseEntity,
        fieldName: string
    ): string | number | boolean | null {
        const targetField = entity.Fields.find(
            f => f.Name.toLowerCase() === fieldName.toLowerCase()
        );
        if (!targetField || targetField.Value === undefined || targetField.Value === null) {
            return null;
        }
        const v = targetField.Value;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            return v;
        }
        if (v instanceof Date) {
            return v.toISOString();
        }
        return String(v);
    }

    private extractEntityFieldSnapshot(
        entity: BaseEntity
    ): Record<string, string | number | boolean | null> {
        const snapshot: Record<string, string | number | boolean | null> = {};
        for (const field of entity.Fields) {
            snapshot[field.Name] = this.getEntityFieldValue(entity, field.Name);
        }
        return snapshot;
    }

    private extractEntityUpdatedAt(entity: BaseEntity): Date | undefined {
        const updatedAtVal = this.getEntityFieldValue(entity, '__mj_UpdatedAt');
        if (!updatedAtVal) return undefined;
        const parsed = new Date(String(updatedAtVal));
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
}
