import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
    BaseCacheInvalidationBroadcastProvider,
    CacheBroadcastNegotiationResult,
    CacheBroadcastProviderConfig,
    CacheInvalidationBroadcastTopology,
    CacheInvalidationCatchUpResponse,
} from '../BaseCacheInvalidationBroadcastProvider.js';
import {
    CACHE_INVALIDATION_TOPIC,
    type CacheInvalidationPayload,
} from '../../generic/CacheInvalidationResolver.js';
import { PubSubManager } from '../../generic/PubSubManager.js';

/**
 * Structural transport contract required by {@link RedisStreamBroadcastProvider}.
 * Satisfied by `RedisLocalStorageProvider` from `@memberjunction/redis-provider`
 * or by custom clustered test fakes.
 */
export interface RedisStreamTransport {
    SubscribeToChannel(channel: string, handler: (raw: string) => void): Promise<() => void>;
    PublishMessage(channel: string, message: string): void;
    KeyPrefix?: string;
    EnsureClusterEpochId?(epochKeySuffix?: string): Promise<string>;
    AppendSequencedStreamEntry?(
        seqKeySuffix: string,
        streamKeySuffix: string,
        maxLen: number,
        payloadJson: string
    ): Promise<number>;
    ReadSequencedStreamSince?(
        streamKeySuffix: string,
        sinceSequence: number,
        maxCount?: number
    ): Promise<{ CurrentSequence: number; Entries: Array<{ Sequence: number; PayloadJson: string }> }>;
}

/**
 * Envelope exchanged across Redis pub/sub channels between MJServer replicas.
 */
export interface RedisStreamBroadcastWireMessage {
    Sequence: number;
    SourceProcessId: string;
    Payload: string;
}

/**
 * Clustered cache invalidation broadcast provider backed by Redis Streams (`'RedisStream'`).
 *
 * Implements:
 * 1. **Cluster-Wide Monotonic Sequence**: Stamped via atomic Redis counter (`INCR`) and appended
 *    to a capped Redis Stream (`XADD MAXLEN ~5000`) so all replicas share a single sequence timeline.
 * 2. **Shared Server Process ID**: Derives a cluster epoch ID from Redis (`redis-stream:<epoch>`),
 *    guaranteeing that round-robin load balancers never flip `X-MJ-Server-ID` between replicas.
 * 3. **Cross-Replica Replay & Delta Catch-Up**: Replicas stream live deltas over Redis pub/sub,
 *    and cold-booted or lagging replicas catch up directly from Redis Stream (`XRANGE`).
 */
@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'RedisStream')
export class RedisStreamBroadcastProvider extends BaseCacheInvalidationBroadcastProvider {
    private _transport: RedisStreamTransport | null = null;
    private _clusterServerProcessId: string | null = null;
    private _streamKeySuffix = 'cache-invalidation-stream';
    private _seqKeySuffix = 'cache-invalidation-seq';
    private _epochKeySuffix = 'cluster-epoch-id';
    private _channelName = 'cache-invalidation-stream';
    private _unsubscribeChannel: (() => void) | undefined;
    private _localPubSubDeliverer: ((sequenced: CacheInvalidationPayload) => void) | null = null;
    private _localProcessId: string = MJGlobal.Instance.ProcessUUID;

    public override get Topology(): CacheInvalidationBroadcastTopology {
        return 'RedisStream';
    }

    /**
     * Local process identifier used for self-echo suppression on inbound Redis broadcasts.
     */
    public get LocalProcessID(): string {
        return this._localProcessId;
    }

    /**
     * Overrides the local process identifier. Used in unit tests simulating multiple replicas
     * within a single Node.js process.
     */
    public SetLocalProcessIDForTesting(id: string): void {
        this._localProcessId = id;
    }

    /**
     * Sets the local pub/sub deliverer callback responsible for delivering sequenced invalidations
     * to local WebSocket subscribers.
     */
    public SetLocalPubSubDeliverer(deliverer: (sequenced: CacheInvalidationPayload) => void): void {
        this._localPubSubDeliverer = deliverer;
    }

    /**
     * Clustered process ID shared across all server replicas bound to the same Redis instance (`X-MJ-Server-ID`).
     * Falls back to local UUID until {@link BindTransport} binds to Redis.
     */
    public override get ServerProcessID(): string {
        return this._clusterServerProcessId ?? super.ServerProcessID;
    }

    public override Configure(config?: CacheBroadcastProviderConfig): void {
        super.Configure(config);
        if (config?.redisStream) {
            if (config.redisStream.streamKeySuffix) {
                this._streamKeySuffix = config.redisStream.streamKeySuffix;
            }
            if (config.redisStream.seqKeySuffix) {
                this._seqKeySuffix = config.redisStream.seqKeySuffix;
            }
            if (config.redisStream.epochKeySuffix) {
                this._epochKeySuffix = config.redisStream.epochKeySuffix;
            }
            if (config.redisStream.channelName) {
                this._channelName = config.redisStream.channelName;
            }
        }
    }

    /**
     * Binds this provider to a Redis transport instance.
     * Establishes the cluster process ID, hydrates recent stream events, and subscribes to peer broadcasts.
     */
    public async BindTransport(transport: RedisStreamTransport): Promise<void> {
        this._transport = transport;
        const epochId = transport.EnsureClusterEpochId
            ? await transport.EnsureClusterEpochId(this._epochKeySuffix)
            : (transport.KeyPrefix ?? 'mj');
        this._clusterServerProcessId = `redis-stream:${epochId}`;

        if (transport.ReadSequencedStreamSince) {
            try {
                const res = await transport.ReadSequencedStreamSince(this._streamKeySuffix, 0, this.MaxRingBufferSize);
                if (res) {
                    for (const entry of res.Entries) {
                        const payload = this.DeserializePayload(entry.PayloadJson);
                        if (payload) {
                            this.RecordSequencedInvalidation(entry.Sequence, payload, false);
                        }
                    }
                    if (res.CurrentSequence > this.CurrentSequence) {
                        this.AdvanceCurrentSequence(res.CurrentSequence);
                    }
                }
            } catch {
                // Tolerate transport hydration failure during startup
            }
        }

        this._unsubscribeChannel = await transport.SubscribeToChannel(
            this._channelName,
            (raw: string) => {
                this.handleInboundPeerMessage(raw);
            }
        );
    }

    /**
     * Serializes a payload to JSON, converting `Date` instances to ISO strings.
     */
    public SerializePayload(payload: CacheInvalidationPayload): string {
        return JSON.stringify({
            entityName: payload.entityName,
            primaryKeyValues: payload.primaryKeyValues,
            action: payload.action,
            sourceServerId: payload.sourceServerId,
            timestamp: payload.timestamp instanceof Date ? payload.timestamp.toISOString() : payload.timestamp,
            originSessionId: payload.originSessionId,
            recordData: payload.recordData,
            sequence: payload.sequence,
        });
    }

    /**
     * Deserializes an inbound payload from JSON, parsing ISO strings back to `Date` objects.
     */
    public DeserializePayload(raw: string): CacheInvalidationPayload | null {
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            return {
                entityName: String(parsed.entityName ?? ''),
                primaryKeyValues:
                    parsed.primaryKeyValues !== undefined && parsed.primaryKeyValues !== null
                        ? String(parsed.primaryKeyValues)
                        : null,
                action: String(parsed.action ?? ''),
                sourceServerId: String(parsed.sourceServerId ?? ''),
                timestamp: parsed.timestamp ? new Date(String(parsed.timestamp)) : new Date(),
                originSessionId: parsed.originSessionId !== undefined ? String(parsed.originSessionId) : undefined,
                recordData: parsed.recordData !== undefined ? String(parsed.recordData) : undefined,
                sequence: typeof parsed.sequence === 'number' ? parsed.sequence : undefined,
            };
        } catch {
            return null;
        }
    }

    /**
     * Publishes a cluster-wide cache invalidation event:
     * 1. Obtains an atomic cluster sequence from Redis.
     * 2. Records the sequenced event into the local circular ring buffer.
     * 3. Delivers to local WebSocket clients via `deliverLocalPubSub`.
     * 4. Broadcasts to peer replicas via Redis pub/sub.
     */
    public override async PublishClusterInvalidation(
        payload: CacheInvalidationPayload,
        deliverLocalPubSub: (sequenced: CacheInvalidationPayload) => void
    ): Promise<void> {
        this._localPubSubDeliverer = deliverLocalPubSub;

        let seq: number;
        const serializedPayload = this.SerializePayload(payload);
        if (this._transport?.AppendSequencedStreamEntry) {
            try {
                seq = await this._transport.AppendSequencedStreamEntry(
                    this._seqKeySuffix,
                    this._streamKeySuffix,
                    this.MaxRingBufferSize,
                    serializedPayload
                );
            } catch {
                seq = this.CurrentSequence + 1;
            }
        } else {
            seq = this.CurrentSequence + 1;
        }

        this.RecordSequencedInvalidation(seq, payload, false);
        deliverLocalPubSub(payload);

        if (this._transport) {
            const wireMsg: RedisStreamBroadcastWireMessage = {
                Sequence: seq,
                SourceProcessId: this._localProcessId,
                Payload: serializedPayload,
            };
            this._transport.PublishMessage(this._channelName, JSON.stringify(wireMsg));
        }

        void this.OnInvalidationRecorded(payload);
    }

    /**
     * Catches up invalidation events strictly after `sinceSequence`.
     * Satisfies queries from the local ring buffer when possible, querying the shared
     * Redis Stream when the local buffer has not seen `sinceSequence` or the cluster is ahead.
     */
    public override async GetChangesSinceAsync(
        sinceSequence: number,
        user: UserInfo | undefined
    ): Promise<CacheInvalidationCatchUpResponse> {
        if (!user) {
            return {
                RequiresFullRefresh: true,
                CurrentSequence: this.CurrentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        if (sinceSequence < 0) {
            return {
                RequiresFullRefresh: true,
                CurrentSequence: this.CurrentSequence,
                ServerProcessID: this.ServerProcessID,
                Events: [],
            };
        }

        const localOldest = this.OldestRingBufferSequence;
        const localCovers =
            this.BufferedEventCount > 0 &&
            localOldest !== null &&
            sinceSequence >= localOldest - 1 &&
            sinceSequence < this.CurrentSequence;

        if (this._transport?.ReadSequencedStreamSince && (!localCovers || sinceSequence >= this.CurrentSequence)) {
            try {
                const streamResult = await this._transport.ReadSequencedStreamSince(
                    this._streamKeySuffix,
                    sinceSequence,
                    this.MaxRingBufferSize
                );
                if (streamResult) {
                    const clusterSeq = Math.max(this.CurrentSequence, streamResult.CurrentSequence);
                    this.AdvanceCurrentSequence(clusterSeq);

                    if (sinceSequence > clusterSeq) {
                        return {
                            RequiresFullRefresh: true,
                            CurrentSequence: clusterSeq,
                            ServerProcessID: this.ServerProcessID,
                            Events: [],
                        };
                    }

                    if (sinceSequence === clusterSeq) {
                        return {
                            RequiresFullRefresh: false,
                            CurrentSequence: clusterSeq,
                            ServerProcessID: this.ServerProcessID,
                            Events: [],
                        };
                    }

                    if (streamResult.Entries.length > 0 && sinceSequence < streamResult.Entries[0].Sequence - 1) {
                        return {
                            RequiresFullRefresh: true,
                            CurrentSequence: clusterSeq,
                            ServerProcessID: this.ServerProcessID,
                            Events: [],
                        };
                    }

                    if (streamResult.Entries.length === 0 && sinceSequence < clusterSeq) {
                        return {
                            RequiresFullRefresh: true,
                            CurrentSequence: clusterSeq,
                            ServerProcessID: this.ServerProcessID,
                            Events: [],
                        };
                    }

                    const streamEntries: Array<{ Sequence: number; Payload: CacheInvalidationPayload }> = [];
                    for (const entry of streamResult.Entries) {
                        const payload = this.DeserializePayload(entry.PayloadJson);
                        if (payload) {
                            this.RecordSequencedInvalidation(entry.Sequence, payload, false);
                            streamEntries.push({ Sequence: entry.Sequence, Payload: payload });
                        }
                    }
                    return this.BuildCatchUpResponseFromPayloads(sinceSequence, clusterSeq, streamEntries, user);
                }
            } catch {
                // Fall back to local ring buffer
            }
        }

        return this.GetChangesSince(sinceSequence, user);
    }

    public override async NegotiateClientConnection(
        user: UserInfo,
        defaultGraphQLWsUrl = '/graphql'
    ): Promise<CacheBroadcastNegotiationResult> {
        const fingerprint = this.GetRoleFingerprint(user);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        return {
            Provider: this.Topology,
            Url: defaultGraphQLWsUrl,
            Groups: [fingerprint],
            ExpiresAt: expiresAt,
            ServerProcessID: this.ServerProcessID,
            CurrentSequence: this.CurrentSequence,
        };
    }

    protected override async OnInvalidationRecorded(_payload: CacheInvalidationPayload): Promise<void> {
        // No-op for RedisStream: distribution occurs through Redis Pub/Sub channel
    }

    /**
     * Unsubscribes from the Redis broadcast channel.
     */
    public Dispose(): void {
        if (this._unsubscribeChannel) {
            try {
                this._unsubscribeChannel();
            } catch {
                // Ignore cleanup errors
            }
            this._unsubscribeChannel = undefined;
        }
    }

    private handleInboundPeerMessage(raw: string): void {
        try {
            const msg = JSON.parse(raw) as {
                Sequence?: unknown;
                SourceProcessId?: unknown;
                Payload?: unknown;
            };
            if (!msg || typeof msg !== 'object') {
                return;
            }
            const sourceProcessId = typeof msg.SourceProcessId === 'string' ? msg.SourceProcessId : '';
            if (sourceProcessId === this._localProcessId) {
                return; // Suppress self-echo
            }
            const seq = typeof msg.Sequence === 'number' ? msg.Sequence : 0;
            let payload: CacheInvalidationPayload | null = null;
            if (typeof msg.Payload === 'string') {
                payload = this.DeserializePayload(msg.Payload);
            } else if (msg.Payload && typeof msg.Payload === 'object') {
                payload = this.DeserializePayload(JSON.stringify(msg.Payload));
            }
            if (!payload) {
                return;
            }

            this.RecordSequencedInvalidation(seq, payload, false);
            if (this._localPubSubDeliverer) {
                this._localPubSubDeliverer(payload);
            } else {
                PubSubManager.Instance.PubSubEngine?.publish(CACHE_INVALIDATION_TOPIC, payload);
            }
        } catch {
            // Ignore malformed wire messages
        }
    }
}
