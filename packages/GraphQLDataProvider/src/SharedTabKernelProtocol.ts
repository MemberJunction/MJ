import type { Client } from 'graphql-ws';
import type { ILocalStorageProvider } from '@memberjunction/core';
import type {
    CacheInvalidationEventData,
    TabInvalidationMessage,
    TabMultiplexerEnvironment,
} from './ClientTabInvalidationMultiplexer';
import type { SocketConnectionState } from './graphQLDataProvider';

/**
 * Minimal event shape delivered by a MessagePort or BroadcastChannel.
 */
export interface KernelPortMessageEventLike {
    readonly Data?: unknown;
}

/**
 * Isomorphic MessagePort abstraction with PascalCase members for browser MessagePort
 * and in-process test MessageChannel ports.
 */
export interface TabPortLike {
    PostMessage(message: unknown): void;
    Start?(): void;
    Close?(): void;
    OnMessage?: ((ev: KernelPortMessageEventLike) => void) | null;
    AddEventListener?(type: string, listener: (ev: KernelPortMessageEventLike) => void): void;
    RemoveEventListener?(type: string, listener: (ev: KernelPortMessageEventLike) => void): void;
}

/**
 * Isomorphic SharedWorker handle returned by a worker factory.
 */
export interface TabKernelWorkerLike {
    readonly Port?: TabPortLike;
    OnError?: ((err: unknown) => void) | null;
    AddEventListener?(type: string, listener: (ev: unknown) => void): void;
    RemoveEventListener?(type: string, listener: (ev: unknown) => void): void;
}

/**
 * Event delivered to `SharedWorkerGlobalScope.onconnect`.
 */
export interface SharedWorkerConnectEventLike {
    readonly Ports: readonly TabPortLike[];
}

/**
 * Isomorphic SharedWorkerGlobalScope abstraction for browser workers and unit tests.
 */
export interface SharedWorkerGlobalScopeLike {
    OnConnect?: ((ev: SharedWorkerConnectEventLike) => void) | null;
    AddEventListener?(type: string, listener: (ev: SharedWorkerConnectEventLike) => void): void;
    RemoveEventListener?(type: string, listener: (ev: SharedWorkerConnectEventLike) => void): void;
}

/**
 * Sink passed to {@link KernelWsClientLike.Subscribe}.
 */
export interface KernelWsSink {
    Next(value: unknown): void;
    Error(error: unknown): void;
    Complete(): void;
}

/**
 * GraphQL-WS subscribe payload carried over {@link KernelWsClientLike.Subscribe}.
 */
export interface KernelWsSubscribePayload {
    Query: string;
    Variables?: Record<string, unknown>;
    OperationName?: string;
    Extensions?: Record<string, unknown>;
}

/**
 * Configuration passed to a {@link KernelWsClientLike} factory.
 */
export interface KernelWsClientConfig {
    Url: string;
    ConnectionParams: () => Record<string, unknown>;
    KeepAliveMs: number;
    ConnectionAckWaitTimeoutMs: number;
    RetryAttempts: number;
    ShouldRetry: (errOrCloseEvent: unknown) => boolean;
}

/**
 * Isomorphic WebSocket client abstraction wrapping `graphql-ws` `Client`.
 */
export interface KernelWsClientLike {
    On(event: 'connected' | 'closed' | 'ping' | 'pong', listener: (...args: unknown[]) => void): () => void;
    Subscribe(payload: KernelWsSubscribePayload, sink: KernelWsSink): () => void;
    Dispose(): void;
    Terminate(): void;
}

/**
 * Browser / test environment configuration for {@link SharedTabKernelClient}.
 * Extends {@link TabMultiplexerEnvironment} so fallback to `BroadcastChannel` + Web Locks
 * works seamlessly when `SharedWorker` is unavailable.
 */
export interface SharedTabKernelEnvironment extends TabMultiplexerEnvironment {
    CreateKernelWorker?: (scopeKey: string) => TabKernelWorkerLike;
    CreateKernelPort?: (scopeKey: string) => TabPortLike;
    KernelHandshakeTimeoutMs?: number;
    HeartbeatIntervalMs?: number;
    RunViewL1TtlMs?: number;
    DisableSharedWorker?: boolean;
}

/**
 * Configuration options for {@link SharedTabKernelHost}.
 */
export interface SharedTabKernelHostOptions {
    CreateWsClient?: (config: KernelWsClientConfig) => KernelWsClientLike;
    CreateStorageProvider?: (scopeKey: string) => ILocalStorageProvider;
    HeartbeatTimeoutMs?: number;
    HeartbeatSweepIntervalMs?: number;
    RunViewL1MaxEntries?: number;
    RunViewL1TtlMs?: number;
    StorageL1MaxEntries?: number;
    TokenRefreshTimeoutMs?: number;
    PongTimeoutMs?: number;
    WsKeepAliveMs?: number;
    WsConnectionAckTimeoutMs?: number;
    WsClientMaxAgeMs?: number;
}

/**
 * Runtime diagnostics and multiplexing metrics reported by {@link SharedTabKernelHost}.
 */
export interface SharedTabKernelStats {
    ActiveTabCount: number;
    WsClientCreatedCount: number;
    ActiveWsClientCount: number;
    ActiveWsSubscriptionCount: number;
    StatusUpdatesStreamCount: number;
    RunViewL1HitCount: number;
    RunViewCoalescedCount: number;
    RunViewBackendExecCount: number;
    StorageL1HitCount: number;
    StorageCoalescedReadCount: number;
    StorageIdbReadCount: number;
    StorageIdbWriteCount: number;
    StorageIdbDeduplicatedWriteCount: number;
    TokenRefreshCoalescedCount: number;
    InvalidationEventsRelayedCount: number;
    DroppedTabCleanupCount: number;
}

export type KernelSubscriptionKind = 'status_updates' | 'cache_invalidation' | 'generic';

export type KernelStorageOperation =
    | 'get_item'
    | 'get_items'
    | 'set_item'
    | 'remove'
    | 'clear_category'
    | 'get_category_keys';

export interface KernelHelloMessage {
    Type: 'kernel_hello';
    RequestId: string;
    TabId: string;
    SessionId: string;
    ScopeKey: string;
    WsUrl: string;
    GraphQLUrl: string;
    Token: string;
    MJAPIKey?: string;
    UserAPIKey?: string;
    CanRefreshToken: boolean;
    LastSequence: number;
    ServerProcessId: string | null;
}

export interface KernelHelloAckMessage {
    Type: 'kernel_hello_ack';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    CurrentSequence: number;
    ServerProcessId: string | null;
    SocketState: SocketConnectionState;
    LatestToken: string;
    HostInstanceId: string;
}

export interface KernelHeartbeatMessage {
    Type: 'kernel_heartbeat';
    TabId: string;
    ScopeKey: string;
    Timestamp: number;
}

export interface KernelHeartbeatAckMessage {
    Type: 'kernel_heartbeat_ack';
    TabId: string;
    Timestamp: number;
}

export interface KernelDisconnectMessage {
    Type: 'kernel_disconnect';
    TabId: string;
    ScopeKey: string;
}

export interface KernelTokenUpdateMessage {
    Type: 'kernel_token_update';
    TabId: string;
    ScopeKey: string;
    Token: string;
    Generation?: number;
}

export interface KernelTokenSyncedMessage {
    Type: 'kernel_token_synced';
    ScopeKey: string;
    Token: string;
    Generation: number;
    OriginTabId: string;
}

export interface KernelRefreshTokenRequestMessage {
    Type: 'kernel_refresh_token_request';
    RequestId: string;
    ScopeKey: string;
    Generation: number;
}

export interface KernelRefreshTokenResponseMessage {
    Type: 'kernel_refresh_token_response';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    Generation: number;
    Success: boolean;
    Token?: string;
    ErrorMessage?: string;
}

export interface KernelCoordinateRefreshRequestMessage {
    Type: 'kernel_coordinate_refresh';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    KnownToken: string;
}

export interface KernelCoordinateRefreshResultMessage {
    Type: 'kernel_coordinate_refresh_result';
    RequestId: string;
    ScopeKey: string;
    Success: boolean;
    Token?: string;
    ErrorMessage?: string;
}

export interface KernelAuthErrorMessage {
    Type: 'kernel_auth_error';
    ScopeKey: string;
    ErrorMessage: string;
}

export interface KernelSubscribeMessage {
    Type: 'kernel_subscribe';
    TabId: string;
    ScopeKey: string;
    SubscriptionId: string;
    ChannelKey: string;
    Kind: KernelSubscriptionKind;
    Query: string;
    Variables?: Record<string, unknown>;
    SessionId?: string;
    Extensions?: Record<string, unknown>;
}

export interface KernelUnsubscribeMessage {
    Type: 'kernel_unsubscribe';
    TabId: string;
    ScopeKey: string;
    SubscriptionId: string;
}

export interface KernelSubscriptionEventMessage {
    Type: 'kernel_sub_event';
    ScopeKey: string;
    SubscriptionId: string;
    EventKind: 'next' | 'error' | 'complete';
    Data?: unknown;
    ErrorMessage?: string;
    ErrorCode?: string;
}

export interface KernelSocketStateMessage {
    Type: 'kernel_socket_state';
    ScopeKey: string;
    State: SocketConnectionState;
    Reconnected?: boolean;
}

export interface KernelForceReconnectMessage {
    Type: 'kernel_force_reconnect';
    TabId: string;
    ScopeKey: string;
}

export interface KernelInvalidationPushMessage {
    Type: 'kernel_invalidation';
    ScopeKey: string;
    Event: CacheInvalidationEventData;
    Sequence?: number;
    ServerProcessId: string | null;
}

export interface KernelCatchUpRequestMessage {
    Type: 'kernel_catchup_request';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    TargetSequence: number;
    SinceSequence: number;
    ServerProcessId: string | null;
}

export interface KernelCatchUpDelegateMessage {
    Type: 'kernel_catchup_delegate';
    RequestId: string;
    ScopeKey: string;
    SinceSequence: number;
}

export interface KernelCatchUpDelegateResultMessage {
    Type: 'kernel_catchup_delegate_result';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    Success: boolean;
    CurrentSequence: number;
    ServerProcessId: string | null;
    RequiresFullRefresh: boolean;
    Events: CacheInvalidationEventData[];
}

export interface KernelCatchUpResultMessage {
    Type: 'kernel_catchup_result';
    RequestId: string;
    ScopeKey: string;
    Success: boolean;
    CurrentSequence: number;
    ServerProcessId: string | null;
    RequiresFullRefresh: boolean;
}

export interface KernelWatermarkSyncMessage {
    Type: 'kernel_watermark_sync';
    ScopeKey: string;
    Sequence: number;
    ServerProcessId: string | null;
    RequiresFullRefresh: boolean;
}

export interface KernelMutationNoticeMessage {
    Type: 'kernel_mutation_notice';
    TabId: string;
    ScopeKey: string;
    EntityNames?: string[];
}

export interface KernelRunViewAcquireMessage {
    Type: 'kernel_rv_acquire';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    CacheKey: string;
    EntityNames: string[];
    AllowL1Read: boolean;
    AllowL1Write: boolean;
}

export interface KernelRunViewAcquireAckMessage {
    Type: 'kernel_rv_acquire_ack';
    RequestId: string;
    ScopeKey: string;
    Outcome: 'l1_hit' | 'execute' | 'wait' | 'coalesced_result' | 'error';
    Data?: unknown;
    ErrorMessage?: string;
    Epoch?: number;
}

export interface KernelRunViewCompleteMessage {
    Type: 'kernel_rv_complete';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    CacheKey: string;
    EntityNames: string[];
    AllowL1Write: boolean;
    Epoch: number;
    Success: boolean;
    Data?: unknown;
    ErrorMessage?: string;
}

export interface KernelStorageRequestMessage {
    Type: 'kernel_storage_request';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
    Operation: KernelStorageOperation;
    Key?: string;
    Keys?: string[];
    Category?: string;
    Value?: unknown;
}

export interface KernelStorageResponseMessage {
    Type: 'kernel_storage_response';
    RequestId: string;
    ScopeKey: string;
    Success: boolean;
    Value?: unknown;
    Items?: Array<[string, unknown]>;
    Keys?: string[];
    ErrorMessage?: string;
}

export interface KernelStatsRequestMessage {
    Type: 'kernel_stats_request';
    RequestId: string;
    TabId: string;
    ScopeKey: string;
}

export interface KernelStatsResponseMessage {
    Type: 'kernel_stats_response';
    RequestId: string;
    ScopeKey: string;
    Stats: SharedTabKernelStats;
}

export type KernelClientToHostMessage =
    | KernelHelloMessage
    | KernelHeartbeatMessage
    | KernelDisconnectMessage
    | KernelTokenUpdateMessage
    | KernelRefreshTokenResponseMessage
    | KernelCoordinateRefreshRequestMessage
    | KernelSubscribeMessage
    | KernelUnsubscribeMessage
    | KernelForceReconnectMessage
    | KernelCatchUpRequestMessage
    | KernelCatchUpDelegateResultMessage
    | KernelMutationNoticeMessage
    | KernelRunViewAcquireMessage
    | KernelRunViewCompleteMessage
    | KernelStorageRequestMessage
    | KernelStatsRequestMessage;

export type KernelHostToClientMessage =
    | KernelHelloAckMessage
    | KernelHeartbeatAckMessage
    | KernelTokenSyncedMessage
    | KernelRefreshTokenRequestMessage
    | KernelCoordinateRefreshResultMessage
    | KernelAuthErrorMessage
    | KernelSubscriptionEventMessage
    | KernelSocketStateMessage
    | KernelInvalidationPushMessage
    | KernelCatchUpDelegateMessage
    | KernelCatchUpResultMessage
    | KernelWatermarkSyncMessage
    | KernelMutationNoticeMessage
    | KernelRunViewAcquireAckMessage
    | KernelStorageResponseMessage
    | KernelStatsResponseMessage;

// Private structural DOM interfaces so DOM lowercase APIs stay encapsulated here
// and exported interfaces remain 100% PascalCase.
interface NativeDomMessageEvent {
    readonly data?: unknown;
}

interface NativeDomMessagePort {
    postMessage(message: unknown): void;
    start(): void;
    close(): void;
    onmessage?: ((ev: NativeDomMessageEvent) => void) | null;
    addEventListener(type: string, listener: (ev: NativeDomMessageEvent) => void): void;
    removeEventListener(type: string, listener: (ev: NativeDomMessageEvent) => void): void;
}

interface NativeDomSharedWorker {
    readonly port: NativeDomMessagePort;
    onerror?: ((err: unknown) => void) | null;
    addEventListener?(type: string, listener: (err: unknown) => void): void;
    removeEventListener?(type: string, listener: (err: unknown) => void): void;
}

interface NativeDomConnectEvent {
    readonly ports?: ReadonlyArray<NativeDomMessagePort>;
}

interface NativeDomSharedWorkerGlobalScope {
    onconnect?: ((ev: NativeDomConnectEvent) => void) | null;
    addEventListener?(type: string, listener: (ev: NativeDomConnectEvent) => void): void;
    removeEventListener?(type: string, listener: (ev: NativeDomConnectEvent) => void): void;
}

/**
 * Wraps a browser `MessagePort` into {@link TabPortLike}.
 */
export function WrapNativeMessagePortForKernel(nativePort: unknown): TabPortLike {
    const port = nativePort as NativeDomMessagePort;
    const listenerMap = new Map<(ev: KernelPortMessageEventLike) => void, (ev: NativeDomMessageEvent) => void>();
    return {
        PostMessage: (message: unknown): void => {
            port.postMessage(message);
        },
        Start: (): void => {
            if (typeof port.start === 'function') {
                port.start();
            }
        },
        Close: (): void => {
            if (typeof port.close === 'function') {
                port.close();
            }
        },
        AddEventListener: (type: string, listener: (ev: KernelPortMessageEventLike) => void): void => {
            if (typeof port.addEventListener === 'function') {
                const wrapped = (ev: NativeDomMessageEvent): void => listener({ Data: ev.data });
                listenerMap.set(listener, wrapped);
                port.addEventListener(type, wrapped);
            } else {
                port.onmessage = (ev: NativeDomMessageEvent): void => listener({ Data: ev.data });
            }
        },
        RemoveEventListener: (type: string, listener: (ev: KernelPortMessageEventLike) => void): void => {
            const wrapped = listenerMap.get(listener);
            if (wrapped && typeof port.removeEventListener === 'function') {
                listenerMap.delete(listener);
                port.removeEventListener(type, wrapped);
            }
        },
    };
}

/**
 * Wraps a browser `SharedWorker` instance into {@link TabKernelWorkerLike}.
 */
export function WrapNativeSharedWorkerForKernel(nativeWorker: unknown): TabKernelWorkerLike {
    const worker = nativeWorker as NativeDomSharedWorker;
    const port = WrapNativeMessagePortForKernel(worker.port);
    return {
        Port: port,
        AddEventListener: (type: string, listener: (ev: unknown) => void): void => {
            if (typeof worker.addEventListener === 'function') {
                worker.addEventListener(type, listener);
            } else if (type === 'error') {
                worker.onerror = listener;
            }
        },
        RemoveEventListener: (type: string, listener: (ev: unknown) => void): void => {
            if (typeof worker.removeEventListener === 'function') {
                worker.removeEventListener(type, listener);
            }
        },
    };
}

/**
 * Wraps `globalThis` inside a browser `SharedWorkerGlobalScope` into {@link SharedWorkerGlobalScopeLike}.
 */
export function WrapNativeSharedWorkerGlobalScope(nativeScope: unknown): SharedWorkerGlobalScopeLike {
    const scope = nativeScope as NativeDomSharedWorkerGlobalScope;
    const listenerMap = new Map<
        (ev: SharedWorkerConnectEventLike) => void,
        (ev: NativeDomConnectEvent) => void
    >();
    return {
        AddEventListener: (type: string, listener: (ev: SharedWorkerConnectEventLike) => void): void => {
            const wrapped = (ev: NativeDomConnectEvent): void => {
                const ports = (ev.ports ?? []).map((p) => WrapNativeMessagePortForKernel(p));
                listener({ Ports: ports });
            };
            listenerMap.set(listener, wrapped);
            if (typeof scope.addEventListener === 'function') {
                scope.addEventListener(type, wrapped);
            } else if (type === 'connect') {
                scope.onconnect = wrapped;
            }
        },
        RemoveEventListener: (type: string, listener: (ev: SharedWorkerConnectEventLike) => void): void => {
            const wrapped = listenerMap.get(listener);
            if (wrapped && typeof scope.removeEventListener === 'function') {
                listenerMap.delete(listener);
                scope.removeEventListener(type, wrapped);
            }
        },
    };
}

/**
 * Wraps a `graphql-ws` {@link Client} into {@link KernelWsClientLike}.
 */
export function WrapGraphQLWsClient(client: Client): KernelWsClientLike {
    return {
        On: (event: 'connected' | 'closed' | 'ping' | 'pong', listener: (...args: unknown[]) => void): (() => void) => {
            return client.on(event, listener as never);
        },
        Subscribe: (payload: KernelWsSubscribePayload, sink: KernelWsSink): (() => void) => {
            return client.subscribe(
                {
                    query: payload.Query,
                    variables: payload.Variables,
                    operationName: payload.OperationName,
                    extensions: payload.Extensions,
                },
                {
                    next: (data) => sink.Next(data),
                    error: (err) => sink.Error(err),
                    complete: () => sink.Complete(),
                }
            );
        },
        Dispose: (): void => {
            void client.dispose();
        },
        Terminate: (): void => {
            client.terminate();
        },
    };
}

/**
 * Attaches a listener to a {@link TabPortLike} and returns a detach function.
 */
export function AttachTabPortMessageListener(
    port: TabPortLike,
    listener: (ev: KernelPortMessageEventLike) => void
): () => void {
    if (typeof port.AddEventListener === 'function') {
        port.AddEventListener('message', listener);
        return () => port.RemoveEventListener?.('message', listener);
    }
    port.OnMessage = listener;
    return () => {
        port.OnMessage = null;
    };
}

/**
 * Deep-clones values across tab/worker cache boundaries (preserving `Date`, `Map`, `Set`,
 * typed arrays, plain objects, and arrays) so caller mutations cannot corrupt shared L1 caches.
 */
export function CloneKernelValue<T>(value: T): T {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // Fall through to recursive clone for edge objects
        }
    }
    return fallbackDeepClone(value, new WeakMap<object, unknown>());
}

function fallbackDeepClone<T>(value: T, seen: WeakMap<object, unknown>): T {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    const obj = value as unknown as object;
    if (seen.has(obj)) {
        return seen.get(obj) as T;
    }
    if (value instanceof Date) {
        return new Date(value.getTime()) as unknown as T;
    }
    if (ArrayBuffer.isView(value)) {
        if (value instanceof Uint8Array) {
            return new Uint8Array(value) as unknown as T;
        }
        return value;
    }
    if (value instanceof Map) {
        const clonedMap = new Map<unknown, unknown>();
        seen.set(obj, clonedMap);
        for (const [k, v] of value.entries()) {
            clonedMap.set(fallbackDeepClone(k, seen), fallbackDeepClone(v, seen));
        }
        return clonedMap as unknown as T;
    }
    if (value instanceof Set) {
        const clonedSet = new Set<unknown>();
        seen.set(obj, clonedSet);
        for (const v of value.values()) {
            clonedSet.add(fallbackDeepClone(v, seen));
        }
        return clonedSet as unknown as T;
    }
    if (Array.isArray(value)) {
        const clonedArr: unknown[] = new Array(value.length);
        seen.set(obj, clonedArr);
        for (let i = 0; i < value.length; i++) {
            clonedArr[i] = fallbackDeepClone(value[i], seen);
        }
        return clonedArr as unknown as T;
    }
    const clonedObj: Record<string, unknown> = {};
    seen.set(obj, clonedObj);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v !== 'function' && v !== undefined) {
            clonedObj[k] = fallbackDeepClone(v, seen);
        }
    }
    return clonedObj as unknown as T;
}

/**
 * Produces a deterministic canonical string key for arbitrary GraphQL / RunView payloads.
 */
export function CanonicalizeKernelRequestKey(prefix: string, payload: unknown): string {
    return `${prefix}:${canonicalSerialize(payload)}`;
}

function canonicalSerialize(value: unknown): string {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (value instanceof Date) {
        return `Date(${value.toISOString()})`;
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record)
            .filter((k) => record[k] !== undefined && typeof record[k] !== 'function')
            .sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(record[k])}`).join(',')}}`;
    }
    return JSON.stringify(String(value));
}

/**
 * Type guard verifying whether a message is a {@link TabInvalidationMessage} from legacy fallback transport.
 */
export function IsLegacyTabInvalidationMessage(data: unknown): data is TabInvalidationMessage {
    if (!data || typeof data !== 'object') {
        return false;
    }
    const msg = data as { Type?: unknown };
    return (
        msg.Type === 'leader_ready' ||
        msg.Type === 'invalidation' ||
        msg.Type === 'catchup_request' ||
        msg.Type === 'watermark_sync'
    );
}
