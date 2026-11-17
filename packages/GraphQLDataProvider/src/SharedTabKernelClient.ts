import { v4 as uuidv4 } from 'uuid';
import { Observable, type Observer } from 'rxjs';
import {
    ClientTabInvalidationMultiplexer,
    type ClientTabInvalidationMultiplexerOptions,
} from './ClientTabInvalidationMultiplexer';
import type { SocketConnectionState } from './graphQLDataProvider';
import {
    AttachTabPortMessageListener,
    CloneKernelValue,
    WrapNativeSharedWorkerForKernel,
    type KernelAuthErrorMessage,
    type KernelCatchUpDelegateMessage,
    type KernelHostToClientMessage,
    type KernelInvalidationPushMessage,
    type KernelMutationNoticeMessage,
    type KernelRefreshTokenRequestMessage,
    type KernelRunViewAcquireAckMessage,
    type KernelSocketStateMessage,
    type KernelStatsResponseMessage,
    type KernelStorageOperation,
    type KernelStorageResponseMessage,
    type KernelSubscriptionEventMessage,
    type KernelSubscriptionKind,
    type KernelTokenSyncedMessage,
    type KernelWatermarkSyncMessage,
    type SharedTabKernelEnvironment,
    type SharedTabKernelStats,
    type TabKernelWorkerLike,
    type TabPortLike,
} from './SharedTabKernelProtocol';

export type SharedTabKernelMode = 'uninitialized' | 'connecting' | 'worker' | 'fallback';

export type SharedWorkerFactory = (scopeKey: string) => unknown;

export interface SharedTabKernelCatchUpPayload {
    Success: boolean;
    CurrentSequence: number;
    ServerProcessId: string | null;
    RequiresFullRefresh: boolean;
    Events: import('./ClientTabInvalidationMultiplexer').CacheInvalidationEventData[];
}

export interface SharedTabKernelClientOptions extends ClientTabInvalidationMultiplexerOptions {
    SessionId: string;
    WsUrl: string;
    GraphQLUrl: string;
    Token: string;
    MJAPIKey?: string;
    UserAPIKey?: string;
    CanRefreshToken?: boolean;
    Environment?: SharedTabKernelEnvironment | null;
    WorkerFactory?: SharedWorkerFactory | null;
    OnTokenSynced?: (newToken: string) => void;
    OnRefreshTokenRequested?: () => Promise<string>;
    OnSocketStateChanged?: (state: SocketConnectionState, reconnected: boolean) => void;
    OnAuthError?: (error: Error) => void;
    OnPerformDelegateCatchUp?: (sinceSequence: number) => Promise<SharedTabKernelCatchUpPayload>;
    OnRemoteMutationNotice?: (entityNames?: readonly string[]) => void;
    OnHostFallback?: (reason: string) => void;
}

export interface KernelRunViewSlotAcquisition<T> {
    Outcome: 'l1_hit' | 'execute' | 'wait';
    RequestId: string;
    Epoch: number;
    Data?: T;
    WaitForCoalescedOrFailover?: () => Promise<KernelRunViewSlotFollowUp<T>>;
}

export interface KernelRunViewSlotFollowUp<T> {
    Outcome: 'coalesced_result' | 'execute';
    Epoch: number;
    Data?: T;
}

interface PendingRpc<T> {
    Resolve: (value: T) => void;
    Reject: (err: Error) => void;
}

/**
 * Client-side Shared Tab Kernel connector extending {@link ClientTabInvalidationMultiplexer}.
 *
 * When `SharedWorker` (or an injected `TabPortLike` / `TabKernelWorkerLike`) is available,
 * connects to the shared {@link SharedTabKernelHost} to multiplex:
 *  - A single origin WebSocket (`cacheInvalidation` + per-session `PushStatusUpdates` + `Subscribe`)
 *  - Cross-tab JWT refresh & token synchronization
 *  - Shared worker L1 cache + cross-tab in-flight coalescing for `RunView` / `RunViews`
 *  - Single-owner IndexedDB storage with worker RAM L1 & write deduplication
 *
 * When `SharedWorker` is unavailable or fails to initialize (mobile Safari, SSR, Node, CSP),
 * automatically and gracefully falls back to {@link ClientTabInvalidationMultiplexer}
 * (`BroadcastChannel` + Web Locks) and per-tab transport.
 */
export class SharedTabKernelClient extends ClientTabInvalidationMultiplexer {
    public static readonly DefaultHandshakeTimeoutMs: number = 3_000;
    public static readonly DefaultHeartbeatIntervalMs: number = 5_000;

    private readonly _kernelOptions: SharedTabKernelClientOptions;
    private readonly _kernelEnv: SharedTabKernelEnvironment | null;
    private _mode: SharedTabKernelMode = 'uninitialized';
    private _started = false;
    private _token: string;
    private _canRefreshToken: boolean;
    private _hostInstanceId: string | null = null;

    private _worker: TabKernelWorkerLike | null = null;
    private _port: TabPortLike | null = null;
    private _detachPortListener: (() => void) | null = null;
    private _detachWorkerErrorListener: (() => void) | null = null;
    private _handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    private _readyPromise: Promise<boolean> | null = null;
    private _resolveReady: ((connected: boolean) => void) | null = null;

    private _pendingHelloRequestId: string | null = null;
    private _pendingSubscriptions = new Map<string, Observer<unknown>>();
    private _pendingRunViewAcquires = new Map<string, PendingRpc<KernelRunViewAcquireAckMessage>>();
    private _pendingStorageRequests = new Map<string, PendingRpc<KernelStorageResponseMessage>>();
    private _pendingRefreshCoalesce = new Map<string, PendingRpc<string>>();
    private _pendingCatchUpRequests = new Map<string, PendingRpc<boolean>>();
    private _pendingStatsRequests = new Map<string, PendingRpc<SharedTabKernelStats>>();

    constructor(options: SharedTabKernelClientOptions) {
        super(options);
        this._kernelOptions = options;
        this._kernelEnv = options.Environment ?? null;
        this._token = options.Token;
        this._canRefreshToken = options.CanRefreshToken ?? false;
    }

    public get Mode(): SharedTabKernelMode {
        return this._mode;
    }

    public get IsKernelConnected(): boolean {
        return this._mode === 'worker' && !this.IsDisposed;
    }

    public get HostInstanceId(): string | null {
        return this._hostInstanceId;
    }

    /**
     * Returns true if a SharedWorker kernel transport is configured/supported in this environment.
     */
    public static IsKernelTransportSupported(
        env?: SharedTabKernelEnvironment | null,
        workerFactory?: SharedWorkerFactory | null
    ): boolean {
        if (env?.DisableSharedWorker) {
            return false;
        }
        if (env?.CreateKernelPort || env?.CreateKernelWorker) {
            return true;
        }
        if (workerFactory) {
            return true;
        }
        if (typeof window !== 'undefined' && typeof SharedWorker !== 'undefined' && Boolean(env?.SharedWorkerScriptUrl)) {
            return true;
        }
        return false;
    }

    /**
     * Connects to the SharedWorker kernel if supported, or automatically falls back to
     * `BroadcastChannel` + Web Locks via `ClientTabInvalidationMultiplexer.Start()`.
     */
    public override Start(): void {
        if (this.IsDisposed || this._started) {
            return;
        }
        this._started = true;

        this._readyPromise = new Promise<boolean>((resolve) => {
            this._resolveReady = resolve;
        });

        if (!SharedTabKernelClient.IsKernelTransportSupported(this._kernelEnv, this._kernelOptions.WorkerFactory)) {
            this.fallbackToMultiplexer('SharedWorker transport unavailable');
            return;
        }

        try {
            const port = this.acquireKernelPort();
            if (!port) {
                this.fallbackToMultiplexer('SharedWorker factory returned null');
                return;
            }
            this._port = port;
            this._mode = 'connecting';

            this._detachPortListener = AttachTabPortMessageListener(port, (ev) => {
                this.handleHostMessage(ev.Data);
            });
            port.Start?.();

            const handshakeTimeoutMs =
                this._kernelEnv?.KernelHandshakeTimeoutMs ?? SharedTabKernelClient.DefaultHandshakeTimeoutMs;

            this._handshakeTimer = setTimeout(() => {
                this._handshakeTimer = null;
                if (this._mode === 'connecting') {
                    this.fallbackToMultiplexer('SharedWorker handshake timeout');
                }
            }, handshakeTimeoutMs);
            if (typeof (this._handshakeTimer as { unref?: () => void }).unref === 'function') {
                (this._handshakeTimer as { unref: () => void }).unref();
            }

            const requestId = uuidv4();
            this._pendingHelloRequestId = requestId;
            port.PostMessage({
                Type: 'kernel_hello',
                RequestId: requestId,
                TabId: this.TabId,
                SessionId: this._kernelOptions.SessionId,
                ScopeKey: this.ScopeKey,
                WsUrl: this._kernelOptions.WsUrl,
                GraphQLUrl: this._kernelOptions.GraphQLUrl,
                Token: this._token,
                MJAPIKey: this._kernelOptions.MJAPIKey,
                UserAPIKey: this._kernelOptions.UserAPIKey,
                CanRefreshToken: this._canRefreshToken,
                LastSequence: this._kernelOptions.Callbacks.GetCurrentSequence(),
                ServerProcessId: this._kernelOptions.Callbacks.GetServerProcessId(),
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.fallbackToMultiplexer(`SharedWorker initialization failed: ${msg}`);
        }
    }

    /**
     * Resolves `true` once the SharedWorker kernel handshake succeeds, or `false` if the client
     * fell back to `BroadcastChannel` + Web Locks / direct per-tab mode.
     */
    public async WaitUntilReady(): Promise<boolean> {
        if (this.IsDisposed) {
            return false;
        }
        if (this._mode === 'worker') {
            return true;
        }
        if (this._mode === 'fallback') {
            return false;
        }
        if (this._readyPromise) {
            return this._readyPromise;
        }
        return false;
    }

    /**
     * Disconnects from the worker, cancels all pending RPCs, stops heartbeats, and disposes
     * fallback multiplexer resources.
     */
    public override async Dispose(): Promise<void> {
        if (this.IsDisposed) {
            return;
        }

        if (this._port && (this._mode === 'worker' || this._mode === 'connecting')) {
            try {
                this._port.PostMessage({
                    Type: 'kernel_disconnect',
                    TabId: this.TabId,
                    ScopeKey: this.ScopeKey,
                });
            } catch {
                // Ignore post failure during teardown
            }
        }

        this.cleanupWorkerTransport();
        this.resolveReadyState(false);

        const disposedErr = new Error('SharedTabKernelClient disposed');
        this.rejectAllPendingRpcs(disposedErr);
        for (const obs of this._pendingSubscriptions.values()) {
            try {
                obs.complete();
            } catch {
                // Ignore
            }
        }
        this._pendingSubscriptions.clear();

        await super.Dispose();
    }

    /**
     * Updates the current authentication token and syncs it to the SharedWorker & sibling tabs.
     */
    public UpdateAuthToken(token: string, canRefreshToken?: boolean): void {
        this._token = token;
        if (canRefreshToken !== undefined) {
            this._canRefreshToken = canRefreshToken;
        }
        if (this.IsKernelConnected && this._port) {
            this._port.PostMessage({
                Type: 'kernel_token_update',
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Token: token,
            });
        }
    }

    /**
     * Coordinates a token refresh across tabs through the SharedWorker so concurrent JWT expiry
     * triggers only one OAuth/refresh call and shares the new token with all tabs.
     */
    public async CoordinateTokenRefresh(localRefreshFn: () => Promise<string>): Promise<string> {
        const ready = await this.WaitUntilReady();
        if (!ready || !this.IsKernelConnected || !this._port) {
            return localRefreshFn();
        }

        const requestId = uuidv4();
        return new Promise<string>((resolve, reject) => {
            this._pendingRefreshCoalesce.set(requestId, { Resolve: resolve, Reject: reject });
            this._port!.PostMessage({
                Type: 'kernel_coordinate_refresh',
                RequestId: requestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                KnownToken: this._token,
            });
        });
    }

    /**
     * Subscribes to a GraphQL subscription channel multiplexed over the single worker WebSocket.
     */
    public Subscribe(
        kind: KernelSubscriptionKind,
        channelKey: string,
        query: string,
        variables?: Record<string, unknown>,
        sessionId?: string,
        extensions?: Record<string, unknown>
    ): Observable<unknown> {
        return new Observable<unknown>((observer) => {
            if (this.IsDisposed || !this.IsKernelConnected || !this._port) {
                observer.error(new Error('SharedTabKernelClient is not connected'));
                return;
            }

            const subscriptionId = uuidv4();
            this._pendingSubscriptions.set(subscriptionId, observer);

            this._port.PostMessage({
                Type: 'kernel_subscribe',
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                SubscriptionId: subscriptionId,
                ChannelKey: channelKey,
                Kind: kind,
                Query: query,
                Variables: variables,
                SessionId: sessionId,
                Extensions: extensions,
            });

            return () => {
                this._pendingSubscriptions.delete(subscriptionId);
                if (this._port && this.IsKernelConnected) {
                    try {
                        this._port.PostMessage({
                            Type: 'kernel_unsubscribe',
                            TabId: this.TabId,
                            ScopeKey: this.ScopeKey,
                            SubscriptionId: subscriptionId,
                        });
                    } catch {
                        // Ignore teardown send errors
                    }
                }
            };
        });
    }

    /**
     * Requests the worker to force-reconnect the shared origin WebSocket.
     */
    public ForceSocketReconnect(): void {
        if (this.IsKernelConnected && this._port) {
            this._port.PostMessage({
                Type: 'kernel_force_reconnect',
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
            });
        }
    }

    /**
     * Notifies the SharedWorker L1 cache and sibling tabs of a mutation on `entityNames`.
     */
    public NotifyMutation(entityNames?: readonly string[]): void {
        if (this.IsKernelConnected && this._port) {
            this._port.PostMessage({
                Type: 'kernel_mutation_notice',
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                EntityNames: entityNames ? Array.from(entityNames) : undefined,
            });
        }
    }

    /**
     * Acquires a slot in the worker's L1 cache / in-flight coalescing registry.
     * Always resolves promptly with `'l1_hit'`, `'execute'`, or `'wait'`.
     */
    public async AcquireRunViewSlot<T>(
        cacheKey: string,
        entityNames: string[],
        allowL1Read: boolean,
        allowL1Write: boolean
    ): Promise<KernelRunViewSlotAcquisition<T>> {
        if (!this.IsKernelConnected || !this._port) {
            return { Outcome: 'execute', RequestId: uuidv4(), Epoch: 0 };
        }

        const requestId = uuidv4();
        let ack: KernelRunViewAcquireAckMessage;
        try {
            ack = await new Promise<KernelRunViewAcquireAckMessage>((resolve, reject) => {
                this._pendingRunViewAcquires.set(requestId, { Resolve: resolve, Reject: reject });
                this._port!.PostMessage({
                    Type: 'kernel_rv_acquire',
                    RequestId: requestId,
                    TabId: this.TabId,
                    ScopeKey: this.ScopeKey,
                    CacheKey: cacheKey,
                    EntityNames: entityNames,
                    AllowL1Read: allowL1Read,
                    AllowL1Write: allowL1Write,
                });
            });
        } catch {
            return { Outcome: 'execute', RequestId: requestId, Epoch: 0 };
        }

        if (ack.Outcome === 'l1_hit' || ack.Outcome === 'coalesced_result') {
            return {
                Outcome: 'l1_hit',
                RequestId: requestId,
                Epoch: ack.Epoch ?? 0,
                Data: CloneKernelValue(ack.Data) as T,
            };
        }
        if (ack.Outcome === 'execute') {
            return {
                Outcome: 'execute',
                RequestId: requestId,
                Epoch: ack.Epoch ?? 0,
            };
        }
        if (ack.Outcome === 'error') {
            throw new Error(ack.ErrorMessage || 'Coalesced RunView execution failed');
        }

        // Outcome === 'wait': register follow-up listener for either coalesced_result or execute failover
        const waitForFollowUp = (): Promise<KernelRunViewSlotFollowUp<T>> => {
            return new Promise<KernelRunViewSlotFollowUp<T>>((resolve, reject) => {
                this._pendingRunViewAcquires.set(requestId, {
                    Resolve: (followAck) => {
                        if (followAck.Outcome === 'coalesced_result' || followAck.Outcome === 'l1_hit') {
                            resolve({
                                Outcome: 'coalesced_result',
                                Epoch: followAck.Epoch ?? 0,
                                Data: CloneKernelValue(followAck.Data) as T,
                            });
                        } else if (followAck.Outcome === 'execute') {
                            resolve({
                                Outcome: 'execute',
                                Epoch: followAck.Epoch ?? 0,
                            });
                        } else {
                            reject(new Error(followAck.ErrorMessage || 'Coalesced RunView execution failed'));
                        }
                    },
                    Reject: reject,
                });
            });
        };

        return {
            Outcome: 'wait',
            RequestId: requestId,
            Epoch: 0,
            WaitForCoalescedOrFailover: waitForFollowUp,
        };
    }

    /**
     * Completes an acquired `'execute'` RunView slot, resolving all waiting tabs and populating worker L1.
     */
    public CompleteRunViewSlot<T>(
        requestId: string,
        cacheKey: string,
        entityNames: string[],
        allowL1Write: boolean,
        epoch: number,
        outcome: { Success: true; Data: T } | { Success: false; ErrorMessage: string }
    ): void {
        if (!this.IsKernelConnected || !this._port) {
            return;
        }
        let dataPayload: T | undefined;
        let errorMessage: string | undefined;
        if (outcome.Success) {
            dataPayload = CloneKernelValue(outcome.Data);
        } else {
            errorMessage = (outcome as { Success: false; ErrorMessage: string }).ErrorMessage;
        }
        this._port.PostMessage({
            Type: 'kernel_rv_complete',
            RequestId: requestId,
            TabId: this.TabId,
            ScopeKey: this.ScopeKey,
            CacheKey: cacheKey,
            EntityNames: entityNames,
            AllowL1Write: allowL1Write,
            Epoch: epoch,
            Success: outcome.Success,
            Data: dataPayload,
            ErrorMessage: errorMessage,
        });
    }

    /**
     * Coordinates a RunView/RunViews/RunViewsWithCacheCheck item through the worker's L1 cache
     * and cross-tab in-flight coalescing registry.
     */
    public async ExecuteWithKernelCoalescing<T>(
        cacheKey: string,
        entityNames: string[],
        allowL1Read: boolean,
        allowL1Write: boolean,
        executeFn: () => Promise<T>
    ): Promise<T> {
        if (!this.IsKernelConnected || !this._port) {
            return executeFn();
        }

        const slot = await this.AcquireRunViewSlot<T>(cacheKey, entityNames, allowL1Read, allowL1Write);
        if (slot.Outcome === 'l1_hit') {
            return slot.Data as T;
        }

        let activeEpoch = slot.Epoch;
        if (slot.Outcome === 'wait' && slot.WaitForCoalescedOrFailover) {
            let followUp: KernelRunViewSlotFollowUp<T>;
            try {
                followUp = await slot.WaitForCoalescedOrFailover();
            } catch (err) {
                // If the kernel itself disposed/disconnected mid-wait, fail safe by executing locally
                if (!this.IsKernelConnected) {
                    return executeFn();
                }
                throw err;
            }
            if (followUp.Outcome === 'coalesced_result') {
                return followUp.Data as T;
            }
            activeEpoch = followUp.Epoch;
        }

        try {
            const result = await executeFn();
            this.CompleteRunViewSlot(slot.RequestId, cacheKey, entityNames, allowL1Write, activeEpoch, {
                Success: true,
                Data: result,
            });
            return result;
        } catch (err) {
            this.CompleteRunViewSlot(slot.RequestId, cacheKey, entityNames, allowL1Write, activeEpoch, {
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }

    /**
     * Requests cache invalidation sequence catch-up through the worker kernel (or falls back
     * to the BroadcastChannel/WebLocks multiplexer when in fallback mode).
     */
    public override async RequestCatchUp(
        targetSequence: number,
        serverProcessId: string | null
    ): Promise<boolean> {
        if (this.IsDisposed) {
            return false;
        }
        if (!this.IsKernelConnected || !this._port) {
            return super.RequestCatchUp(targetSequence, serverProcessId);
        }

        const currentSeq = this._kernelOptions.Callbacks.GetCurrentSequence();
        if (currentSeq >= targetSequence) {
            return true;
        }

        const requestId = uuidv4();
        return new Promise<boolean>((resolve, reject) => {
            this._pendingCatchUpRequests.set(requestId, { Resolve: resolve, Reject: reject });
            this._port!.PostMessage({
                Type: 'kernel_catchup_request',
                RequestId: requestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                TargetSequence: targetSequence,
                SinceSequence: currentSeq,
                ServerProcessId: serverProcessId,
            });
        });
    }

    /**
     * Executes a storage operation via the worker's single IDB + L1 owner.
     */
    public async SendStorageRequest(
        operation: KernelStorageOperation,
        params: {
            Key?: string;
            Keys?: string[];
            Category?: string;
            Value?: unknown;
        }
    ): Promise<KernelStorageResponseMessage> {
        if (!this.IsKernelConnected || !this._port) {
            throw new Error('SharedTabKernelClient is not connected to worker');
        }
        const requestId = uuidv4();
        return new Promise<KernelStorageResponseMessage>((resolve, reject) => {
            this._pendingStorageRequests.set(requestId, { Resolve: resolve, Reject: reject });
            this._port!.PostMessage({
                Type: 'kernel_storage_request',
                RequestId: requestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Operation: operation,
                Key: params.Key,
                Keys: params.Keys,
                Category: params.Category,
                Value: params.Value !== undefined ? CloneKernelValue(params.Value) : undefined,
            });
        });
    }

    /**
     * Queries live multiplexing & cache metrics from the connected {@link SharedTabKernelHost}.
     */
    public async GetKernelStats(): Promise<SharedTabKernelStats | null> {
        const ready = await this.WaitUntilReady();
        if (!ready || !this.IsKernelConnected || !this._port) {
            return null;
        }
        const requestId = uuidv4();
        return new Promise<SharedTabKernelStats>((resolve, reject) => {
            this._pendingStatsRequests.set(requestId, { Resolve: resolve, Reject: reject });
            this._port!.PostMessage({
                Type: 'kernel_stats_request',
                RequestId: requestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
            });
        });
    }

    // ── Internal Port / Handshake / Message Routing ──────────────────────────

    private acquireKernelPort(): TabPortLike | null {
        if (this._kernelEnv?.CreateKernelPort) {
            return this._kernelEnv.CreateKernelPort(this.ScopeKey);
        }

        let worker: TabKernelWorkerLike | null = null;
        if (this._kernelEnv?.CreateKernelWorker) {
            worker = this._kernelEnv.CreateKernelWorker(this.ScopeKey);
        } else if (this._kernelOptions.WorkerFactory) {
            const rawWorker = this._kernelOptions.WorkerFactory(this.ScopeKey);
            if (!rawWorker) {
                return null;
            }
            worker = this.normalizeWorkerHandle(rawWorker);
        } else if (typeof SharedWorker !== 'undefined' && this._kernelEnv?.SharedWorkerScriptUrl) {
            const globalWithWorker = globalThis as {
                SharedWorker?: new (url: string, options?: { type?: string; name?: string }) => unknown;
            };
            if (globalWithWorker.SharedWorker) {
                const raw = new globalWithWorker.SharedWorker(this._kernelEnv.SharedWorkerScriptUrl, {
                    type: 'module',
                    name: `mj-shared-tab-kernel:${this.ScopeKey}`,
                });
                worker = WrapNativeSharedWorkerForKernel(raw);
            }
        }

        if (!worker) {
            return null;
        }
        this._worker = worker;

        const onWorkerError = (): void => {
            if (this._mode === 'connecting') {
                this.fallbackToMultiplexer('SharedWorker error event before handshake');
            }
        };
        if (typeof worker.AddEventListener === 'function') {
            worker.AddEventListener('error', onWorkerError);
            this._detachWorkerErrorListener = () => worker?.RemoveEventListener?.('error', onWorkerError);
        } else if ('OnError' in worker) {
            worker.OnError = onWorkerError;
            this._detachWorkerErrorListener = () => {
                if (worker) {
                    worker.OnError = null;
                }
            };
        }

        return worker.Port ?? null;
    }

    private normalizeWorkerHandle(rawWorker: unknown): TabKernelWorkerLike {
        const candidate = rawWorker as Partial<TabKernelWorkerLike> & { port?: unknown };
        if (candidate.Port) {
            return candidate as TabKernelWorkerLike;
        }
        return WrapNativeSharedWorkerForKernel(rawWorker);
    }

    private fallbackToMultiplexer(reason: string): void {
        if (this._mode === 'fallback' || this.IsDisposed) {
            return;
        }
        this._mode = 'fallback';
        this.cleanupWorkerTransport();
        this.rejectAllPendingRpcs(new Error(`SharedTabKernel fell back to multiplexer: ${reason}`));
        this.resolveReadyState(false);
        this._kernelOptions.OnHostFallback?.(reason);

        if (ClientTabInvalidationMultiplexer.IsSupported(this._kernelEnv)) {
            super.Start();
        }
    }

    private cleanupWorkerTransport(): void {
        if (this._handshakeTimer) {
            clearTimeout(this._handshakeTimer);
            this._handshakeTimer = null;
        }
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        if (this._detachWorkerErrorListener) {
            this._detachWorkerErrorListener();
            this._detachWorkerErrorListener = null;
        }
        if (this._detachPortListener) {
            this._detachPortListener();
            this._detachPortListener = null;
        }
        if (this._port) {
            this._port.Close?.();
            this._port = null;
        }
        this._worker = null;
    }

    private resolveReadyState(connected: boolean): void {
        if (this._resolveReady) {
            const resolve = this._resolveReady;
            this._resolveReady = null;
            resolve(connected);
        }
    }

    private rejectAllPendingRpcs(err: Error): void {
        for (const p of this._pendingRunViewAcquires.values()) {
            p.Reject(err);
        }
        this._pendingRunViewAcquires.clear();

        for (const p of this._pendingStorageRequests.values()) {
            p.Reject(err);
        }
        this._pendingStorageRequests.clear();

        for (const p of this._pendingRefreshCoalesce.values()) {
            p.Reject(err);
        }
        this._pendingRefreshCoalesce.clear();

        for (const p of this._pendingCatchUpRequests.values()) {
            p.Reject(err);
        }
        this._pendingCatchUpRequests.clear();

        for (const p of this._pendingStatsRequests.values()) {
            p.Reject(err);
        }
        this._pendingStatsRequests.clear();
    }

    private startHeartbeatLoop(): void {
        if (this._heartbeatTimer || this.IsDisposed) {
            return;
        }
        const intervalMs = this._kernelEnv?.HeartbeatIntervalMs ?? SharedTabKernelClient.DefaultHeartbeatIntervalMs;
        this._heartbeatTimer = setInterval(() => {
            if (this._port && this.IsKernelConnected) {
                try {
                    this._port.PostMessage({
                        Type: 'kernel_heartbeat',
                        TabId: this.TabId,
                        ScopeKey: this.ScopeKey,
                        Timestamp: Date.now(),
                    });
                } catch {
                    // Ignore heartbeat post error
                }
            }
        }, intervalMs);
        if (typeof (this._heartbeatTimer as { unref?: () => void }).unref === 'function') {
            (this._heartbeatTimer as { unref: () => void }).unref();
        }
    }

    private handleHostMessage(rawData: unknown): void {
        if (this.IsDisposed || !rawData || typeof rawData !== 'object') {
            return;
        }
        const msg = rawData as Partial<KernelHostToClientMessage>;
        if (!msg.Type) {
            return;
        }

        switch (msg.Type) {
            case 'kernel_hello_ack': {
                const ack = msg as import('./SharedTabKernelProtocol').KernelHelloAckMessage;
                if (ack.RequestId !== this._pendingHelloRequestId) {
                    return;
                }
                this._pendingHelloRequestId = null;
                if (this._handshakeTimer) {
                    clearTimeout(this._handshakeTimer);
                    this._handshakeTimer = null;
                }
                this._mode = 'worker';
                this._hostInstanceId = ack.HostInstanceId;
                this.startHeartbeatLoop();

                if (ack.LatestToken && ack.LatestToken !== this._token) {
                    this._token = ack.LatestToken;
                    this._kernelOptions.OnTokenSynced?.(ack.LatestToken);
                }
                if (ack.CurrentSequence > this._kernelOptions.Callbacks.GetCurrentSequence()) {
                    this._kernelOptions.Callbacks.OnWatermarkSync?.(
                        ack.CurrentSequence,
                        ack.ServerProcessId,
                        false
                    );
                }
                if (ack.SocketState && ack.SocketState !== 'unknown') {
                    this._kernelOptions.OnSocketStateChanged?.(ack.SocketState, false);
                }

                this.resolveReadyState(true);
                break;
            }
            case 'kernel_heartbeat_ack':
                break;
            case 'kernel_sub_event':
                this.handleSubscriptionEvent(msg as KernelSubscriptionEventMessage);
                break;
            case 'kernel_socket_state': {
                const stateMsg = msg as KernelSocketStateMessage;
                this._kernelOptions.OnSocketStateChanged?.(stateMsg.State, stateMsg.Reconnected === true);
                break;
            }
            case 'kernel_invalidation': {
                const invMsg = msg as KernelInvalidationPushMessage;
                this._kernelOptions.Callbacks.OnRemoteInvalidation(invMsg.Event, invMsg.ServerProcessId);
                break;
            }
            case 'kernel_watermark_sync': {
                const wmMsg = msg as KernelWatermarkSyncMessage;
                this._kernelOptions.Callbacks.OnWatermarkSync?.(
                    wmMsg.Sequence,
                    wmMsg.ServerProcessId,
                    wmMsg.RequiresFullRefresh
                );
                break;
            }
            case 'kernel_catchup_result': {
                const cuMsg = msg as import('./SharedTabKernelProtocol').KernelCatchUpResultMessage;
                const pending = this._pendingCatchUpRequests.get(cuMsg.RequestId);
                if (pending) {
                    this._pendingCatchUpRequests.delete(cuMsg.RequestId);
                    pending.Resolve(cuMsg.Success && !cuMsg.RequiresFullRefresh);
                }
                break;
            }
            case 'kernel_catchup_delegate':
                void this.handleCatchUpDelegate(msg as KernelCatchUpDelegateMessage);
                break;
            case 'kernel_token_synced': {
                const tokenMsg = msg as KernelTokenSyncedMessage;
                if (tokenMsg.Token && tokenMsg.Token !== this._token) {
                    this._token = tokenMsg.Token;
                    this._kernelOptions.OnTokenSynced?.(tokenMsg.Token);
                }
                break;
            }
            case 'kernel_refresh_token_request':
                void this.handleRefreshTokenRequest(msg as KernelRefreshTokenRequestMessage);
                break;
            case 'kernel_coordinate_refresh_result': {
                const resMsg = msg as import('./SharedTabKernelProtocol').KernelCoordinateRefreshResultMessage;
                const pending = this._pendingRefreshCoalesce.get(resMsg.RequestId);
                if (pending) {
                    this._pendingRefreshCoalesce.delete(resMsg.RequestId);
                    if (resMsg.Success && resMsg.Token) {
                        this._token = resMsg.Token;
                        pending.Resolve(resMsg.Token);
                    } else {
                        pending.Reject(new Error(resMsg.ErrorMessage || 'Cross-tab token refresh failed'));
                    }
                }
                break;
            }
            case 'kernel_auth_error': {
                const errMsg = msg as KernelAuthErrorMessage;
                this._kernelOptions.OnAuthError?.(new Error(errMsg.ErrorMessage));
                break;
            }
            case 'kernel_mutation_notice': {
                const mutMsg = msg as KernelMutationNoticeMessage;
                this._kernelOptions.OnRemoteMutationNotice?.(mutMsg.EntityNames);
                break;
            }
            case 'kernel_rv_acquire_ack': {
                const rvMsg = msg as KernelRunViewAcquireAckMessage;
                const pending = this._pendingRunViewAcquires.get(rvMsg.RequestId);
                if (pending) {
                    this._pendingRunViewAcquires.delete(rvMsg.RequestId);
                    pending.Resolve(rvMsg);
                }
                break;
            }
            case 'kernel_storage_response': {
                const stMsg = msg as KernelStorageResponseMessage;
                const pending = this._pendingStorageRequests.get(stMsg.RequestId);
                if (pending) {
                    this._pendingStorageRequests.delete(stMsg.RequestId);
                    if (stMsg.Success) {
                        pending.Resolve(stMsg);
                    } else {
                        pending.Reject(new Error(stMsg.ErrorMessage || 'Storage operation failed'));
                    }
                }
                break;
            }
            case 'kernel_stats_response': {
                const statsMsg = msg as KernelStatsResponseMessage;
                const pending = this._pendingStatsRequests.get(statsMsg.RequestId);
                if (pending) {
                    this._pendingStatsRequests.delete(statsMsg.RequestId);
                    pending.Resolve(statsMsg.Stats);
                }
                break;
            }
        }
    }

    private handleSubscriptionEvent(msg: KernelSubscriptionEventMessage): void {
        const observer = this._pendingSubscriptions.get(msg.SubscriptionId);
        if (!observer) {
            return;
        }
        switch (msg.EventKind) {
            case 'next':
                observer.next(CloneKernelValue(msg.Data));
                break;
            case 'error': {
                this._pendingSubscriptions.delete(msg.SubscriptionId);
                const err = new Error(msg.ErrorMessage || 'Subscription error') as Error & {
                    extensions?: { code?: string };
                };
                if (msg.ErrorCode) {
                    err.extensions = { code: msg.ErrorCode };
                }
                observer.error(err);
                break;
            }
            case 'complete':
                this._pendingSubscriptions.delete(msg.SubscriptionId);
                observer.complete();
                break;
        }
    }

    private async handleRefreshTokenRequest(msg: KernelRefreshTokenRequestMessage): Promise<void> {
        if (!this._port || !this.IsKernelConnected) {
            return;
        }
        if (!this._kernelOptions.OnRefreshTokenRequested) {
            this._port.PostMessage({
                Type: 'kernel_refresh_token_response',
                RequestId: msg.RequestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Generation: msg.Generation,
                Success: false,
                ErrorMessage: 'No token refresh callback available on tab',
            });
            return;
        }

        try {
            const newToken = await this._kernelOptions.OnRefreshTokenRequested();
            this._token = newToken;
            this._port?.PostMessage({
                Type: 'kernel_refresh_token_response',
                RequestId: msg.RequestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Generation: msg.Generation,
                Success: true,
                Token: newToken,
            });
        } catch (err) {
            this._port?.PostMessage({
                Type: 'kernel_refresh_token_response',
                RequestId: msg.RequestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Generation: msg.Generation,
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private async handleCatchUpDelegate(msg: KernelCatchUpDelegateMessage): Promise<void> {
        if (!this._port || !this.IsKernelConnected) {
            return;
        }
        if (!this._kernelOptions.OnPerformDelegateCatchUp) {
            this._port.PostMessage({
                Type: 'kernel_catchup_delegate_result',
                RequestId: msg.RequestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Success: false,
                CurrentSequence: this._kernelOptions.Callbacks.GetCurrentSequence(),
                ServerProcessId: this._kernelOptions.Callbacks.GetServerProcessId(),
                RequiresFullRefresh: false,
                Events: [],
            });
            return;
        }

        try {
            const payload = await this._kernelOptions.OnPerformDelegateCatchUp(msg.SinceSequence);
            this._port?.PostMessage({
                Type: 'kernel_catchup_delegate_result',
                RequestId: msg.RequestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Success: payload.Success,
                CurrentSequence: payload.CurrentSequence,
                ServerProcessId: payload.ServerProcessId,
                RequiresFullRefresh: payload.RequiresFullRefresh,
                Events: payload.Events,
            });
        } catch {
            this._port?.PostMessage({
                Type: 'kernel_catchup_delegate_result',
                RequestId: msg.RequestId,
                TabId: this.TabId,
                ScopeKey: this.ScopeKey,
                Success: false,
                CurrentSequence: this._kernelOptions.Callbacks.GetCurrentSequence(),
                ServerProcessId: this._kernelOptions.Callbacks.GetServerProcessId(),
                RequiresFullRefresh: false,
                Events: [],
            });
        }
    }
}
