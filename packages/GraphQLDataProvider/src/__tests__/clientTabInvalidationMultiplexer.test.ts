import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { BaseEntity, BaseEntityEvent } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import {
    ClientTabInvalidationMultiplexer,
    TabMultiplexerEnvironment,
    BroadcastChannelLike,
    WebLocksLike,
    SharedWorkerLike,
    MessagePortLike,
    MessageEventLike,
    CacheInvalidationEventData,
    TabInvalidationMessage,
} from '../ClientTabInvalidationMultiplexer.js';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '../graphQLDataProvider.js';

class FakeBroadcastChannel implements BroadcastChannelLike {
    public IsClosed = false;
    public OnMessage: ((ev: MessageEventLike) => void) | null = null;
    private _listeners = new Set<(ev: MessageEventLike) => void>();

    constructor(
        public readonly Name: string,
        private _hub: FakeBroadcastChannelHub
    ) {}

    public get name(): string {
        return this.Name;
    }

    public PostMessage(message: TabInvalidationMessage): void {
        if (this.IsClosed) return;
        this._hub.Broadcast(this, message);
    }

    public postMessage(message: TabInvalidationMessage): void {
        this.PostMessage(message);
    }

    public AddEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.add(listener);
        }
    }

    public addEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        this.AddEventListener(type, listener);
    }

    public RemoveEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.delete(listener);
        }
    }

    public removeEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        this.RemoveEventListener(type, listener);
    }

    public DeliverMessage(event: MessageEventLike): void {
        if (this.IsClosed) return;
        this.OnMessage?.(event);
        for (const listener of this._listeners) {
            listener(event);
        }
    }

    public Close(): void {
        if (this.IsClosed) return;
        this.IsClosed = true;
        this._hub.RemoveChannel(this);
    }

    public close(): void {
        this.Close();
    }
}

class FakeBroadcastChannelHub {
    private _channels = new Map<string, Set<FakeBroadcastChannel>>();

    public CreateChannel(name: string): BroadcastChannelLike {
        const channel = new FakeBroadcastChannel(name, this);
        let set = this._channels.get(name);
        if (!set) {
            set = new Set();
            this._channels.set(name, set);
        }
        set.add(channel);
        return channel;
    }

    public Broadcast(sender: FakeBroadcastChannel, data: TabInvalidationMessage): void {
        const set = this._channels.get(sender.Name);
        if (!set) return;
        const serialized = JSON.stringify(data);
        for (const ch of set) {
            if (ch !== sender && !ch.IsClosed) {
                const cloned = JSON.parse(serialized) as TabInvalidationMessage;
                queueMicrotask(() => {
                    if (!ch.IsClosed) {
                        ch.DeliverMessage({ Data: cloned });
                    }
                });
            }
        }
    }

    public RemoveChannel(channel: FakeBroadcastChannel): void {
        const set = this._channels.get(channel.Name);
        if (set) {
            set.delete(channel);
            if (set.size === 0) {
                this._channels.delete(channel.Name);
            }
        }
    }

    public Clear(): void {
        for (const set of this._channels.values()) {
            for (const ch of set) {
                ch.IsClosed = true;
            }
        }
        this._channels.clear();
    }
}

class FakeWebLocksManager implements WebLocksLike {
    private _lockQueues = new Map<
        string,
        Array<{
            Callback: () => Promise<void>;
            Resolve: () => void;
            Reject: (err: unknown) => void;
        }>
    >();
    private _activeLocks = new Set<string>();

    public async Request(name: string, callback: () => Promise<void>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let queue = this._lockQueues.get(name);
            if (!queue) {
                queue = [];
                this._lockQueues.set(name, queue);
            }
            queue.push({ Callback: callback, Resolve: resolve, Reject: reject });
            this.processQueue(name);
        });
    }

    public async request(name: string, callback: () => Promise<void>): Promise<void> {
        return this.Request(name, callback);
    }

    private processQueue(name: string): void {
        if (this._activeLocks.has(name)) {
            return;
        }
        const queue = this._lockQueues.get(name);
        if (!queue || queue.length === 0) {
            return;
        }
        const item = queue.shift();
        if (!item) return;

        this._activeLocks.add(name);

        (async () => {
            try {
                await item.Callback();
                item.Resolve();
            } catch (err) {
                item.Reject(err);
            } finally {
                this._activeLocks.delete(name);
                this.processQueue(name);
            }
        })();
    }

    public Clear(): void {
        this._lockQueues.clear();
        this._activeLocks.clear();
    }
}

class FakeMessagePort implements MessagePortLike {
    public IsClosed = false;
    public OnMessage: ((ev: MessageEventLike) => void) | null = null;
    private _listeners = new Set<(ev: MessageEventLike) => void>();

    constructor(
        public readonly Key: string,
        private _hub: FakeSharedWorkerHub
    ) {}

    public PostMessage(message: TabInvalidationMessage): void {
        if (this.IsClosed) return;
        this._hub.Broadcast(this, this.Key, message);
    }

    public postMessage(message: TabInvalidationMessage): void {
        this.PostMessage(message);
    }

    public AddEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.add(listener);
        }
    }

    public addEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        this.AddEventListener(type, listener);
    }

    public RemoveEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        if (type === 'message') {
            this._listeners.delete(listener);
        }
    }

    public removeEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
        this.RemoveEventListener(type, listener);
    }

    public DeliverMessage(event: MessageEventLike): void {
        if (this.IsClosed) return;
        this.OnMessage?.(event);
        for (const listener of this._listeners) {
            listener(event);
        }
    }

    public Start(): void {}
    public start(): void {}

    public Close(): void {
        if (this.IsClosed) return;
        this.IsClosed = true;
        this._hub.RemovePort(this.Key, this);
    }

    public close(): void {
        this.Close();
    }
}

class FakeSharedWorkerHub {
    private _ports = new Map<string, Set<FakeMessagePort>>();

    public CreateSharedWorker(scriptUrl: string, name: string): SharedWorkerLike {
        const key = `${scriptUrl}|${name}`;
        let set = this._ports.get(key);
        if (!set) {
            set = new Set();
            this._ports.set(key, set);
        }
        const port = new FakeMessagePort(key, this);
        set.add(port);
        return { Port: port };
    }

    public Broadcast(sender: FakeMessagePort, key: string, data: TabInvalidationMessage): void {
        const set = this._ports.get(key);
        if (!set) return;
        const serialized = JSON.stringify(data);
        for (const port of set) {
            if (port !== sender && !port.IsClosed) {
                const cloned = JSON.parse(serialized) as TabInvalidationMessage;
                queueMicrotask(() => {
                    if (!port.IsClosed) {
                        port.DeliverMessage({ Data: cloned });
                    }
                });
            }
        }
    }

    public RemovePort(key: string, port: FakeMessagePort): void {
        const set = this._ports.get(key);
        if (set) {
            set.delete(port);
            if (set.size === 0) {
                this._ports.delete(key);
            }
        }
    }

    public Clear(): void {
        for (const set of this._ports.values()) {
            for (const port of set) {
                port.IsClosed = true;
            }
        }
        this._ports.clear();
    }
}

interface TestTabContext {
    provider: GraphQLDataProvider;
    wsSubject: Subject<{ cacheInvalidation?: CacheInvalidationEventData }>;
    subscribeSpy: ReturnType<typeof vi.spyOn>;
    requestMock: ReturnType<typeof vi.fn>;
}

function CreateTestTab(params: {
    tabId: string;
    sessionId: string;
    userId: string;
    wsUrl?: string;
    env: TabMultiplexerEnvironment;
    requestMock?: ReturnType<typeof vi.fn>;
}): TestTabContext {
    const provider = new GraphQLDataProvider(true);
    provider.ResetCacheSequenceState();
    provider.SetTabInvalidationMultiplexerEnvironment(params.env);

    (provider as unknown as { _sessionId: string })._sessionId = params.sessionId;
    vi.spyOn(provider, 'CurrentUser', 'get').mockReturnValue({ ID: params.userId } as unknown as import('@memberjunction/core').UserInfo);
    (provider as unknown as { _configData: GraphQLProviderConfigData })._configData = new GraphQLProviderConfigData(
        'mock-token',
        'http://localhost:4000/graphql',
        params.wsUrl ?? 'ws://localhost:4000/graphql'
    );

    const requestMock = params.requestMock ?? vi.fn();
    (provider as unknown as { _client: { request: typeof requestMock } })._client = {
        request: requestMock,
    };

    const wsSubject = new Subject<{ cacheInvalidation?: CacheInvalidationEventData }>();
    const subscribeSpy = vi.spyOn(provider, 'Subscribe').mockReturnValue(wsSubject.asObservable());

    return { provider, wsSubject, subscribeSpy, requestMock };
}

describe('ClientTabInvalidationMultiplexer & Multi-Tab Browser Cache Invalidation', () => {
    let channelHub: FakeBroadcastChannelHub;
    let locksManager: FakeWebLocksManager;
    let sharedWorkerHub: FakeSharedWorkerHub;
    let defaultEnv: TabMultiplexerEnvironment;

    beforeEach(() => {
        channelHub = new FakeBroadcastChannelHub();
        locksManager = new FakeWebLocksManager();
        sharedWorkerHub = new FakeSharedWorkerHub();

        defaultEnv = {
            CreateBroadcastChannel: (name: string) => channelHub.CreateChannel(name),
            Locks: locksManager,
        };

        GraphQLDataProvider.EnableMultiTabInvalidationMultiplexing = true;
    });

    afterEach(() => {
        channelHub.Clear();
        locksManager.Clear();
        sharedWorkerHub.Clear();
    });

    it('validates IsSupported environment detection correctly', () => {
        expect(ClientTabInvalidationMultiplexer.IsSupported(null)).toBe(false);
        expect(ClientTabInvalidationMultiplexer.IsSupported({})).toBe(false);

        expect(
            ClientTabInvalidationMultiplexer.IsSupported({
                Locks: locksManager,
            })
        ).toBe(false);

        expect(
            ClientTabInvalidationMultiplexer.IsSupported({
                CreateBroadcastChannel: (n) => channelHub.CreateChannel(n),
            })
        ).toBe(false);

        expect(
            ClientTabInvalidationMultiplexer.IsSupported({
                Locks: locksManager,
                CreateBroadcastChannel: (n) => channelHub.CreateChannel(n),
            })
        ).toBe(true);

        expect(
            ClientTabInvalidationMultiplexer.IsSupported({
                Locks: locksManager,
                CreateSharedWorker: (url, n) => sharedWorkerHub.CreateSharedWorker(url, n),
                SharedWorkerScriptUrl: '/worker.js',
            })
        ).toBe(true);

        expect(
            ClientTabInvalidationMultiplexer.IsSupported({
                Locks: locksManager,
                CreateSharedWorker: (url, n) => sharedWorkerHub.CreateSharedWorker(url, n),
            })
        ).toBe(false);
    });

    it('Scenario 1: 3-Tab Leader Election elects ONLY Tab1 as Leader with 1 WS subscription', async () => {
        const tab1 = CreateTestTab({
            tabId: 'tab-1',
            sessionId: 'sess-1',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab2 = CreateTestTab({
            tabId: 'tab-2',
            sessionId: 'sess-2',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab3 = CreateTestTab({
            tabId: 'tab-3',
            sessionId: 'sess-3',
            userId: 'user-A',
            env: defaultEnv,
        });

        tab1.provider.SubscribeToCacheInvalidation();
        tab2.provider.SubscribeToCacheInvalidation();
        tab3.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(tab1.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tab2.provider.TabInvalidationMultiplexer?.IsLeader).toBe(false);
        expect(tab3.provider.TabInvalidationMultiplexer?.IsLeader).toBe(false);

        expect(tab1.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(tab2.subscribeSpy).toHaveBeenCalledTimes(0);
        expect(tab3.subscribeSpy).toHaveBeenCalledTimes(0);

        await tab1.provider.UnsubscribeFromCacheInvalidation();
        await tab2.provider.UnsubscribeFromCacheInvalidation();
        await tab3.provider.UnsubscribeFromCacheInvalidation();
    });

    it('Scenario 2: Real-Time Broadcast Relay and OriginSessionID self-echo suppression', async () => {
        const tab1 = CreateTestTab({
            tabId: 'tab-1',
            sessionId: 'sess-1',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab2 = CreateTestTab({
            tabId: 'tab-2',
            sessionId: 'sess-2',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab3 = CreateTestTab({
            tabId: 'tab-3',
            sessionId: 'sess-3',
            userId: 'user-A',
            env: defaultEnv,
        });

        tab1.provider.SubscribeToCacheInvalidation();
        tab2.provider.SubscribeToCacheInvalidation();
        tab3.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        const globalEvents: Array<{ event: BaseEntityEvent; provider: unknown }> = [];
        const globalSub = MJGlobal.Instance.GetEventListener(false).subscribe((ev) => {
            if (ev.event === MJEventType.ComponentEvent && ev.eventCode === BaseEntity.BaseEventCode) {
                globalEvents.push({
                    event: ev.args as BaseEntityEvent,
                    provider: ev.component,
                });
            }
        });

        try {
            // Event 1 from foreign session: delivered to all 3 tabs
            tab1.wsSubject.next({
                cacheInvalidation: {
                    EntityName: 'AI Models',
                    PrimaryKeyValues: '[{"FieldName":"ID","Value":"m-1"}]',
                    Action: 'save',
                    SourceServerID: 'srv-1',
                    Timestamp: '2026-11-11T00:00:00Z',
                    OriginSessionID: 'foreign-session',
                    Sequence: 10,
                },
            });

            await new Promise((resolve) => setTimeout(resolve, 30));

            expect(tab1.provider.LastCacheInvalidationSequence).toBe(10);
            expect(tab2.provider.LastCacheInvalidationSequence).toBe(10);
            expect(tab3.provider.LastCacheInvalidationSequence).toBe(10);

            expect(globalEvents).toHaveLength(3);
            expect(globalEvents.map((g) => g.event.entityName)).toEqual(['AI Models', 'AI Models', 'AI Models']);

            globalEvents.length = 0;

            // Event 2 originating from Tab 2's session (sess-2)
            tab1.wsSubject.next({
                cacheInvalidation: {
                    EntityName: 'AI Prompts',
                    PrimaryKeyValues: '[{"FieldName":"ID","Value":"p-1"}]',
                    Action: 'save',
                    SourceServerID: 'srv-1',
                    Timestamp: '2026-11-11T00:00:01Z',
                    OriginSessionID: 'sess-2',
                    Sequence: 11,
                },
            });

            await new Promise((resolve) => setTimeout(resolve, 30));

            expect(tab1.provider.LastCacheInvalidationSequence).toBe(11);
            expect(tab2.provider.LastCacheInvalidationSequence).toBe(11);
            expect(tab3.provider.LastCacheInvalidationSequence).toBe(11);

            // Tab 2 suppresses self-originated event, so only Tab 1 and Tab 3 raise MJGlobal events
            expect(globalEvents).toHaveLength(2);
            expect(globalEvents.some((g) => g.provider === tab1.provider)).toBe(true);
            expect(globalEvents.some((g) => g.provider === tab3.provider)).toBe(true);
            expect(globalEvents.some((g) => g.provider === tab2.provider)).toBe(false);
        } finally {
            globalSub.unsubscribe();
            await tab1.provider.UnsubscribeFromCacheInvalidation();
            await tab2.provider.UnsubscribeFromCacheInvalidation();
            await tab3.provider.UnsubscribeFromCacheInvalidation();
        }
    });

    it('Scenario 3: Automatic Leader Failover when Leader tab is closed or disposed', async () => {
        const tab1 = CreateTestTab({
            tabId: 'tab-1',
            sessionId: 'sess-1',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab2 = CreateTestTab({
            tabId: 'tab-2',
            sessionId: 'sess-2',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab3 = CreateTestTab({
            tabId: 'tab-3',
            sessionId: 'sess-3',
            userId: 'user-A',
            env: defaultEnv,
        });

        tab1.provider.SubscribeToCacheInvalidation();
        tab2.provider.SubscribeToCacheInvalidation();
        tab3.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(tab1.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tab2.provider.TabInvalidationMultiplexer?.IsLeader).toBe(false);

        // Close / Unsubscribe Tab 1 (Leader)
        await tab1.provider.UnsubscribeFromCacheInvalidation();
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Tab 2 should immediately failover to Leader
        expect(tab2.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tab3.provider.TabInvalidationMultiplexer?.IsLeader).toBe(false);
        expect(tab2.subscribeSpy).toHaveBeenCalledTimes(1);

        // Now Tab 2 emits WS frames and Tab 3 receives them
        tab2.wsSubject.next({
            cacheInvalidation: {
                EntityName: 'Users',
                PrimaryKeyValues: '[{"FieldName":"ID","Value":"u-2"}]',
                Action: 'save',
                SourceServerID: 'srv-1',
                Timestamp: '2026-11-11T00:00:02Z',
                OriginSessionID: 'other',
                Sequence: 25,
            },
        });

        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(tab2.provider.LastCacheInvalidationSequence).toBe(25);
        expect(tab3.provider.LastCacheInvalidationSequence).toBe(25);

        await tab2.provider.UnsubscribeFromCacheInvalidation();
        await tab3.provider.UnsubscribeFromCacheInvalidation();
    });

    it('Scenario 4: Coordinated Catch-Up Deduplication across multiple follower tabs', async () => {
        const tab1 = CreateTestTab({
            tabId: 'tab-1',
            sessionId: 'sess-1',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab2 = CreateTestTab({
            tabId: 'tab-2',
            sessionId: 'sess-2',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tab3 = CreateTestTab({
            tabId: 'tab-3',
            sessionId: 'sess-3',
            userId: 'user-A',
            env: defaultEnv,
        });

        tab1.provider.SubscribeToCacheInvalidation();
        tab2.provider.SubscribeToCacheInvalidation();
        tab3.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        // Baseline sequence is 10 on all tabs
        tab1.provider.ProcessServerCacheSequenceHeader(10, 'srv-1');
        tab2.provider.ProcessServerCacheSequenceHeader(10, 'srv-1');
        tab3.provider.ProcessServerCacheSequenceHeader(10, 'srv-1');

        expect(tab1.provider.LastCacheInvalidationSequence).toBe(10);
        expect(tab2.provider.LastCacheInvalidationSequence).toBe(10);
        expect(tab3.provider.LastCacheInvalidationSequence).toBe(10);

        // Leader's GraphQL client returns catch-up results advancing sequence to 15
        tab1.requestMock.mockResolvedValueOnce({
            GetCacheInvalidationsSince: {
                RequiresFullRefresh: false,
                CurrentSequence: 15,
                ServerProcessID: 'srv-1',
                Events: [
                    {
                        EntityName: 'Dashboards',
                        PrimaryKeyValues: '[{"FieldName":"ID","Value":"d-1"}]',
                        Action: 'save',
                        SourceServerID: 'srv-1',
                        Timestamp: '2026-11-11T00:00:03Z',
                        OriginSessionID: 'other',
                        Sequence: 15,
                    },
                ],
            },
        });

        // Tab 2 and Tab 3 simultaneously observe X-MJ-Cache-Seq: 15
        tab2.provider.ProcessServerCacheSequenceHeader(15, 'srv-1');
        tab3.provider.ProcessServerCacheSequenceHeader(15, 'srv-1');

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Exactly 1 GraphQL HTTP query executed by Tab 1 (Leader), 0 by followers
        expect(tab1.requestMock).toHaveBeenCalledTimes(1);
        expect(tab2.requestMock).toHaveBeenCalledTimes(0);
        expect(tab3.requestMock).toHaveBeenCalledTimes(0);

        // All 3 tabs synchronized to sequence 15
        expect(tab1.provider.LastCacheInvalidationSequence).toBe(15);
        expect(tab2.provider.LastCacheInvalidationSequence).toBe(15);
        expect(tab3.provider.LastCacheInvalidationSequence).toBe(15);

        await tab1.provider.UnsubscribeFromCacheInvalidation();
        await tab2.provider.UnsubscribeFromCacheInvalidation();
        await tab3.provider.UnsubscribeFromCacheInvalidation();
    });

    it('Scenario 5: User Scope Isolation prevents cross-user invalidation delivery', async () => {
        const tabA = CreateTestTab({
            tabId: 'tab-user-A',
            sessionId: 'sess-user-A',
            userId: 'user-A',
            env: defaultEnv,
        });
        const tabB = CreateTestTab({
            tabId: 'tab-user-B',
            sessionId: 'sess-user-B',
            userId: 'user-B',
            env: defaultEnv,
        });

        tabA.provider.SubscribeToCacheInvalidation();
        tabB.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        // Both are leaders of their own independent scopes
        expect(tabA.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tabB.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tabA.provider.TabInvalidationMultiplexer?.ChannelName).not.toBe(
            tabB.provider.TabInvalidationMultiplexer?.ChannelName
        );

        // Emit WS event for user A
        tabA.wsSubject.next({
            cacheInvalidation: {
                EntityName: 'PrivateRecord',
                PrimaryKeyValues: '[{"FieldName":"ID","Value":"pr-1"}]',
                Action: 'save',
                SourceServerID: 'srv-1',
                Timestamp: '2026-11-11T00:00:04Z',
                OriginSessionID: 'external',
                Sequence: 50,
            },
        });

        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(tabA.provider.LastCacheInvalidationSequence).toBe(50);
        expect(tabB.provider.LastCacheInvalidationSequence).toBe(0); // Untouched

        await tabA.provider.UnsubscribeFromCacheInvalidation();
        await tabB.provider.UnsubscribeFromCacheInvalidation();
    });

    it('Scenario 6: SharedWorker Port Transport message relay when configured', async () => {
        const swEnv: TabMultiplexerEnvironment = {
            Locks: locksManager,
            CreateSharedWorker: (url, name) => sharedWorkerHub.CreateSharedWorker(url, name),
            SharedWorkerScriptUrl: '/worker.js',
        };

        const tab1 = CreateTestTab({
            tabId: 'tab-sw-1',
            sessionId: 'sess-sw-1',
            userId: 'user-SW',
            env: swEnv,
        });
        const tab2 = CreateTestTab({
            tabId: 'tab-sw-2',
            sessionId: 'sess-sw-2',
            userId: 'user-SW',
            env: swEnv,
        });

        tab1.provider.SubscribeToCacheInvalidation();
        tab2.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(tab1.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tab2.provider.TabInvalidationMultiplexer?.IsLeader).toBe(false);

        // Relay invalidation from tab1 to tab2 via SharedWorker MessagePort
        tab1.wsSubject.next({
            cacheInvalidation: {
                EntityName: 'SharedData',
                PrimaryKeyValues: '[{"FieldName":"ID","Value":"sd-1"}]',
                Action: 'save',
                SourceServerID: 'srv-1',
                Timestamp: '2026-11-11T00:00:05Z',
                OriginSessionID: 'other',
                Sequence: 75,
            },
        });

        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(tab1.provider.LastCacheInvalidationSequence).toBe(75);
        expect(tab2.provider.LastCacheInvalidationSequence).toBe(75);

        await tab1.provider.UnsubscribeFromCacheInvalidation();
        await tab2.provider.UnsubscribeFromCacheInvalidation();
    });

    it('Scenario 7: Follower falls back to direct catch-up if leader fails to sync within timeout', async () => {
        const shortTimeoutEnv: TabMultiplexerEnvironment = {
            ...defaultEnv,
            CatchUpFallbackTimeoutMs: 30,
        };

        const tab1 = CreateTestTab({
            tabId: 'tab-dead-leader',
            sessionId: 'sess-1',
            userId: 'user-timeout',
            env: shortTimeoutEnv,
        });
        const tab2 = CreateTestTab({
            tabId: 'tab-follower',
            sessionId: 'sess-2',
            userId: 'user-timeout',
            env: shortTimeoutEnv,
        });

        tab1.provider.SubscribeToCacheInvalidation();
        tab2.provider.SubscribeToCacheInvalidation();

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(tab1.provider.TabInvalidationMultiplexer?.IsLeader).toBe(true);
        expect(tab2.provider.TabInvalidationMultiplexer?.IsLeader).toBe(false);

        // Follower tab2 is at sequence 10
        tab2.provider.ProcessServerCacheSequenceHeader(10, 'srv-1');

        // Leader tab1 ignores the catch-up request (e.g. leader hung / frozen)
        tab1.requestMock.mockImplementation(() => new Promise(() => {}));

        // Tab 2's requestMock will be called once fallback timer triggers
        tab2.requestMock.mockResolvedValueOnce({
            GetCacheInvalidationsSince: {
                RequiresFullRefresh: false,
                CurrentSequence: 30,
                ServerProcessID: 'srv-1',
                Events: [],
            },
        });

        // Tab 2 observes gap to sequence 30
        tab2.provider.ProcessServerCacheSequenceHeader(30, 'srv-1');

        // Wait for CatchUpFallbackTimeoutMs (30ms) to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        // Tab 2 fell back and executed catch-up directly!
        expect(tab2.requestMock).toHaveBeenCalledTimes(1);
        expect(tab2.provider.LastCacheInvalidationSequence).toBe(30);

        await tab1.provider.UnsubscribeFromCacheInvalidation();
        await tab2.provider.UnsubscribeFromCacheInvalidation();
    });
});
