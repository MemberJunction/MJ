import { LogError } from '@memberjunction/core';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { v4 as uuidv4 } from 'uuid';
import type { TicketReplayStore } from './ArtifactCollaborationServer.js';

const PEER_PRESENCE_TTL_MS = 45_000;
const PEER_PRESENCE_REFRESH_MS = 15_000;
const PEER_PRESENCE_KEY_TTL_MS = 90_000;

/**
 * Envelope published across server instances when a collaborative Yjs room processes
 * a document update, awareness broadcast, or permission revocation.
 */
export interface YjsRelayMessage {
    /** Target `MJ: Artifacts.ID` (or provider-scoped room key) identifier. */
    ArtifactID: string;
    /** Optional provider scope key (`resolveProviderKey`) isolating tenants sharing the same ArtifactID. */
    ProviderKey?: string;
    /** Unique identifier of the MJServer instance that originated the message (used for echo suppression). */
    OriginInstanceID: string;
    /** Kind of room event being relayed. */
    MessageType:
        | 'sync-update'
        | 'awareness'
        | 'permission-revoked'
        | 'sync-request'
        | 'sync-state'
        | 'version-saved'
        | 'room-rollback'
        | 'presence-ping';
    /** Base64-encoded binary payload (Yjs update/state-vector bytes or encoded awareness update). */
    PayloadBase64: string;
    /** Optional user ID that authored the update or whose permissions changed. */
    TargetUserID?: string;
    /** Optional persisted version ID when `MessageType === 'version-saved'`. */
    VersionID?: string;
    /** Optional persisted version number when `MessageType === 'version-saved'`. */
    VersionNumber?: number;
}

/**
 * Handler callback invoked when a peer server instance publishes a {@link YjsRelayMessage}
 * for a subscribed artifact room.
 */
export type YjsRelayMessageHandler = (message: YjsRelayMessage) => void | Promise<void>;

/**
 * Pluggable pub/sub relay abstraction (`O3`) that synchronizes Yjs CRDT updates,
 * awareness states, and permission revocations across MJServer instances.
 */
export interface IYjsRoomRelay {
    /** Unique identifier of this relay instance (used to suppress self-echoes). */
    readonly InstanceID: string;

    /**
     * Subscribes to cross-instance updates for `roomKey` (artifact ID or `${providerKey}::${artifactId}`).
     *
     * @returns An unsubscribe function that removes the subscription.
     */
    SubscribeRoom(roomKey: string, handler: YjsRelayMessageHandler): Promise<() => void>;

    /**
     * Publishes a room event to all other subscribed server instances.
     * Returns the number of peer subscribers reached if known, or void.
     */
    PublishToRoom(message: Omit<YjsRelayMessage, 'OriginInstanceID'>): Promise<number | void>;

    /**
     * Cleanly releases all active subscriptions and underlying transport resources.
     */
    Shutdown(): Promise<void>;

    /**
     * Optional probe checking if at least one peer server instance is currently subscribed
     * to `roomKey`.
     */
    HasRoomPeers?(roomKey: string): boolean | Promise<boolean>;

    /**
     * Optional single-writer distributed compaction lease (`SET NX PX` in Redis, `NW-5`).
     */
    TryAcquireCompactionLease?(roomKey: string, ttlMs: number): Promise<boolean> | boolean;

    /**
     * Releases a distributed compaction lease held by this server instance (`NW-5`).
     */
    ReleaseCompactionLease?(roomKey: string): Promise<void> | void;
}

function buildBusKey(artifactOrRoomKey: string, providerKey?: string): string {
    const raw = (artifactOrRoomKey ?? '').trim().toLowerCase();
    const normalizedProvider = (providerKey ?? '').trim().toLowerCase();
    if (!normalizedProvider || normalizedProvider === 'default' || raw.includes('::')) {
        return raw;
    }
    return `${normalizedProvider}::${raw}`;
}

/**
 * Shared in-process bus that allows multiple {@link InMemoryYjsRoomRelay} instances
 * in deterministic integration tests to simulate multi-node horizontal scaling without Redis.
 */
export class InMemoryYjsRelayBus {
    private readonly _handlersByRoom = new Map<string, Set<{ InstanceID: string; Handler: YjsRelayMessageHandler }>>();
    private readonly _compactionLeases = new Map<string, { Owner: string; ExpiresAtMs: number }>();

    public Register(
        roomKey: string,
        instanceId: string,
        handler: YjsRelayMessageHandler
    ): () => void {
        const key = buildBusKey(roomKey);
        let set = this._handlersByRoom.get(key);
        if (!set) {
            set = new Set();
            this._handlersByRoom.set(key, set);
        }
        const entry = { InstanceID: instanceId, Handler: handler };
        set.add(entry);
        return () => {
            const current = this._handlersByRoom.get(key);
            if (!current) {
                return;
            }
            current.delete(entry);
            if (current.size === 0) {
                this._handlersByRoom.delete(key);
            }
        };
    }

    public HasPeerSubscribers(roomKey: string, excludeInstanceId: string): boolean {
        const key = buildBusKey(roomKey);
        const set = this._handlersByRoom.get(key);
        if (!set || set.size === 0) {
            return false;
        }
        for (const entry of set) {
            if (entry.InstanceID !== excludeInstanceId) {
                return true;
            }
        }
        return false;
    }

    public TryAcquireLease(roomKey: string, instanceId: string, ttlMs: number): boolean {
        const key = buildBusKey(roomKey);
        const now = Date.now();
        const existing = this._compactionLeases.get(key);
        if (existing && existing.ExpiresAtMs > now && existing.Owner !== instanceId) {
            return false;
        }
        this._compactionLeases.set(key, { Owner: instanceId, ExpiresAtMs: now + Math.max(100, ttlMs) });
        return true;
    }

    public ReleaseLease(roomKey: string, instanceId: string): void {
        const key = buildBusKey(roomKey);
        const existing = this._compactionLeases.get(key);
        if (existing && existing.Owner === instanceId) {
            this._compactionLeases.delete(key);
        }
    }

    public async Publish(message: YjsRelayMessage): Promise<number> {
        const key = buildBusKey(message.ArtifactID, message.ProviderKey);
        const set = this._handlersByRoom.get(key);
        if (!set || set.size === 0) {
            return 0;
        }
        let invokedCount = 0;
        for (const entry of Array.from(set)) {
            if (entry.InstanceID === message.OriginInstanceID) {
                continue;
            }
            invokedCount++;
            try {
                await entry.Handler(message);
            } catch (err) {
                LogError(
                    `InMemoryYjsRelayBus handler error on artifact '${message.ArtifactID}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }
        return invokedCount;
    }
}

/**
 * Default in-memory implementation of {@link IYjsRoomRelay} used when Redis is not configured.
 * Accepts an optional shared {@link InMemoryYjsRelayBus} for multi-node integration testing.
 */
export class InMemoryYjsRoomRelay implements IYjsRoomRelay {
    public readonly InstanceID: string;
    private readonly _bus: InMemoryYjsRelayBus;
    private readonly _unsubscribers = new Set<() => void>();

    constructor(bus?: InMemoryYjsRelayBus, instanceId?: string) {
        this.InstanceID = instanceId ?? uuidv4();
        this._bus = bus ?? new InMemoryYjsRelayBus();
    }

    public HasRoomPeers(roomKey: string): boolean {
        return this._bus.HasPeerSubscribers(roomKey, this.InstanceID);
    }

    public TryAcquireCompactionLease(roomKey: string, ttlMs: number): boolean {
        return this._bus.TryAcquireLease(roomKey, this.InstanceID, ttlMs);
    }

    public ReleaseCompactionLease(roomKey: string): void {
        this._bus.ReleaseLease(roomKey, this.InstanceID);
    }

    public async SubscribeRoom(roomKey: string, handler: YjsRelayMessageHandler): Promise<() => void> {
        const unsub = this._bus.Register(roomKey, this.InstanceID, handler);
        this._unsubscribers.add(unsub);
        return () => {
            unsub();
            this._unsubscribers.delete(unsub);
        };
    }

    public async PublishToRoom(message: Omit<YjsRelayMessage, 'OriginInstanceID'>): Promise<number> {
        return await this._bus.Publish({
            ...message,
            OriginInstanceID: this.InstanceID
        });
    }

    public async Shutdown(): Promise<void> {
        for (const unsub of this._unsubscribers) {
            unsub();
        }
        this._unsubscribers.clear();
    }
}

/**
 * Distributed single-use collaboration ticket replay store backed by Redis `SET ... PX NX` (`P0`, `NW-5`).
 */
export class RedisTicketReplayStore implements TicketReplayStore {
    private readonly _redisProvider: RedisLocalStorageProvider;

    constructor(redisProvider: RedisLocalStorageProvider) {
        this._redisProvider = redisProvider;
    }

    public async ConsumeNonce(nonce: string, ttlMs: number): Promise<boolean> {
        const client = this._redisProvider.Client;
        const safeTtlMs = Math.max(1000, Math.floor(ttlMs));
        if (client && typeof client.set === 'function') {
            const result = await client.set(`yjs:ticket:${nonce}`, '1', 'PX', safeTtlMs, 'NX');
            return result === 'OK';
        }
        return await this._redisProvider.TryAcquireLease(`yjs:ticket:${nonce}`, safeTtlMs);
    }
}

/**
 * Redis-backed implementation of {@link IYjsRoomRelay} (`O3`, `NW-5`) using
 * {@link RedisLocalStorageProvider} pub/sub, TTL ZSET peer presence (never `PUBLISH` counts),
 * and Redis single-writer compaction leases (`TryAcquireLease`/`ReleaseLease`).
 */
export class RedisYjsRoomRelay implements IYjsRoomRelay {
    public readonly InstanceID: string;
    private readonly _redisProvider: RedisLocalStorageProvider;
    private readonly _unsubscribers = new Set<() => void>();
    private readonly _subscribedChannelCounts = new Map<string, number>();
    private readonly _presenceTimers = new Map<string, ReturnType<typeof setInterval>>();

    constructor(redisProvider: RedisLocalStorageProvider, instanceId?: string) {
        this.InstanceID = instanceId ?? uuidv4();
        this._redisProvider = redisProvider;
    }

    private static channelForRoomKey(roomKey: string): string {
        return `yjs:room:${roomKey.trim().toLowerCase()}`;
    }

    private static peersKeyForRoomKey(roomKey: string): string {
        return `yjs:peers:${roomKey.trim().toLowerCase()}`;
    }

    private async upsertSelfPresence(peersKey: string): Promise<void> {
        const client = this._redisProvider.Client;
        if (!client || typeof client.zadd !== 'function') {
            return;
        }
        const now = Date.now();
        try {
            await client.zremrangebyscore(peersKey, 0, now - 1);
            await client.zadd(peersKey, now + PEER_PRESENCE_TTL_MS, this.InstanceID);
            await client.pexpire(peersKey, PEER_PRESENCE_KEY_TTL_MS);
        } catch (err) {
            LogError(`RedisYjsRoomRelay presence heartbeat failed on '${peersKey}': ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async removeSelfPresence(peersKey: string): Promise<void> {
        const client = this._redisProvider.Client;
        if (!client || typeof client.zrem !== 'function') {
            return;
        }
        try {
            await client.zrem(peersKey, this.InstanceID);
        } catch {
            // Ignore cleanup failure
        }
    }

    public async HasRoomPeers(roomKey: string): Promise<boolean> {
        const peersKey = RedisYjsRoomRelay.peersKeyForRoomKey(roomKey);
        const client = this._redisProvider.Client;
        if (client && typeof client.zrange === 'function' && typeof client.zremrangebyscore === 'function') {
            try {
                await client.zremrangebyscore(peersKey, 0, Date.now() - 1);
                const activeMembers = await client.zrange(peersKey, 0, -1);
                return activeMembers.some((member) => member !== this.InstanceID);
            } catch (err) {
                LogError(`RedisYjsRoomRelay.HasRoomPeers error on '${peersKey}': ${err instanceof Error ? err.message : String(err)}`);
                return false;
            }
        }
        return false;
    }

    public async TryAcquireCompactionLease(roomKey: string, ttlMs: number): Promise<boolean> {
        return await this._redisProvider.TryAcquireLease(`yjs:compact:${roomKey.trim().toLowerCase()}`, ttlMs);
    }

    public async ReleaseCompactionLease(roomKey: string): Promise<void> {
        await this._redisProvider.ReleaseLease(`yjs:compact:${roomKey.trim().toLowerCase()}`);
    }

    public async SubscribeRoom(roomKey: string, handler: YjsRelayMessageHandler): Promise<() => void> {
        const channel = RedisYjsRoomRelay.channelForRoomKey(roomKey);
        const peersKey = RedisYjsRoomRelay.peersKeyForRoomKey(roomKey);
        const unsub = await this._redisProvider.SubscribeToChannel(channel, async (rawPayload: string) => {
            try {
                const parsed = JSON.parse(rawPayload) as YjsRelayMessage;
                if (!parsed || parsed.OriginInstanceID === this.InstanceID) {
                    return;
                }
                if (parsed.MessageType === 'presence-ping') {
                    return;
                }
                await handler(parsed);
            } catch (err) {
                LogError(
                    `RedisYjsRoomRelay failed to process message on '${channel}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        });
        this._unsubscribers.add(unsub);
        const prevCount = this._subscribedChannelCounts.get(channel) ?? 0;
        this._subscribedChannelCounts.set(channel, prevCount + 1);
        if (prevCount === 0) {
            await this.upsertSelfPresence(peersKey);
            const timer = setInterval(() => {
                void this.upsertSelfPresence(peersKey);
            }, PEER_PRESENCE_REFRESH_MS);
            (timer as { unref?: () => void }).unref?.();
            this._presenceTimers.set(peersKey, timer);
        }

        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            const current = (this._subscribedChannelCounts.get(channel) ?? 0) - 1;
            if (current <= 0) {
                this._subscribedChannelCounts.delete(channel);
                const timer = this._presenceTimers.get(peersKey);
                if (timer) {
                    clearInterval(timer);
                    this._presenceTimers.delete(peersKey);
                }
                void this.removeSelfPresence(peersKey);
            } else {
                this._subscribedChannelCounts.set(channel, current);
            }
            this._unsubscribers.delete(unsub);
            unsub();
        };
    }

    public async PublishToRoom(message: Omit<YjsRelayMessage, 'OriginInstanceID'>): Promise<number> {
        if (!this._redisProvider.IsPubSubEnabled) {
            return 0;
        }
        const roomKey = buildBusKey(message.ArtifactID, message.ProviderKey);
        const channel = RedisYjsRoomRelay.channelForRoomKey(roomKey);
        const fullMessage: YjsRelayMessage = {
            ...message,
            OriginInstanceID: this.InstanceID
        };
        const totalSubscribers = await this._redisProvider.PublishMessageAndWait(channel, JSON.stringify(fullMessage));
        const selfSubscribed = (this._subscribedChannelCounts.get(channel) ?? 0) > 0 ? 1 : 0;
        return Math.max(0, totalSubscribers - selfSubscribed);
    }

    public async Shutdown(): Promise<void> {
        for (const [peersKey, timer] of this._presenceTimers.entries()) {
            clearInterval(timer);
            await this.removeSelfPresence(peersKey);
        }
        this._presenceTimers.clear();
        for (const unsub of this._unsubscribers) {
            unsub();
        }
        this._unsubscribers.clear();
        this._subscribedChannelCounts.clear();
    }
}
