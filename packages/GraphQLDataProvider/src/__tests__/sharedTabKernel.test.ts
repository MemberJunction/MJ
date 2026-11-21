/**
 * Comprehensive unit, stress, failover, fallback, and BEFORE-vs-AFTER benchmark suite for the
 * Wave 6B Multi-Tab SharedWorker & Cache Multiplexing Kernel
 * ({@link SharedTabKernelClient}, {@link SharedTabKernelHost}, {@link SharedTabKernelStorageProvider},
 * and {@link GraphQLDataProvider} integration).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as GraphQLWs from 'graphql-ws';
import type { Client as GraphQLWsClient } from 'graphql-ws';
import { EntityInfo, getGraphQLTypeNameBase, InMemoryLocalStorageProvider } from '@memberjunction/core';
import { MJGlobal, MJEventType, UUIDsEqual } from '@memberjunction/global';
import type { BaseEntityEvent } from '@memberjunction/core';
import {
    GraphQLDataProvider,
    GraphQLProviderConfigData,
} from '../graphQLDataProvider';
import {
    SharedTabKernelHost,
} from '../SharedTabKernelHost';
import {
    SharedTabKernelClient,
    CloneKernelValue,
    type KernelPortMessageEventLike,
    type KernelWsClientConfig,
    type KernelWsClientLike,
    type KernelWsSink,
    type KernelWsSubscribePayload,
    type SharedTabKernelEnvironment,
    type TabKernelWorkerLike,
    type TabPortLike,
} from '../index';
import type {
    BroadcastChannelLike,
    MessageEventLike,
    TabInvalidationMessage,
    WebLocksLike,
} from '../ClientTabInvalidationMultiplexer';
import { GraphQLWire } from './support/graphQLWire';
import {
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

/**
 * Every socket in this file is a {@link FakeWsServerRegistry} socket. A provider's own direct `graphql-ws` client
 * (a tab with no kernel environment) gets this never-dialing client, so the suite's result does not depend on whatever
 * listens on ws://localhost:4000 (another developer's MJAPI refuses the socket 4403 and failed the run).
 */
vi.mock('graphql-ws', async (importOriginal) => {
    const actual = await importOriginal<typeof GraphQLWs>();
    const createClient = (): GraphQLWsClient => ({
        on: () => () => {},
        subscribe: () => () => {},
        iterate: () => (async function* () {})(),
        dispose: () => {},
        terminate: () => {},
    });
    return { ...actual, createClient };
});

// ── Test Fakes: MessageChannel Port Pairs, WebSocket Client, Storage & Fallback Hubs ──

class FakeTabPort implements TabPortLike {
    public Peer: FakeTabPort | null = null;
    public IsClosed = false;
    public OnMessage: ((ev: KernelPortMessageEventLike) => void) | null = null;
    private _listeners = new Set<(ev: KernelPortMessageEventLike) => void>();
    private _started = false;
    private _queue: unknown[] = [];

    public Start(): void {
        if (this._started) return;
        this._started = true;
        while (this._queue.length > 0 && !this.IsClosed) {
            const msg = this._queue.shift();
            this.deliverNow(msg);
        }
    }

    public Close(): void {
        this.IsClosed = true;
        this._listeners.clear();
        this.OnMessage = null;
        this._queue = [];
    }

    public PostMessage(message: unknown): void {
        if (this.IsClosed || !this.Peer || this.Peer.IsClosed) {
            return;
        }
        const cloned = CloneKernelValue(message);
        const target = this.Peer;
        queueMicrotask(() => {
            if (!target.IsClosed) {
                target.receive(cloned);
            }
        });
    }

    public AddEventListener(type: string, listener: (ev: KernelPortMessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.add(listener);
        }
    }

    public RemoveEventListener(type: string, listener: (ev: KernelPortMessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.delete(listener);
        }
    }

    private receive(data: unknown): void {
        if (!this._started && this._listeners.size === 0 && !this.OnMessage) {
            this._queue.push(data);
            return;
        }
        this._started = true;
        this.deliverNow(data);
    }

    private deliverNow(data: unknown): void {
        const event: KernelPortMessageEventLike = { Data: data };
        this.OnMessage?.(event);
        for (const listener of Array.from(this._listeners)) {
            listener(event);
        }
    }
}

function createPortPair(): { ClientPort: FakeTabPort; HostPort: FakeTabPort } {
    const clientPort = new FakeTabPort();
    const hostPort = new FakeTabPort();
    clientPort.Peer = hostPort;
    hostPort.Peer = clientPort;
    return { ClientPort: clientPort, HostPort: hostPort };
}

interface ActiveFakeWsSubscription {
    Id: number;
    Payload: KernelWsSubscribePayload;
    Sink: KernelWsSink;
    Disposed: boolean;
}

class FakeKernelWsClient implements KernelWsClientLike {
    public readonly ClientIndex: number;
    public Disposed = false;
    public Terminated = false;
    public ActiveSubscriptions = new Map<number, ActiveFakeWsSubscription>();
    private _eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    private _nextSubId = 1;

    constructor(
        public readonly Config: KernelWsClientConfig,
        private readonly _registry: FakeWsServerRegistry
    ) {
        this.ClientIndex = _registry.RegisterClient(this);
        queueMicrotask(() => {
            if (!this.Disposed) {
                this.EmitEvent('connected', {}, {}, false);
            }
        });
    }

    public On(event: 'connected' | 'closed' | 'ping' | 'pong', listener: (...args: unknown[]) => void): () => void {
        let set = this._eventListeners.get(event);
        if (!set) {
            set = new Set();
            this._eventListeners.set(event, set);
        }
        set.add(listener);
        return () => set?.delete(listener);
    }

    public EmitEvent(event: 'connected' | 'closed' | 'ping' | 'pong', ...args: unknown[]): void {
        const set = this._eventListeners.get(event);
        if (!set) return;
        for (const listener of Array.from(set)) {
            listener(...args);
        }
    }

    public Subscribe(payload: KernelWsSubscribePayload, sink: KernelWsSink): () => void {
        const id = this._nextSubId++;
        const entry: ActiveFakeWsSubscription = { Id: id, Payload: payload, Sink: sink, Disposed: false };
        this.ActiveSubscriptions.set(id, entry);
        return () => {
            entry.Disposed = true;
            this.ActiveSubscriptions.delete(id);
        };
    }

    public Dispose(): void {
        this.Disposed = true;
        this.ActiveSubscriptions.clear();
        this._registry.OnClientDisposed(this);
    }

    public Terminate(): void {
        this.Terminated = true;
        this.EmitEvent('closed', { code: 4499 });
    }
}

class FakeWsServerRegistry {
    public CreatedClients: FakeKernelWsClient[] = [];
    public ActiveClients = new Set<FakeKernelWsClient>();

    public CreateFactory(): (config: KernelWsClientConfig) => KernelWsClientLike {
        return (config: KernelWsClientConfig) => {
            const client = new FakeKernelWsClient(config, this);
            return client;
        };
    }

    public RegisterClient(client: FakeKernelWsClient): number {
        this.CreatedClients.push(client);
        this.ActiveClients.add(client);
        return this.CreatedClients.length - 1;
    }

    public OnClientDisposed(client: FakeKernelWsClient): void {
        this.ActiveClients.delete(client);
    }

    public GetLatestClient(): FakeKernelWsClient | undefined {
        return this.CreatedClients[this.CreatedClients.length - 1];
    }

    public PushStatusUpdate(sessionId: string, message: string, date: string = new Date().toISOString()): number {
        let delivered = 0;
        for (const client of this.ActiveClients) {
            for (const sub of client.ActiveSubscriptions.values()) {
                if (
                    sub.Payload.Query.includes('statusUpdates') &&
                    sub.Payload.Variables?.sessionId === sessionId
                ) {
                    sub.Sink.Next({
                        data: {
                            statusUpdates: {
                                date,
                                message,
                                sessionId,
                            },
                        },
                    });
                    delivered++;
                }
            }
        }
        return delivered;
    }

    public PushCacheInvalidation(event: {
        EntityName: string;
        PrimaryKeyValues: string;
        Action: string;
        SourceServerID: string;
        Timestamp: string;
        OriginSessionID?: string;
        Sequence?: number;
    }): number {
        let delivered = 0;
        for (const client of this.ActiveClients) {
            for (const sub of client.ActiveSubscriptions.values()) {
                if (sub.Payload.Query.includes('cacheInvalidation')) {
                    sub.Sink.Next({
                        data: {
                            cacheInvalidation: event,
                        },
                    });
                    delivered++;
                }
            }
        }
        return delivered;
    }

    public PushTaskGraphFrame(parentTaskId: string, frame: Record<string, unknown>): number {
        let delivered = 0;
        for (const client of this.ActiveClients) {
            for (const sub of client.ActiveSubscriptions.values()) {
                if (
                    sub.Payload.Query.includes('taskGraphFrames') &&
                    sub.Payload.Variables?.parentTaskId === parentTaskId
                ) {
                    sub.Sink.Next({
                        data: {
                            taskGraphFrames: frame,
                        },
                    });
                    delivered++;
                }
            }
        }
        return delivered;
    }

    public TriggerJwtExpiredError(): number {
        let triggered = 0;
        for (const client of this.ActiveClients) {
            for (const sub of Array.from(client.ActiveSubscriptions.values())) {
                const err = new Error('JWT_EXPIRED: token has expired') as Error & {
                    extensions?: { code?: string };
                };
                err.extensions = { code: 'JWT_EXPIRED' };
                sub.Sink.Error(err);
                triggered++;
            }
        }
        return triggered;
    }
}

class InstrumentedStorageProvider extends InMemoryLocalStorageProvider {
    public PhysicalReads = 0;
    public PhysicalWrites = 0;
    public PhysicalRemoves = 0;

    public override async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        this.PhysicalReads++;
        return super.GetItem<T>(key, category);
    }

    public override async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        this.PhysicalReads += keys.length > 0 ? 1 : 0;
        return super.GetItems<T>(keys, category);
    }

    public override async SetItem<T = unknown>(key: string, value: T, category?: string): Promise<void> {
        this.PhysicalWrites++;
        return super.SetItem<T>(key, value, category);
    }

    public override async Remove(key: string, category?: string): Promise<void> {
        this.PhysicalRemoves++;
        return super.Remove(key, category);
    }
}

class FakeFallbackBroadcastChannel implements BroadcastChannelLike {
    public IsClosed = false;
    public OnMessage: ((ev: MessageEventLike) => void) | null = null;
    private _listeners = new Set<(ev: MessageEventLike) => void>();

    constructor(
        public readonly Name: string,
        private readonly _hub: FakeFallbackBroadcastHub
    ) {}

    public PostMessage(message: TabInvalidationMessage): void {
        if (!this.IsClosed) {
            this._hub.Broadcast(this, message);
        }
    }

    public AddEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.add(listener);
        }
    }

    public RemoveEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.delete(listener);
        }
    }

    public Deliver(ev: MessageEventLike): void {
        if (this.IsClosed) return;
        this.OnMessage?.(ev);
        for (const l of this._listeners) {
            l(ev);
        }
    }

    public Close(): void {
        if (this.IsClosed) return;
        this.IsClosed = true;
        this._hub.Remove(this);
    }
}

class FakeFallbackBroadcastHub {
    private _channels = new Map<string, Set<FakeFallbackBroadcastChannel>>();

    public CreateChannel(name: string): BroadcastChannelLike {
        const ch = new FakeFallbackBroadcastChannel(name, this);
        let set = this._channels.get(name);
        if (!set) {
            set = new Set();
            this._channels.set(name, set);
        }
        set.add(ch);
        return ch;
    }

    public Broadcast(sender: FakeFallbackBroadcastChannel, message: TabInvalidationMessage): void {
        const set = this._channels.get(sender.Name);
        if (!set) return;
        const cloned = CloneKernelValue(message);
        queueMicrotask(() => {
            for (const target of set) {
                if (target !== sender && !target.IsClosed) {
                    target.Deliver({ Data: cloned });
                }
            }
        });
    }

    public Remove(channel: FakeFallbackBroadcastChannel): void {
        this._channels.get(channel.Name)?.delete(channel);
    }
}

class FakeWebLocks implements WebLocksLike {
    private _held = new Set<string>();
    private _waiters = new Map<string, Array<() => void>>();

    public Request(name: string, callback: () => Promise<void>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const acquire = () => {
                this._held.add(name);
                Promise.resolve()
                    .then(() => callback())
                    .then(
                        () => {
                            this.release(name);
                            resolve();
                        },
                        (err) => {
                            this.release(name);
                            reject(err);
                        }
                    );
            };
            if (!this._held.has(name)) {
                acquire();
            } else {
                let q = this._waiters.get(name);
                if (!q) {
                    q = [];
                    this._waiters.set(name, q);
                }
                q.push(acquire);
            }
        });
    }

    private release(name: string): void {
        this._held.delete(name);
        const q = this._waiters.get(name);
        if (q && q.length > 0) {
            const next = q.shift()!;
            queueMicrotask(next);
        }
    }
}

async function flushMicrotasksAndTimers(ms: number = 15): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createKernelWorkerEnv(
    host: SharedTabKernelHost,
    overrides?: Partial<SharedTabKernelEnvironment>
): SharedTabKernelEnvironment {
    return {
        CreateKernelPort: () => {
            const { ClientPort, HostPort } = createPortPair();
            host.AttachPort(HostPort);
            return ClientPort;
        },
        HeartbeatIntervalMs: 30,
        KernelHandshakeTimeoutMs: 250,
        ...overrides,
    };
}

function makeTestEntity(id: string, name: string, baseView: string, fieldNames: string[]): EntityInfo {
    return new EntityInfo({
        ID: id,
        Name: name,
        BaseView: baseView,
        BaseTable: name.replace(/[^a-zA-Z0-9]/g, ''),
        SchemaName: '__mj',
        IncludeInAPI: true,
        AllowAllRowsAPI: true,
        Fields: fieldNames.map((fname, idx) => ({
            ID: `${id}-f-${idx}`,
            EntityID: id,
            Name: fname,
            Type: 'nvarchar',
            IsPrimaryKey: idx === 0,
            AllowsNull: idx > 0,
            AllowUpdateAPI: idx > 0,
            AutoIncrement: false,
            IsVirtual: false,
            Sequence: idx + 1,
            Status: 'Active',
        })),
    });
}

function createTestTabProvider(options: {
    sessionId: string;
    token?: string;
    wsUrl?: string;
    url?: string;
    refreshTokenFn?: () => Promise<string>;
    onAuthError?: (err: Error) => void;
    kernelEnv?: SharedTabKernelEnvironment | null;
}): WireTestGraphQLProvider {
    const provider = new WireTestGraphQLProvider(true);
    const config = new GraphQLProviderConfigData(
        options.token ?? 'token-initial',
        options.url ?? 'http://localhost:4000/graphql',
        options.wsUrl ?? 'ws://localhost:4000/graphql',
        options.refreshTokenFn ?? (async () => 'token-refreshed'),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        options.onAuthError
    );
    provider.InitForWire(config, options.sessionId);
    if (options.kernelEnv !== undefined) {
        provider.SetSharedTabKernelEnvironment(options.kernelEnv);
    }
    provider.RegisterTestEntity(
        makeTestEntity('10000000-0000-4000-8000-000000000001', 'Users', 'vwUsers', ['ID', 'Name', 'Email'])
    );
    provider.RegisterTestEntity(
        makeTestEntity('10000000-0000-4000-8000-000000000002', 'Roles', 'vwRoles', ['ID', 'Name'])
    );
    provider.RegisterTestEntity(
        makeTestEntity('10000000-0000-4000-8000-000000000003', 'Entities', 'vwEntities', ['ID', 'Name'])
    );
    return provider;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite
// ────────────────────────────────────────────────────────────────────────────

describe('SharedTabKernel — Cross-Tab SharedWorker WS, Cache & IDB Multiplexing', () => {
    const hostsToDispose: SharedTabKernelHost[] = [];
    const providersToDispose: WireTestGraphQLProvider[] = [];

    beforeEach(() => {
        GraphQLWire.Reset();
        GraphQLDataProvider.SetSharedWorkerFactory(null);
        GraphQLDataProvider.EnableSharedTabKernel = true;
        GraphQLDataProvider.EnableMultiTabInvalidationMultiplexing = true;
    });

    afterEach(async () => {
        for (const p of providersToDispose) {
            try {
                p.DisposeWebSocketResources();
            } catch {
                // Ignore cleanup error
            }
        }
        providersToDispose.length = 0;

        for (const h of hostsToDispose) {
            try {
                h.Dispose();
            } catch {
                // Ignore cleanup error
            }
        }
        hostsToDispose.length = 0;

        GraphQLDataProvider.SetSharedWorkerFactory(null);
        ResetGraphQLProviderSingleton();
    });

    // ── 1. 10 Concurrent Tabs -> 1 Origin WebSocket ─────────────────────────

    it('multiplexes 10 concurrent tabs over 1 origin WebSocket for cacheInvalidation, PushStatusUpdates, and TaskGraphFrames', async () => {
        const wsRegistry = new FakeWsServerRegistry();
        const storage = new InstrumentedStorageProvider();
        const host = new SharedTabKernelHost({
            CreateWsClient: wsRegistry.CreateFactory(),
            CreateStorageProvider: () => storage,
        });
        hostsToDispose.push(host);

        const tabs: WireTestGraphQLProvider[] = [];
        const statusMessagesByTab: string[][] = [];
        const remoteInvalidationsByTab: string[][] = [];
        const graphFramesByTab: Array<Array<Record<string, unknown>>> = [];
        const subscriptions: Array<{ unsubscribe: () => void }> = [];

        const globalSub = MJGlobal.Instance.GetEventListener(false).subscribe((ev) => {
            if (ev.event === MJEventType.ComponentEvent) {
                const baseEv = ev.args as BaseEntityEvent;
                if (baseEv?.type === 'remote-invalidate') {
                    const idx = tabs.findIndex((t) => t === baseEv.provider);
                    if (idx >= 0) {
                        remoteInvalidationsByTab[idx].push(baseEv.entityName);
                    }
                }
            }
        });
        subscriptions.push(globalSub);

        try {
            for (let i = 0; i < 10; i++) {
                statusMessagesByTab.push([]);
                remoteInvalidationsByTab.push([]);
                graphFramesByTab.push([]);
                const tab = createTestTabProvider({
                    sessionId: `session-tab-${i}`,
                    kernelEnv: createKernelWorkerEnv(host),
                });
                providersToDispose.push(tab);
                tabs.push(tab);
                tab.SubscribeToCacheInvalidation();
                subscriptions.push(
                    tab.PushStatusUpdates(`session-tab-${i}`).subscribe((msg) => {
                        statusMessagesByTab[i].push(msg);
                    })
                );
            }

            // Also subscribe 3 tabs to the SAME PushStatusUpdates session and TaskGraphFrames graph
            const sharedStatusSubTab0: string[] = [];
            const sharedStatusSubTab5: string[] = [];
            subscriptions.push(
                tabs[0].PushStatusUpdates('shared-agent-session').subscribe((m) => sharedStatusSubTab0.push(m)),
                tabs[5].PushStatusUpdates('shared-agent-session').subscribe((m) => sharedStatusSubTab5.push(m)),
                tabs[0].TaskGraphFrames('graph-123').subscribe((f) => graphFramesByTab[0].push(f as unknown as Record<string, unknown>)),
                tabs[7].TaskGraphFrames('graph-123').subscribe((f) => graphFramesByTab[7].push(f as unknown as Record<string, unknown>))
            );

            await Promise.all(tabs.map((t) => t.SharedTabKernel!.WaitUntilReady()));
            await flushMicrotasksAndTimers(25);

            // Exactly ONE origin WebSocket was created for all 10 tabs combined
            expect(wsRegistry.CreatedClients).toHaveLength(1);
            expect(wsRegistry.ActiveClients.size).toBe(1);

            const stats = await tabs[0].GetSharedTabKernelStats();
            expect(stats).not.toBeNull();
            expect(stats!.ActiveTabCount).toBe(10);
            expect(stats!.WsClientCreatedCount).toBe(1);
            expect(stats!.ActiveWsClientCount).toBe(1);
            // 1 cacheInvalidation + 10 per-tab statusUpdates + 1 shared statusUpdates + 1 taskGraphFrames = 13 upstream subs on 1 socket
            expect(stats!.ActiveWsSubscriptionCount).toBe(13);

            // Route targeted per-session status updates + shared status + task graph + invalidation
            for (let i = 0; i < 10; i++) {
                wsRegistry.PushStatusUpdate(`session-tab-${i}`, `hello-tab-${i}`);
            }
            wsRegistry.PushStatusUpdate('shared-agent-session', 'shared-progress-50%');
            wsRegistry.PushTaskGraphFrame('graph-123', { kind: 'TaskCompleted', taskId: 't1', parentTaskId: 'graph-123' });
            wsRegistry.PushCacheInvalidation({
                EntityName: 'Users',
                PrimaryKeyValues: '["u-1"]',
                Action: 'Update',
                SourceServerID: 'srv-1',
                Timestamp: new Date().toISOString(),
                OriginSessionID: 'session-tab-0',
                Sequence: 101,
            });

            await flushMicrotasksAndTimers(25);

            for (let i = 0; i < 10; i++) {
                expect(statusMessagesByTab[i]).toEqual([`hello-tab-${i}`]);
                expect(tabs[i].LastCacheInvalidationSequence).toBe(101);
            }
            expect(sharedStatusSubTab0).toEqual(['shared-progress-50%']);
            expect(sharedStatusSubTab5).toEqual(['shared-progress-50%']);
            expect(graphFramesByTab[0]).toHaveLength(1);
            expect(graphFramesByTab[7]).toHaveLength(1);

            // Tab 0 originated the save so Tab 0 suppresses local duplicate dispatch; Tabs 1..9 receive it
            expect(remoteInvalidationsByTab[0]).toEqual([]);
            for (let i = 1; i < 10; i++) {
                expect(remoteInvalidationsByTab[i]).toEqual(['Users']);
            }
        } finally {
            for (const sub of subscriptions) {
                sub.unsubscribe();
            }
        }
    });

    // ── 2. Tab 1 Close, Rapid Churn & Heartbeat Drop Under Active Streaming ─

    it('survives Tab 1 close, rapid tab churn, and abrupt dead-tab timeout with 0 dropped messages on 1 origin WS', async () => {
        const wsRegistry = new FakeWsServerRegistry();
        const host = new SharedTabKernelHost({
            CreateWsClient: wsRegistry.CreateFactory(),
            CreateStorageProvider: () => new InstrumentedStorageProvider(),
            HeartbeatTimeoutMs: 70,
            HeartbeatSweepIntervalMs: 20,
        });
        hostsToDispose.push(host);

        const tabPorts = new Map<WireTestGraphQLProvider, FakeTabPort>();
        const makeTab = (id: number, heartbeatIntervalMs: number = 25): WireTestGraphQLProvider => {
            const p = createTestTabProvider({
                sessionId: `churn-session-${id}`,
                kernelEnv: {
                    CreateKernelPort: () => {
                        const { ClientPort, HostPort } = createPortPair();
                        tabPorts.set(p, ClientPort);
                        host.AttachPort(HostPort);
                        return ClientPort;
                    },
                    HeartbeatIntervalMs: heartbeatIntervalMs,
                    KernelHandshakeTimeoutMs: 250,
                },
            });
            providersToDispose.push(p);
            return p;
        };

        const initialTabs = Array.from({ length: 6 }, (_, i) => makeTab(i + 1));
        const receivedByTab = new Map<number, string[]>();
        const subs = initialTabs.map((tab, idx) => {
            const arr: string[] = [];
            receivedByTab.set(idx + 1, arr);
            tab.SubscribeToCacheInvalidation();
            return tab.PushStatusUpdates(`churn-session-${idx + 1}`).subscribe((m) => arr.push(m));
        });

        await Promise.all(initialTabs.map((t) => t.SharedTabKernel!.WaitUntilReady()));
        await flushMicrotasksAndTimers(25);
        expect(wsRegistry.CreatedClients).toHaveLength(1);

        // Stream batch 1 (50 msgs each) before closing Tab 1
        for (let seq = 1; seq <= 50; seq++) {
            for (let t = 1; t <= 6; t++) {
                wsRegistry.PushStatusUpdate(`churn-session-${t}`, `msg-${seq}`);
            }
        }
        await flushMicrotasksAndTimers(20);

        // Gracefully close Tab 1 (first tab) AND Tab 2 mid-stream
        subs[0].unsubscribe();
        subs[1].unsubscribe();
        initialTabs[0].DisposeWebSocketResources();
        initialTabs[1].DisposeWebSocketResources();

        // Abruptly crash Tab 3 (close its port without sending disconnect so heartbeat sweeper reaps it)
        tabPorts.get(initialTabs[2])!.Close();

        // Churn in two brand new tabs (Tabs 7 and 8) while streaming continues
        const tab7 = makeTab(7);
        const tab8 = makeTab(8);
        receivedByTab.set(7, []);
        receivedByTab.set(8, []);
        tab7.SubscribeToCacheInvalidation();
        tab8.SubscribeToCacheInvalidation();
        const sub7 = tab7.PushStatusUpdates('churn-session-7').subscribe((m) => receivedByTab.get(7)!.push(m));
        const sub8 = tab8.PushStatusUpdates('churn-session-8').subscribe((m) => receivedByTab.get(8)!.push(m));
        await Promise.all([tab7.SharedTabKernel!.WaitUntilReady(), tab8.SharedTabKernel!.WaitUntilReady()]);

        // Wait enough for heartbeat sweeper to detect dead Tab 3
        await flushMicrotasksAndTimers(130);

        // Stream batch 2 (50 more msgs) to surviving tabs 4, 5, 6, 7, 8
        for (let seq = 51; seq <= 100; seq++) {
            for (const t of [4, 5, 6, 7, 8]) {
                wsRegistry.PushStatusUpdate(`churn-session-${t}`, `msg-${seq}`);
            }
        }
        await flushMicrotasksAndTimers(25);

        // Still ONLY 1 origin WS client ever created!
        expect(wsRegistry.CreatedClients).toHaveLength(1);
        expect(wsRegistry.ActiveClients.size).toBe(1);

        const statsAfterChurn = await tab7.GetSharedTabKernelStats();
        expect(statsAfterChurn!.DroppedTabCleanupCount).toBeGreaterThanOrEqual(1);
        expect(statsAfterChurn!.ActiveTabCount).toBe(5); // tabs 4, 5, 6, 7, 8

        // ZERO dropped messages for all surviving original tabs (4, 5, 6) AND churned-in tabs (7, 8)
        for (const t of [4, 5, 6]) {
            expect(receivedByTab.get(t)).toHaveLength(100);
        }
        for (const t of [7, 8]) {
            expect(receivedByTab.get(t)).toHaveLength(50);
        }

        // Dispose all remaining tabs -> single WS cleans up cleanly
        subs[3].unsubscribe();
        subs[4].unsubscribe();
        subs[5].unsubscribe();
        sub7.unsubscribe();
        sub8.unsubscribe();
        for (const t of [initialTabs[3], initialTabs[4], initialTabs[5], tab7, tab8]) {
            t.DisposeWebSocketResources();
        }
        await flushMicrotasksAndTimers(30);
        expect(wsRegistry.ActiveClients.size).toBe(0);
    });

    // ── 3. Concurrent JWT Expiry & Single-Flight Refresh Across Tabs + Failover ─

    it('coalesces concurrent 4403 / JWT_EXPIRED refreshes into 1 OAuth call, syncs tokens, seamlessly re-subscribes WS, and fails over if owner closes', async () => {
        const wsRegistry = new FakeWsServerRegistry();
        const host = new SharedTabKernelHost({
            CreateWsClient: wsRegistry.CreateFactory(),
            CreateStorageProvider: () => new InstrumentedStorageProvider(),
        });
        hostsToDispose.push(host);

        let refreshCalls = 0;
        const makeTab = (idx: number, refreshFn?: () => Promise<string>): WireTestGraphQLProvider => {
            const p = createTestTabProvider({
                sessionId: `auth-tab-${idx}`,
                token: 'jwt-v1',
                refreshTokenFn: refreshFn ?? (async () => {
                    refreshCalls++;
                    await flushMicrotasksAndTimers(10);
                    return `jwt-v${refreshCalls + 1}`;
                }),
                kernelEnv: createKernelWorkerEnv(host),
            });
            providersToDispose.push(p);
            return p;
        };

        const tabs = Array.from({ length: 5 }, (_, i) => makeTab(i));
        for (const t of tabs) {
            t.SubscribeToCacheInvalidation();
        }
        await Promise.all(tabs.map((t) => t.SharedTabKernel!.WaitUntilReady()));
        const received: string[] = [];
        const sub = tabs[2].PushStatusUpdates('auth-stream').subscribe((m) => received.push(m));
        await flushMicrotasksAndTimers(20);

        // Concurrent RefreshToken() across all 5 tabs simultaneously
        await Promise.all(tabs.map((t) => t.RefreshToken()));
        expect(refreshCalls).toBe(1);
        for (const t of tabs) {
            expect(t.ConfigData.Token).toBe('jwt-v2');
        }

        // Now trigger JWT_EXPIRED on the active WebSocket subscription
        wsRegistry.TriggerJwtExpiredError();
        await flushMicrotasksAndTimers(40);

        // Worker refreshed ONCE (refreshCalls === 2), recreated WS with jwt-v3, and seamlessly kept stream alive!
        expect(refreshCalls).toBe(2);
        expect(wsRegistry.CreatedClients).toHaveLength(2);
        const newConnParams = wsRegistry.GetLatestClient()!.Config.ConnectionParams();
        expect(newConnParams.Authorization).toBe('Bearer jwt-v3');
        for (const t of tabs) {
            expect(t.ConfigData.Token).toBe('jwt-v3');
        }

        // Push message after JWT_EXPIRED reconnect -> Tab 2 still receives it with zero dropped events
        wsRegistry.PushStatusUpdate('auth-stream', 'post-refresh-event');
        await flushMicrotasksAndTimers(20);
        expect(received).toEqual(['post-refresh-event']);

        // Test failover when the delegated refresh-owner tab closes mid-refresh!
        let releaseSlowRefresh!: (t: string) => void;
        let slowOwnerStarted = false;
        const slowTab0 = createTestTabProvider({
            sessionId: 'slow-owner',
            token: 'jwt-v3',
            refreshTokenFn: () => {
                slowOwnerStarted = true;
                return new Promise<string>((resolve) => {
                    releaseSlowRefresh = resolve;
                });
            },
            kernelEnv: createKernelWorkerEnv(host),
        });
        providersToDispose.push(slowTab0);

        // Close existing WS client with 4403 while slowTab0 is connected, or invoke refresh directly via 4403
        // Trigger 4403 close on WS -> host delegates refresh, let's test owner disconnect failover cleanly:
        const failoverHost = new SharedTabKernelHost({
            CreateWsClient: wsRegistry.CreateFactory(),
            CreateStorageProvider: () => new InstrumentedStorageProvider(),
        });
        hostsToDispose.push(failoverHost);

        let fallbackOwnerCalls = 0;
        const ownerTab = createTestTabProvider({
            sessionId: 'failover-owner',
            token: 'old-tok',
            refreshTokenFn: () => new Promise<string>(() => {
                // Intentionally never resolves because ownerTab closes mid-flight
            }),
            kernelEnv: createKernelWorkerEnv(failoverHost),
        });
        const backupTab = createTestTabProvider({
            sessionId: 'failover-backup',
            token: 'old-tok',
            refreshTokenFn: async () => {
                fallbackOwnerCalls++;
                return 'failover-jwt-success';
            },
            kernelEnv: createKernelWorkerEnv(failoverHost),
        });
        providersToDispose.push(ownerTab, backupTab);

        ownerTab.SubscribeToCacheInvalidation();
        backupTab.SubscribeToCacheInvalidation();
        await Promise.all([ownerTab.SharedTabKernel!.WaitUntilReady(), backupTab.SharedTabKernel!.WaitUntilReady()]);
        await flushMicrotasksAndTimers(20);

        const refreshPromise = backupTab.RefreshToken();
        await flushMicrotasksAndTimers(10);
        // Kill ownerTab (the tab delegated the refresh) before it resolves -> worker fails over to backupTab!
        ownerTab.DisposeWebSocketResources();
        await refreshPromise;

        expect(fallbackOwnerCalls).toBe(1);
        expect(backupTab.ConfigData.Token).toBe('failover-jwt-success');

        sub.unsubscribe();
        void slowOwnerStarted;
        void releaseSlowRefresh;
    });

    // ── 4. Cross-Tab RunView L1, In-Flight Coalescing, Batch Splitting & Failover ─

    it('coalesces 10 concurrent RunView/RunViewsWithCacheCheck requests to 1 backend query, splits partial batches, isolates mutations, and invalidates on mutation', async () => {
        const wsRegistry = new FakeWsServerRegistry();
        const host = new SharedTabKernelHost({
            CreateWsClient: wsRegistry.CreateFactory(),
            CreateStorageProvider: () => new InstrumentedStorageProvider(),
            RunViewL1TtlMs: 5_000,
        });
        hostsToDispose.push(host);

        const tabs = Array.from({ length: 10 }, (_, i) => {
            const t = createTestTabProvider({
                sessionId: `rv-tab-${i}`,
                kernelEnv: createKernelWorkerEnv(host),
            });
            providersToDispose.push(t);
            t.SubscribeToCacheInvalidation();
            return t;
        });
        await Promise.all(tabs.map((t) => t.SharedTabKernel!.WaitUntilReady()));
        await flushMicrotasksAndTimers(20);

        // Hold the first backend GraphQL response open until all 10 tabs queue their requests
        let releaseBackend!: (val: unknown) => void;
        let backendHoldCount = 0;
        GraphQLWire.EnqueueResponder(async () => {
            backendHoldCount++;
            return new Promise((resolve) => {
                releaseBackend = resolve;
            });
        });

        const concurrentPromises = tabs.map((tab) =>
            tab.CallInternalRunView<{ ID: string; Name: string }>({
                EntityName: 'Users',
                ExtraFilter: 'IsActive=1',
            })
        );
        await flushMicrotasksAndTimers(15);

        expect(backendHoldCount).toBe(1);
        const usersQName = `Run${getGraphQLTypeNameBase(tabs[0].EntityByName('Users')!)}DynamicView`;
        releaseBackend({
            [usersQName]: {
                Success: true,
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 4,
                Results: [{ ID: 'u-1', Name: 'Ada Lovelace', Email: 'ada@example.com' }],
            },
        });

        const concurrentResults = await Promise.all(concurrentPromises);
        expect(GraphQLWire.Requests).toHaveLength(1);
        expect(concurrentResults).toHaveLength(10);
        for (const r of concurrentResults) {
            expect(r.Results[0].Name).toBe('Ada Lovelace');
        }

        // Copy-on-read isolation: mutating Tab 0's result MUST NOT corrupt Tab 1 or Worker L1
        concurrentResults[0].Results[0].Name = 'MUTATED_ON_TAB_0';
        concurrentResults[0].Results.push({ ID: 'u-999', Name: 'Injected', Email: 'bad@example.com' });

        // Warm L1 hit from Tab 3 -> ZERO backend requests, returns unmutated data
        GraphQLWire.Reset();
        const l1HitResult = await tabs[3].CallInternalRunView<{ ID: string; Name: string }>({
            EntityName: 'Users',
            ExtraFilter: 'IsActive=1',
        });
        expect(GraphQLWire.Requests).toHaveLength(0);
        expect(l1HitResult.Results).toHaveLength(1);
        expect(l1HitResult.Results[0].Name).toBe('Ada Lovelace');

        // Partial batch splitting in InternalRunViews: [Users (L1 hit), Roles (miss)] -> wire sees ONLY Roles!
        // Prime Users in InternalRunViews L1 first, then run batch [Users, Roles]
        GraphQLWire.Reset();
        GraphQLWire.EnqueueResponse({
            RunViews: [
                {
                    Success: true,
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 2,
                    Results: [{ PrimaryKey: [], EntityID: 'u-entity', Data: JSON.stringify({ ID: 'u-1', Name: 'Ada' }) }],
                },
            ],
        });
        await tabs[1].CallInternalRunViews([{ EntityName: 'Users', ExtraFilter: '1=1' }]);
        expect(GraphQLWire.Requests).toHaveLength(1);

        GraphQLWire.EnqueueResponse({
            RunViews: [
                {
                    Success: true,
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 2,
                    Results: [{ PrimaryKey: [], EntityID: 'r-entity', Data: JSON.stringify({ ID: 'role-1', Name: 'Admin' }) }],
                },
            ],
        });
        const splitBatchResult = await tabs[2].CallInternalRunViews<{ ID: string; Name: string }>([
            { EntityName: 'Users', ExtraFilter: '1=1' },
            { EntityName: 'Roles', ExtraFilter: '1=1' },
        ]);
        // Only ONE additional network call sent, containing ONLY Roles (input array length 1)
        expect(GraphQLWire.Requests).toHaveLength(2);
        const secondVariables = GraphQLWire.LastRequest.variables as { input: Array<{ EntityName: string }> };
        expect(secondVariables.input).toHaveLength(1);
        expect(secondVariables.input[0].EntityName).toBe('Roles');
        expect(splitBatchResult[0].Results[0].Name).toBe('Ada');
        expect(splitBatchResult[1].Results[0].Name).toBe('Admin');

        // Mutation on Users evicts Users L1 across all tabs while leaving Roles L1 intact!
        tabs[0].InvalidateRunViewDedupCache(['Users']);
        await flushMicrotasksAndTimers(20);

        GraphQLWire.Reset();
        GraphQLWire.EnqueueResponse({
            RunViews: [
                {
                    Success: true,
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 2,
                    Results: [{ PrimaryKey: [], EntityID: 'u-entity', Data: JSON.stringify({ ID: 'u-1', Name: 'Ada Updated' }) }],
                },
            ],
        });
        const postInvalidationBatch = await tabs[4].CallInternalRunViews<{ ID: string; Name: string }>([
            { EntityName: 'Users', ExtraFilter: '1=1' },
            { EntityName: 'Roles', ExtraFilter: '1=1' },
        ]);
        expect(GraphQLWire.Requests).toHaveLength(1);
        const postInvVars = GraphQLWire.LastRequest.variables as { input: Array<{ EntityName: string }> };
        expect(postInvVars.input).toHaveLength(1);
        expect(postInvVars.input[0].EntityName).toBe('Users');
        expect(postInvalidationBatch[0].Results[0].Name).toBe('Ada Updated');
        expect(postInvalidationBatch[1].Results[0].Name).toBe('Admin'); // Roles stayed cached!

        // RunViewsWithCacheCheck coalescing + BypassCache escape hatch
        GraphQLWire.Reset();
        GraphQLWire.EnqueueResponse({
            RunViewsWithCacheCheck: {
                success: true,
                results: [
                    {
                        viewIndex: 0,
                        status: 'stale',
                        maxUpdatedAt: '2026-11-16T10:00:00Z',
                        rowCount: 1,
                        Results: [{ PrimaryKey: [], EntityID: 'e-ent', Data: JSON.stringify({ ID: 'e-1', Name: 'Contacts' }) }],
                    },
                ],
            },
        });
        const ccResults = await Promise.all(
            tabs.slice(0, 5).map((t) =>
                t.RunViewsWithCacheCheck<{ ID: string; Name: string }>([{ params: { EntityName: 'Entities' } }])
            )
        );
        expect(GraphQLWire.Requests).toHaveLength(1);
        for (const r of ccResults) {
            expect(r.success).toBe(true);
            expect(r.results[0].viewIndex).toBe(0);
            expect(r.results[0].results?.[0].Name).toBe('Contacts');
        }

        // BypassCache=true always goes to server directly
        GraphQLWire.EnqueueResponse({
            [usersQName]: {
                Success: true,
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                Results: [{ ID: 'u-bypass', Name: 'FreshDB' }],
            },
        });
        const bypassRes = await tabs[0].CallInternalRunView<{ ID: string; Name: string }>({
            EntityName: 'Users',
            ExtraFilter: 'IsActive=1',
            BypassCache: true,
        });
        expect(bypassRes.Results[0].Name).toBe('FreshDB');

        // Failover test: if owner tab executing an in-flight RunView closes mid-flight, waiter takes over cleanly!
        GraphQLWire.Reset();
        let rejectOrIgnoreFirst = false;
        GraphQLWire.EnqueueResponder(async () => {
            return new Promise(() => {
                rejectOrIgnoreFirst = true;
            });
        });
        GraphQLWire.EnqueueResponder(async () => ({
            [usersQName]: {
                Success: true,
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 2,
                Results: [{ ID: 'u-failover', Name: 'Recovered By Tab 2' }],
            },
        }));

        const ownerRunView = tabs[8].CallInternalRunView<{ ID: string; Name: string }>({
            EntityName: 'Users',
            ExtraFilter: 'Failover=1',
        });
        const waiterRunView = tabs[9].CallInternalRunView<{ ID: string; Name: string }>({
            EntityName: 'Users',
            ExtraFilter: 'Failover=1',
        });
        await flushMicrotasksAndTimers(15);
        expect(rejectOrIgnoreFirst).toBe(true);
        // Tab 8 closes abruptly -> worker hands execute slot to Tab 9
        tabs[8].DisposeWebSocketResources();
        const recovered = await waiterRunView;
        expect(recovered.Results[0].Name).toBe('Recovered By Tab 2');
        void ownerRunView;
    });

    // ── 5. Single IDB Owner: RAM L1, Read Coalescing & Write Deduplication ────

    it('routes 10 tabs through a single IDB owner with RAM L1 hits, read coalescing, write deduplication, and reference isolation', async () => {
        const storage = new InstrumentedStorageProvider();
        const host = new SharedTabKernelHost({
            CreateWsClient: new FakeWsServerRegistry().CreateFactory(),
            CreateStorageProvider: () => storage,
        });
        hostsToDispose.push(host);

        const tabs = Array.from({ length: 10 }, (_, i) => {
            const t = createTestTabProvider({
                sessionId: `idb-tab-${i}`,
                kernelEnv: createKernelWorkerEnv(host),
            });
            providersToDispose.push(t);
            t.SubscribeToCacheInvalidation();
            return t;
        });
        await Promise.all(tabs.map((t) => t.SharedTabKernel!.WaitUntilReady()));
        await flushMicrotasksAndTimers(20);

        expect(tabs[0].LocalStorageProvider.SupportsCrossProcessPersistence).toBe(true);
        expect(tabs[0].LocalStorageProvider.SharedAcrossProcesses).toBe(true);
        expect(tabs[0].LocalStorageProvider.SharesReferences).toBe(false);

        const metadataPayload = { version: 42, entities: [{ Name: 'Users' }, { Name: 'Roles' }] };
        await tabs[0].LocalStorageProvider.SetObject('MJ_Metadata', metadataPayload, 'metadata');
        expect(storage.PhysicalWrites).toBe(1);

        // Identical writes from Tabs 1..9 MUST be deduplicated -> 0 additional IDB writes!
        await Promise.all(
            tabs.slice(1).map((t) => t.LocalStorageProvider.SetObject('MJ_Metadata', { version: 42, entities: [{ Name: 'Users' }, { Name: 'Roles' }] }, 'metadata'))
        );
        expect(storage.PhysicalWrites).toBe(1);

        // Cold pre-seeded key read concurrently across 10 tabs -> 1 physical IDB read (coalesced)
        await storage.SetItem('ColdSeedKey', JSON.stringify({ boot: 'fast' }), 'metadata');
        const readsBeforeCold = storage.PhysicalReads;
        const coldReads = await Promise.all(
            tabs.map((t) => t.LocalStorageProvider.GetObject<{ boot: string }>('ColdSeedKey', 'metadata'))
        );
        expect(storage.PhysicalReads - readsBeforeCold).toBe(1);
        for (const r of coldReads) {
            expect(r).toEqual({ boot: 'fast' });
        }

        // Subsequent Tab 1..9 reads of MJ_Metadata -> 0 physical IDB reads (100% Worker L1 RAM)
        const readsBeforeWarm = storage.PhysicalReads;
        const warmMetas = await Promise.all(
            tabs.slice(1).map((t) => t.LocalStorageProvider.GetObject<typeof metadataPayload>('MJ_Metadata', 'metadata'))
        );
        expect(storage.PhysicalReads - readsBeforeWarm).toBe(0);

        // Mutating Tab 1's hydrated object does not affect Tab 2 or Worker L1
        warmMetas[0]!.entities.push({ Name: 'Tampered' });
        const checkMeta = await tabs[2].LocalStorageProvider.GetObject<typeof metadataPayload>('MJ_Metadata', 'metadata');
        expect(checkMeta!.entities).toHaveLength(2);

        const stats = await tabs[0].GetSharedTabKernelStats();
        expect(stats!.StorageL1HitCount).toBeGreaterThanOrEqual(9);
        expect(stats!.StorageCoalescedReadCount).toBeGreaterThanOrEqual(1);
        expect(stats!.StorageIdbDeduplicatedWriteCount).toBe(9);
    });

    // ── 6. Graceful Fallback to BroadcastChannel + Web Locks ─────────────────

    it('automatically falls back to BroadcastChannel + Web Locks when SharedWorker is unavailable, errors, or times out', async () => {
        const wsRegistry = new FakeWsServerRegistry();
        const fallbackHub = new FakeFallbackBroadcastHub();
        const locks = new FakeWebLocks();

        // Case A: SharedWorker unavailable (Mobile Safari / DisableSharedWorker=true)
        const makeFallbackEnv = (extra?: Partial<SharedTabKernelEnvironment>): SharedTabKernelEnvironment => ({
            DisableSharedWorker: true,
            CreateBroadcastChannel: (name: string) => fallbackHub.CreateChannel(name),
            Locks: locks,
            HeartbeatIntervalMs: 30,
            ...extra,
        });

        const tabA = createTestTabProvider({
            sessionId: 'safari-tab-a',
            kernelEnv: makeFallbackEnv(),
        });
        const tabB = createTestTabProvider({
            sessionId: 'safari-tab-b',
            kernelEnv: makeFallbackEnv(),
        });
        // Case B: SharedWorker errors before handshake
        const errorWorkerEnv: SharedTabKernelEnvironment = {
            CreateKernelWorker: () => {
                const { ClientPort } = createPortPair();
                const worker: TabKernelWorkerLike = {
                    Port: ClientPort,
                    AddEventListener: (type, cb) => {
                        if (type === 'error') {
                            queueMicrotask(() => cb(new Error('worker script blocked by CSP')));
                        }
                    },
                };
                return worker;
            },
            CreateBroadcastChannel: (name: string) => fallbackHub.CreateChannel(name),
            Locks: locks,
        };
        const tabC = createTestTabProvider({
            sessionId: 'csp-error-tab-c',
            kernelEnv: errorWorkerEnv,
        });
        // Case C: Handshake timeout fallback
        const silentPortEnv: SharedTabKernelEnvironment = {
            CreateKernelPort: () => {
                const { ClientPort } = createPortPair();
                return ClientPort; // Never attached to any host -> triggers timeout!
            },
            KernelHandshakeTimeoutMs: 25,
            CreateBroadcastChannel: (name: string) => fallbackHub.CreateChannel(name),
            Locks: locks,
        };
        const tabD = createTestTabProvider({
            sessionId: 'timeout-tab-d',
            kernelEnv: silentPortEnv,
        });
        void wsRegistry;

        providersToDispose.push(tabA, tabB, tabC, tabD);
        tabA.SubscribeToCacheInvalidation();
        tabB.SubscribeToCacheInvalidation();
        tabC.SubscribeToCacheInvalidation();
        tabD.SubscribeToCacheInvalidation();

        const [readyA, readyB, readyC, readyD] = await Promise.all([
            tabA.SharedTabKernel!.WaitUntilReady(),
            tabB.SharedTabKernel!.WaitUntilReady(),
            tabC.SharedTabKernel!.WaitUntilReady(),
            tabD.SharedTabKernel!.WaitUntilReady(),
        ]);

        expect(readyA).toBe(false);
        expect(readyB).toBe(false);
        expect(readyC).toBe(false);
        expect(readyD).toBe(false);
        expect(tabA.SharedTabKernel!.Mode).toBe('fallback');
        expect(tabB.SharedTabKernel!.Mode).toBe('fallback');
        expect(tabC.SharedTabKernel!.Mode).toBe('fallback');
        expect(tabD.SharedTabKernel!.Mode).toBe('fallback');

        await flushMicrotasksAndTimers(25);
        // BroadcastChannel + Web Locks elected strictly 1 leader among Tabs A..D sharing the same scope
        const leaders = [tabA, tabB, tabC, tabD].filter((t) => t.SharedTabKernel!.IsLeader);
        expect(leaders).toHaveLength(1);
    });

    // ── 6b. Isolation: no test in this file dials a real socket ─────────────

    it('a provider without a kernel environment opens its direct subscription without dialing ws://localhost:4000', async () => {
        const dialed: string[] = [];
        /** Whatever listens on :4000 (another developer's MJAPI) refuses the socket the way MJAPI refuses a foreign token. */
        class ForeignServerSocket {
            public static readonly CONNECTING = 0;
            public static readonly OPEN = 1;
            public static readonly CLOSING = 2;
            public static readonly CLOSED = 3;
            public readyState = 0;
            public protocol = 'graphql-transport-ws';
            public onopen: (() => void) | null = null;
            public onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
            public onerror: ((ev: unknown) => void) | null = null;
            public onmessage: ((ev: { data: string }) => void) | null = null;
            constructor(url: string) {
                dialed.push(url);
                queueMicrotask(() => {
                    this.readyState = 3;
                    this.onclose?.({ code: 4403, reason: 'Forbidden', wasClean: true });
                });
            }
            public send(): void {}
            public close(): void {
                this.readyState = 3;
            }
        }
        vi.stubGlobal('WebSocket', ForeignServerSocket);
        try {
            const p = createTestTabProvider({ sessionId: 'isolated-tab', kernelEnv: null });
            providersToDispose.push(p);
            const sub = p.Subscribe('subscription CacheInvalidation { cacheInvalidation { EntityName } }').subscribe({ next: () => {}, error: () => {} });
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
            sub.unsubscribe();
            expect(dialed).toEqual([]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    // ── 7. Reproducible BEFORE vs AFTER 10-Tab Stress Benchmark ──────────────

    it('captures reproducible BEFORE vs AFTER benchmark improvements across 10 concurrent tabs', async () => {
        const tabCount = 10;

        // ── BEFORE: 10 isolated tabs with no SharedTabKernel (1 WS per tab, 10 backend calls, 10 IDB reads & writes)
        const beforeWsRegistry = new FakeWsServerRegistry();
        const beforeIdb = new InstrumentedStorageProvider();
        const beforeMetaPayload = { version: 99, entities: Array.from({ length: 120 }, (_, i) => ({ Name: `Entity_${i}` })) };
        await beforeIdb.SetItem('MJ_Metadata', JSON.stringify(beforeMetaPayload), 'metadata');
        beforeIdb.PhysicalReads = 0;
        beforeIdb.PhysicalWrites = 0;

        const beforeTabs: Array<{ Provider: WireTestGraphQLProvider; DirectWs: KernelWsClientLike }> = [];
        const beforeStatusReceived: number[] = Array(tabCount).fill(0);
        const beforeSubs: Array<{ unsubscribe: () => void }> = [];

        const beforeT0 = performance.now();
        for (let i = 0; i < tabCount; i++) {
            const p = createTestTabProvider({
                sessionId: `before-tab-${i}`,
                kernelEnv: null,
            });
            providersToDispose.push(p);
            const wsFactory = beforeWsRegistry.CreateFactory();
            const directWs = wsFactory({
                Url: 'ws://localhost:4000/graphql',
                ConnectionParams: () => ({ Authorization: 'Bearer tok' }),
                KeepAliveMs: 30_000,
                ConnectionAckWaitTimeoutMs: 10_000,
                RetryAttempts: 3,
                ShouldRetry: () => true,
            });
            beforeSubs.push(
                { unsubscribe: directWs.Subscribe({ Query: 'subscription CacheInvalidation { cacheInvalidation { EntityName } }' }, { Next: () => {}, Error: () => {}, Complete: () => {} }) },
                { unsubscribe: directWs.Subscribe({ Query: `subscription StatusUpdates($sessionId: String!) { statusUpdates(sessionId: $sessionId) { message } }`, Variables: { sessionId: `before-tab-${i}` } }, { Next: () => { beforeStatusReceived[i]++; }, Error: () => {}, Complete: () => {} }) }
            );
            beforeTabs.push({ Provider: p, DirectWs: directWs });
        }

        const beforeHydrateT0 = performance.now();
        await Promise.all(
            beforeTabs.slice(1).map(async () => {
                const raw = await beforeIdb.GetItem<string>('MJ_Metadata', 'metadata');
                return raw ? JSON.parse(raw) : null;
            })
        );
        const beforeHydrateMs = Math.max(0.01, performance.now() - beforeHydrateT0);
        const beforeIdbHydrateReads = beforeIdb.PhysicalReads;

        const benchUsersQName = `Run${getGraphQLTypeNameBase(beforeTabs[0].Provider.EntityByName('Users')!)}DynamicView`;
        GraphQLWire.Reset();
        for (let i = 0; i < tabCount; i++) {
            GraphQLWire.EnqueueResponse({
                [benchUsersQName]: {
                    Success: true,
                    RowCount: 5,
                    TotalRowCount: 5,
                    ExecutionTime: 3,
                    Results: [{ ID: '1', Name: 'Row' }],
                },
            });
        }
        await Promise.all(
            beforeTabs.map(({ Provider }) =>
                Provider.CallInternalRunView({ EntityName: 'Users', ExtraFilter: 'IsActive=1' })
            )
        );
        const beforeBackendCalls = GraphQLWire.Requests.length;

        const beforeWriteStart = beforeIdb.PhysicalWrites;
        await Promise.all(
            beforeTabs.map(() =>
                beforeIdb.SetItem('UserState', JSON.stringify(beforeMetaPayload), 'state')
            )
        );
        const beforeIdbWrites = beforeIdb.PhysicalWrites - beforeWriteStart;

        const beforeStreamT0 = performance.now();
        for (let m = 0; m < 100; m++) {
            for (let i = 0; i < tabCount; i++) {
                beforeWsRegistry.PushStatusUpdate(`before-tab-${i}`, `msg-${m}`);
            }
        }
        const beforeStreamMs = Math.max(0.01, performance.now() - beforeStreamT0);
        const beforeTotalMs = performance.now() - beforeT0;

        for (const s of beforeSubs) s.unsubscribe();
        for (const { DirectWs } of beforeTabs) DirectWs.Dispose();

        // ── AFTER: 10 concurrent tabs multiplexed through SharedTabKernelHost ──
        const afterWsRegistry = new FakeWsServerRegistry();
        const afterIdb = new InstrumentedStorageProvider();
        const afterHost = new SharedTabKernelHost({
            CreateWsClient: afterWsRegistry.CreateFactory(),
            CreateStorageProvider: () => afterIdb,
        });
        hostsToDispose.push(afterHost);

        const afterStatusReceived: number[] = Array(tabCount).fill(0);
        const afterSubs: Array<{ unsubscribe: () => void }> = [];
        const afterTabs: WireTestGraphQLProvider[] = [];

        const afterT0 = performance.now();
        for (let i = 0; i < tabCount; i++) {
            const tab = createTestTabProvider({
                sessionId: `after-tab-${i}`,
                kernelEnv: createKernelWorkerEnv(afterHost),
            });
            providersToDispose.push(tab);
            tab.SubscribeToCacheInvalidation();
            afterSubs.push(
                tab.PushStatusUpdates(`after-tab-${i}`).subscribe(() => {
                    afterStatusReceived[i]++;
                })
            );
            afterTabs.push(tab);
        }
        await Promise.all(afterTabs.map((t) => t.SharedTabKernel!.WaitUntilReady()));
        await flushMicrotasksAndTimers(20);

        // Tab 0 writes MJ_Metadata once; Tab 1..9 hydrate from SharedWorker L1 RAM
        await afterTabs[0].LocalStorageProvider.SetObject('MJ_Metadata', beforeMetaPayload, 'metadata');
        const afterReadsBeforeHydrate = afterIdb.PhysicalReads;
        const afterHydrateT0 = performance.now();
        await Promise.all(
            afterTabs.slice(1).map((t) => t.LocalStorageProvider.GetObject('MJ_Metadata', 'metadata'))
        );
        const afterHydrateMs = Math.max(0.01, performance.now() - afterHydrateT0);
        const afterIdbHydrateReads = afterIdb.PhysicalReads - afterReadsBeforeHydrate;

        GraphQLWire.Reset();
        GraphQLWire.EnqueueResponse({
            [benchUsersQName]: {
                Success: true,
                RowCount: 5,
                TotalRowCount: 5,
                ExecutionTime: 3,
                Results: [{ ID: '1', Name: 'Row' }],
            },
        });
        await Promise.all(
            afterTabs.map((tab) => tab.CallInternalRunView({ EntityName: 'Users', ExtraFilter: 'IsActive=1' }))
        );
        const afterBackendCalls = GraphQLWire.Requests.length;

        const afterWritesBefore = afterIdb.PhysicalWrites;
        await Promise.all(
            afterTabs.map((tab) => tab.LocalStorageProvider.SetObject('UserState', beforeMetaPayload, 'state'))
        );
        const afterIdbWrites = afterIdb.PhysicalWrites - afterWritesBefore;

        const afterStreamT0 = performance.now();
        for (let m = 0; m < 100; m++) {
            for (let i = 0; i < tabCount; i++) {
                afterWsRegistry.PushStatusUpdate(`after-tab-${i}`, `msg-${m}`);
            }
        }
        await flushMicrotasksAndTimers(15);
        const afterStreamMs = Math.max(0.01, performance.now() - afterStreamT0);
        const afterTotalMs = performance.now() - afterT0;

        for (const s of afterSubs) s.unsubscribe();

        const beforeStatsSnapshot = {
            OriginWebSockets: beforeWsRegistry.CreatedClients.length,
            DuplicateBackendRunViews: beforeBackendCalls,
            Tab2To10IdbHydrateReads: beforeIdbHydrateReads,
            Tab2To10HydrateMs: Number(beforeHydrateMs.toFixed(2)),
            IdbWritesForIdenticalPayload: beforeIdbWrites,
            StatusMessagesDelivered: beforeStatusReceived.reduce((a, b) => a + b, 0),
            StreamFanoutMs: Number(beforeStreamMs.toFixed(2)),
            TotalHarnessMs: Number(beforeTotalMs.toFixed(2)),
        };

        const kernelStats = await afterTabs[0].GetSharedTabKernelStats();
        const afterStatsSnapshot = {
            OriginWebSockets: kernelStats!.WsClientCreatedCount,
            DuplicateBackendRunViews: afterBackendCalls,
            Tab2To10IdbHydrateReads: afterIdbHydrateReads,
            Tab2To10HydrateMs: Number(afterHydrateMs.toFixed(2)),
            IdbWritesForIdenticalPayload: afterIdbWrites,
            StatusMessagesDelivered: afterStatusReceived.reduce((a, b) => a + b, 0),
            StreamFanoutMs: Number(afterStreamMs.toFixed(2)),
            TotalHarnessMs: Number(afterTotalMs.toFixed(2)),
        };

        // Emit structured BEFORE vs AFTER summary for benchmark reporting
        console.log('[Wave6B SharedTabKernel 10-Tab Benchmark] BEFORE:', JSON.stringify(beforeStatsSnapshot));
        console.log('[Wave6B SharedTabKernel 10-Tab Benchmark] AFTER :', JSON.stringify(afterStatsSnapshot));

        // Verify massive structural reductions
        expect(beforeStatsSnapshot.OriginWebSockets).toBe(10);
        expect(afterStatsSnapshot.OriginWebSockets).toBe(1);
        expect(beforeStatsSnapshot.DuplicateBackendRunViews).toBe(10);
        expect(afterStatsSnapshot.DuplicateBackendRunViews).toBe(1);
        expect(beforeStatsSnapshot.Tab2To10IdbHydrateReads).toBe(9);
        expect(afterStatsSnapshot.Tab2To10IdbHydrateReads).toBe(0);
        expect(beforeStatsSnapshot.IdbWritesForIdenticalPayload).toBe(10);
        expect(afterStatsSnapshot.IdbWritesForIdenticalPayload).toBe(1);
        expect(afterStatsSnapshot.StatusMessagesDelivered).toBe(1000);
        expect(UUIDsEqual('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')).toBe(true);
    });
});
