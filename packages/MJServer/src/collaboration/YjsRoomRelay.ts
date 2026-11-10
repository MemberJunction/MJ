import { LogError } from '@memberjunction/core';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { v4 as uuidv4 } from 'uuid';

/**
 * Envelope published across server instances when a collaborative Yjs room processes
 * a document update, awareness broadcast, or permission revocation.
 */
export interface YjsRelayMessage {
    /** Target `MJ: Artifacts.ID` room identifier. */
    ArtifactID: string;
    /** Unique identifier of the MJServer instance that originated the message (used for echo suppression). */
    OriginInstanceID: string;
    /** Kind of room event being relayed. */
    MessageType:
        | 'sync-update'
        | 'awareness'
        | 'permission-revoked'
        | 'sync-request'
        | 'sync-state'
        | 'version-saved';
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
     * Subscribes to cross-instance updates for `artifactId`.
     *
     * @returns An unsubscribe function that removes the subscription.
     */
    SubscribeRoom(artifactId: string, handler: YjsRelayMessageHandler): Promise<() => void>;

    /**
     * Publishes a room event to all other subscribed server instances.
     */
    PublishToRoom(message: Omit<YjsRelayMessage, 'OriginInstanceID'>): Promise<void>;

    /**
     * Cleanly releases all active subscriptions and underlying transport resources.
     */
    Shutdown(): Promise<void>;
}

/**
 * Shared in-process bus that allows multiple {@link InMemoryYjsRoomRelay} instances
 * in deterministic integration tests to simulate multi-node horizontal scaling without Redis.
 */
export class InMemoryYjsRelayBus {
    private readonly _handlersByRoom = new Map<string, Set<{ InstanceID: string; Handler: YjsRelayMessageHandler }>>();

    public Register(
        artifactId: string,
        instanceId: string,
        handler: YjsRelayMessageHandler
    ): () => void {
        const key = artifactId.trim().toLowerCase();
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

    public async Publish(message: YjsRelayMessage): Promise<void> {
        const key = message.ArtifactID.trim().toLowerCase();
        const set = this._handlersByRoom.get(key);
        if (!set || set.size === 0) {
            return;
        }
        for (const entry of set) {
            if (entry.InstanceID === message.OriginInstanceID) {
                continue;
            }
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

    public async SubscribeRoom(artifactId: string, handler: YjsRelayMessageHandler): Promise<() => void> {
        const unsub = this._bus.Register(artifactId, this.InstanceID, handler);
        this._unsubscribers.add(unsub);
        return () => {
            unsub();
            this._unsubscribers.delete(unsub);
        };
    }

    public async PublishToRoom(message: Omit<YjsRelayMessage, 'OriginInstanceID'>): Promise<void> {
        await this._bus.Publish({
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
 * Redis-backed implementation of {@link IYjsRoomRelay} (`O3`) built on top of
 * {@link RedisLocalStorageProvider}'s native `SubscribeToChannel` and `PublishMessageAndWait` APIs.
 */
export class RedisYjsRoomRelay implements IYjsRoomRelay {
    public readonly InstanceID: string;
    private readonly _redisProvider: RedisLocalStorageProvider;
    private readonly _unsubscribers = new Set<() => void>();

    constructor(redisProvider: RedisLocalStorageProvider, instanceId?: string) {
        this.InstanceID = instanceId ?? uuidv4();
        this._redisProvider = redisProvider;
    }

    private static channelForArtifact(artifactId: string): string {
        return `yjs:room:${artifactId.trim().toLowerCase()}`;
    }

    public async SubscribeRoom(artifactId: string, handler: YjsRelayMessageHandler): Promise<() => void> {
        const channel = RedisYjsRoomRelay.channelForArtifact(artifactId);
        const unsub = await this._redisProvider.SubscribeToChannel(channel, async (rawPayload: string) => {
            try {
                const parsed = JSON.parse(rawPayload) as YjsRelayMessage;
                if (!parsed || parsed.OriginInstanceID === this.InstanceID) {
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
        return () => {
            unsub();
            this._unsubscribers.delete(unsub);
        };
    }

    public async PublishToRoom(message: Omit<YjsRelayMessage, 'OriginInstanceID'>): Promise<void> {
        if (!this._redisProvider.IsPubSubEnabled) {
            return;
        }
        const channel = RedisYjsRoomRelay.channelForArtifact(message.ArtifactID);
        const fullMessage: YjsRelayMessage = {
            ...message,
            OriginInstanceID: this.InstanceID
        };
        await this._redisProvider.PublishMessageAndWait(channel, JSON.stringify(fullMessage));
    }

    public async Shutdown(): Promise<void> {
        for (const unsub of this._unsubscribers) {
            unsub();
        }
        this._unsubscribers.clear();
    }
}
