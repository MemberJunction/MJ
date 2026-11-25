import { UUIDsEqual } from "@memberjunction/global";
import { v4 as uuidv4 } from "uuid";

/**
 * Event received when a message is delivered over BroadcastChannel or MessagePort.
 */
export interface MessageEventLike {
    readonly Data?: TabInvalidationMessage | null;
}

/**
 * Minimal interface matching browser BroadcastChannel API with PascalCase members.
 */
export interface BroadcastChannelLike {
    readonly Name?: string;
    PostMessage?(message: TabInvalidationMessage): void;
    OnMessage?: ((ev: MessageEventLike) => void) | null;
    AddEventListener?(type: string, listener: (ev: MessageEventLike) => void): void;
    RemoveEventListener?(type: string, listener: (ev: MessageEventLike) => void): void;
    Close?(): void;
}

/**
 * Minimal interface matching browser Web Locks API (navigator.locks).
 */
export interface WebLocksLike {
    Request?(name: string, callback: () => Promise<void>): Promise<void>;
}

/**
 * Minimal interface matching browser MessagePort API for SharedWorker.
 */
export interface MessagePortLike {
    PostMessage?(message: TabInvalidationMessage): void;
    Start?(): void;
    Close?(): void;
    OnMessage?: ((ev: MessageEventLike) => void) | null;
    AddEventListener?(type: string, listener: (ev: MessageEventLike) => void): void;
    RemoveEventListener?(type: string, listener: (ev: MessageEventLike) => void): void;
}

/**
 * Minimal interface matching browser SharedWorker.
 */
export interface SharedWorkerLike {
    readonly Port?: MessagePortLike;
}

/**
 * Injectable browser primitives and configuration for multi-tab invalidation multiplexing.
 */
export interface TabMultiplexerEnvironment {
    CreateBroadcastChannel?: (name: string) => BroadcastChannelLike;
    Locks?: WebLocksLike;
    CreateSharedWorker?: (scriptUrl: string, name: string) => SharedWorkerLike;
    SharedWorkerScriptUrl?: string;
    CatchUpFallbackTimeoutMs?: number;
}

/**
 * Wire shape of a cache invalidation event emitted by MJAPI.
 */
export interface CacheInvalidationEventData {
    EntityName: string;
    PrimaryKeyValues: string | null;
    Action: string;
    SourceServerID: string;
    Timestamp: string;
    OriginSessionID?: string;
    RecordData?: string;
    Sequence?: number;
}

export type TabInvalidationMessageType =
    | 'leader_ready'
    | 'invalidation'
    | 'catchup_request'
    | 'watermark_sync';

export interface LeaderReadyMessage {
    Type: 'leader_ready';
    MessageId?: string;
    TabId: string;
    Sequence: number;
    ServerProcessId: string | null;
}

export interface InvalidationMessage {
    Type: 'invalidation';
    MessageId?: string;
    TabId: string;
    Event: CacheInvalidationEventData;
    Sequence?: number;
    ServerProcessId: string | null;
}

export interface CatchUpRequestMessage {
    Type: 'catchup_request';
    MessageId?: string;
    TabId: string;
    TargetSequence: number;
    ServerProcessId: string | null;
}

export interface WatermarkSyncMessage {
    Type: 'watermark_sync';
    MessageId?: string;
    TabId: string;
    Sequence: number;
    ServerProcessId: string | null;
    RequiresFullRefresh: boolean;
}

export type TabInvalidationMessage =
    | LeaderReadyMessage
    | InvalidationMessage
    | CatchUpRequestMessage
    | WatermarkSyncMessage;

export interface TabMultiplexerCallbacks {
    OnBecomeLeader: () => void | Promise<void>;
    OnLoseLeadership?: () => void | Promise<void>;
    OnRemoteInvalidation: (event: CacheInvalidationEventData, serverProcessId: string | null) => void;
    OnPerformCatchUp: (targetSequence: number, serverProcessId: string | null) => Promise<boolean>;
    GetCurrentSequence: () => number;
    GetServerProcessId: () => string | null;
    OnWatermarkSync?: (sequence: number, serverProcessId: string | null, requiresFullRefresh: boolean) => void;
}

export interface ClientTabInvalidationMultiplexerOptions {
    ScopeKey: string;
    Callbacks: TabMultiplexerCallbacks;
    Environment?: TabMultiplexerEnvironment | null;
    TabId?: string;
    CatchUpFallbackTimeoutMs?: number;
}

interface NativeDomMessageEvent {
    readonly data?: TabInvalidationMessage | null;
}

interface NativeDomBroadcastChannel {
    readonly name: string;
    postMessage(message: TabInvalidationMessage): void;
    addEventListener(type: string, listener: (ev: NativeDomMessageEvent) => void): void;
    removeEventListener(type: string, listener: (ev: NativeDomMessageEvent) => void): void;
    close(): void;
}

interface NativeDomMessagePort {
    postMessage(message: TabInvalidationMessage): void;
    start(): void;
    close(): void;
    addEventListener(type: string, listener: (ev: NativeDomMessageEvent) => void): void;
    removeEventListener(type: string, listener: (ev: NativeDomMessageEvent) => void): void;
}

interface NativeDomLocks {
    request(name: string, callback: () => Promise<void>): Promise<void>;
}

function WrapNativeBroadcastChannel(native: NativeDomBroadcastChannel): BroadcastChannelLike {
    const listenerMap = new Map<(ev: MessageEventLike) => void, (ev: NativeDomMessageEvent) => void>();
    return {
        Name: native.name,
        PostMessage: (message: TabInvalidationMessage) => native.postMessage(message),
        AddEventListener: (type: string, listener: (ev: MessageEventLike) => void) => {
            const wrapped = (ev: NativeDomMessageEvent): void => listener({ Data: ev.data ?? null });
            listenerMap.set(listener, wrapped);
            native.addEventListener(type, wrapped);
        },
        RemoveEventListener: (type: string, listener: (ev: MessageEventLike) => void) => {
            const wrapped = listenerMap.get(listener);
            if (wrapped) {
                listenerMap.delete(listener);
                native.removeEventListener(type, wrapped);
            }
        },
        Close: () => native.close(),
    };
}

function WrapNativeMessagePort(native: NativeDomMessagePort): MessagePortLike {
    const listenerMap = new Map<(ev: MessageEventLike) => void, (ev: NativeDomMessageEvent) => void>();
    return {
        PostMessage: (message: TabInvalidationMessage) => native.postMessage(message),
        Start: () => native.start(),
        Close: () => native.close(),
        AddEventListener: (type: string, listener: (ev: MessageEventLike) => void) => {
            const wrapped = (ev: NativeDomMessageEvent): void => listener({ Data: ev.data ?? null });
            listenerMap.set(listener, wrapped);
            native.addEventListener(type, wrapped);
        },
        RemoveEventListener: (type: string, listener: (ev: MessageEventLike) => void) => {
            const wrapped = listenerMap.get(listener);
            if (wrapped) {
                listenerMap.delete(listener);
                native.removeEventListener(type, wrapped);
            }
        },
    };
}

function SafePostMessage(
    target: BroadcastChannelLike | MessagePortLike | null | undefined,
    message: TabInvalidationMessage
): void {
    if (target && typeof target.PostMessage === 'function') {
        target.PostMessage(message);
    }
}

function SafeClose(
    target: BroadcastChannelLike | MessagePortLike | null | undefined
): void {
    if (target && typeof target.Close === 'function') {
        target.Close();
    }
}

function SafeStart(
    target: MessagePortLike | null | undefined
): void {
    if (target && typeof target.Start === 'function') {
        target.Start();
    }
}

function SafeAddMessageListener(
    target: BroadcastChannelLike | MessagePortLike,
    listener: (ev: MessageEventLike) => void
): () => void {
    if (typeof target.AddEventListener === 'function') {
        target.AddEventListener('message', listener);
        return () => target.RemoveEventListener?.('message', listener);
    }
    if ('OnMessage' in target) {
        target.OnMessage = listener;
        return () => {
            target.OnMessage = null;
        };
    }
    return () => {};
}

function SafeRequestLock(
    locks: WebLocksLike,
    name: string,
    callback: () => Promise<void>
): Promise<void> {
    if (typeof locks.Request === 'function') {
        return locks.Request(name, callback);
    }
    return Promise.reject(new Error('WebLocksLike does not implement Request'));
}

/**
 * Coordinates multi-tab cache invalidation across browser tabs using Web Locks and BroadcastChannel/SharedWorker.
 * Exactly one tab holds the exclusive Web Lock and becomes Leader, establishing the single WebSocket subscription
 * to MJAPI and relaying invalidation frames to follower tabs.
 */
export class ClientTabInvalidationMultiplexer {
    public static readonly DefaultCatchUpFallbackTimeoutMs: number = 300;

    private _tabId: string;
    private _scopeKey: string;
    private _channelName: string;
    private _lockName: string;
    private _callbacks: TabMultiplexerCallbacks;
    private _env: TabMultiplexerEnvironment | null;
    private _fallbackTimeoutMs: number;

    private _channel: BroadcastChannelLike | null = null;
    private _channelUnlisten: (() => void) | null = null;
    private _sharedWorker: SharedWorkerLike | null = null;
    private _sharedWorkerPort: MessagePortLike | null = null;
    private _workerPortUnlisten: (() => void) | null = null;

    private _isLeader = false;
    private _isDisposed = false;
    private _leaderTabId: string | null = null;
    private _releaseLock: (() => void) | null = null;
    private _lockPromise: Promise<void> | null = null;

    private _pendingCatchUpTimers = new Map<number, ReturnType<typeof setTimeout>>();
    private _seenMessageIds = new Set<string>();
    private _seenMessageOrder: string[] = [];
    private _messageCounter = 0;
    private _activeLeaderCatchUpPromise: Promise<boolean> | null = null;

    constructor(options: ClientTabInvalidationMultiplexerOptions) {
        this._tabId = options.TabId ?? uuidv4();
        this._scopeKey = ClientTabInvalidationMultiplexer.NormalizeScopeKey(options.ScopeKey);
        this._channelName = `mj:cache-inv:v1:${this._scopeKey}`;
        this._lockName = `mj:cache-inv:v1:${this._scopeKey}`;
        this._callbacks = options.Callbacks;
        this._env = options.Environment ?? null;
        this._fallbackTimeoutMs =
            options.CatchUpFallbackTimeoutMs ??
            options.Environment?.CatchUpFallbackTimeoutMs ??
            ClientTabInvalidationMultiplexer.DefaultCatchUpFallbackTimeoutMs;
    }

    public get TabId(): string {
        return this._tabId;
    }

    public get ScopeKey(): string {
        return this._scopeKey;
    }

    public get ChannelName(): string {
        return this._channelName;
    }

    public get LockName(): string {
        return this._lockName;
    }

    public get IsLeader(): boolean {
        return this._isLeader;
    }

    public get IsDisposed(): boolean {
        return this._isDisposed;
    }

    public get LeaderTabId(): string | null {
        return this._leaderTabId;
    }

    public get CatchUpFallbackTimeoutMs(): number {
        return this._fallbackTimeoutMs;
    }

    public static NormalizeScopeKey(scopeKey: string): string {
        const trimmed = (scopeKey || '').trim().toLowerCase();
        return trimmed.replace(/\s+/g, '_');
    }

    /**
     * Returns true only when BOTH a channel transport (BroadcastChannel or SharedWorker)
     * AND Web Locks (navigator.locks.request) are available in the current environment.
     * In Node.js or SSR (where window is undefined), returns false unless an explicit
     * test TabMultiplexerEnvironment is provided.
     */
    public static IsSupported(env?: TabMultiplexerEnvironment | null): boolean {
        if (env) {
            const hasLocks = env.Locks ? typeof env.Locks.Request === 'function' : false;

            if (!hasLocks) {
                return false;
            }

            const hasBroadcastChannel = typeof env.CreateBroadcastChannel === 'function';
            const hasSharedWorker =
                typeof env.CreateSharedWorker === 'function' && Boolean(env.SharedWorkerScriptUrl);

            return Boolean(hasBroadcastChannel || hasSharedWorker);
        }

        // When running in Node.js or SSR (window undefined), browser tab multiplexing is not active
        if (typeof window === 'undefined') {
            return false;
        }

        const navWithLocks = typeof navigator !== 'undefined'
            ? (navigator as { locks?: Partial<NativeDomLocks> })
            : undefined;
        const hasBrowserLocks = typeof navWithLocks?.locks?.request === 'function';

        if (!hasBrowserLocks) {
            return false;
        }

        const hasBrowserBroadcastChannel = typeof BroadcastChannel !== 'undefined';
        const hasBrowserSharedWorker = typeof SharedWorker !== 'undefined';

        return Boolean(hasBrowserBroadcastChannel || hasBrowserSharedWorker);
    }

    /**
     * Starts listening on the broadcast transport and enters the Web Locks request queue.
     */
    public Start(): void {
        if (this._isDisposed) {
            return;
        }

        // Initialize BroadcastChannel transport if available
        if (!this._channel) {
            if (this._env?.CreateBroadcastChannel) {
                this._channel = this._env.CreateBroadcastChannel(this._channelName);
            } else if (typeof BroadcastChannel !== 'undefined') {
                this._channel = WrapNativeBroadcastChannel(
                    new BroadcastChannel(this._channelName) as NativeDomBroadcastChannel
                );
            }
        }

        if (this._channel) {
            this._channelUnlisten = SafeAddMessageListener(this._channel, (ev) => {
                this.handleIncomingMessage(ev.Data ?? null);
            });
        }

        // Initialize SharedWorker port transport if configured
        if (!this._sharedWorkerPort) {
            if (this._env?.CreateSharedWorker && this._env.SharedWorkerScriptUrl) {
                this._sharedWorker = this._env.CreateSharedWorker(
                    this._env.SharedWorkerScriptUrl,
                    this._channelName
                );
                this._sharedWorkerPort = this._sharedWorker.Port ?? null;
            } else if (typeof SharedWorker !== 'undefined' && this._env?.SharedWorkerScriptUrl) {
                const globalWithWorker = globalThis as {
                    SharedWorker?: new (url: string, name: string) => { port: NativeDomMessagePort };
                };
                if (globalWithWorker.SharedWorker) {
                    const worker = new globalWithWorker.SharedWorker(
                        this._env.SharedWorkerScriptUrl,
                        this._channelName
                    );
                    const port = WrapNativeMessagePort(worker.port);
                    this._sharedWorker = { Port: port };
                    this._sharedWorkerPort = port;
                }
            }
        }

        if (this._sharedWorkerPort) {
            this._workerPortUnlisten = SafeAddMessageListener(this._sharedWorkerPort, (ev) => {
                this.handleIncomingMessage(ev.Data ?? null);
            });
            SafeStart(this._sharedWorkerPort);
        }

        // Enter Web Locks queue for exclusive leadership
        const nativeLocks = typeof navigator !== 'undefined'
            ? (navigator as { locks?: NativeDomLocks }).locks
            : undefined;
        const locks: WebLocksLike | undefined = this._env?.Locks ?? (
            nativeLocks
                ? { Request: (name: string, cb: () => Promise<void>) => nativeLocks.request(name, cb) }
                : undefined
        );

        if (!locks) {
            return;
        }

        this._lockPromise = SafeRequestLock(locks, this._lockName, async () => {
            if (this._isDisposed) {
                return;
            }

            this._isLeader = true;
            this._leaderTabId = this._tabId;

            this.broadcastMessage({
                Type: 'leader_ready',
                TabId: this._tabId,
                Sequence: this._callbacks.GetCurrentSequence(),
                ServerProcessId: this._callbacks.GetServerProcessId(),
            });

            try {
                await this._callbacks.OnBecomeLeader();
            } catch (err) {
                console.error('[ClientTabInvalidationMultiplexer] OnBecomeLeader failed:', err);
            }

            await new Promise<void>((resolve) => {
                this._releaseLock = resolve;
            });

            this._isLeader = false;
            if (this._leaderTabId === this._tabId) {
                this._leaderTabId = null;
            }

            try {
                await this._callbacks.OnLoseLeadership?.();
            } catch (err) {
                console.error('[ClientTabInvalidationMultiplexer] OnLoseLeadership failed:', err);
            }
        }).catch((err: unknown) => {
            if (!this._isDisposed) {
                console.error('[ClientTabInvalidationMultiplexer] Lock request error:', err);
            }
        });
    }

    /**
     * Releases leadership (if held), detaches event listeners, closes channel transports,
     * and clears any pending fallback timers.
     */
    public async Dispose(): Promise<void> {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;

        for (const timer of this._pendingCatchUpTimers.values()) {
            clearTimeout(timer);
        }
        this._pendingCatchUpTimers.clear();

        if (this._releaseLock) {
            const release = this._releaseLock;
            this._releaseLock = null;
            release();
        }

        if (this._channelUnlisten) {
            this._channelUnlisten();
            this._channelUnlisten = null;
        }
        if (this._channel) {
            SafeClose(this._channel);
            this._channel = null;
        }

        if (this._workerPortUnlisten) {
            this._workerPortUnlisten();
            this._workerPortUnlisten = null;
        }
        if (this._sharedWorkerPort) {
            SafeClose(this._sharedWorkerPort);
            this._sharedWorkerPort = null;
            this._sharedWorker = null;
        }

        if (this._lockPromise) {
            try {
                await this._lockPromise;
            } catch {
                // Ignore lock teardown errors
            }
            this._lockPromise = null;
        }
    }

    /**
     * Broadcasts an invalidation event received via WebSocket to all follower tabs.
     * Only executed by the Leader tab.
     */
    public PublishInvalidationToFollowers(
        event: CacheInvalidationEventData,
        serverProcessId: string | null
    ): void {
        if (!this._isLeader || this._isDisposed) {
            return;
        }
        this.broadcastMessage({
            Type: 'invalidation',
            TabId: this._tabId,
            Event: event,
            Sequence: event.Sequence,
            ServerProcessId: serverProcessId,
        });
    }

    /**
     * Broadcasts updated watermark and refresh status to all follower tabs.
     * Only executed by the Leader tab.
     */
    public PublishWatermarkSync(
        sequence: number,
        serverProcessId: string | null,
        requiresFullRefresh: boolean
    ): void {
        if (!this._isLeader || this._isDisposed) {
            return;
        }
        this.broadcastMessage({
            Type: 'watermark_sync',
            TabId: this._tabId,
            Sequence: sequence,
            ServerProcessId: serverProcessId,
            RequiresFullRefresh: requiresFullRefresh,
        });
    }

    /**
     * Requests catch-up up to targetSequence from the Leader tab.
     * Follower sets a safety fallback timer: if leader fails to deliver watermark/events
     * before CatchUpFallbackTimeoutMs, follower executes catch-up directly.
     */
    public async RequestCatchUp(
        targetSequence: number,
        serverProcessId: string | null
    ): Promise<boolean> {
        if (this._isDisposed) {
            return false;
        }

        if (this._isLeader) {
            return this._callbacks.OnPerformCatchUp(targetSequence, serverProcessId);
        }

        const currentSeq = this._callbacks.GetCurrentSequence();
        if (currentSeq >= targetSequence) {
            return true;
        }

        if (!this._pendingCatchUpTimers.has(targetSequence)) {
            const timer = setTimeout(async () => {
                this._pendingCatchUpTimers.delete(targetSequence);
                if (!this._isDisposed && this._callbacks.GetCurrentSequence() < targetSequence) {
                    try {
                        await this._callbacks.OnPerformCatchUp(targetSequence, serverProcessId);
                    } catch (err) {
                        console.warn('[ClientTabInvalidationMultiplexer] Fallback catch-up failed:', err);
                    }
                }
            }, this._fallbackTimeoutMs);

            if (typeof (timer as { unref?: () => void }).unref === 'function') {
                (timer as { unref: () => void }).unref();
            }
            this._pendingCatchUpTimers.set(targetSequence, timer);
        }

        this.broadcastMessage({
            Type: 'catchup_request',
            TabId: this._tabId,
            TargetSequence: targetSequence,
            ServerProcessId: serverProcessId,
        });

        return true;
    }

    private recordSeenMessage(messageId: string): boolean {
        if (this._seenMessageIds.has(messageId)) {
            return false;
        }
        this._seenMessageIds.add(messageId);
        this._seenMessageOrder.push(messageId);
        if (this._seenMessageOrder.length > 500) {
            const oldest = this._seenMessageOrder.shift();
            if (oldest) {
                this._seenMessageIds.delete(oldest);
            }
        }
        return true;
    }

    private broadcastMessage(message: TabInvalidationMessage): void {
        if (this._isDisposed) {
            return;
        }
        const msgId = `${this._tabId}:${++this._messageCounter}`;
        message.MessageId = msgId;
        this.recordSeenMessage(msgId);

        try {
            SafePostMessage(this._channel, message);
        } catch (err) {
            console.warn('[ClientTabInvalidationMultiplexer] BroadcastChannel postMessage failed:', err);
        }

        try {
            SafePostMessage(this._sharedWorkerPort, message);
        } catch (err) {
            console.warn('[ClientTabInvalidationMultiplexer] SharedWorker port postMessage failed:', err);
        }
    }

    private handleIncomingMessage(data: TabInvalidationMessage | null | undefined): void {
        if (this._isDisposed) {
            return;
        }
        if (!data || typeof data !== 'object') {
            return;
        }
        const msg = data as Partial<TabInvalidationMessage>;
        if (!msg.Type || !msg.TabId) {
            return;
        }
        if (UUIDsEqual(msg.TabId, this._tabId) || msg.TabId === this._tabId) {
            return; // Ignore self-sent messages
        }
        if (msg.MessageId && !this.recordSeenMessage(msg.MessageId)) {
            return; // Deduplicate dual-transport delivery
        }

        switch (msg.Type) {
            case 'leader_ready':
                this.handleLeaderReadyMessage(msg as LeaderReadyMessage);
                break;
            case 'invalidation':
                this.handleInvalidationMessage(msg as InvalidationMessage);
                break;
            case 'catchup_request':
                void this.handleCatchUpRequestMessage(msg as CatchUpRequestMessage);
                break;
            case 'watermark_sync':
                this.handleWatermarkSyncMessage(msg as WatermarkSyncMessage);
                break;
        }
    }

    private handleLeaderReadyMessage(msg: LeaderReadyMessage): void {
        this._leaderTabId = msg.TabId;
        if (msg.ServerProcessId && msg.Sequence > this._callbacks.GetCurrentSequence()) {
            this._callbacks.OnWatermarkSync?.(msg.Sequence, msg.ServerProcessId, false);
        }
    }

    private handleInvalidationMessage(msg: InvalidationMessage): void {
        if (this._isLeader) {
            return;
        }
        const seq = msg.Sequence ?? msg.Event?.Sequence;
        if (typeof seq === 'number') {
            this.resolvePendingCatchUps(seq);
        }
        this._callbacks.OnRemoteInvalidation(msg.Event, msg.ServerProcessId);
    }

    private handleWatermarkSyncMessage(msg: WatermarkSyncMessage): void {
        if (this._isLeader) {
            return;
        }
        this.resolvePendingCatchUps(msg.Sequence);
        this._callbacks.OnWatermarkSync?.(
            msg.Sequence,
            msg.ServerProcessId,
            msg.RequiresFullRefresh
        );
    }

    private async handleCatchUpRequestMessage(msg: CatchUpRequestMessage): Promise<void> {
        if (!this._isLeader || this._isDisposed) {
            return;
        }

        const currentSeq = this._callbacks.GetCurrentSequence();
        const currentServerProcessId = this._callbacks.GetServerProcessId();

        if (currentSeq >= msg.TargetSequence) {
            this.PublishWatermarkSync(currentSeq, currentServerProcessId, false);
            return;
        }

        if (this._activeLeaderCatchUpPromise) {
            try {
                await this._activeLeaderCatchUpPromise;
            } catch {
                // Ignore caught error from in-flight catch-up
            }
            if (this._callbacks.GetCurrentSequence() >= msg.TargetSequence) {
                this.PublishWatermarkSync(
                    this._callbacks.GetCurrentSequence(),
                    this._callbacks.GetServerProcessId(),
                    false
                );
                return;
            }
        }

        const promise = this._callbacks.OnPerformCatchUp(msg.TargetSequence, msg.ServerProcessId);
        this._activeLeaderCatchUpPromise = promise;
        try {
            await promise;
        } catch (err) {
            console.error('[ClientTabInvalidationMultiplexer] Leader catch-up failed:', err);
        } finally {
            if (this._activeLeaderCatchUpPromise === promise) {
                this._activeLeaderCatchUpPromise = null;
            }
        }
    }

    private resolvePendingCatchUps(currentSeq: number): void {
        for (const [targetSeq, timer] of this._pendingCatchUpTimers.entries()) {
            if (currentSeq >= targetSeq) {
                clearTimeout(timer);
                this._pendingCatchUpTimers.delete(targetSeq);
            }
        }
    }
}
