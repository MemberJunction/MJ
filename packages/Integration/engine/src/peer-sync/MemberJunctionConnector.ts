import {
    CompositeKey,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationRecordMapEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
} from '@memberjunction/core-entities';
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ConnectorPipelineContext,
    type ExternalFieldSchema,
    type ExternalObjectSchema,
    type FetchBatchResult,
    type FetchContext,
} from '../BaseIntegrationConnector.js';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
} from '../entity-types.js';
import type {
    DefaultFieldMapping,
    EntityMapSyncResult,
    ExternalRecord,
    SyncResult,
} from '../types.js';
import {
    BuildCompositeWatermarkWhereClause,
    CoalesceRecordChanges,
    PlanPeerEntityOrder,
} from './ChangeSetPlanner.js';
import { PeerSyncApplier } from './PeerSyncApplier.js';
import { GraphQLPeerSyncTransport } from './PeerSyncEndpointService.js';
import { ComputePairingID, SchemaPlanner } from './SchemaPlanner.js';
import { DEFAULT_PEER_SYNC_CONFIG } from './types.js';
import type {
    IPeerSyncDuplicateCandidateFinder,
    IPeerSyncSchemaEvolutionRunner,
    IPeerSyncTransport,
    IPeerSyncVectorIndexer,
    PeerChangeCursor,
    PeerDatabaseEngine,
    PeerDeferredFKUpdate,
    PeerManifest,
    PeerRecordChangeEntry,
    PeerSyncConfiguration,
    SchemaReconciliationPlan,
} from './types.js';

/**
 * Dependency injection overrides for `MemberJunctionConnector` (used in multi-instance
 * pipelines and deterministic unit tests).
 */
export interface MemberJunctionConnectorDependencies {
    Transport?: IPeerSyncTransport;
    LocalInstanceID?: string;
    LocalInstanceName?: string;
    LocalMJCoreVersion?: string;
    LocalDatabaseEngine?: PeerDatabaseEngine;
    DuplicateFinder?: IPeerSyncDuplicateCandidateFinder;
    VectorIndexer?: IPeerSyncVectorIndexer;
    SchemaEvolutionRunner?: IPeerSyncSchemaEvolutionRunner;
    MetadataProvider?: IMetadataProvider;
    RunViewProvider?: IRunViewProvider;
}

/**
 * First-class MemberJunction-to-MemberJunction connector (`MemberJunctionConnector`).
 *
 * Implements the 4-phase MJ Peer Sync architecture:
 * 1. Handshake & Symmetric Pairing ID (`ComputePairingID`)
 * 2. Schema Fingerprint Comparison & Drift Policy Enforcement (`SchemaPlanner`)
 * 3. Dependency-Ordered Pull with Two-Pass Nullable FK Cycle Breaking & 5-Step Hybrid Identity Gate
 * 4. Dependency-Ordered Push with Change Set Coalescing & Loop-Preventing `SyncContext`
 */
@RegisterClass(BaseIntegrationConnector, 'MemberJunctionConnector')
export class MemberJunctionConnector extends BaseIntegrationConnector {
    private deps: MemberJunctionConnectorDependencies;
    private readonly schemaPlanner = new SchemaPlanner();
    private readonly applier = new PeerSyncApplier();

    constructor(deps?: MemberJunctionConnectorDependencies) {
        super();
        this.deps = deps ?? {};
    }

    /**
     * Configures optional runtime dependencies (transport, duplicate detector, vector indexer, providers).
     */
    public ConfigureDependencies(deps: MemberJunctionConnectorDependencies): void {
        this.deps = { ...this.deps, ...deps };
    }

    public override get IntegrationName(): string {
        return 'MemberJunction Peer Sync';
    }

    public override get SupportsGet(): boolean {
        return true;
    }

    public override get SupportsCreate(): boolean {
        return true;
    }

    public override get SupportsUpdate(): boolean {
        return true;
    }

    public override get SupportsDelete(): boolean {
        return true;
    }

    public override get MonotonicWatermark(): boolean {
        return true;
    }

    public override get DiscoveryIsAuthoritative(): boolean {
        return true;
    }

    /**
     * Phase 1 Handshake: verifies connectivity to the remote MemberJunction peer
     * and validates `PeerManifest`.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const peerConfig = this.parsePeerConfiguration(companyIntegration);
            const transport = this.resolveTransport(peerConfig);
            const manifest = await transport.GetManifest();
            return {
                Success: true,
                Message:
                    `Connected to MJ peer '${manifest.InstanceName}' ` +
                    `(InstanceID=${manifest.InstanceID}, Engine=${manifest.DatabaseEngine}, Core=${manifest.MJCoreVersion})`,
                ServerVersion: manifest.MJCoreVersion,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                Message: `Failed to connect to MJ peer: ${msg}`,
            };
        }
    }

    /**
     * Discovers sync-eligible entities exposed by the remote MemberJunction peer.
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const peerConfig = this.parsePeerConfiguration(companyIntegration);
        const transport = this.resolveTransport(peerConfig);
        const manifest = await transport.GetManifest();
        const fingerprints = await transport.GetSchemaFingerprint(manifest.AllowedEntityNames);

        return fingerprints.map(fp => ({
            Name: fp.EntityName,
            Label: fp.EntityName,
            Description: `MemberJunction entity ${fp.BaseTable} (${fp.SchemaName}.${fp.BaseView})`,
            SupportsIncrementalSync: fp.TrackRecordChanges,
            SupportsWrite: true,
        }));
    }

    /**
     * Discovers fields on a specific remote MemberJunction entity via its schema fingerprint.
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const peerConfig = this.parsePeerConfiguration(companyIntegration);
        const transport = this.resolveTransport(peerConfig);
        const fingerprints = await transport.GetSchemaFingerprint([objectName]);
        const fp = fingerprints[0];
        if (!fp) {
            return [];
        }

        return fp.Fields.map(f => ({
            Name: f.Name,
            Label: f.Name,
            DataType: f.SQLFullType || f.Type,
            IsRequired: !f.AllowsNull && f.DefaultValue == null && !f.IsPrimaryKey,
            AllowsNull: f.AllowsNull,
            IsPrimaryKey: f.IsPrimaryKey,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.Name.startsWith('__mj_'),
            IsForeignKey: f.RelatedEntityName != null,
            ForeignKeyTarget: f.RelatedEntityName,
            MaxLength: f.MaxLength,
            Precision: f.Precision,
            Scale: f.Scale,
            DefaultValue: f.DefaultValue,
        }));
    }

    /**
     * Returns 1:1 same-name field mappings when both peers share the MJ entity.
     */
    public override GetDefaultFieldMappings(
        _objectName: string,
        entityName: string
    ): DefaultFieldMapping[] {
        const md = this.deps.MetadataProvider ?? Metadata.Provider;
        const entityInfo = md.Entities.find(
            e => e.Name.toLowerCase() === entityName.toLowerCase()
        );
        if (!entityInfo) return [];

        return entityInfo.Fields.filter(
            f => !f.IsPrimaryKey && !f.ReadOnly && !f.Name.startsWith('__mj_')
        ).map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: false,
            IsRequired: !f.AllowsNull && !f.HasDefaultValue,
        }));
    }

    /**
     * Standard single-object `FetchChanges` implementation for callers that invoke
     * `FetchChanges` directly outside `RunPipeline`.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const peerConfig = this.parsePeerConfiguration(ctx.CompanyIntegration);
        const transport = this.resolveTransport(peerConfig);
        const manifest = await transport.GetManifest();
        const localInstanceID = this.resolveLocalInstanceID(peerConfig);
        const pairingID = ComputePairingID(localInstanceID, manifest.InstanceID);
        const cursor = this.parseCursorWatermark(ctx.WatermarkValue);

        const response = await transport.FetchChangeBatch({
            PairingID: pairingID,
            RequesterInstanceID: localInstanceID,
            EntityName: ctx.ObjectName,
            SinceCursor: cursor,
            BatchSize: ctx.BatchSize || peerConfig.BatchSize,
        });

        const records: ExternalRecord[] = response.Changes.map(change => ({
            ExternalID: change.SourceRecordID,
            ObjectType: change.EntityName,
            Fields: change.RecordData,
            ModifiedAt: new Date(change.LatestChangedAt),
            IsDeleted: change.Operation === 'Delete',
        }));

        return {
            Records: records,
            HasMore: response.HasMore,
            NewWatermarkValue: response.NextCursor
                ? JSON.stringify(response.NextCursor)
                : ctx.WatermarkValue ?? undefined,
        };
    }

    /**
     * Whole-run Peer Sync pipeline invoked by `IntegrationEngine.executeEntityMaps`.
     *
     * Executes:
     * 1. Handshake & Symmetric Pairing ID
     * 2. Schema Fingerprint Reconciliation & Drift Policy Enforcement
     * 3. Dependency-Ordered Pull (Tarjan SCC + Two-Pass Nullable FK Deferral)
     * 4. Dependency-Ordered Push (Coalesced `MJ: Record Changes` where `Source <> 'Sync'`)
     */
    public async RunPipeline(context: ConnectorPipelineContext): Promise<SyncResult> {
        const md = this.deps.MetadataProvider ?? Metadata.Provider;
        const peerConfig = this.parsePeerConfiguration(context.CompanyIntegration);
        const transport = this.resolveTransport(peerConfig);
        const localManifest = this.buildLocalManifest(peerConfig, context.EntityMaps);
        const remoteManifest = await transport.GetManifest();
        const pairingID = ComputePairingID(localManifest.InstanceID, remoteManifest.InstanceID);

        // Phase 2: Schema Fingerprint Comparison & Reconciliation
        const activeMaps = context.EntityMaps.filter(
            em => em.SyncEnabled && em.Status === 'Active'
        );
        const entityNames = activeMaps.map(em => em.Entity || em.ExternalObjectName);
        const localFingerprints = this.schemaPlanner.ExtractLocalSchemaFingerprints(
            entityNames,
            md
        );
        const remoteFingerprints = await transport.GetSchemaFingerprint(
            activeMaps.map(em => em.ExternalObjectName || em.Entity)
        );

        const schemaPlan = this.schemaPlanner.BuildReconciliationPlan(
            localManifest,
            remoteManifest,
            localFingerprints,
            remoteFingerprints
        );

        await this.enforceSchemaDriftPolicy(
            schemaPlan,
            peerConfig,
            context.ContextUser
        );

        const blockedSet = new Set(schemaPlan.BlockedEntities.map(n => n.toLowerCase()));
        const eligibleMaps = activeMaps.filter(
            em => !blockedSet.has((em.Entity || em.ExternalObjectName).toLowerCase())
        );

        // Plan entity-level dependency order via Tarjan SCC + two-pass nullable FK cycle breaking
        const dependencyPlan = PlanPeerEntityOrder(
            eligibleMaps.map(em => em.EntityID),
            md
        );

        if (dependencyPlan.UnresolvableCycles.length > 0) {
            throw new Error(
                `Unresolvable non-nullable foreign key cycle detected across entities: ` +
                dependencyPlan.UnresolvableCycles.map(c => c.join(' -> ')).join('; ')
            );
        }

        const mapByNormEntityID = new Map<string, ICompanyIntegrationEntityMap>();
        for (const em of eligibleMaps) {
            mapByNormEntityID.set(NormalizeUUID(em.EntityID), em);
        }

        const orderedMaps: ICompanyIntegrationEntityMap[] = [];
        for (const entityID of dependencyPlan.OrderedEntityIDs) {
            const em = mapByNormEntityID.get(NormalizeUUID(entityID));
            if (em) orderedMaps.push(em);
        }

        const deferredFieldsByEntityID = new Map<string, string[]>();
        for (const edge of dependencyPlan.DeferredNullableFields) {
            const normFrom = NormalizeUUID(edge.FromEntityID);
            const list = deferredFieldsByEntityID.get(normFrom) ?? [];
            list.push(edge.FieldName);
            deferredFieldsByEntityID.set(normFrom, list);
        }

        const entityMapResults: EntityMapSyncResult[] = [];
        let totalProcessed = 0;
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalDeleted = 0;
        let totalErrored = 0;
        let totalSkipped = 0;

        // Phase 3: Dependency-Ordered Pull (Pass 1 + Pass 2 Deferred FKs)
        const allPullDeferredFKs: Array<{
            entityMap: ICompanyIntegrationEntityMap;
            updates: PeerDeferredFKUpdate[];
        }> = [];

        for (const entityMap of orderedMaps) {
            if (context.AbortSignal?.aborted) break;

            const effectiveDirection = context.SyncDirection ?? entityMap.SyncDirection;
            const shouldPull =
                effectiveDirection === 'Pull' || effectiveDirection === 'Bidirectional';
            const shouldPush =
                effectiveDirection === 'Push' || effectiveDirection === 'Bidirectional';

            const mapResult: EntityMapSyncResult = {
                EntityMapID: entityMap.ID,
                ExternalObjectName: entityMap.ExternalObjectName,
                EntityName: entityMap.Entity,
                Success: true,
                RecordsProcessed: 0,
                RecordsCreated: 0,
                RecordsUpdated: 0,
                RecordsDeleted: 0,
                RecordsErrored: 0,
                RecordsSkipped: 0,
            };

            const fieldMaps = context.FieldMapsByEntityMapID.get(entityMap.ID) ?? [];

            if (shouldPull) {
                const pullOutcome = await this.pullEntityChanges(
                    entityMap,
                    fieldMaps,
                    deferredFieldsByEntityID.get(NormalizeUUID(entityMap.EntityID)) ?? [],
                    pairingID,
                    localManifest.InstanceID,
                    remoteManifest.InstanceID,
                    context.Run.ID,
                    context.FullSync,
                    peerConfig,
                    transport,
                    context.ContextUser,
                    md
                );

                mapResult.RecordsProcessed += pullOutcome.processed;
                mapResult.RecordsCreated += pullOutcome.created;
                mapResult.RecordsUpdated += pullOutcome.updated;
                mapResult.RecordsDeleted += pullOutcome.deleted;
                mapResult.RecordsErrored += pullOutcome.errored;
                mapResult.RecordsSkipped += pullOutcome.skipped;
                if (pullOutcome.errored > 0) {
                    mapResult.Success = false;
                }
                if (pullOutcome.deferredFKs.length > 0) {
                    allPullDeferredFKs.push({
                        entityMap,
                        updates: pullOutcome.deferredFKs,
                    });
                }
            }

            if (shouldPush) {
                const pushOutcome = await this.pushEntityChanges(
                    entityMap,
                    pairingID,
                    localManifest.InstanceID,
                    context.Run.ID,
                    context.FullSync,
                    peerConfig,
                    transport,
                    context.ContextUser,
                    md
                );

                mapResult.RecordsProcessed += pushOutcome.processed;
                mapResult.RecordsCreated += pushOutcome.created;
                mapResult.RecordsUpdated += pushOutcome.updated;
                mapResult.RecordsDeleted += pushOutcome.deleted;
                mapResult.RecordsErrored += pushOutcome.errored;
                mapResult.RecordsSkipped += pushOutcome.skipped;
                if (pushOutcome.errored > 0) {
                    mapResult.Success = false;
                }
            }

            totalProcessed += mapResult.RecordsProcessed;
            totalCreated += mapResult.RecordsCreated;
            totalUpdated += mapResult.RecordsUpdated;
            totalDeleted += mapResult.RecordsDeleted;
            totalErrored += mapResult.RecordsErrored;
            totalSkipped += mapResult.RecordsSkipped;
            entityMapResults.push(mapResult);
        }

        // Pass 2 of Two-Pass Nullable FK Cycle Breaking on Inbound Pull
        for (const item of allPullDeferredFKs) {
            await this.applier.ApplyDeferredForeignKeys(
                item.updates,
                {
                    PairingID: pairingID,
                    OriginInstanceID: remoteManifest.InstanceID,
                    RunID: context.Run.ID,
                },
                {
                    CompanyIntegrationID: context.CompanyIntegration.ID,
                    EntityMap: item.entityMap,
                    PreservePrimaryKeys: peerConfig.PreservePrimaryKeys,
                    DuplicateThreshold: peerConfig.DuplicateThreshold,
                    PotentialMatchThreshold: peerConfig.PotentialMatchThreshold,
                    ContextUser: context.ContextUser,
                    MetadataProvider: md,
                    RunViewProvider: this.deps.RunViewProvider,
                }
            );
        }

        return {
            Success: totalErrored === 0,
            RunID: context.Run.ID,
            RecordsProcessed: totalProcessed,
            RecordsCreated: totalCreated,
            RecordsUpdated: totalUpdated,
            RecordsDeleted: totalDeleted,
            RecordsErrored: totalErrored,
            RecordsSkipped: totalSkipped,
            Errors: [],
            EntityMapResults: entityMapResults,
        };
    }

    private async pullEntityChanges(
        entityMap: ICompanyIntegrationEntityMap,
        fieldMaps: ICompanyIntegrationFieldMap[],
        deferredFieldNames: string[],
        pairingID: string,
        localInstanceID: string,
        remoteInstanceID: string,
        runID: string,
        fullSync: boolean,
        peerConfig: PeerSyncConfiguration,
        transport: IPeerSyncTransport,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<{
        processed: number;
        created: number;
        updated: number;
        deleted: number;
        errored: number;
        skipped: number;
        deferredFKs: PeerDeferredFKUpdate[];
    }> {
        let cursor = fullSync
            ? null
            : await this.loadCompositeWatermark(entityMap.ID, 'Pull', contextUser);

        let processed = 0;
        let created = 0;
        let updated = 0;
        let deleted = 0;
        let errored = 0;
        let skipped = 0;
        const deferredFKs: PeerDeferredFKUpdate[] = [];

        let hasMore = true;
        let pageGuard = 0;
        while (hasMore && pageGuard++ < 1000) {
            const batchResponse = await transport.FetchChangeBatch({
                PairingID: pairingID,
                RequesterInstanceID: localInstanceID,
                EntityName: entityMap.ExternalObjectName || entityMap.Entity,
                SinceCursor: cursor,
                BatchSize: peerConfig.BatchSize,
            });

            if (batchResponse.Changes.length > 0) {
                const { Response: applyRes, DeferredFKUpdates } = await this.applier.ApplyBatch(
                    {
                        PairingID: pairingID,
                        SenderInstanceID: remoteInstanceID,
                        RunID: runID,
                        EntityName: entityMap.Entity,
                        Changes: batchResponse.Changes,
                        PreservePrimaryKeys: peerConfig.PreservePrimaryKeys,
                    },
                    {
                        CompanyIntegrationID: entityMap.CompanyIntegrationID,
                        EntityMap: entityMap,
                        FieldMaps: fieldMaps.length > 0 ? fieldMaps : undefined,
                        DeferredFieldNames: deferredFieldNames,
                        PreservePrimaryKeys: peerConfig.PreservePrimaryKeys,
                        DuplicateThreshold: peerConfig.DuplicateThreshold,
                        PotentialMatchThreshold: peerConfig.PotentialMatchThreshold,
                        DuplicateFinder: this.deps.DuplicateFinder,
                        VectorIndexer: this.deps.VectorIndexer,
                        ContextUser: contextUser,
                        MetadataProvider: md,
                        RunViewProvider: this.deps.RunViewProvider,
                    }
                );

                processed += batchResponse.Changes.length;
                created += applyRes.CreatedCount;
                updated += applyRes.UpdatedCount;
                deleted += applyRes.DeletedCount;
                errored += applyRes.ErrorCount + applyRes.ConflictCount;
                skipped += applyRes.SkippedCount + applyRes.QuarantinedCount;
                deferredFKs.push(...DeferredFKUpdates);

                if (applyRes.ErrorCount === 0 && batchResponse.NextCursor) {
                    cursor = batchResponse.NextCursor;
                    await this.saveCompositeWatermark(
                        entityMap.ID,
                        'Pull',
                        cursor,
                        batchResponse.Changes.length,
                        contextUser,
                        md
                    );
                }
            } else if (batchResponse.NextCursor) {
                cursor = batchResponse.NextCursor;
            }

            hasMore = batchResponse.HasMore && batchResponse.Changes.length > 0;
        }

        return { processed, created, updated, deleted, errored, skipped, deferredFKs };
    }

    private async pushEntityChanges(
        entityMap: ICompanyIntegrationEntityMap,
        pairingID: string,
        localInstanceID: string,
        runID: string,
        fullSync: boolean,
        peerConfig: PeerSyncConfiguration,
        transport: IPeerSyncTransport,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<{
        processed: number;
        created: number;
        updated: number;
        deleted: number;
        errored: number;
        skipped: number;
    }> {
        let cursor = fullSync
            ? null
            : await this.loadCompositeWatermark(entityMap.ID, 'Push', contextUser);

        let processed = 0;
        let created = 0;
        let updated = 0;
        let deleted = 0;
        let errored = 0;
        let skipped = 0;

        const rv = new RunView(this.deps.RunViewProvider ?? null);
        const batchSize = Math.max(1, peerConfig.BatchSize || 500);
        let hasMore = true;
        let pageGuard = 0;

        while (hasMore && pageGuard++ < 1000) {
            const whereClause = BuildCompositeWatermarkWhereClause(
                entityMap.EntityID,
                cursor
            );
            const rawChangesResult = await rv.RunView<PeerRecordChangeEntry>({
                EntityName: 'MJ: Record Changes',
                ExtraFilter: whereClause,
                OrderBy: 'ChangedAt ASC, ID ASC',
                MaxRows: batchSize + 1,
                ResultType: 'simple',
                BypassCache: true,
            }, contextUser);

            if (!rawChangesResult.Success) {
                throw new Error(
                    `Failed to query local MJ: Record Changes for '${entityMap.Entity}': ${rawChangesResult.ErrorMessage}`
                );
            }

            hasMore = rawChangesResult.Results.length > batchSize;
            const windowRows = hasMore
                ? rawChangesResult.Results.slice(0, batchSize)
                : rawChangesResult.Results;

            if (windowRows.length === 0) {
                break;
            }

            const lastRow = windowRows[windowRows.length - 1];
            const nextCursor: PeerChangeCursor = {
                ChangedAt: lastRow.ChangedAt,
                ChangeID: lastRow.ID,
            };

            const coalesced = CoalesceRecordChanges(windowRows);
            if (coalesced.length > 0) {
                const applyRes = await transport.ApplyChangeBatch({
                    PairingID: pairingID,
                    SenderInstanceID: localInstanceID,
                    RunID: runID,
                    EntityName: entityMap.ExternalObjectName || entityMap.Entity,
                    Changes: coalesced,
                    PreservePrimaryKeys: peerConfig.PreservePrimaryKeys,
                });

                processed += coalesced.length;
                created += applyRes.CreatedCount;
                updated += applyRes.UpdatedCount;
                deleted += applyRes.DeletedCount;
                errored += applyRes.ErrorCount + applyRes.ConflictCount;
                skipped += applyRes.SkippedCount + applyRes.QuarantinedCount;

                // Record remote DestinationRecordID mappings in our local CompanyIntegrationRecordMap
                for (const r of applyRes.Results) {
                    if (
                        r.DestinationRecordID &&
                        (r.Status === 'Created' || r.Status === 'Updated')
                    ) {
                        await this.upsertOutboundRecordMap(
                            entityMap.CompanyIntegrationID,
                            entityMap.EntityID,
                            r.SourceRecordID,
                            r.DestinationRecordID,
                            contextUser,
                            md
                        );
                    }
                }

                if (applyRes.ErrorCount === 0) {
                    cursor = nextCursor;
                    await this.saveCompositeWatermark(
                        entityMap.ID,
                        'Push',
                        cursor,
                        coalesced.length,
                        contextUser,
                        md
                    );
                }
            } else {
                cursor = nextCursor;
                await this.saveCompositeWatermark(
                    entityMap.ID,
                    'Push',
                    cursor,
                    0,
                    contextUser,
                    md
                );
            }
        }

        return { processed, created, updated, deleted, errored, skipped };
    }

    private async enforceSchemaDriftPolicy(
        plan: SchemaReconciliationPlan,
        peerConfig: PeerSyncConfiguration,
        contextUser: UserInfo
    ): Promise<void> {
        if (plan.OverallVerdict === 'Identical' || plan.OverallVerdict === 'CompatibleSuperset') {
            return;
        }

        if (peerConfig.SchemaDriftPolicy === 'Strict') {
            throw new Error(
                `Schema drift detected under Strict policy (verdict=${plan.OverallVerdict}): ` +
                plan.EntityResults.filter(r => r.Verdict !== 'Identical')
                    .map(r => `${r.EntityName} (${r.Verdict})`)
                    .join(', ')
            );
        }

        if (peerConfig.SchemaDriftPolicy === 'AdditiveAutoEvolve') {
            if (plan.BlockedEntities.length > 0) {
                throw new Error(
                    `Incompatible schema drift blocked sync on entities: ${plan.BlockedEntities.join(', ')}`
                );
            }
            if (plan.AutoEvolvableEntities.length > 0 && this.deps.SchemaEvolutionRunner) {
                const evolved = await this.deps.SchemaEvolutionRunner.ApplyAdditivePlan(
                    plan,
                    contextUser
                );
                if (!evolved.Success) {
                    throw new Error(
                        `Additive schema evolution failed: ${evolved.ErrorMessage ?? 'unknown error'}`
                    );
                }
            }
        }
    }

    private async loadCompositeWatermark(
        entityMapID: string,
        direction: 'Pull' | 'Push',
        contextUser: UserInfo
    ): Promise<PeerChangeCursor | null> {
        const rv = new RunView(this.deps.RunViewProvider ?? null);
        const res = await rv.RunView<{ WatermarkValue: string | null }>({
            EntityName: 'MJ: Company Integration Sync Watermarks',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Direction='${direction}'`,
            Fields: ['WatermarkValue'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);

        if (!res.Success || res.Results.length === 0) {
            return null;
        }
        return this.parseCursorWatermark(res.Results[0].WatermarkValue);
    }

    private async saveCompositeWatermark(
        entityMapID: string,
        direction: 'Pull' | 'Push',
        cursor: PeerChangeCursor,
        recordsSyncedDelta: number,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<void> {
        const rv = new RunView(this.deps.RunViewProvider ?? null);
        const existing = await rv.RunView<{ ID: string; RecordsSynced: number }>({
            EntityName: 'MJ: Company Integration Sync Watermarks',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Direction='${direction}'`,
            Fields: ['ID', 'RecordsSynced'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);

        const wm = await md.GetEntityObject<MJCompanyIntegrationSyncWatermarkEntity>(
            'MJ: Company Integration Sync Watermarks',
            contextUser
        );

        if (existing.Success && existing.Results.length > 0) {
            await wm.InnerLoad(CompositeKey.FromID(existing.Results[0].ID));
            wm.WatermarkType = 'Cursor';
            wm.WatermarkValue = JSON.stringify(cursor);
            wm.LastSyncAt = new Date();
            wm.RecordsSynced = (existing.Results[0].RecordsSynced ?? 0) + recordsSyncedDelta;
        } else {
            wm.NewRecord();
            wm.EntityMapID = entityMapID;
            wm.Direction = direction;
            wm.WatermarkType = 'Cursor';
            wm.WatermarkValue = JSON.stringify(cursor);
            wm.LastSyncAt = new Date();
            wm.RecordsSynced = recordsSyncedDelta;
        }
        await wm.Save();
    }

    private async upsertOutboundRecordMap(
        companyIntegrationID: string,
        entityID: string,
        localRecordID: string,
        remoteRecordID: string,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<void> {
        const rv = new RunView(this.deps.RunViewProvider ?? null);
        const escapedRemote = remoteRecordID.replace(/'/g, "''");
        const existing = await rv.RunView<{ ID: string; EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${companyIntegrationID}' ` +
                `AND EntityID='${entityID}' ` +
                `AND ExternalSystemRecordID='${escapedRemote}'`,
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
            recordMap.ExternalSystemRecordID = remoteRecordID;
        }
        recordMap.EntityRecordID = localRecordID;
        await recordMap.Save();
    }

    private parseCursorWatermark(raw: string | null): PeerChangeCursor | null {
        if (!raw || raw.trim().length === 0) return null;
        try {
            const parsed = JSON.parse(raw) as Partial<PeerChangeCursor>;
            if (typeof parsed.ChangedAt === 'string' && typeof parsed.ChangeID === 'string') {
                return {
                    ChangedAt: parsed.ChangedAt,
                    ChangeID: parsed.ChangeID,
                };
            }
        } catch {
            // Legacy timestamp watermark fallback
        }
        return {
            ChangedAt: raw,
            ChangeID: '',
        };
    }

    private parsePeerConfiguration(
        companyIntegration: MJCompanyIntegrationEntity
    ): PeerSyncConfiguration {
        const rawConfig = companyIntegration.Configuration;
        let parsed: Partial<PeerSyncConfiguration> = {};
        if (rawConfig && rawConfig.trim().length > 0) {
            try {
                parsed = JSON.parse(rawConfig) as Partial<PeerSyncConfiguration>;
            } catch {
                parsed = {};
            }
        }

        return {
            ...DEFAULT_PEER_SYNC_CONFIG,
            ...parsed,
            PeerGraphQLUrl:
                parsed.PeerGraphQLUrl ||
                companyIntegration.ExternalSystemID ||
                DEFAULT_PEER_SYNC_CONFIG.PeerGraphQLUrl,
        };
    }

    private resolveTransport(peerConfig: PeerSyncConfiguration): IPeerSyncTransport {
        if (this.deps.Transport) {
            return this.deps.Transport;
        }
        return new GraphQLPeerSyncTransport({
            PeerGraphQLUrl: peerConfig.PeerGraphQLUrl,
        });
    }

    private resolveLocalInstanceID(peerConfig: PeerSyncConfiguration): string {
        return (
            this.deps.LocalInstanceID ||
            peerConfig.PeerInstanceID ||
            process.env['MJ_DEPLOYMENT_ID'] ||
            '00000000-0000-0000-0000-000000000001'
        );
    }

    private buildLocalManifest(
        peerConfig: PeerSyncConfiguration,
        entityMaps: ICompanyIntegrationEntityMap[]
    ): PeerManifest {
        return {
            InstanceID: this.resolveLocalInstanceID(peerConfig),
            InstanceName: this.deps.LocalInstanceName ?? 'Local MJ Instance',
            MJCoreVersion: this.deps.LocalMJCoreVersion ?? '5.27.0',
            DatabaseEngine: this.deps.LocalDatabaseEngine ?? 'SQLServer',
            ServerTimestamp: new Date().toISOString(),
            SupportedCapabilities: [
                'SchemaFingerprint',
                'ChangeCoalescing',
                'ThreeWayMerge',
                'HybridIdentityGate',
                'DoorbellWebhook',
            ],
            AllowedEntityNames: entityMaps.map(em => em.Entity || em.ExternalObjectName),
        };
    }
}
