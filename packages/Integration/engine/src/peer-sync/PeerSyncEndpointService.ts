import { IMetadataProvider, IRunViewProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    BuildCompositeWatermarkWhereClause,
    CoalesceRecordChanges,
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
 * Enforces `AllowedEntityNames` on every entity-scoped operation so a peer can
 * never read or mutate entities outside the configured integration scope.
 */
export class PeerSyncEndpointService {
    private readonly config: PeerSyncEndpointConfig;
    private readonly schemaPlanner = new SchemaPlanner();
    private readonly applier = new PeerSyncApplier();
    private readonly allowedLowerSet: Set<string>;
    private pendingDeferredFKs: PeerDeferredFKUpdate[] = [];

    constructor(config: PeerSyncEndpointConfig) {
        this.config = config;
        this.allowedLowerSet = new Set(
            config.AllowedEntityNames.map(n => n.toLowerCase())
        );
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
        const entityInfo = md.Entities.find(
            e => e.Name.toLowerCase() === request.EntityName.toLowerCase()
        );
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

        const applyCtx: PeerSyncApplyContext = {
            CompanyIntegrationID: this.config.CompanyIntegrationID,
            PreservePrimaryKeys: this.config.PreservePrimaryKeys ?? true,
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
            this.pendingDeferredFKs.push(...DeferredFKUpdates);
        }
        return Response;
    }

    /**
     * Flushes any deferred nullable FK updates accumulated during Pass 1 of a multi-entity sync.
     */
    public async FlushDeferredForeignKeys(
        requestMeta: { PairingID: string; OriginInstanceID: string; RunID: string },
        contextUser: UserInfo
    ): Promise<number> {
        if (this.pendingDeferredFKs.length === 0) return 0;
        const toFlush = [...this.pendingDeferredFKs];
        this.pendingDeferredFKs = [];

        return this.applier.ApplyDeferredForeignKeys(
            toFlush,
            requestMeta,
            {
                CompanyIntegrationID: this.config.CompanyIntegrationID,
                PreservePrimaryKeys: this.config.PreservePrimaryKeys ?? true,
                DuplicateThreshold: this.config.DuplicateThreshold ?? 0.92,
                PotentialMatchThreshold: this.config.PotentialMatchThreshold ?? 0.75,
                ContextUser: contextUser,
                MetadataProvider: this.config.MetadataProvider,
                RunViewProvider: this.config.RunViewProvider,
            }
        );
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

    public async NotifyChangeBatch(
        notification: PeerDoorbellNotification
    ): Promise<PeerDoorbellResponse> {
        return this.endpoint.NotifyChangeBatch(notification, this.contextUser);
    }
}

/**
 * GraphQL HTTP/HTTPS implementation of `IPeerSyncTransport` that communicates
 * with a remote MemberJunction instance's `/graphql` endpoint.
 */
export class GraphQLPeerSyncTransport implements IPeerSyncTransport {
    private readonly graphqlUrl: string;
    private readonly headers: Record<string, string>;

    constructor(options: {
        PeerGraphQLUrl: string;
        ApiKey?: string;
        BearerToken?: string;
    }) {
        this.graphqlUrl = options.PeerGraphQLUrl;
        this.headers = {
            'Content-Type': 'application/json',
        };
        if (options.ApiKey) {
            this.headers['x-api-key'] = options.ApiKey;
        }
        if (options.BearerToken) {
            this.headers['Authorization'] = `Bearer ${options.BearerToken}`;
        }
    }

    public async GetManifest(): Promise<PeerManifest> {
        const query = `query PeerSyncGetManifest { PeerSyncGetManifest }`;
        const data = await this.executeGraphQL<{ PeerSyncGetManifest: string }>(query, {});
        return JSON.parse(data.PeerSyncGetManifest) as PeerManifest;
    }

    public async GetSchemaFingerprint(
        entityNames: string[]
    ): Promise<PeerEntitySchemaFingerprint[]> {
        const query = `query PeerSyncGetSchemaFingerprint($entityNames: [String!]!) {
            PeerSyncGetSchemaFingerprint(entityNames: $entityNames)
        }`;
        const data = await this.executeGraphQL<{ PeerSyncGetSchemaFingerprint: string }>(
            query,
            { entityNames }
        );
        return JSON.parse(data.PeerSyncGetSchemaFingerprint) as PeerEntitySchemaFingerprint[];
    }

    public async PreviewSchemaPlan(
        remoteSchemas: PeerEntitySchemaFingerprint[]
    ): Promise<SchemaReconciliationPlan> {
        const query = `query PeerSyncPreviewSchemaPlan($remoteSchemasJSON: String!) {
            PeerSyncPreviewSchemaPlan(remoteSchemasJSON: $remoteSchemasJSON)
        }`;
        const data = await this.executeGraphQL<{ PeerSyncPreviewSchemaPlan: string }>(
            query,
            { remoteSchemasJSON: JSON.stringify(remoteSchemas) }
        );
        return JSON.parse(data.PeerSyncPreviewSchemaPlan) as SchemaReconciliationPlan;
    }

    public async FetchChangeBatch(
        request: PeerFetchChangesRequest
    ): Promise<PeerFetchChangesResponse> {
        const query = `query PeerSyncFetchChangeBatch($requestJSON: String!) {
            PeerSyncFetchChangeBatch(requestJSON: $requestJSON)
        }`;
        const data = await this.executeGraphQL<{ PeerSyncFetchChangeBatch: string }>(
            query,
            { requestJSON: JSON.stringify(request) }
        );
        return JSON.parse(data.PeerSyncFetchChangeBatch) as PeerFetchChangesResponse;
    }

    public async ApplyChangeBatch(
        request: PeerApplyBatchRequest
    ): Promise<PeerApplyBatchResponse> {
        const mutation = `mutation PeerSyncApplyChangeBatch($requestJSON: String!) {
            PeerSyncApplyChangeBatch(requestJSON: $requestJSON)
        }`;
        const data = await this.executeGraphQL<{ PeerSyncApplyChangeBatch: string }>(
            mutation,
            { requestJSON: JSON.stringify(request) }
        );
        return JSON.parse(data.PeerSyncApplyChangeBatch) as PeerApplyBatchResponse;
    }

    public async NotifyChangeBatch(
        notification: PeerDoorbellNotification
    ): Promise<PeerDoorbellResponse> {
        const mutation = `mutation PeerSyncNotifyChangeBatch($notificationJSON: String!) {
            PeerSyncNotifyChangeBatch(notificationJSON: $notificationJSON)
        }`;
        const data = await this.executeGraphQL<{ PeerSyncNotifyChangeBatch: string }>(
            mutation,
            { notificationJSON: JSON.stringify(notification) }
        );
        return JSON.parse(data.PeerSyncNotifyChangeBatch) as PeerDoorbellResponse;
    }

    private async executeGraphQL<TData>(
        query: string,
        variables: Record<string, string | string[]>
    ): Promise<TData> {
        const response = await fetch(this.graphqlUrl, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new Error(
                `PeerSync GraphQL HTTP error ${response.status}: ${response.statusText}`
            );
        }

        const payload = (await response.json()) as {
            data?: TData;
            errors?: Array<{ message: string }>;
        };
        if (payload.errors && payload.errors.length > 0) {
            throw new Error(
                `PeerSync GraphQL error: ${payload.errors.map(e => e.message).join('; ')}`
            );
        }
        if (!payload.data) {
            throw new Error('PeerSync GraphQL response contained no data.');
        }
        return payload.data;
    }
}
