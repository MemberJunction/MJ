import { randomUUID } from 'node:crypto';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { EntityInfo, Metadata, UserInfo } from '@memberjunction/core';
import type {
    CacheInvalidationNotification,
    CacheInvalidationPayload,
    ReadPermissionRow,
    RoleHolder,
} from '../generic/CacheInvalidationResolver.js';

/**
 * Supported cache invalidation broadcast topologies.
 */
export type CacheInvalidationBroadcastTopology =
    | 'SequencedRoleBucket'
    | 'AzureWebPubSub'
    | 'AWSIoTCore'
    | 'GCPPubSub';

/**
 * Configuration options for the cache invalidation broadcast subsystem.
 * Configured under `cacheSettings.broadcast` in `mj.config.cjs` or via `MJ_CACHE_BROADCAST_*` env vars.
 */
export interface CacheBroadcastProviderConfig {
    /**
     * Driver key registered with `@RegisterClass(BaseCacheInvalidationBroadcastProvider, key)`.
     * Defaults to `'SequencedRoleBucket'`.
     */
    provider?: CacheInvalidationBroadcastTopology | string;
    /**
     * Maximum number of sequenced invalidation events retained in the in-memory ring buffer
     * for catch-up delta queries (`GetCacheInvalidationsSince`). Defaults to 5000.
     */
    ringBufferSize?: number;
    /**
     * Optional list of entity names whose cache invalidation broadcasts should be suppressed
     * (e.g., high-churn telemetry/audit tables never cached on the client).
     */
    excludedEntities?: string[];
    /**
     * Azure Web PubSub configuration (used when `provider === 'AzureWebPubSub'`).
     */
    azureWebPubSub?: {
        endpoint?: string;
        hubName?: string;
        accessKey?: string;
        tokenTtlMinutes?: number;
    };
    /**
     * AWS IoT Core MQTT over WebSockets configuration (used when `provider === 'AWSIoTCore'`).
     */
    awsIoTCore?: {
        endpoint?: string;
        region?: string;
        topicPrefix?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        tokenTtlSeconds?: number;
    };
    /**
     * Google Cloud Pub/Sub / Cloud Run WebSockets configuration (used when `provider === 'GCPPubSub'`).
     */
    gcpPubSub?: {
        projectId?: string;
        topicPrefix?: string;
        gatewayUrl?: string;
        signingSecret?: string;
        tokenTtlSeconds?: number;
    };
}

/**
 * Catch-up response returned by `GetChangesSince` when a client detects a sequence gap
 * via `X-MJ-Cache-Seq` / `X-MJ-Server-ID` HTTP headers or WebSocket reconnection.
 */
export interface CacheInvalidationCatchUpResponse {
    /**
     * True when the requested `sinceSequence` has already been evicted from the ring buffer,
     * belongs to a future sequence, or the server restarted. Instructs the client to evict
     * its local dataset cache and re-fetch cleanly.
     */
    RequiresFullRefresh: boolean;
    /**
     * Latest monotonic sequence number assigned by this server process.
     */
    CurrentSequence: number;
    /**
     * Unique process identifier for this MJServer instance (`X-MJ-Server-ID`).
     */
    ServerProcessID: string;
    /**
     * Ordered delta of permission-filtered, RLS-shaped invalidation events strictly after `sinceSequence`.
     */
    Events: CacheInvalidationNotification[];
}

/**
 * Connection token and subscription metadata returned by `NegotiateClientConnection`
 * for Topology 3 external cloud WebSocket multiplexers (or in-process GraphQL WS fallback).
 */
export interface CacheBroadcastNegotiationResult {
    /**
     * Active provider driver key (e.g. `'SequencedRoleBucket'`, `'AzureWebPubSub'`, `'AWSIoTCore'`, `'GCPPubSub'`).
     */
    Provider: string;
    /**
     * WebSocket endpoint URL for the client to connect to.
     */
    Url: string;
    /**
     * Signed token / credentials authorizing the client for its role-scoped broadcast groups.
     */
    Token?: string;
    /**
     * Role-scoped group/topic names the client is authorized to subscribe to.
     */
    Groups: string[];
    /**
     * ISO-8601 expiration timestamp for the negotiated token.
     */
    ExpiresAt: string;
    /**
     * Current server process ID for sequence continuity tracking.
     */
    ServerProcessID: string;
    /**
     * Current server invalidation sequence at the moment of negotiation.
     */
    CurrentSequence: number;
}

/**
 * Result of evaluating an invalidation event against a single role fingerprint bucket.
 */
export interface RoleBucketEvaluationResult {
    Allow: boolean;
    WithholdKey: boolean;
    Shaped: CacheInvalidationNotification;
}

interface RingBufferEntry {
    Sequence: number;
    Payload: CacheInvalidationPayload;
}

/**
 * High-churn system telemetry/logging entities that can optionally be excluded from browser
 * invalidation fan-out because browsers do not maintain live dataset caches for them.
 */
export const DEFAULT_HIGH_CHURN_SYSTEM_ENTITIES: readonly string[] = [
    'MJ: Audit Logs',
    'MJ: Error Logs',
    'MJ: AI Prompt Runs',
    'MJ: AI Agent Runs',
    'MJ: AI Agent Run Steps',
    'MJ: Query Execution Histories',
];

/**
 * Abstract base class for MemberJunction's pluggable Cache Invalidation Broadcast Hierarchy.
 *
 * Provides the shared primitives used by all broadcast topologies:
 * 1. **Monotonic Sequence Ring Buffer (Topology 1)**: Every invalidation event is stamped with a
 *    monotonically increasing `Sequence` integer and stored in a bounded circular buffer (`MaxRingBufferSize`),
 *    enabling HTTP `X-MJ-Cache-Seq` piggybacking and `GetCacheInvalidationsSince` delta catch-up.
 * 2. **Role-Fingerprint $O(\text{Roles})$ Evaluation & Shaping Memoizer (Topology 2)**: Computes a canonical
 *    fingerprint of a user's sorted `RoleID`s (cached per `UserInfo` in a `WeakMap`) and memoizes
 *    entity read-permission checks (`CanRead`) and row-level security key-withholding (`ReadIsRowFiltered`)
 *    once per `(payload, entity, roleFingerprint)` tuple instead of once per connected WebSocket client.
 * 3. **Cloud Multiplexer Extension Hooks (Topology 3)**: Subclasses (`AzureWebPubSubBroadcastProvider`,
 *    `AWSIoTCoreBroadcastProvider`, `GCPPubSubBroadcastProvider`) override `PublishInvalidation` and
 *    `NegotiateClientConnection` to offload WebSocket fan-out to managed cloud pub/sub infrastructure.
 */
export abstract class BaseCacheInvalidationBroadcastProvider {
    private static readonly _serverProcessId: string = randomUUID();

    private _currentSequence = 0;
    private _maxRingBufferSize = 5000;
    private _ringBuffer: Array<RingBufferEntry | undefined> = [];
    private _ringHead = 0;
    private _ringCount = 0;
    private _excludedEntities: Set<string> = new Set<string>();
    protected _config: CacheBroadcastProviderConfig = {};

    /**
     * Memoizes canonical role fingerprints per `RoleHolder` / `UserInfo` object reference.
     */
    private readonly _roleFingerprintCache = new WeakMap<object, { roleCount: number; fingerprint: string }>();

    /**
     * Memoizes `Metadata.EntityByName` lookup per `CacheInvalidationPayload` object reference
     * so `CacheInvalidationFilter` and `CacheInvalidationResolver` only look up the entity once per event.
     */
    private readonly _payloadEntityCache = new WeakMap<CacheInvalidationPayload, EntityInfo | null>();

    /**
     * Memoizes entity-level read permission (`CanRead`) per `(payload, roleFingerprint)`.
     */
    private readonly _payloadFilterMemo = new WeakMap<CacheInvalidationPayload, Map<string, boolean>>();

    /**
     * Memoizes row-level security key-withholding and shaped `CacheInvalidationNotification`
     * per `(payload, entity, roleFingerprint)`.
     */
    private readonly _payloadShapeMemo = new WeakMap<
        CacheInvalidationPayload,
        WeakMap<object, Map<string, CacheInvalidationNotification>>
    >();

    /**
     * Unique identifier of the running MJServer process, emitted in `X-MJ-Server-ID`.
     */
    public get ServerProcessID(): string {
        return BaseCacheInvalidationBroadcastProvider._serverProcessId;
    }

    /**
     * Identifier for the active broadcast topology.
     */
    public abstract get Topology(): CacheInvalidationBroadcastTopology;

    /**
     * Latest monotonic sequence number assigned to a cache invalidation event in this process.
     */
    public get CurrentSequence(): number {
        return this._currentSequence;
    }

    /**
     * Maximum number of invalidation events held in the circular ring buffer.
     */
    public get MaxRingBufferSize(): number {
        return this._maxRingBufferSize;
    }

    /**
     * Number of invalidation events currently retained in the circular ring buffer.
     */
    public get BufferedEventCount(): number {
        return this._ringCount;
    }

    /**
     * Configures the provider instance with buffer sizing, entity exclusions, and cloud settings.
     */
    public Configure(config?: CacheBroadcastProviderConfig): void {
        this._config = config ?? {};
        const desiredSize = config?.ringBufferSize && config.ringBufferSize > 0 ? Math.floor(config.ringBufferSize) : 5000;
        if (desiredSize !== this._maxRingBufferSize || this._ringBuffer.length === 0) {
            this._maxRingBufferSize = desiredSize;
            this._ringBuffer = new Array<RingBufferEntry | undefined>(this._maxRingBufferSize);
            this._ringHead = 0;
            this._ringCount = 0;
        }
        this._excludedEntities = new Set(
            (config?.excludedEntities ?? [])
                .map((name) => name.trim().toLowerCase())
                .filter((name) => name.length > 0)
        );
    }

    /**
     * Returns whether invalidation events for `entityName` should be broadcast to clients.
     * Returns `false` for blank names or entities explicitly listed in `excludedEntities`.
     */
    public ShouldBroadcastEntity(entityName: string | undefined | null): boolean {
        if (!entityName) {
            return false;
        }
        const normalized = entityName.trim().toLowerCase();
        if (normalized.length === 0) {
            return false;
        }
        return !this._excludedEntities.has(normalized);
    }

    /**
     * Computes a canonical, order-independent role fingerprint for a user (`RoleHolder`).
     * Memoized per user object in a `WeakMap` so repeated evaluations across thousands of events are $O(1)$.
     */
    public GetRoleFingerprint(user: RoleHolder | undefined | null): string {
        if (!user || typeof user !== 'object') {
            return 'anonymous';
        }
        const roles = user.UserRoles;
        if (!Array.isArray(roles)) {
            return 'no-roles';
        }
        const cached = this._roleFingerprintCache.get(user);
        if (cached && cached.roleCount === roles.length) {
            return cached.fingerprint;
        }

        let fingerprint: string;
        if (roles.length === 0) {
            fingerprint = 'roles:empty';
        } else if (roles.length === 1) {
            fingerprint = `roles:${(roles[0]?.RoleID ?? '').trim().toLowerCase()}`;
        } else {
            const normalizedIds: string[] = new Array<string>(roles.length);
            for (let i = 0; i < roles.length; i++) {
                normalizedIds[i] = (roles[i]?.RoleID ?? '').trim().toLowerCase();
            }
            normalizedIds.sort();
            fingerprint = `roles:${normalizedIds.join('|')}`;
        }

        this._roleFingerprintCache.set(user, { roleCount: roles.length, fingerprint });
        return fingerprint;
    }

    /**
     * Resolves and caches the `EntityInfo` for a `CacheInvalidationPayload` so that
     * `CacheInvalidationFilter` and `CacheInvalidationResolver` do not repeat metadata lookups.
     */
    public ResolveEntityForPayload(
        payload: CacheInvalidationPayload,
        entityLookup?: (entityName: string) => EntityInfo | undefined | null
    ): EntityInfo | null {
        if (this._payloadEntityCache.has(payload)) {
            return this._payloadEntityCache.get(payload) ?? null;
        }
        const entityName = payload?.entityName;
        if (!entityName) {
            this._payloadEntityCache.set(payload, null);
            return null;
        }
        const entity = entityLookup
            ? (entityLookup(entityName) ?? null)
            : (new Metadata().EntityByName(entityName) ?? null); // global-provider-ok: subscription broadcast provider resolves server-wide entity metadata once per event
        this._payloadEntityCache.set(payload, entity);
        return entity;
    }

    /**
     * Evaluates whether `user` has entity-level read permission for `payload`, memoized by
     * `(payload, entityName, roleFingerprint)` so $N$ subscribers sharing $R$ role combinations
     * only run `GetUserPermisions` $R$ times per event.
     */
    public EvaluateEntityReadAccess(
        payload: CacheInvalidationPayload,
        user: UserInfo | undefined,
        entityLookup?: (entityName: string) => EntityInfo | undefined | null
    ): boolean {
        if (!user) {
            return false;
        }
        const entityName = payload?.entityName;
        if (!this.ShouldBroadcastEntity(entityName)) {
            return false;
        }

        const entity = this.ResolveEntityForPayload(payload, entityLookup);
        if (!entity) {
            // Unknown entity: deliver rather than leaving client cache silently stale
            return true;
        }

        // Only coalesce across users when UserRoles is an array; mock users without UserRoles
        // in isolated unit tests are evaluated directly.
        if (!Array.isArray(user.UserRoles)) {
            return entity.GetUserPermisions(user).CanRead;
        }

        let bucketMap = this._payloadFilterMemo.get(payload);
        if (!bucketMap) {
            bucketMap = new Map<string, boolean>();
            this._payloadFilterMemo.set(payload, bucketMap);
        }

        const bucketKey = `${entity.Name.toLowerCase()}::${this.GetRoleFingerprint(user)}`;
        const cached = bucketMap.get(bucketKey);
        if (cached !== undefined) {
            return cached;
        }

        const canRead = entity.GetUserPermisions(user).CanRead;
        bucketMap.set(bucketKey, canRead);
        return canRead;
    }

    /**
     * Evaluates whether every read permission the user holds on `entity` is gated by a
     * Row-Level Security filter (`ReadRLSFilterID`).
     */
    public ReadIsRowFiltered(
        entity: { Permissions: ReadonlyArray<ReadPermissionRow> },
        user: RoleHolder
    ): boolean {
        const roles = new Set((user.UserRoles ?? []).map((role) => (role.RoleID ?? '').trim().toLowerCase()));
        let filteredReads = 0;
        for (const row of entity.Permissions) {
            if (!row.CanRead) continue;
            const isDeny = row.IsDeny ?? (row.Type ?? 'Allow').trim().toLowerCase() === 'deny';
            if (isDeny) continue;
            if (!roles.has((row.RoleID ?? '').trim().toLowerCase())) continue;
            if (!row.ReadRLSFilterID) return false;
            filteredReads += 1;
        }
        return filteredReads > 0;
    }

    /**
     * Shapes a `CacheInvalidationPayload` into a `CacheInvalidationNotification` for `user` and `entity`.
     * When `user` and `entity` are present and `user.UserRoles` is populated, the shaped object is
     * memoized per `(payload, entity, roleFingerprint)` so $N$ subscribers sharing $R$ role buckets
     * only allocate and evaluate `ReadIsRowFiltered` $R$ times per event.
     */
    public ShapeEventForSubscriber(
        payload: CacheInvalidationPayload,
        user: RoleHolder | undefined,
        entity: { Permissions: ReadonlyArray<ReadPermissionRow> } | null | undefined
    ): CacheInvalidationNotification {
        if (!user || !entity || !Array.isArray(user.UserRoles)) {
            const withholdKey = !!user && !!entity && this.ReadIsRowFiltered(entity, user);
            return this.buildNotification(payload, withholdKey);
        }

        let entityMap = this._payloadShapeMemo.get(payload);
        if (!entityMap) {
            entityMap = new WeakMap<object, Map<string, CacheInvalidationNotification>>();
            this._payloadShapeMemo.set(payload, entityMap);
        }

        let roleMap = entityMap.get(entity);
        if (!roleMap) {
            roleMap = new Map<string, CacheInvalidationNotification>();
            entityMap.set(entity, roleMap);
        }

        const fingerprint = this.GetRoleFingerprint(user);
        const existing = roleMap.get(fingerprint);
        if (existing) {
            return existing;
        }

        const withholdKey = this.ReadIsRowFiltered(entity, user);
        const shaped = this.buildNotification(payload, withholdKey);
        roleMap.set(fingerprint, shaped);
        return shaped;
    }

    /**
     * Assigns the next monotonic sequence number to `payload` (if not already stamped on this server),
     * appends it to the bounded circular ring buffer, and invokes `OnInvalidationRecorded` for
     * provider-specific fan-out.
     */
    public RecordInvalidation(payload: CacheInvalidationPayload): CacheInvalidationPayload {
        if (!this.ShouldBroadcastEntity(payload.entityName)) {
            return payload;
        }
        if (this._ringBuffer.length === 0) {
            this.Configure(this._config);
        }

        const seq = ++this._currentSequence;
        payload.sequence = seq;

        const writeIndex = (this._ringHead + this._ringCount) % this._maxRingBufferSize;
        if (this._ringCount < this._maxRingBufferSize) {
            this._ringBuffer[writeIndex] = { Sequence: seq, Payload: payload };
            this._ringCount++;
        } else {
            // Buffer full: overwrite oldest at _ringHead and advance head
            this._ringBuffer[this._ringHead] = { Sequence: seq, Payload: payload };
            this._ringHead = (this._ringHead + 1) % this._maxRingBufferSize;
        }

        void this.OnInvalidationRecorded(payload);
        return payload;
    }

    /**
     * Returns all permission-allowed, RLS-shaped invalidation events strictly after `sinceSequence`
     * for `user`. If `sinceSequence` has already been evicted from the ring buffer (or lies in the
     * future due to a server restart), sets `RequiresFullRefresh: true` and returns an empty `Events` list.
     */
    public GetChangesSince(
        sinceSequence: number,
        user: UserInfo | undefined
    ): CacheInvalidationCatchUpResponse {
        if (!user) {
            return {
                RequiresFullRefresh: true,
                CurrentSequence: this._currentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        if (sinceSequence < 0 || sinceSequence > this._currentSequence) {
            return {
                RequiresFullRefresh: true,
                CurrentSequence: this._currentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        if (sinceSequence === this._currentSequence) {
            return {
                RequiresFullRefresh: false,
                CurrentSequence: this._currentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        if (this._ringCount === 0) {
            return {
                RequiresFullRefresh: true,
                CurrentSequence: this._currentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        const oldestEntry = this._ringBuffer[this._ringHead];
        if (!oldestEntry || sinceSequence < oldestEntry.Sequence - 1) {
            return {
                RequiresFullRefresh: true,
                CurrentSequence: this._currentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        // Coalesce duplicate entity+PK events within the catch-up window (latest event wins)
        const coalescedPayloads = new Map<string, CacheInvalidationPayload>();
        for (let i = 0; i < this._ringCount; i++) {
            const idx = (this._ringHead + i) % this._maxRingBufferSize;
            const entry = this._ringBuffer[idx];
            if (!entry || entry.Sequence <= sinceSequence) {
                continue;
            }
            const payload = entry.Payload;
            if (!this.EvaluateEntityReadAccess(payload, user)) {
                continue;
            }
            const entity = this.ResolveEntityForPayload(payload);
            const shaped = this.ShapeEventForSubscriber(payload, user, entity);
            // If key is withheld (RLS-filtered), coalesce at whole-entity granularity; otherwise entity + PK
            const dedupKey = shaped.PrimaryKeyValues
                ? `${shaped.EntityName.toLowerCase()}::pk::${shaped.PrimaryKeyValues}`
                : `${shaped.EntityName.toLowerCase()}::all`;
            coalescedPayloads.set(dedupKey, payload);
        }

        const events: CacheInvalidationNotification[] = [];
        for (const payload of coalescedPayloads.values()) {
            const entity = this.ResolveEntityForPayload(payload);
            events.push(this.ShapeEventForSubscriber(payload, user, entity));
        }

        return {
            RequiresFullRefresh: false,
            CurrentSequence: this._currentSequence,
            ServerProcessID: this.ServerProcessID,
            Events: events,
        };
    }

    /**
     * Resets the sequence counter and ring buffer. Intended for unit tests.
     */
    public ResetStateForTesting(): void {
        this._currentSequence = 0;
        this._ringHead = 0;
        this._ringCount = 0;
        this._ringBuffer = new Array<RingBufferEntry | undefined>(this._maxRingBufferSize);
    }

    /**
     * Hook invoked after an invalidation event is sequenced and stored in the ring buffer.
     * Cloud multiplexer providers override this to forward role-bucketed payloads to their
     * external pub/sub infrastructure.
     */
    protected abstract OnInvalidationRecorded(payload: CacheInvalidationPayload): Promise<void>;

    /**
     * Negotiates a client broadcast connection (URL, token, and authorized role-bucket groups)
     * for the given authenticated user.
     */
    public abstract NegotiateClientConnection(
        user: UserInfo,
        defaultGraphQLWsUrl?: string
    ): Promise<CacheBroadcastNegotiationResult>;

    private buildNotification(
        payload: CacheInvalidationPayload,
        withholdKey: boolean
    ): CacheInvalidationNotification {
        const notification: CacheInvalidationNotification = {
            EntityName: payload.entityName,
            PrimaryKeyValues: withholdKey ? undefined : (payload.primaryKeyValues ?? undefined),
            Action: payload.action,
            SourceServerID: payload.sourceServerId,
            Timestamp: payload.timestamp,
            OriginSessionID: payload.originSessionId ?? undefined,
            RecordData: withholdKey ? undefined : (payload.recordData ?? undefined),
        };
        if (payload.sequence !== undefined) {
            notification.Sequence = payload.sequence;
        }
        return notification;
    }
}

/**
 * Process-wide singleton managing the active {@link BaseCacheInvalidationBroadcastProvider}.
 *
 * Uses `MJGlobal.Instance.ClassFactory` to instantiate the configured provider class
 * (defaulting to `'SequencedRoleBucket'`).
 */
export class CacheInvalidationBroadcastManager extends BaseSingleton<CacheInvalidationBroadcastManager> {
    private _provider: BaseCacheInvalidationBroadcastProvider | null = null;
    private _fallbackFactory: (() => BaseCacheInvalidationBroadcastProvider) | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): CacheInvalidationBroadcastManager {
        return super.getInstance<CacheInvalidationBroadcastManager>();
    }

    /**
     * Registers the default fallback provider factory so `Provider` is always available even
     * before `Configure()` is explicitly called.
     */
    public RegisterDefaultProviderFactory(factory: () => BaseCacheInvalidationBroadcastProvider): void {
        this._fallbackFactory = factory;
    }

    /**
     * Returns the active broadcast provider, lazily instantiating the default
     * `SequencedRoleBucketBroadcastProvider` if not yet configured.
     */
    public get Provider(): BaseCacheInvalidationBroadcastProvider {
        if (!this._provider) {
            this.Configure();
        }
        return this._provider!;
    }

    /**
     * Configures and activates a broadcast provider via `MJGlobal.Instance.ClassFactory`.
     */
    public Configure(config?: CacheBroadcastProviderConfig): BaseCacheInvalidationBroadcastProvider {
        const driverKey = config?.provider?.trim() || 'SequencedRoleBucket';
        let instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCacheInvalidationBroadcastProvider>(
            BaseCacheInvalidationBroadcastProvider,
            driverKey
        );
        if (!instance && this._fallbackFactory) {
            instance = this._fallbackFactory();
        }
        if (!instance) {
            throw new Error(
                `Failed to instantiate BaseCacheInvalidationBroadcastProvider for driver '${driverKey}'.`
            );
        }
        instance.Configure(config);
        this._provider = instance;
        return instance;
    }

    /**
     * Explicitly sets the active provider instance (useful for testing or custom programmatic wiring).
     */
    public SetProvider(provider: BaseCacheInvalidationBroadcastProvider): void {
        this._provider = provider;
    }
}
