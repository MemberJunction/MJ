import { v4 as uuidv4 } from 'uuid';
import { InMemoryLocalStorageProvider, type ILocalStorageProvider } from '@memberjunction/core';
import { ExcludeByUUIDs, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { createClient } from 'graphql-ws';
import type { CacheInvalidationEventData } from './ClientTabInvalidationMultiplexer';
import {
    WS_CONNECTION_ACK_TIMEOUT_MS,
    WS_KEEPALIVE_MS,
    WS_PONG_TIMEOUT_MS,
    type SocketConnectionState,
} from './graphQLDataProvider';
import { BrowserIndexedDBStorageProvider } from './storage-providers';
import {
    AttachTabPortMessageListener,
    CloneKernelValue,
    WrapGraphQLWsClient,
    WrapNativeSharedWorkerGlobalScope,
    type KernelCatchUpDelegateResultMessage,
    type KernelCatchUpRequestMessage,
    type KernelClientToHostMessage,
    type KernelCoordinateRefreshRequestMessage,
    type KernelDisconnectMessage,
    type KernelForceReconnectMessage,
    type KernelHeartbeatMessage,
    type KernelHelloMessage,
    type KernelHostToClientMessage,
    type KernelMutationNoticeMessage,
    type KernelRefreshTokenResponseMessage,
    type KernelRunViewAcquireMessage,
    type KernelRunViewCompleteMessage,
    type KernelStatsRequestMessage,
    type KernelStorageRequestMessage,
    type KernelSubscribeMessage,
    type KernelSubscriptionKind,
    type KernelTokenUpdateMessage,
    type KernelUnsubscribeMessage,
    type KernelWsClientConfig,
    type KernelWsClientLike,
    type SharedTabKernelHostOptions,
    type SharedTabKernelStats,
    type SharedWorkerConnectEventLike,
    type SharedWorkerGlobalScopeLike,
    type TabPortLike,
} from './SharedTabKernelProtocol';

const CACHE_INVALIDATION_CHANNEL_KEY = 'cache_invalidation';

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 20_000;
const DEFAULT_HEARTBEAT_SWEEP_INTERVAL_MS = 5_000;
const DEFAULT_RUNVIEW_L1_MAX_ENTRIES = 256;
const DEFAULT_RUNVIEW_L1_TTL_MS = 5_000;
const DEFAULT_STORAGE_L1_MAX_ENTRIES = 512;
const DEFAULT_TOKEN_REFRESH_TIMEOUT_MS = 15_000;
const DEFAULT_WS_CLIENT_MAX_AGE_MS = 30 * 60 * 1000;

interface ConnectedTabState {
    TabId: string;
    SessionId: string;
    ScopeKey: string;
    Port: TabPortLike;
    DetachListener: () => void;
    CanRefreshToken: boolean;
    LastHeartbeatAt: number;
    SubscriptionIds: Set<string>;
}

interface UpstreamSubscriptionState {
    ChannelKey: string;
    Kind: KernelSubscriptionKind;
    Query: string;
    Variables?: Record<string, unknown>;
    Extensions?: Record<string, unknown>;
    SubscribersByTab: Map<string, Set<string>>;
    UnsubscribeUpstream: (() => void) | null;
}

interface RunViewL1Entry {
    CacheKey: string;
    Value: unknown;
    EntityNames: Set<string>;
    CreatedAt: number;
}

interface InFlightRunViewWaiter {
    TabId: string;
    RequestId: string;
}

interface InFlightRunViewEntry {
    CacheKey: string;
    OwnerTabId: string;
    RequestId: string;
    EntityNames: Set<string>;
    AllowL1Write: boolean;
    StartGlobalEpoch: number;
    StartEntityEpochs: Map<string, number>;
    Waiters: InFlightRunViewWaiter[];
}

interface RefreshInFlightState {
    Generation: number;
    OwnerTabId: string | null;
    RequestId: string | null;
    Promise: Promise<string>;
    Resolve: (token: string) => void;
    Reject: (err: Error) => void;
    Timer: ReturnType<typeof setTimeout> | null;
}

interface CatchUpInFlightState {
    TargetSequence: number;
    OwnerTabId: string | null;
    RequestId: string | null;
    Promise: Promise<void>;
    Resolve: () => void;
}

interface StorageCacheBucket {
    StorageL1: Map<string, unknown>;
    StorageWriteSignatures: Map<string, string>;
    InFlightStorageReads: Map<string, Promise<unknown>>;
    StorageWriteQueues: Map<string, Promise<void>>;
}

interface ScopeState {
    ScopeKey: string;
    WsUrl: string;
    GraphQLUrl: string;
    Token: string;
    MJAPIKey?: string;
    UserAPIKey?: string;
    TokenGeneration: number;
    LastSequence: number;
    LastServerProcessId: string | null;

    Tabs: Map<string, ConnectedTabState>;
    WsClient: KernelWsClientLike | null;
    WsClientCreatedAt: number | null;
    SocketState: SocketConnectionState;
    IsDisposingWsIntentionally: boolean;
    DisarmPongWatchdog: (() => void) | null;

    UpstreamSubscriptions: Map<string, UpstreamSubscriptionState>;
    SubIdToChannel: Map<string, { TabId: string; ChannelKey: string }>;

    RefreshInFlight: RefreshInFlightState | null;
    JwtReconnectInFlight: Promise<void> | null;
    CatchUpInFlight: CatchUpInFlightState | null;

    RunViewL1: Map<string, RunViewL1Entry>;
    InFlightRunViews: Map<string, InFlightRunViewEntry>;
    InFlightRunViewsByRequestId: Map<string, InFlightRunViewEntry>;
    GlobalMutationEpoch: number;
    EntityMutationEpochs: Map<string, number>;
}

/**
 * Normalizes a scope key identically to `ClientTabInvalidationMultiplexer.NormalizeScopeKey`.
 */
function normalizeScopeKey(scopeKey: string): string {
    return (scopeKey || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Normalizes entity names for case-insensitive cache indexing and invalidation.
 */
function normalizeEntityName(entityName: string): string {
    return (entityName || '').trim().toLowerCase();
}

/**
 * Computes a fast, deterministic, dependency-free 64-bit FNV-1a digest for storage write deduplication.
 */
export function ComputeKernelContentDigest(value: unknown): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;

    const feedString = (str: string): void => {
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            h1 ^= c & 0xff;
            h1 = Math.imul(h1, 0x01000193);
            h2 ^= (c >>> 8) ^ (c & 0xff);
            h2 = Math.imul(h2, 0x01000193);
        }
    };

    const visit = (v: unknown): void => {
        if (v === null) {
            feedString('N;');
            return;
        }
        if (v === undefined) {
            feedString('U;');
            return;
        }
        const t = typeof v;
        if (t === 'string') {
            const s = v as string;
            feedString(`S${s.length}:${s};`);
            return;
        }
        if (t === 'number' || t === 'boolean') {
            feedString(`${t[0].toUpperCase()}${String(v)};`);
            return;
        }
        if (v instanceof Date) {
            feedString(`D${v.getTime()};`);
            return;
        }
        if (v instanceof Uint8Array) {
            feedString(`B${v.byteLength}:`);
            const step = Math.max(1, Math.floor(v.byteLength / 64));
            for (let i = 0; i < v.byteLength; i += step) {
                h1 ^= v[i];
                h1 = Math.imul(h1, 0x01000193);
            }
            return;
        }
        if (v instanceof Set) {
            feedString(`Set${v.size}[`);
            for (const item of v.values()) {
                visit(item);
            }
            feedString(']');
            return;
        }
        if (v instanceof Map) {
            feedString(`Map${v.size}[`);
            for (const [mk, mv] of v.entries()) {
                visit(mk);
                visit(mv);
            }
            feedString(']');
            return;
        }
        if (Array.isArray(v)) {
            feedString(`A${v.length}[`);
            for (let i = 0; i < v.length; i++) {
                visit(v[i]);
            }
            feedString(']');
            return;
        }
        if (t === 'object') {
            const rec = v as Record<string, unknown>;
            const keys = Object.keys(rec).sort();
            feedString(`O${keys.length}{`);
            for (const k of keys) {
                if (rec[k] !== undefined && typeof rec[k] !== 'function') {
                    feedString(`${k}=`);
                    visit(rec[k]);
                }
            }
            feedString('}');
        }
    };

    visit(value);
    return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Shared Tab Kernel Host — runs inside the browser `SharedWorker` (or in-process in tests).
 *
 * Responsibilities:
 *  - Hosts **one** origin `graphql-ws` WebSocket per scope (`wsUrl|userId`), multiplexing
 *    `cacheInvalidation`, per-session `PushStatusUpdates(sessionId)`, and generic `Subscribe()` channels.
 *  - Survives individual tab closes (including Tab 1) without dropping active streams; cleans up dead tabs
 *    automatically via port heartbeats.
 *  - Coordinates cross-tab JWT refresh single-flight and syncs refreshed tokens across all tabs.
 *  - Shares an LRU L1 RunView cache + cross-tab in-flight request coalescing with safe copy-on-read isolation
 *    and immediate mutation/invalidation eviction.
 *  - Owns the single `ILocalStorageProvider` (`BrowserIndexedDBStorageProvider`) per scope with an in-memory
 *    L1 layer, read coalescing, and identical-write deduplication.
 */
export class SharedTabKernelHost {
    public readonly HostInstanceId: string = uuidv4();

    private readonly _options: SharedTabKernelHostOptions;
    private readonly _heartbeatTimeoutMs: number;
    private readonly _heartbeatSweepIntervalMs: number;
    private readonly _runViewL1MaxEntries: number;
    private readonly _runViewL1TtlMs: number;
    private readonly _storageL1MaxEntries: number;
    private readonly _tokenRefreshTimeoutMs: number;
    private readonly _pongTimeoutMs: number;
    private readonly _wsKeepAliveMs: number;
    private readonly _wsConnectionAckTimeoutMs: number;

    private _scopes = new Map<string, ScopeState>();
    private _storageByScope = new Map<string, ILocalStorageProvider>();
    private _storageBuckets = new WeakMap<ILocalStorageProvider, StorageCacheBucket>();
    private _sharedBrowserStorage: ILocalStorageProvider | null = null;
    private _tabToScope = new Map<string, string>();
    private _unregisteredPorts = new Set<{ Port: TabPortLike; Detach: () => void }>();
    private _heartbeatSweepTimer: ReturnType<typeof setInterval> | null = null;
    private _isDisposed = false;

    private _stats: SharedTabKernelStats = {
        ActiveTabCount: 0,
        WsClientCreatedCount: 0,
        ActiveWsClientCount: 0,
        ActiveWsSubscriptionCount: 0,
        StatusUpdatesStreamCount: 0,
        RunViewL1HitCount: 0,
        RunViewCoalescedCount: 0,
        RunViewBackendExecCount: 0,
        StorageL1HitCount: 0,
        StorageCoalescedReadCount: 0,
        StorageIdbReadCount: 0,
        StorageIdbWriteCount: 0,
        StorageIdbDeduplicatedWriteCount: 0,
        TokenRefreshCoalescedCount: 0,
        InvalidationEventsRelayedCount: 0,
        DroppedTabCleanupCount: 0,
    };

    constructor(options: SharedTabKernelHostOptions = {}) {
        this._options = options;
        this._heartbeatTimeoutMs = options.HeartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
        this._heartbeatSweepIntervalMs = options.HeartbeatSweepIntervalMs ?? DEFAULT_HEARTBEAT_SWEEP_INTERVAL_MS;
        this._runViewL1MaxEntries = options.RunViewL1MaxEntries ?? DEFAULT_RUNVIEW_L1_MAX_ENTRIES;
        this._runViewL1TtlMs = options.RunViewL1TtlMs ?? DEFAULT_RUNVIEW_L1_TTL_MS;
        this._storageL1MaxEntries = options.StorageL1MaxEntries ?? DEFAULT_STORAGE_L1_MAX_ENTRIES;
        this._tokenRefreshTimeoutMs = options.TokenRefreshTimeoutMs ?? DEFAULT_TOKEN_REFRESH_TIMEOUT_MS;
        this._pongTimeoutMs = options.PongTimeoutMs ?? WS_PONG_TIMEOUT_MS;
        this._wsKeepAliveMs = options.WsKeepAliveMs ?? WS_KEEPALIVE_MS;
        this._wsConnectionAckTimeoutMs = options.WsConnectionAckTimeoutMs ?? WS_CONNECTION_ACK_TIMEOUT_MS;
    }

    /**
     * Attaches this host to a browser `SharedWorkerGlobalScope` (listening for `connect` events).
     */
    public AttachGlobalScope(scope: SharedWorkerGlobalScopeLike): () => void {
        const onConnect = (ev: SharedWorkerConnectEventLike): void => {
            for (const port of ev.Ports) {
                this.AttachPort(port);
            }
        };
        if (typeof scope.AddEventListener === 'function') {
            scope.AddEventListener('connect', onConnect);
            return () => scope.RemoveEventListener?.('connect', onConnect);
        }
        scope.OnConnect = onConnect;
        return () => {
            scope.OnConnect = null;
        };
    }

    /**
     * Attaches a client tab `MessagePort` to this host.
     */
    public AttachPort(port: TabPortLike): void {
        if (this._isDisposed) {
            return;
        }
        const entry: { Port: TabPortLike; Detach: () => void } = {
            Port: port,
            Detach: () => {},
        };
        const detach = AttachTabPortMessageListener(port, (ev) => {
            void this.handlePortMessage(port, ev.Data);
        });
        entry.Detach = detach;
        this._unregisteredPorts.add(entry);
        port.Start?.();
    }

    /**
     * Returns a snapshot of runtime multiplexing and cache statistics.
     */
    public GetStats(scopeKey?: string): SharedTabKernelStats {
        const snapshot: SharedTabKernelStats = {
            ...this._stats,
            ActiveTabCount: this.countActiveTabs(scopeKey),
            ActiveWsClientCount: this.countActiveWsClients(scopeKey),
            ActiveWsSubscriptionCount: this.countActiveWsSubscriptions(scopeKey),
            StatusUpdatesStreamCount: this.countStatusUpdateStreams(scopeKey),
        };
        return snapshot;
    }

    /**
     * Manually runs one dead-tab heartbeat sweep (useful in deterministic tests).
     */
    public SweepExpiredTabs(now: number = Date.now()): void {
        for (const scope of this._scopes.values()) {
            const expired: string[] = [];
            for (const tab of scope.Tabs.values()) {
                if (now - tab.LastHeartbeatAt > this._heartbeatTimeoutMs) {
                    expired.push(tab.TabId);
                }
            }
            for (const tabId of expired) {
                this._stats.DroppedTabCleanupCount++;
                this.removeTabFromScope(scope, tabId);
            }
        }
    }

    /**
     * Disposes all scopes, WebSocket connections, timers, and ports held by this host.
     */
    public async Dispose(): Promise<void> {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this.stopHeartbeatSweeper();

        for (const entry of this._unregisteredPorts) {
            entry.Detach();
            entry.Port.Close?.();
        }
        this._unregisteredPorts.clear();

        for (const scope of this._scopes.values()) {
            for (const tab of scope.Tabs.values()) {
                tab.DetachListener();
                tab.Port.Close?.();
            }
            scope.Tabs.clear();
            this.closeAllUpstreamSubscriptions(scope);
            this.disposeScopeWsClient(scope);
            scope.RunViewL1.clear();
        }
        this._scopes.clear();
        this._tabToScope.clear();
        this._storageByScope.clear();
        this._sharedBrowserStorage = null;
    }

    private countActiveTabs(scopeKey?: string): number {
        if (scopeKey) {
            const scope = this._scopes.get(normalizeScopeKey(scopeKey));
            return scope ? scope.Tabs.size : 0;
        }
        let total = 0;
        for (const scope of this._scopes.values()) {
            total += scope.Tabs.size;
        }
        return total;
    }

    private countActiveWsClients(scopeKey?: string): number {
        if (scopeKey) {
            const scope = this._scopes.get(normalizeScopeKey(scopeKey));
            return scope?.WsClient ? 1 : 0;
        }
        let total = 0;
        for (const scope of this._scopes.values()) {
            if (scope.WsClient) {
                total++;
            }
        }
        return total;
    }

    private countActiveWsSubscriptions(scopeKey?: string): number {
        if (scopeKey) {
            const scope = this._scopes.get(normalizeScopeKey(scopeKey));
            return scope ? scope.UpstreamSubscriptions.size : 0;
        }
        let total = 0;
        for (const scope of this._scopes.values()) {
            total += scope.UpstreamSubscriptions.size;
        }
        return total;
    }

    private countStatusUpdateStreams(scopeKey?: string): number {
        const countInScope = (scope: ScopeState): number => {
            let c = 0;
            for (const sub of scope.UpstreamSubscriptions.values()) {
                if (sub.Kind === 'status_updates') {
                    c++;
                }
            }
            return c;
        };
        if (scopeKey) {
            const scope = this._scopes.get(normalizeScopeKey(scopeKey));
            return scope ? countInScope(scope) : 0;
        }
        let total = 0;
        for (const scope of this._scopes.values()) {
            total += countInScope(scope);
        }
        return total;
    }

    private ensureHeartbeatSweeper(): void {
        if (this._heartbeatSweepTimer || this._isDisposed) {
            return;
        }
        this._heartbeatSweepTimer = setInterval(() => {
            this.SweepExpiredTabs();
        }, this._heartbeatSweepIntervalMs);
        if (typeof (this._heartbeatSweepTimer as { unref?: () => void }).unref === 'function') {
            (this._heartbeatSweepTimer as { unref: () => void }).unref();
        }
    }

    private stopHeartbeatSweeper(): void {
        if (this._heartbeatSweepTimer) {
            clearInterval(this._heartbeatSweepTimer);
            this._heartbeatSweepTimer = null;
        }
    }

    private sendToPort(port: TabPortLike, message: KernelHostToClientMessage): void {
        if (this._isDisposed) {
            return;
        }
        try {
            port.PostMessage(message);
        } catch {
            // Port closed; will be cleaned up on disconnect/heartbeat sweep
        }
    }

    private broadcastToScope(scope: ScopeState, message: KernelHostToClientMessage, excludeTabId?: string): void {
        for (const tab of scope.Tabs.values()) {
            if (excludeTabId && (UUIDsEqual(tab.TabId, excludeTabId) || tab.TabId === excludeTabId)) {
                continue;
            }
            this.sendToPort(tab.Port, message);
        }
    }

    private getOrCreateScope(hello: KernelHelloMessage): ScopeState {
        const normalizedKey = normalizeScopeKey(hello.ScopeKey);
        let scope = this._scopes.get(normalizedKey);
        if (!scope) {
            scope = {
                ScopeKey: normalizedKey,
                WsUrl: hello.WsUrl,
                GraphQLUrl: hello.GraphQLUrl,
                Token: hello.Token,
                MJAPIKey: hello.MJAPIKey,
                UserAPIKey: hello.UserAPIKey,
                TokenGeneration: 1,
                LastSequence: hello.LastSequence,
                LastServerProcessId: hello.ServerProcessId,
                Tabs: new Map(),
                WsClient: null,
                WsClientCreatedAt: null,
                SocketState: 'unknown',
                IsDisposingWsIntentionally: false,
                DisarmPongWatchdog: null,
                UpstreamSubscriptions: new Map(),
                SubIdToChannel: new Map(),
                RefreshInFlight: null,
                JwtReconnectInFlight: null,
                CatchUpInFlight: null,
                RunViewL1: new Map(),
                InFlightRunViews: new Map(),
                InFlightRunViewsByRequestId: new Map(),
                GlobalMutationEpoch: 0,
                EntityMutationEpochs: new Map(),
            };
            this._scopes.set(normalizedKey, scope);
        } else {
            // Update endpoint/token metadata if newer
            if (hello.WsUrl && !scope.WsUrl) {
                scope.WsUrl = hello.WsUrl;
            }
            if (hello.GraphQLUrl && !scope.GraphQLUrl) {
                scope.GraphQLUrl = hello.GraphQLUrl;
            }
            if (hello.Token && !scope.Token) {
                scope.Token = hello.Token;
            }
            if (hello.MJAPIKey && !scope.MJAPIKey) {
                scope.MJAPIKey = hello.MJAPIKey;
            }
            if (hello.UserAPIKey && !scope.UserAPIKey) {
                scope.UserAPIKey = hello.UserAPIKey;
            }
            if (hello.LastSequence > scope.LastSequence) {
                scope.LastSequence = hello.LastSequence;
            }
            if (hello.ServerProcessId && !scope.LastServerProcessId) {
                scope.LastServerProcessId = hello.ServerProcessId;
            }
        }
        return scope;
    }

    private async handlePortMessage(port: TabPortLike, rawData: unknown): Promise<void> {
        if (this._isDisposed || !rawData || typeof rawData !== 'object') {
            return;
        }
        const msg = rawData as Partial<KernelClientToHostMessage>;
        if (!msg.Type) {
            return;
        }

        switch (msg.Type) {
            case 'kernel_hello':
                this.handleHello(port, msg as KernelHelloMessage);
                break;
            case 'kernel_heartbeat':
                this.handleHeartbeat(msg as KernelHeartbeatMessage);
                break;
            case 'kernel_disconnect':
                this.handleDisconnect(msg as KernelDisconnectMessage);
                break;
            case 'kernel_token_update':
                this.handleTokenUpdate(msg as KernelTokenUpdateMessage);
                break;
            case 'kernel_refresh_token_response':
                this.handleRefreshTokenResponse(msg as KernelRefreshTokenResponseMessage);
                break;
            case 'kernel_coordinate_refresh':
                await this.handleCoordinateRefresh(msg as KernelCoordinateRefreshRequestMessage);
                break;
            case 'kernel_subscribe':
                this.handleSubscribe(msg as KernelSubscribeMessage);
                break;
            case 'kernel_unsubscribe':
                this.handleUnsubscribe(msg as KernelUnsubscribeMessage);
                break;
            case 'kernel_force_reconnect':
                this.handleForceReconnect(msg as KernelForceReconnectMessage);
                break;
            case 'kernel_catchup_request':
                await this.handleCatchUpRequest(msg as KernelCatchUpRequestMessage);
                break;
            case 'kernel_catchup_delegate_result':
                this.handleCatchUpDelegateResult(msg as KernelCatchUpDelegateResultMessage);
                break;
            case 'kernel_mutation_notice':
                this.handleMutationNotice(msg as KernelMutationNoticeMessage);
                break;
            case 'kernel_rv_acquire':
                this.handleRunViewAcquire(msg as KernelRunViewAcquireMessage);
                break;
            case 'kernel_rv_complete':
                this.handleRunViewComplete(msg as KernelRunViewCompleteMessage);
                break;
            case 'kernel_storage_request':
                await this.handleStorageRequest(msg as KernelStorageRequestMessage);
                break;
            case 'kernel_stats_request':
                this.handleStatsRequest(msg as KernelStatsRequestMessage);
                break;
        }
    }

    private handleHello(port: TabPortLike, msg: KernelHelloMessage): void {
        const scope = this.getOrCreateScope(msg);
        let detach: () => void = () => {};
        for (const pending of this._unregisteredPorts) {
            if (pending.Port === port) {
                detach = pending.Detach;
                this._unregisteredPorts.delete(pending);
                break;
            }
        }

        const existingTab = scope.Tabs.get(msg.TabId);
        if (existingTab) {
            existingTab.LastHeartbeatAt = Date.now();
            existingTab.CanRefreshToken = msg.CanRefreshToken;
        } else {
            scope.Tabs.set(msg.TabId, {
                TabId: msg.TabId,
                SessionId: msg.SessionId,
                ScopeKey: scope.ScopeKey,
                Port: port,
                DetachListener: detach,
                CanRefreshToken: msg.CanRefreshToken,
                LastHeartbeatAt: Date.now(),
                SubscriptionIds: new Set(),
            });
            this._tabToScope.set(msg.TabId, scope.ScopeKey);
        }

        this.ensureHeartbeatSweeper();

        this.sendToPort(port, {
            Type: 'kernel_hello_ack',
            RequestId: msg.RequestId,
            TabId: msg.TabId,
            ScopeKey: scope.ScopeKey,
            CurrentSequence: scope.LastSequence,
            ServerProcessId: scope.LastServerProcessId,
            SocketState: scope.SocketState,
            LatestToken: scope.Token,
            HostInstanceId: this.HostInstanceId,
        });
    }

    private handleHeartbeat(msg: KernelHeartbeatMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const tab = scope?.Tabs.get(msg.TabId);
        if (tab) {
            tab.LastHeartbeatAt = Date.now();
            this.sendToPort(tab.Port, {
                Type: 'kernel_heartbeat_ack',
                TabId: tab.TabId,
                Timestamp: msg.Timestamp,
            });
        }
    }

    private handleDisconnect(msg: KernelDisconnectMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        if (!scope) {
            return;
        }
        this.removeTabFromScope(scope, msg.TabId);
    }

    private removeTabFromScope(scope: ScopeState, tabId: string): void {
        const tab = scope.Tabs.get(tabId);
        if (!tab) {
            return;
        }

        scope.Tabs.delete(tabId);
        this._tabToScope.delete(tabId);
        tab.DetachListener();
        tab.Port.Close?.();

        // Clean up every subscription owned by this tab
        for (const subId of Array.from(tab.SubscriptionIds)) {
            this.removeTabSubscription(scope, tabId, subId);
        }

        // Fail over any in-flight RunView owned by the departed tab
        const departedTabs = new UUIDSet([tabId]);
        for (const entry of Array.from(scope.InFlightRunViewsByRequestId.values())) {
            if (departedTabs.Has(entry.OwnerTabId) || entry.OwnerTabId === tabId) {
                scope.InFlightRunViewsByRequestId.delete(entry.RequestId);
                // Prune any waiters that belonged to the departed tab
                entry.Waiters = ExcludeByUUIDs(entry.Waiters, departedTabs, (w) => w.TabId);

                if (entry.Waiters.length > 0) {
                    const nextOwner = entry.Waiters.shift()!;
                    entry.OwnerTabId = nextOwner.TabId;
                    entry.RequestId = nextOwner.RequestId;
                    scope.InFlightRunViewsByRequestId.set(entry.RequestId, entry);
                    const nextTab = scope.Tabs.get(nextOwner.TabId);
                    if (nextTab) {
                        this.sendToPort(nextTab.Port, {
                            Type: 'kernel_rv_acquire_ack',
                            RequestId: nextOwner.RequestId,
                            ScopeKey: scope.ScopeKey,
                            Outcome: 'execute',
                            Epoch: entry.StartGlobalEpoch,
                        });
                    }
                } else {
                    const current = scope.InFlightRunViews.get(entry.CacheKey);
                    if (current === entry) {
                        scope.InFlightRunViews.delete(entry.CacheKey);
                    }
                }
            } else {
                entry.Waiters = ExcludeByUUIDs(entry.Waiters, departedTabs, (w) => w.TabId);
            }
        }

        // Fail over in-flight token refresh if the refreshing tab disappeared
        if (scope.RefreshInFlight && (departedTabs.Has(scope.RefreshInFlight.OwnerTabId ?? '') || scope.RefreshInFlight.OwnerTabId === tabId)) {
            this.delegateRefreshToNextTab(scope, scope.RefreshInFlight);
        }

        // Fail over in-flight catch-up if the delegated tab disappeared
        if (scope.CatchUpInFlight && (departedTabs.Has(scope.CatchUpInFlight.OwnerTabId ?? '') || scope.CatchUpInFlight.OwnerTabId === tabId)) {
            this.delegateCatchUpToNextTab(scope, scope.CatchUpInFlight);
        }

        // If no tabs remain in this scope, close its WebSocket client cleanly
        if (scope.Tabs.size === 0) {
            this.closeAllUpstreamSubscriptions(scope);
            this.disposeScopeWsClient(scope);
            if (this.countActiveTabs() === 0) {
                this.stopHeartbeatSweeper();
            }
        }
    }

    // ── WebSocket Lifecycle & Multiplexing ───────────────────────────────────

    private getOrCreateScopeWsClient(scope: ScopeState): KernelWsClientLike {
        const now = Date.now();
        if (scope.WsClient && scope.WsClientCreatedAt) {
            const age = now - scope.WsClientCreatedAt;
            const maxAge = this._options.WsClientMaxAgeMs ?? DEFAULT_WS_CLIENT_MAX_AGE_MS;
            if (age > maxAge && scope.UpstreamSubscriptions.size === 0) {
                this.disposeScopeWsClient(scope);
            }
        }

        if (!scope.WsClient) {
            scope.IsDisposingWsIntentionally = false;
            const wsConfig: KernelWsClientConfig = {
                Url: scope.WsUrl,
                ConnectionParams: () => ({
                    Authorization: 'Bearer ' + scope.Token,
                    ...(scope.MJAPIKey ? { 'x-mj-api-key': scope.MJAPIKey } : {}),
                    ...(scope.UserAPIKey ? { 'x-mj-user-api-key': scope.UserAPIKey } : {}),
                }),
                KeepAliveMs: this._wsKeepAliveMs,
                ConnectionAckWaitTimeoutMs: this._wsConnectionAckTimeoutMs,
                RetryAttempts: 3,
                ShouldRetry: () => true,
            };

            const client = this._options.CreateWsClient
                ? this._options.CreateWsClient(wsConfig)
                : this.createDefaultWsClient(wsConfig);

            scope.WsClient = client;
            scope.WsClientCreatedAt = now;
            this._stats.WsClientCreatedCount++;

            let pongTimeout: ReturnType<typeof setTimeout> | null = null;
            const disarmPongWatchdog = (): void => {
                if (pongTimeout !== null) {
                    clearTimeout(pongTimeout);
                    pongTimeout = null;
                }
            };
            scope.DisarmPongWatchdog = disarmPongWatchdog;

            client.On('ping', (received: unknown) => {
                if (received === true) {
                    return;
                }
                disarmPongWatchdog();
                pongTimeout = setTimeout(() => {
                    pongTimeout = null;
                    try {
                        client.Terminate();
                    } catch {
                        // Already terminated
                    }
                }, this._pongTimeoutMs);
                if (typeof (pongTimeout as { unref?: () => void }).unref === 'function') {
                    (pongTimeout as { unref: () => void }).unref();
                }
            });

            client.On('pong', (received: unknown) => {
                if (received === true) {
                    disarmPongWatchdog();
                }
            });

            client.On('connected', (_socket: unknown, _payload: unknown, wasRetry: unknown) => {
                if (scope.WsClient !== client) {
                    return;
                }
                scope.SocketState = 'connected';
                this.broadcastToScope(scope, {
                    Type: 'kernel_socket_state',
                    ScopeKey: scope.ScopeKey,
                    State: 'connected',
                    Reconnected: wasRetry === true,
                });
            });

            client.On('closed', (event: unknown) => {
                disarmPongWatchdog();
                if (scope.WsClient !== client) {
                    return;
                }
                if (scope.IsDisposingWsIntentionally) {
                    return;
                }
                scope.SocketState = 'disconnected';
                this.broadcastToScope(scope, {
                    Type: 'kernel_socket_state',
                    ScopeKey: scope.ScopeKey,
                    State: 'disconnected',
                });

                const closeCode = (event as { code?: number } | null | undefined)?.code;
                if (closeCode === 4403) {
                    void this.coordinateTokenRefresh(scope, scope.Token).catch(() => {
                        // Auth error already broadcast to tabs
                    });
                }
            });
        }

        return scope.WsClient;
    }

    private createDefaultWsClient(config: KernelWsClientConfig): KernelWsClientLike {
        const client = createClient({
            url: config.Url,
            connectionParams: config.ConnectionParams,
            keepAlive: config.KeepAliveMs,
            connectionAckWaitTimeout: config.ConnectionAckWaitTimeoutMs,
            retryAttempts: config.RetryAttempts,
            shouldRetry: config.ShouldRetry,
        });
        return WrapGraphQLWsClient(client);
    }

    private disposeScopeWsClient(scope: ScopeState): void {
        if (scope.WsClient) {
            scope.IsDisposingWsIntentionally = true;
            scope.DisarmPongWatchdog?.();
            scope.DisarmPongWatchdog = null;
            try {
                scope.WsClient.Dispose();
            } catch {
                // Ignore dispose errors
            }
            scope.WsClient = null;
            scope.WsClientCreatedAt = null;
            scope.SocketState = 'unknown';
            this.broadcastToScope(scope, {
                Type: 'kernel_socket_state',
                ScopeKey: scope.ScopeKey,
                State: 'unknown',
            });
        }
    }

    private closeAllUpstreamSubscriptions(scope: ScopeState): void {
        for (const sub of scope.UpstreamSubscriptions.values()) {
            try {
                sub.UnsubscribeUpstream?.();
            } catch {
                // Ignore teardown error
            }
            sub.UnsubscribeUpstream = null;
        }
        scope.UpstreamSubscriptions.clear();
        scope.SubIdToChannel.clear();
    }

    private handleSubscribe(msg: KernelSubscribeMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const tab = scope?.Tabs.get(msg.TabId);
        if (!scope || !tab) {
            return;
        }

        tab.SubscriptionIds.add(msg.SubscriptionId);
        scope.SubIdToChannel.set(msg.SubscriptionId, {
            TabId: msg.TabId,
            ChannelKey: msg.ChannelKey,
        });

        let upstream = scope.UpstreamSubscriptions.get(msg.ChannelKey);
        if (!upstream) {
            upstream = {
                ChannelKey: msg.ChannelKey,
                Kind: msg.Kind,
                Query: msg.Query,
                Variables: msg.Variables,
                Extensions: msg.Extensions,
                SubscribersByTab: new Map(),
                UnsubscribeUpstream: null,
            };
            scope.UpstreamSubscriptions.set(msg.ChannelKey, upstream);
            this.openUpstreamSubscription(scope, upstream);
        }

        let tabSubSet = upstream.SubscribersByTab.get(msg.TabId);
        if (!tabSubSet) {
            tabSubSet = new Set();
            upstream.SubscribersByTab.set(msg.TabId, tabSubSet);
        }
        tabSubSet.add(msg.SubscriptionId);
    }

    private handleUnsubscribe(msg: KernelUnsubscribeMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        if (!scope) {
            return;
        }
        this.removeTabSubscription(scope, msg.TabId, msg.SubscriptionId);
    }

    private removeTabSubscription(scope: ScopeState, tabId: string, subscriptionId: string): void {
        const tab = scope.Tabs.get(tabId);
        tab?.SubscriptionIds.delete(subscriptionId);

        const mapping = scope.SubIdToChannel.get(subscriptionId);
        if (!mapping) {
            return;
        }
        scope.SubIdToChannel.delete(subscriptionId);

        const upstream = scope.UpstreamSubscriptions.get(mapping.ChannelKey);
        if (!upstream) {
            return;
        }

        const tabSubs = upstream.SubscribersByTab.get(tabId);
        if (tabSubs) {
            tabSubs.delete(subscriptionId);
            if (tabSubs.size === 0) {
                upstream.SubscribersByTab.delete(tabId);
            }
        }

        if (upstream.SubscribersByTab.size === 0) {
            try {
                upstream.UnsubscribeUpstream?.();
            } catch {
                // Ignore unsubscribe errors
            }
            upstream.UnsubscribeUpstream = null;
            scope.UpstreamSubscriptions.delete(mapping.ChannelKey);
        }
    }

    private openUpstreamSubscription(scope: ScopeState, upstream: UpstreamSubscriptionState): void {
        if (this._isDisposed || scope.Tabs.size === 0 || !scope.WsUrl) {
            return;
        }

        const client = this.getOrCreateScopeWsClient(scope);
        upstream.UnsubscribeUpstream = client.Subscribe(
            {
                Query: upstream.Query,
                Variables: upstream.Variables,
                Extensions: upstream.Extensions,
            },
            {
                Next: (rawResult: unknown) => {
                    const data = (rawResult as { data?: unknown } | null | undefined)?.data ?? rawResult;

                    if (upstream.Kind === 'cache_invalidation' || upstream.ChannelKey === CACHE_INVALIDATION_CHANNEL_KEY) {
                        const invEvent = (data as { cacheInvalidation?: CacheInvalidationEventData } | null | undefined)?.cacheInvalidation;
                        if (invEvent) {
                            this.processIncomingCacheInvalidation(scope, invEvent);
                            return;
                        }
                    }

                    // Fan out to every subscribed (tabId, subscriptionId) on this channel
                    for (const [tabId, subIds] of upstream.SubscribersByTab.entries()) {
                        const tab = scope.Tabs.get(tabId);
                        if (!tab) {
                            continue;
                        }
                        for (const subId of subIds) {
                            this.sendToPort(tab.Port, {
                                Type: 'kernel_sub_event',
                                ScopeKey: scope.ScopeKey,
                                SubscriptionId: subId,
                                EventKind: 'next',
                                Data: CloneKernelValue(data),
                            });
                        }
                    }
                },
                Error: (error: unknown) => {
                    const errObj = error as { extensions?: { code?: string }; message?: string } | null | undefined;
                    const errCode = errObj?.extensions?.code;
                    const errMessage = error instanceof Error ? error.message : errObj?.message ?? String(error);
                    const isTokenExpired =
                        errCode === 'JWT_EXPIRED' ||
                        errMessage.includes('token has expired') ||
                        errMessage.includes('JWT_EXPIRED');

                    if (isTokenExpired) {
                        void this.handleExpiredJwtOnWebSocket(scope);
                        return;
                    }

                    // Propagate non-JWT errors to subscribed tabs and remove upstream entry
                    for (const [tabId, subIds] of upstream.SubscribersByTab.entries()) {
                        const tab = scope.Tabs.get(tabId);
                        if (!tab) {
                            continue;
                        }
                        for (const subId of subIds) {
                            this.sendToPort(tab.Port, {
                                Type: 'kernel_sub_event',
                                ScopeKey: scope.ScopeKey,
                                SubscriptionId: subId,
                                EventKind: 'error',
                                ErrorMessage: errMessage,
                                ErrorCode: errCode,
                            });
                            tab.SubscriptionIds.delete(subId);
                            scope.SubIdToChannel.delete(subId);
                        }
                    }
                    upstream.SubscribersByTab.clear();
                    upstream.UnsubscribeUpstream = null;
                    scope.UpstreamSubscriptions.delete(upstream.ChannelKey);
                },
                Complete: () => {
                    for (const [tabId, subIds] of upstream.SubscribersByTab.entries()) {
                        const tab = scope.Tabs.get(tabId);
                        if (!tab) {
                            continue;
                        }
                        for (const subId of subIds) {
                            this.sendToPort(tab.Port, {
                                Type: 'kernel_sub_event',
                                ScopeKey: scope.ScopeKey,
                                SubscriptionId: subId,
                                EventKind: 'complete',
                            });
                            tab.SubscriptionIds.delete(subId);
                            scope.SubIdToChannel.delete(subId);
                        }
                    }
                    upstream.SubscribersByTab.clear();
                    upstream.UnsubscribeUpstream = null;
                    scope.UpstreamSubscriptions.delete(upstream.ChannelKey);
                },
            }
        );
    }

    private async handleExpiredJwtOnWebSocket(scope: ScopeState): Promise<void> {
        if (scope.JwtReconnectInFlight) {
            return scope.JwtReconnectInFlight;
        }
        const staleToken = scope.Token;
        const reconnectPromise = (async () => {
            try {
                await this.coordinateTokenRefresh(scope, staleToken);
                if (this._isDisposed || scope.Tabs.size === 0) {
                    return;
                }
                // Recreate the single WS client with the new token and seamlessly re-open all
                // active upstream subscriptions so tabs suffer 0 dropped streams!
                const activeUpstreams = Array.from(scope.UpstreamSubscriptions.values());
                for (const sub of activeUpstreams) {
                    try {
                        sub.UnsubscribeUpstream?.();
                    } catch {
                        // Ignore old subscription teardown error
                    }
                    sub.UnsubscribeUpstream = null;
                }
                this.disposeScopeWsClient(scope);
                for (const sub of activeUpstreams) {
                    if (sub.SubscribersByTab.size > 0) {
                        this.openUpstreamSubscription(scope, sub);
                    }
                }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                // Notify subscribed tabs of irrecoverable auth error
                for (const upstream of Array.from(scope.UpstreamSubscriptions.values())) {
                    for (const [tabId, subIds] of upstream.SubscribersByTab.entries()) {
                        const tab = scope.Tabs.get(tabId);
                        if (!tab) {
                            continue;
                        }
                        for (const subId of subIds) {
                            this.sendToPort(tab.Port, {
                                Type: 'kernel_sub_event',
                                ScopeKey: scope.ScopeKey,
                                SubscriptionId: subId,
                                EventKind: 'error',
                                ErrorMessage: errorMessage,
                            });
                            tab.SubscriptionIds.delete(subId);
                            scope.SubIdToChannel.delete(subId);
                        }
                    }
                }
                scope.UpstreamSubscriptions.clear();
            } finally {
                scope.JwtReconnectInFlight = null;
            }
        })();
        scope.JwtReconnectInFlight = reconnectPromise;
        return reconnectPromise;
    }

    private handleForceReconnect(msg: KernelForceReconnectMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        if (!scope) {
            return;
        }
        const activeUpstreams = Array.from(scope.UpstreamSubscriptions.values());
        for (const sub of activeUpstreams) {
            try {
                sub.UnsubscribeUpstream?.();
            } catch {
                // Ignore
            }
            sub.UnsubscribeUpstream = null;
        }
        this.disposeScopeWsClient(scope);
        for (const sub of activeUpstreams) {
            if (sub.SubscribersByTab.size > 0) {
                this.openUpstreamSubscription(scope, sub);
            }
        }
    }

    // ── Auth Token Synchronization & Single-Flight Refresh ───────────────────

    private handleTokenUpdate(msg: KernelTokenUpdateMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        if (!scope || !msg.Token) {
            return;
        }
        if (scope.Token !== msg.Token) {
            scope.Token = msg.Token;
            scope.TokenGeneration++;
            this.broadcastToScope(
                scope,
                {
                    Type: 'kernel_token_synced',
                    ScopeKey: scope.ScopeKey,
                    Token: msg.Token,
                    Generation: scope.TokenGeneration,
                    OriginTabId: msg.TabId,
                },
                msg.TabId
            );
        }
    }

    private async handleCoordinateRefresh(msg: KernelCoordinateRefreshRequestMessage): Promise<void> {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const tab = scope?.Tabs.get(msg.TabId);
        if (!scope || !tab) {
            return;
        }
        try {
            const freshToken = await this.coordinateTokenRefresh(scope, msg.KnownToken);
            this.sendToPort(tab.Port, {
                Type: 'kernel_coordinate_refresh_result',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Success: true,
                Token: freshToken,
            });
        } catch (err) {
            this.sendToPort(tab.Port, {
                Type: 'kernel_coordinate_refresh_result',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private coordinateTokenRefresh(scope: ScopeState, knownStaleToken: string): Promise<string> {
        // If another tab ALREADY refreshed the token to something newer than what the caller had,
        // return that fresh token immediately without calling RefreshTokenFunction again!
        if (scope.Token && knownStaleToken && scope.Token !== knownStaleToken) {
            this._stats.TokenRefreshCoalescedCount++;
            return Promise.resolve(scope.Token);
        }

        if (scope.RefreshInFlight) {
            this._stats.TokenRefreshCoalescedCount++;
            return scope.RefreshInFlight.Promise;
        }

        const generation = scope.TokenGeneration + 1;
        let resolveFn!: (token: string) => void;
        let rejectFn!: (err: Error) => void;
        const promise = new Promise<string>((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        });

        const state: RefreshInFlightState = {
            Generation: generation,
            OwnerTabId: null,
            RequestId: null,
            Promise: promise,
            Resolve: resolveFn,
            Reject: rejectFn,
            Timer: null,
        };
        scope.RefreshInFlight = state;

        state.Timer = setTimeout(() => {
            if (scope.RefreshInFlight === state) {
                scope.RefreshInFlight = null;
                const err = new Error('Cross-tab token refresh timed out');
                this.broadcastToScope(scope, {
                    Type: 'kernel_auth_error',
                    ScopeKey: scope.ScopeKey,
                    ErrorMessage: err.message,
                });
                state.Reject(err);
            }
        }, this._tokenRefreshTimeoutMs);
        if (typeof (state.Timer as { unref?: () => void }).unref === 'function') {
            (state.Timer as { unref: () => void }).unref();
        }

        this.delegateRefreshToNextTab(scope, state);
        return promise;
    }

    private delegateRefreshToNextTab(scope: ScopeState, state: RefreshInFlightState): void {
        const candidate = Array.from(scope.Tabs.values()).find(
            (t) => t.CanRefreshToken && t.TabId !== state.OwnerTabId
        ) ?? Array.from(scope.Tabs.values()).find((t) => t.CanRefreshToken);

        if (!candidate) {
            if (state.Timer) {
                clearTimeout(state.Timer);
                state.Timer = null;
            }
            if (scope.RefreshInFlight === state) {
                scope.RefreshInFlight = null;
            }
            const err = new Error('No active tab available with token refresh capability');
            this.broadcastToScope(scope, {
                Type: 'kernel_auth_error',
                ScopeKey: scope.ScopeKey,
                ErrorMessage: err.message,
            });
            state.Reject(err);
            return;
        }

        const requestId = uuidv4();
        state.OwnerTabId = candidate.TabId;
        state.RequestId = requestId;
        this.sendToPort(candidate.Port, {
            Type: 'kernel_refresh_token_request',
            RequestId: requestId,
            ScopeKey: scope.ScopeKey,
            Generation: state.Generation,
        });
    }

    private handleRefreshTokenResponse(msg: KernelRefreshTokenResponseMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const state = scope?.RefreshInFlight;
        if (!scope || !state || state.RequestId !== msg.RequestId) {
            return;
        }

        if (state.Timer) {
            clearTimeout(state.Timer);
            state.Timer = null;
        }
        scope.RefreshInFlight = null;

        if (msg.Success && msg.Token) {
            scope.Token = msg.Token;
            scope.TokenGeneration = Math.max(scope.TokenGeneration + 1, msg.Generation);
            this.broadcastToScope(scope, {
                Type: 'kernel_token_synced',
                ScopeKey: scope.ScopeKey,
                Token: msg.Token,
                Generation: scope.TokenGeneration,
                OriginTabId: msg.TabId,
            });
            state.Resolve(msg.Token);
        } else {
            const errMsg = msg.ErrorMessage || 'Token refresh failed';
            this.broadcastToScope(scope, {
                Type: 'kernel_auth_error',
                ScopeKey: scope.ScopeKey,
                ErrorMessage: errMsg,
            });
            state.Reject(new Error(errMsg));
        }
    }

    // ── Cache Invalidation & Sequence Catch-Up ───────────────────────────────

    private processIncomingCacheInvalidation(scope: ScopeState, event: CacheInvalidationEventData): void {
        if (typeof event.Sequence === 'number' && event.Sequence > scope.LastSequence) {
            scope.LastSequence = event.Sequence;
        }
        if (event.SourceServerID && !scope.LastServerProcessId) {
            scope.LastServerProcessId = event.SourceServerID;
        }
        if (event.EntityName) {
            this.invalidateRunViewL1(scope, [event.EntityName]);
        }

        this._stats.InvalidationEventsRelayedCount++;
        this.broadcastToScope(scope, {
            Type: 'kernel_invalidation',
            ScopeKey: scope.ScopeKey,
            Event: CloneKernelValue(event),
            Sequence: event.Sequence,
            ServerProcessId: scope.LastServerProcessId,
        });
    }

    private async handleCatchUpRequest(msg: KernelCatchUpRequestMessage): Promise<void> {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const requesterTab = scope?.Tabs.get(msg.TabId);
        if (!scope || !requesterTab) {
            return;
        }

        if (msg.ServerProcessId && scope.LastServerProcessId && scope.LastServerProcessId !== msg.ServerProcessId) {
            scope.LastServerProcessId = msg.ServerProcessId;
            scope.LastSequence = msg.TargetSequence;
            this.sendToPort(requesterTab.Port, {
                Type: 'kernel_catchup_result',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Success: true,
                CurrentSequence: scope.LastSequence,
                ServerProcessId: scope.LastServerProcessId,
                RequiresFullRefresh: false,
            });
            return;
        }

        if (scope.LastSequence >= msg.TargetSequence) {
            this.sendToPort(requesterTab.Port, {
                Type: 'kernel_catchup_result',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Success: true,
                CurrentSequence: scope.LastSequence,
                ServerProcessId: scope.LastServerProcessId,
                RequiresFullRefresh: false,
            });
            return;
        }

        if (scope.CatchUpInFlight) {
            await scope.CatchUpInFlight.Promise;
            this.sendToPort(requesterTab.Port, {
                Type: 'kernel_catchup_result',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Success: true,
                CurrentSequence: scope.LastSequence,
                ServerProcessId: scope.LastServerProcessId,
                RequiresFullRefresh: false,
            });
            return;
        }

        let resolveCatchUp!: () => void;
        const promise = new Promise<void>((resolve) => {
            resolveCatchUp = resolve;
        });

        const catchUpState: CatchUpInFlightState = {
            TargetSequence: msg.TargetSequence,
            OwnerTabId: requesterTab.TabId,
            RequestId: uuidv4(),
            Promise: promise,
            Resolve: resolveCatchUp,
        };
        scope.CatchUpInFlight = catchUpState;

        this.sendToPort(requesterTab.Port, {
            Type: 'kernel_catchup_delegate',
            RequestId: catchUpState.RequestId!,
            ScopeKey: scope.ScopeKey,
            SinceSequence: Math.min(msg.SinceSequence, scope.LastSequence || msg.SinceSequence),
        });

        await promise;
        this.sendToPort(requesterTab.Port, {
            Type: 'kernel_catchup_result',
            RequestId: msg.RequestId,
            ScopeKey: scope.ScopeKey,
            Success: true,
            CurrentSequence: scope.LastSequence,
            ServerProcessId: scope.LastServerProcessId,
            RequiresFullRefresh: false,
        });
    }

    private delegateCatchUpToNextTab(scope: ScopeState, state: CatchUpInFlightState): void {
        const candidate = Array.from(scope.Tabs.values()).find((t) => t.TabId !== state.OwnerTabId);
        if (!candidate) {
            if (scope.CatchUpInFlight === state) {
                scope.CatchUpInFlight = null;
            }
            state.Resolve();
            return;
        }
        state.OwnerTabId = candidate.TabId;
        state.RequestId = uuidv4();
        this.sendToPort(candidate.Port, {
            Type: 'kernel_catchup_delegate',
            RequestId: state.RequestId,
            ScopeKey: scope.ScopeKey,
            SinceSequence: scope.LastSequence,
        });
    }

    private handleCatchUpDelegateResult(msg: KernelCatchUpDelegateResultMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const state = scope?.CatchUpInFlight;
        if (!scope || !state || state.RequestId !== msg.RequestId) {
            return;
        }
        scope.CatchUpInFlight = null;

        if (msg.Success) {
            if (msg.ServerProcessId) {
                scope.LastServerProcessId = msg.ServerProcessId;
            }
            if (msg.CurrentSequence > scope.LastSequence) {
                scope.LastSequence = msg.CurrentSequence;
            }
            for (const event of msg.Events) {
                this.processIncomingCacheInvalidation(scope, event);
            }
            this.broadcastToScope(scope, {
                Type: 'kernel_watermark_sync',
                ScopeKey: scope.ScopeKey,
                Sequence: scope.LastSequence,
                ServerProcessId: scope.LastServerProcessId,
                RequiresFullRefresh: msg.RequiresFullRefresh,
            });
        }
        state.Resolve();
    }

    // ── Shared L1 RunView Cache & In-Flight Request Coalescing ───────────────

    private handleMutationNotice(msg: KernelMutationNoticeMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        if (!scope) {
            return;
        }
        this.invalidateRunViewL1(scope, msg.EntityNames);
        // Notify sibling tabs so their local ProviderBase linger caches drop matching entities too
        this.broadcastToScope(
            scope,
            {
                Type: 'kernel_mutation_notice',
                TabId: msg.TabId,
                ScopeKey: scope.ScopeKey,
                EntityNames: msg.EntityNames,
            },
            msg.TabId
        );
    }

    private invalidateRunViewL1(scope: ScopeState, entityNames?: readonly string[]): void {
        const normalized = (entityNames ?? []).map(normalizeEntityName).filter((n) => n.length > 0);
        if (normalized.length === 0) {
            scope.GlobalMutationEpoch++;
            scope.RunViewL1.clear();
            scope.InFlightRunViews.clear();
            return;
        }

        const targetSet = new Set(normalized);
        for (const name of targetSet) {
            scope.EntityMutationEpochs.set(name, (scope.EntityMutationEpochs.get(name) ?? 0) + 1);
        }

        for (const [key, entry] of scope.RunViewL1.entries()) {
            for (const ent of entry.EntityNames) {
                if (targetSet.has(ent)) {
                    scope.RunViewL1.delete(key);
                    break;
                }
            }
        }

        // Drop in-flight entries so late joiners don't attach to pre-mutation queries
        for (const [key, inflight] of scope.InFlightRunViews.entries()) {
            for (const ent of inflight.EntityNames) {
                if (targetSet.has(ent)) {
                    scope.InFlightRunViews.delete(key);
                    break;
                }
            }
        }
    }

    private snapshotEntityEpochs(scope: ScopeState, entityNames: Set<string>): Map<string, number> {
        const epochs = new Map<string, number>();
        for (const name of entityNames) {
            epochs.set(name, scope.EntityMutationEpochs.get(name) ?? 0);
        }
        return epochs;
    }

    private hasEntityMutatedSince(scope: ScopeState, entry: InFlightRunViewEntry): boolean {
        if (scope.GlobalMutationEpoch !== entry.StartGlobalEpoch) {
            return true;
        }
        for (const [name, epoch] of entry.StartEntityEpochs.entries()) {
            if ((scope.EntityMutationEpochs.get(name) ?? 0) !== epoch) {
                return true;
            }
        }
        return false;
    }

    private setRunViewL1Entry(scope: ScopeState, cacheKey: string, value: unknown, entityNames: Set<string>): void {
        if (this._runViewL1MaxEntries <= 0) {
            return;
        }
        if (scope.RunViewL1.has(cacheKey)) {
            scope.RunViewL1.delete(cacheKey);
        }
        while (scope.RunViewL1.size >= this._runViewL1MaxEntries) {
            const oldestKey = scope.RunViewL1.keys().next().value;
            if (oldestKey !== undefined) {
                scope.RunViewL1.delete(oldestKey);
            } else {
                break;
            }
        }
        scope.RunViewL1.set(cacheKey, {
            CacheKey: cacheKey,
            Value: CloneKernelValue(value),
            EntityNames: new Set(entityNames),
            CreatedAt: Date.now(),
        });
    }

    private handleRunViewAcquire(msg: KernelRunViewAcquireMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const tab = scope?.Tabs.get(msg.TabId);
        if (!scope || !tab) {
            return;
        }

        // 1. Check Shared L1 Cache
        if (msg.AllowL1Read) {
            const cached = scope.RunViewL1.get(msg.CacheKey);
            if (cached) {
                const age = Date.now() - cached.CreatedAt;
                if (age <= this._runViewL1TtlMs) {
                    // Refresh LRU position
                    scope.RunViewL1.delete(msg.CacheKey);
                    scope.RunViewL1.set(msg.CacheKey, cached);
                    this._stats.RunViewL1HitCount++;
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_rv_acquire_ack',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Outcome: 'l1_hit',
                        Data: CloneKernelValue(cached.Value),
                    });
                    return;
                }
                scope.RunViewL1.delete(msg.CacheKey);
            }
        }

        // 2. Check Cross-Tab In-Flight Coalescing
        const existing = scope.InFlightRunViews.get(msg.CacheKey);
        if (existing) {
            this._stats.RunViewCoalescedCount++;
            existing.Waiters.push({ TabId: msg.TabId, RequestId: msg.RequestId });
            this.sendToPort(tab.Port, {
                Type: 'kernel_rv_acquire_ack',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Outcome: 'wait',
            });
            return;
        }

        // 3. Elect this tab to execute the single backend request
        const entitySet = new Set(msg.EntityNames.map(normalizeEntityName).filter((n) => n.length > 0));
        const entry: InFlightRunViewEntry = {
            CacheKey: msg.CacheKey,
            OwnerTabId: msg.TabId,
            RequestId: msg.RequestId,
            EntityNames: entitySet,
            AllowL1Write: msg.AllowL1Write,
            StartGlobalEpoch: scope.GlobalMutationEpoch,
            StartEntityEpochs: this.snapshotEntityEpochs(scope, entitySet),
            Waiters: [],
        };

        scope.InFlightRunViews.set(msg.CacheKey, entry);
        scope.InFlightRunViewsByRequestId.set(msg.RequestId, entry);
        this._stats.RunViewBackendExecCount++;

        this.sendToPort(tab.Port, {
            Type: 'kernel_rv_acquire_ack',
            RequestId: msg.RequestId,
            ScopeKey: scope.ScopeKey,
            Outcome: 'execute',
            Epoch: entry.StartGlobalEpoch,
        });
    }

    private handleRunViewComplete(msg: KernelRunViewCompleteMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        if (!scope) {
            return;
        }

        const entry = scope.InFlightRunViewsByRequestId.get(msg.RequestId);
        if (entry) {
            scope.InFlightRunViewsByRequestId.delete(msg.RequestId);
            if (scope.InFlightRunViews.get(entry.CacheKey) === entry) {
                scope.InFlightRunViews.delete(entry.CacheKey);
            }
        }

        const allowWrite = entry ? entry.AllowL1Write && !this.hasEntityMutatedSince(scope, entry) : msg.AllowL1Write;
        if (msg.Success && allowWrite) {
            const entitySet = entry
                ? entry.EntityNames
                : new Set(msg.EntityNames.map(normalizeEntityName).filter((n) => n.length > 0));
            this.setRunViewL1Entry(scope, msg.CacheKey, msg.Data, entitySet);
        }

        if (!entry || entry.Waiters.length === 0) {
            return;
        }

        for (const waiter of entry.Waiters) {
            const waiterTab = scope.Tabs.get(waiter.TabId);
            if (!waiterTab) {
                continue;
            }
            if (msg.Success) {
                this.sendToPort(waiterTab.Port, {
                    Type: 'kernel_rv_acquire_ack',
                    RequestId: waiter.RequestId,
                    ScopeKey: scope.ScopeKey,
                    Outcome: 'coalesced_result',
                    Data: CloneKernelValue(msg.Data),
                });
            } else {
                this.sendToPort(waiterTab.Port, {
                    Type: 'kernel_rv_acquire_ack',
                    RequestId: waiter.RequestId,
                    ScopeKey: scope.ScopeKey,
                    Outcome: 'error',
                    ErrorMessage: msg.ErrorMessage || 'Coalesced RunView execution failed',
                });
            }
        }
    }

    // ── Single IDB Owner & Shared Storage L1 Cache ───────────────────────────

    private getScopeStorageProvider(scopeKey: string): ILocalStorageProvider {
        if (this._options.CreateStorageProvider) {
            let existing = this._storageByScope.get(scopeKey);
            if (!existing) {
                existing = this._options.CreateStorageProvider(scopeKey);
                this._storageByScope.set(scopeKey, existing);
            }
            return existing;
        }

        if (!this._sharedBrowserStorage) {
            this._sharedBrowserStorage =
                typeof indexedDB !== 'undefined'
                    ? new BrowserIndexedDBStorageProvider()
                    : new InMemoryLocalStorageProvider();
        }
        return this._sharedBrowserStorage;
    }

    private getStorageBucket(storage: ILocalStorageProvider): StorageCacheBucket {
        let bucket = this._storageBuckets.get(storage);
        if (!bucket) {
            bucket = {
                StorageL1: new Map(),
                StorageWriteSignatures: new Map(),
                InFlightStorageReads: new Map(),
                StorageWriteQueues: new Map(),
            };
            this._storageBuckets.set(storage, bucket);
        }
        return bucket;
    }

    private makeStorageL1Key(category: string | undefined, key: string): string {
        return `${category || 'default'}::${key}`;
    }

    private setStorageL1Value(bucket: StorageCacheBucket, l1Key: string, value: unknown): void {
        if (this._storageL1MaxEntries <= 0) {
            return;
        }
        if (bucket.StorageL1.has(l1Key)) {
            bucket.StorageL1.delete(l1Key);
        }
        while (bucket.StorageL1.size >= this._storageL1MaxEntries) {
            const oldest = bucket.StorageL1.keys().next().value;
            if (oldest !== undefined) {
                bucket.StorageL1.delete(oldest);
            } else {
                break;
            }
        }
        bucket.StorageL1.set(l1Key, CloneKernelValue(value));
    }

    private async handleStorageRequest(msg: KernelStorageRequestMessage): Promise<void> {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const tab = scope?.Tabs.get(msg.TabId);
        if (!scope || !tab) {
            return;
        }

        const storage = this.getScopeStorageProvider(scope.ScopeKey);
        const bucket = this.getStorageBucket(storage);
        const category = msg.Category;

        try {
            switch (msg.Operation) {
                case 'get_item': {
                    const key = msg.Key ?? '';
                    const val = await this.readSingleStorageItem(bucket, storage, key, category);
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_storage_response',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Success: true,
                        Value: val,
                    });
                    return;
                }
                case 'get_items': {
                    const keys = msg.Keys ?? [];
                    const map = await this.readBatchStorageItems(bucket, storage, keys, category);
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_storage_response',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Success: true,
                        Items: Array.from(map.entries()),
                    });
                    return;
                }
                case 'set_item': {
                    const key = msg.Key ?? '';
                    await this.writeStorageItemSerialized(bucket, storage, key, msg.Value, category);
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_storage_response',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Success: true,
                    });
                    return;
                }
                case 'remove': {
                    const key = msg.Key ?? '';
                    const l1Key = this.makeStorageL1Key(category, key);
                    bucket.StorageL1.delete(l1Key);
                    bucket.StorageWriteSignatures.delete(l1Key);
                    await storage.Remove(key, category);
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_storage_response',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Success: true,
                    });
                    return;
                }
                case 'clear_category': {
                    const cat = category || 'default';
                    const prefix = `${cat}::`;
                    for (const k of Array.from(bucket.StorageL1.keys())) {
                        if (k.startsWith(prefix)) {
                            bucket.StorageL1.delete(k);
                        }
                    }
                    for (const k of Array.from(bucket.StorageWriteSignatures.keys())) {
                        if (k.startsWith(prefix)) {
                            bucket.StorageWriteSignatures.delete(k);
                        }
                    }
                    await storage.ClearCategory(cat);
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_storage_response',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Success: true,
                    });
                    return;
                }
                case 'get_category_keys': {
                    const cat = category || 'default';
                    const keys = await storage.GetCategoryKeys(cat);
                    this.sendToPort(tab.Port, {
                        Type: 'kernel_storage_response',
                        RequestId: msg.RequestId,
                        ScopeKey: scope.ScopeKey,
                        Success: true,
                        Keys: keys,
                    });
                    return;
                }
            }
        } catch (err) {
            this.sendToPort(tab.Port, {
                Type: 'kernel_storage_response',
                RequestId: msg.RequestId,
                ScopeKey: scope.ScopeKey,
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private async readSingleStorageItem(
        bucket: StorageCacheBucket,
        storage: ILocalStorageProvider,
        key: string,
        category?: string
    ): Promise<unknown> {
        const l1Key = this.makeStorageL1Key(category, key);
        if (bucket.StorageL1.has(l1Key)) {
            const hit = bucket.StorageL1.get(l1Key);
            bucket.StorageL1.delete(l1Key);
            bucket.StorageL1.set(l1Key, hit);
            this._stats.StorageL1HitCount++;
            return CloneKernelValue(hit);
        }

        const inflight = bucket.InFlightStorageReads.get(l1Key);
        if (inflight) {
            this._stats.StorageCoalescedReadCount++;
            const val = await inflight;
            return CloneKernelValue(val);
        }

        const readPromise = (async () => {
            this._stats.StorageIdbReadCount++;
            const val = await storage.GetItem(key, category);
            if (val !== null && val !== undefined) {
                this.setStorageL1Value(bucket, l1Key, val);
            }
            return val;
        })();

        bucket.InFlightStorageReads.set(l1Key, readPromise);
        try {
            const val = await readPromise;
            return CloneKernelValue(val);
        } finally {
            if (bucket.InFlightStorageReads.get(l1Key) === readPromise) {
                bucket.InFlightStorageReads.delete(l1Key);
            }
        }
    }

    private async readBatchStorageItems(
        bucket: StorageCacheBucket,
        storage: ILocalStorageProvider,
        keys: string[],
        category?: string
    ): Promise<Map<string, unknown>> {
        const out = new Map<string, unknown>();
        if (keys.length === 0) {
            return out;
        }

        const uniqueKeys = Array.from(new Set(keys));
        const missingKeys: string[] = [];
        const inflightWaiters: Array<{ Key: string; Promise: Promise<unknown> }> = [];

        for (const k of uniqueKeys) {
            const l1Key = this.makeStorageL1Key(category, k);
            if (bucket.StorageL1.has(l1Key)) {
                const hit = bucket.StorageL1.get(l1Key);
                bucket.StorageL1.delete(l1Key);
                bucket.StorageL1.set(l1Key, hit);
                this._stats.StorageL1HitCount++;
                out.set(k, CloneKernelValue(hit));
            } else {
                const inflight = bucket.InFlightStorageReads.get(l1Key);
                if (inflight) {
                    this._stats.StorageCoalescedReadCount++;
                    inflightWaiters.push({ Key: k, Promise: inflight });
                } else {
                    missingKeys.push(k);
                }
            }
        }

        let batchReadPromise: Promise<Map<string, unknown>> | null = null;
        if (missingKeys.length > 0) {
            batchReadPromise = (async () => {
                this._stats.StorageIdbReadCount++;
                const fetched = await storage.GetItems(missingKeys, category);
                for (const k of missingKeys) {
                    const val = fetched.get(k) ?? null;
                    if (val !== null && val !== undefined) {
                        this.setStorageL1Value(bucket, this.makeStorageL1Key(category, k), val);
                    }
                }
                return fetched;
            })();

            for (const k of missingKeys) {
                const l1Key = this.makeStorageL1Key(category, k);
                const itemPromise = batchReadPromise.then((map) => map.get(k) ?? null);
                bucket.InFlightStorageReads.set(l1Key, itemPromise);
            }
        }

        try {
            if (batchReadPromise) {
                const fetched = await batchReadPromise;
                for (const k of missingKeys) {
                    out.set(k, CloneKernelValue(fetched.get(k) ?? null));
                }
            }
            if (inflightWaiters.length > 0) {
                const resolved = await Promise.all(inflightWaiters.map((w) => w.Promise));
                for (let i = 0; i < inflightWaiters.length; i++) {
                    out.set(inflightWaiters[i].Key, CloneKernelValue(resolved[i]));
                }
            }
            return out;
        } finally {
            if (batchReadPromise) {
                for (const k of missingKeys) {
                    bucket.InFlightStorageReads.delete(this.makeStorageL1Key(category, k));
                }
            }
        }
    }

    private writeStorageItemSerialized(
        bucket: StorageCacheBucket,
        storage: ILocalStorageProvider,
        key: string,
        value: unknown,
        category?: string
    ): Promise<void> {
        const l1Key = this.makeStorageL1Key(category, key);
        const cloned = CloneKernelValue(value);
        const signature = ComputeKernelContentDigest(cloned);

        const prevQueue = bucket.StorageWriteQueues.get(l1Key) ?? Promise.resolve();
        const nextTask = prevQueue.then(async () => {
            const existingSig = bucket.StorageWriteSignatures.get(l1Key);
            this.setStorageL1Value(bucket, l1Key, cloned);

            if (existingSig !== undefined && existingSig === signature) {
                this._stats.StorageIdbDeduplicatedWriteCount++;
                return;
            }

            this._stats.StorageIdbWriteCount++;
            await storage.SetItem(key, cloned, category);
            bucket.StorageWriteSignatures.set(l1Key, signature);
        });

        const settledTask = nextTask.catch(() => {
            // Swallow to prevent blocking subsequent writes in the queue
        });
        bucket.StorageWriteQueues.set(l1Key, settledTask);

        return nextTask.finally(() => {
            if (bucket.StorageWriteQueues.get(l1Key) === settledTask) {
                bucket.StorageWriteQueues.delete(l1Key);
            }
        });
    }

    private handleStatsRequest(msg: KernelStatsRequestMessage): void {
        const scope = this._scopes.get(normalizeScopeKey(msg.ScopeKey));
        const tab = scope?.Tabs.get(msg.TabId);
        if (!scope || !tab) {
            return;
        }
        this.sendToPort(tab.Port, {
            Type: 'kernel_stats_response',
            RequestId: msg.RequestId,
            ScopeKey: scope.ScopeKey,
            Stats: this.GetStats(scope.ScopeKey),
        });
    }
}

const WORKER_HOST_GLOBAL_KEY = '___MJ_SHARED_TAB_KERNEL_HOST__';

/**
 * Entrypoint invoked inside a browser `SharedWorker` script (such as `MJExplorer`'s
 * `shared-tab-kernel.worker.ts`). Creates/reuses the singleton {@link SharedTabKernelHost}
 * inside the worker global scope and attaches `onconnect`.
 */
export function StartSharedTabKernelWorker(
    scope?: SharedWorkerGlobalScopeLike,
    options?: SharedTabKernelHostOptions
): SharedTabKernelHost {
    const g = globalThis as Record<string, unknown>;
    let host = g[WORKER_HOST_GLOBAL_KEY] as SharedTabKernelHost | undefined;
    if (!host) {
        host = new SharedTabKernelHost(options);
        g[WORKER_HOST_GLOBAL_KEY] = host;
    }
    const targetScope = scope ?? WrapNativeSharedWorkerGlobalScope(globalThis);
    host.AttachGlobalScope(targetScope);
    return host;
}
