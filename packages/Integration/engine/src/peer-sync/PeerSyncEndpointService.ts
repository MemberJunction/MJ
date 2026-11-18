import { IMetadataProvider, IRunViewProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import {
    BuildCompositeWatermarkWhereClause,
    CoalesceRecordChanges,
    PlanPeerEntityOrder,
} from './ChangeSetPlanner.js';
import { PeerSyncApplier } from './PeerSyncApplier.js';
import type { PeerSyncApplyContext } from './PeerSyncApplier.js';
import { SchemaPlanner } from './SchemaPlanner.js';
import type {
    IPeerSyncDuplicateCandidateFinder,
    IPeerSyncTransport,
    IPeerSyncVectorIndexer,
    PeerApplyBatchRequest,
    PeerApplyBatchResponse,
    PeerChangeCursor,
    PeerDatabaseEngine,
    PeerDeferredFKApplyResult,
    PeerDeferredFKUpdate,
    PeerDoorbellNotification,
    PeerDoorbellResponse,
    PeerEntitySchemaFingerprint,
    PeerFetchChangesRequest,
    PeerFetchChangesResponse,
    PeerManifest,
    PeerRecordChangeEntry,
    SchemaReconciliationPlan,
} from './types.js';

/**
 * Configuration for hosting a `PeerSyncEndpointService` on a MemberJunction instance.
 */
export interface PeerSyncEndpointConfig {
    /** Stable UUID identifying this MemberJunction instance. */
    InstanceID: string;
    /** Human-readable name of this MemberJunction instance. */
    InstanceName: string;
    /** Installed `@memberjunction/core` version string (e.g., `'5.27.0'`). */
    MJCoreVersion: string;
    /** Database engine backing this instance (`'SQLServer'` or `'PostgreSQL'`). */
    DatabaseEngine: PeerDatabaseEngine;
    /** Local `CompanyIntegration.ID` used when applying inbound changes for this pairing. */
    CompanyIntegrationID: string;
    /**
     * Optional `MJ: Integrations` ID (`Integration.ID`, NOT `CompanyIntegration.ID`)
     * recorded on inbound `RecordChange.IntegrationID`.
     */
    IntegrationID?: string | null;
    /**
     * Explicit entity allowlist exposed to the remote peer.
     * If non-empty, requests for any entity not in this list are rejected.
     */
    AllowedEntityNames: string[];
    /** Whether inbound records should preserve source UUID primary keys on create (default `true`). */
    PreservePrimaryKeys?: boolean;
    /** Duplicate score threshold for auto-linking (default `0.92`). */
    DuplicateThreshold?: number;
    /** Duplicate score threshold for quarantining potential matches (default `0.75`). */
    PotentialMatchThreshold?: number;
    /** Optional duplicate candidate finder for inbound Step 4 matching. */
    DuplicateFinder?: IPeerSyncDuplicateCandidateFinder;
    /** Optional incremental vector indexer for post-batch indexing. */
    VectorIndexer?: IPeerSyncVectorIndexer;
    /** Optional callback invoked when a remote peer sends `NotifyChangeBatch`. */
    OnDoorbellNotification?: (
        notification: PeerDoorbellNotification,
        contextUser: UserInfo
    ) => Promise<PeerDoorbellResponse>;
    /** Optional metadata provider override for testing. */
    MetadataProvider?: IMetadataProvider;
    /** Optional RunView provider override for testing. */
    RunViewProvider?: IRunViewProvider;
}

/**
 * Server-side handler for the 6 `PeerSync.*` protocol operations:
 * - `GetManifest`
 * - `GetSchemaFingerprint`
 * - `PreviewSchemaPlan`
 * - `FetchChangeBatch`
 * - `ApplyChangeBatch`
 * - `NotifyChangeBatch`
 *
 * When `AllowedEntityNames` is non-empty, enforces that allowlist on every
 * entity-scoped operation in addition to the authenticated `contextUser`'s
 * entity permissions and API-key row filters. When `AllowedEntityNames` is empty,
 * entity-level authorization relies solely on `contextUser` permissions and API-key scopes/filters.
 */
export class PeerSyncEndpointService {
    private static readonly MAX_TRACKED_DEFERRED_RUNS = 256;

    private readonly config: PeerSyncEndpointConfig;
    private readonly schemaPlanner = new SchemaPlanner();
    private readonly applier = new PeerSyncApplier();
    private readonly allowedLowerSet: Set<string>;
    private readonly pendingDeferredFKsByRun = new Map<
        string,
        { updates: PeerDeferredFKUpdate[]; preservePrimaryKeys: boolean }
    >();
    private cachedDeferredFieldsByEntityID: Map<string, string[]> | null = null;

    constructor(config: PeerSyncEndpointConfig) {
        this.config = config;
        this.allowedLowerSet = new Set(
            config.AllowedEntityNames.map(n => n.toLowerCase())
        );
        if (this.allowedLowerSet.size === 0) {
            console.warn(
                `[PeerSyncEndpointService] AllowedEntityNames is empty on peer '${config.InstanceName}'; ` +
                `entity access relies solely on contextUser permissions and API-key row filters.`
            );
        }
    }

    /**
     * Returns this instance's `PeerManifest` for the handshake phase.
     */
    public async GetManifest(): Promise<PeerManifest> {
        return {
            InstanceID: this.config.InstanceID,
            InstanceName: this.config.InstanceName,
            MJCoreVersion: this.config.MJCoreVersion,
            DatabaseEngine: this.config.DatabaseEngine,
            ServerTimestamp: new Date().toISOString(),
            SupportedCapabilities: [
                'SchemaFingerprint',
                'ChangeCoalescing',
                'ThreeWayMerge',
                'HybridIdentityGate',
                'DoorbellWebhook',
            ],
            AllowedEntityNames: [...this.config.AllowedEntityNames],
        };
    }

    /**
     * Computes structural schema fingerprints for the requested entities after
     * verifying each entity is permitted by `AllowedEntityNames`.
     */
    public async GetSchemaFingerprint(
        entityNames: string[]
    ): Promise<PeerEntitySchemaFingerprint[]> {
        for (const name of entityNames) {
            this.assertEntityAllowed(name);
        }
        return this.schemaPlanner.ExtractLocalSchemaFingerprints(
            entityNames,
            this.config.MetadataProvider
        );
    }

    /**
     * Compares `remoteSchemas` against local metadata and returns a
     * `SchemaReconciliationPlan` without executing DDL.
     */
    public async PreviewSchemaPlan(
        remoteSchemas: PeerEntitySchemaFingerprint[],
        remoteManifest?: PeerManifest
    ): Promise<SchemaReconciliationPlan> {
        for (const s of remoteSchemas) {
            this.assertEntityAllowed(s.EntityName);
        }
        const localNames = remoteSchemas.map(s => s.EntityName);
        const localFingerprints = this.schemaPlanner.ExtractLocalSchemaFingerprints(
            localNames,
            this.config.MetadataProvider
        );
        const localManifest = await this.GetManifest();
        const syntheticRemoteManifest: PeerManifest = remoteManifest ?? {
            ...localManifest,
            InstanceID: 'remote-peer',
        };
        return this.schemaPlanner.BuildReconciliationPlan(
            localManifest,
            syntheticRemoteManifest,
            localFingerprints,
            remoteSchemas
        );
    }

    /**
     * Fetches and coalesces changes for `request.EntityName` strictly after
     * `request.SinceCursor`, excluding any change with `Source = 'Sync'`.
     */
    public async FetchChangeBatch(
        request: PeerFetchChangesRequest,
        contextUser: UserInfo
    ): Promise<PeerFetchChangesResponse> {
        this.assertEntityAllowed(request.EntityName);

        const md = this.config.MetadataProvider ?? Metadata.Provider;
        const entityInfo = md.EntityByName(request.EntityName);
        if (!entityInfo) {
            throw new Error(`Entity '${request.EntityName}' not found on peer '${this.config.InstanceName}'.`);
        }

        const whereClause = BuildCompositeWatermarkWhereClause(
            entityInfo.ID,
            request.SinceCursor
        );
        const batchSize = Math.max(1, request.BatchSize || 500);

        const rv = new RunView(this.config.RunViewProvider ?? null);
        const rawResult = await rv.RunView<PeerRecordChangeEntry>({
            EntityName: 'MJ: Record Changes',
            ExtraFilter: whereClause,
            OrderBy: 'ChangedAt ASC, ID ASC',
            MaxRows: batchSize + 1,
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);

        if (!rawResult.Success) {
            throw new Error(
                `Failed to query MJ: Record Changes for '${request.EntityName}': ${rawResult.ErrorMessage}`
            );
        }

        const hasMore = rawResult.Results.length > batchSize;
        const windowRows = hasMore
            ? rawResult.Results.slice(0, batchSize)
            : rawResult.Results;

        const coalesced = CoalesceRecordChanges(windowRows);
        let nextCursor: PeerChangeCursor | null = request.SinceCursor;
        if (windowRows.length > 0) {
            const lastRow = windowRows[windowRows.length - 1];
            nextCursor = {
                ChangedAt: lastRow.ChangedAt,
                ChangeID: lastRow.ID,
            };
        }

        return {
            PairingID: request.PairingID,
            EntityName: entityInfo.Name,
            Changes: coalesced,
            NextCursor: nextCursor,
            HasMore: hasMore,
        };
    }

    /**
     * Applies an inbound batch of coalesced record changes onto this MJ instance.
     */
    public async ApplyChangeBatch(
        request: PeerApplyBatchRequest,
        contextUser: UserInfo,
        overrideContext?: Partial<PeerSyncApplyContext>
    ): Promise<PeerApplyBatchResponse> {
        this.assertEntityAllowed(request.EntityName);

        const md = this.config.MetadataProvider ?? Metadata.Provider;
        let computedDeferredFields: string[] | undefined;
        if (!overrideContext?.DeferredFieldNames) {
            const targetEntity = md.EntityByName(request.EntityName);
            if (targetEntity) {
                computedDeferredFields = this.getDeferredFieldsForEntity(targetEntity.ID, md);
            }
        }

        const effectivePreservePrimaryKeys =
            request.PreservePrimaryKeys ?? this.config.PreservePrimaryKeys ?? true;

        const applyCtx: PeerSyncApplyContext = {
            CompanyIntegrationID: this.config.CompanyIntegrationID,
            IntegrationID: this.config.IntegrationID,
            DeferredFieldNames: computedDeferredFields,
            PreservePrimaryKeys: effectivePreservePrimaryKeys,
            DuplicateThreshold: this.config.DuplicateThreshold ?? 0.92,
            PotentialMatchThreshold: this.config.PotentialMatchThreshold ?? 0.75,
            DuplicateFinder: this.config.DuplicateFinder,
            VectorIndexer: this.config.VectorIndexer,
            ContextUser: contextUser,
            MetadataProvider: this.config.MetadataProvider,
            RunViewProvider: this.config.RunViewProvider,
            ...overrideContext,
        };

        const { Response, DeferredFKUpdates } = await this.applier.ApplyBatch(
            request,
            applyCtx
        );
        if (DeferredFKUpdates.length > 0) {
            const runKey = this.buildDeferredRunKey(request.PairingID, request.RunID);
            const existing = this.pendingDeferredFKsByRun.get(runKey);
            if (existing) {
                existing.updates.push(...DeferredFKUpdates);
            } else {
                if (this.pendingDeferredFKsByRun.size >= PeerSyncEndpointService.MAX_TRACKED_DEFERRED_RUNS) {
                    const oldestKey = this.pendingDeferredFKsByRun.keys().next().value;
                    if (oldestKey !== undefined) {
                        const evicted = this.pendingDeferredFKsByRun.get(oldestKey);
                        console.warn(
                            `[PeerSyncEndpointService] Evicting ${evicted?.updates.length ?? 0} unflushed deferred FK update(s) ` +
                            `for run '${oldestKey}' because MAX_TRACKED_DEFERRED_RUNS (${PeerSyncEndpointService.MAX_TRACKED_DEFERRED_RUNS}) was exceeded.`
                        );
                        this.pendingDeferredFKsByRun.delete(oldestKey);
                    }
                }
                this.pendingDeferredFKsByRun.set(runKey, {
                    updates: [...DeferredFKUpdates],
                    preservePrimaryKeys: effectivePreservePrimaryKeys,
                });
            }
        }
        return Response;
    }

    /**
     * Flushes deferred nullable FK updates accumulated during Pass 1 for `(PairingID, RunID)`.
     */
    public async FlushDeferredForeignKeys(
        requestMeta: { PairingID: string; OriginInstanceID: string; RunID: string },
        contextUser: UserInfo
    ): Promise<PeerDeferredFKApplyResult> {
        const runKey = this.buildDeferredRunKey(requestMeta.PairingID, requestMeta.RunID);
        const queued = this.pendingDeferredFKsByRun.get(runKey);
        if (!queued || queued.updates.length === 0) {
            this.pendingDeferredFKsByRun.delete(runKey);
            return { updatedCount: 0, errorCount: 0, errors: [], errorsByEntityName: {} };
        }
        this.pendingDeferredFKsByRun.delete(runKey);

        return this.applier.ApplyDeferredForeignKeys(
            queued.updates,
            requestMeta,
            {
                CompanyIntegrationID: this.config.CompanyIntegrationID,
                IntegrationID: this.config.IntegrationID,
                PreservePrimaryKeys: queued.preservePrimaryKeys,
                DuplicateThreshold: this.config.DuplicateThreshold ?? 0.92,
                PotentialMatchThreshold: this.config.PotentialMatchThreshold ?? 0.75,
                ContextUser: contextUser,
                MetadataProvider: this.config.MetadataProvider,
                RunViewProvider: this.config.RunViewProvider,
            }
        );
    }

    private getDeferredFieldsForEntity(entityID: string, md: IMetadataProvider): string[] {
        if (!this.cachedDeferredFieldsByEntityID) {
            const scopeEntities =
                this.allowedLowerSet.size > 0
                    ? md.Entities.filter(e => this.allowedLowerSet.has(e.Name.toLowerCase()))
                    : md.Entities;
            const depPlan = PlanPeerEntityOrder(
                scopeEntities.map(e => e.ID),
                md
            );
            const byEntityID = new Map<string, string[]>();
            for (const edge of depPlan.DeferredNullableFields) {
                if (!edge.AllowsNull) continue;
                const normFrom = NormalizeUUID(edge.FromEntityID);
                const fields = byEntityID.get(normFrom) ?? [];
                fields.push(edge.FieldName);
                byEntityID.set(normFrom, fields);
            }
            this.cachedDeferredFieldsByEntityID = byEntityID;
        }
        return this.cachedDeferredFieldsByEntityID.get(NormalizeUUID(entityID)) ?? [];
    }

    private buildDeferredRunKey(pairingID: string, runID: string): string {
        return `${pairingID}::${runID}`;
    }

    /**
     * Handles an inbound real-time doorbell notification (`PeerSync.NotifyChangeBatch`).
     */
    public async NotifyChangeBatch(
        notification: PeerDoorbellNotification,
        contextUser: UserInfo
    ): Promise<PeerDoorbellResponse> {
        for (const entityName of notification.ChangedEntityNames) {
            this.assertEntityAllowed(entityName);
        }
        if (this.config.OnDoorbellNotification) {
            return this.config.OnDoorbellNotification(notification, contextUser);
        }
        return {
            Accepted: true,
            TriggeredRunID: null,
        };
    }

    private assertEntityAllowed(entityName: string): void {
        if (
            this.allowedLowerSet.size > 0 &&
            !this.allowedLowerSet.has(entityName.toLowerCase())
        ) {
            throw new Error(
                `Entity '${entityName}' is not in the AllowedEntityNames list on peer '${this.config.InstanceName}'.`
            );
        }
    }
}

/**
 * In-process implementation of `IPeerSyncTransport` that routes protocol calls
 * directly to a target `PeerSyncEndpointService` instance.
 */
export class InProcessPeerSyncTransport implements IPeerSyncTransport {
    private readonly endpoint: PeerSyncEndpointService;
    private readonly contextUser: UserInfo;

    constructor(endpoint: PeerSyncEndpointService, contextUser: UserInfo) {
        this.endpoint = endpoint;
        this.contextUser = contextUser;
    }

    public async GetManifest(): Promise<PeerManifest> {
        return this.endpoint.GetManifest();
    }

    public async GetSchemaFingerprint(
        entityNames: string[]
    ): Promise<PeerEntitySchemaFingerprint[]> {
        return this.endpoint.GetSchemaFingerprint(entityNames);
    }

    public async PreviewSchemaPlan(
        remoteSchemas: PeerEntitySchemaFingerprint[]
    ): Promise<SchemaReconciliationPlan> {
        return this.endpoint.PreviewSchemaPlan(remoteSchemas);
    }

    public async FetchChangeBatch(
        request: PeerFetchChangesRequest
    ): Promise<PeerFetchChangesResponse> {
        return this.endpoint.FetchChangeBatch(request, this.contextUser);
    }

    public async ApplyChangeBatch(
        request: PeerApplyBatchRequest
    ): Promise<PeerApplyBatchResponse> {
        return this.endpoint.ApplyChangeBatch(request, this.contextUser);
    }

    public async FlushDeferredForeignKeys(requestMeta: {
        PairingID: string;
        OriginInstanceID: string;
        RunID: string;
    }): Promise<PeerDeferredFKApplyResult> {
        return this.endpoint.FlushDeferredForeignKeys(requestMeta, this.contextUser);
    }

    public async NotifyChangeBatch(
        notification: PeerDoorbellNotification
    ): Promise<PeerDoorbellResponse> {
        return this.endpoint.NotifyChangeBatch(notification, this.contextUser);
    }
}
