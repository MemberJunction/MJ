import type { PubSubEngine } from 'type-graphql';
import { MJGlobal } from '@memberjunction/global';

/**
 * Default Redis channel carrying replicated GraphQL `@Subscription` topic payloads across MJServer replicas.
 */
export const DEFAULT_GRAPHQL_PUBSUB_FANOUT_CHANNEL = 'graphql-pubsub-fanout';
export const DefaultGraphQLPubSubFanoutChannel = DEFAULT_GRAPHQL_PUBSUB_FANOUT_CHANNEL;

/**
 * Topics with bespoke replication bridges that MUST NOT be duplicated by the generic GraphQL PubSub bridge:
 * - `'CACHE_INVALIDATION'`: replicated by `RedisStreamBroadcastProvider` / `WireSharedCacheEvents`
 * - `'PUSH_STATUS_UPDATES'` and `'PUSH_STATUS_UPDATES:session:*'`: replicated by `WirePushStatusFanOut`
 * - `'HANDOFF_OFFER'`: replicated by `wireHandoffOfferFanOut`
 * - `'REALTIME_SESSION_EVENTS'`: replicated by `wireRealtimeSessionEventFanOut`
 */
export const EXCLUDED_CLUSTER_PUBSUB_TOPICS: readonly string[] = Object.freeze([
    'CACHE_INVALIDATION',
    'PUSH_STATUS_UPDATES',
    'HANDOFF_OFFER',
    'REALTIME_SESSION_EVENTS',
]);
export const ExcludedClusterPubSubTopics = EXCLUDED_CLUSTER_PUBSUB_TOPICS;

/**
 * Returns true if `topic` is handled by a bespoke bridge or session routing and must not be
 * broadcast over the generic GraphQL PubSub fanout channel.
 */
export function IsExcludedClusterPubSubTopic(topic: string | undefined | null): boolean {
    if (!topic || typeof topic !== 'string') {
        return true;
    }
    const trimmed = topic.trim();
    if (trimmed === 'CACHE_INVALIDATION') {
        return true;
    }
    if (trimmed === 'PUSH_STATUS_UPDATES' || trimmed.startsWith('PUSH_STATUS_UPDATES:session:')) {
        return true;
    }
    if (trimmed === 'HANDOFF_OFFER') {
        return true;
    }
    if (trimmed === 'REALTIME_SESSION_EVENTS') {
        return true;
    }
    return false;
}

/**
 * Structural Redis channel transport contract required by {@link AttachRedisClusterPubSub}.
 * Implemented by `RedisLocalStorageProvider` or in-memory clustered test fakes.
 */
export interface RedisPubSubChannelTransport {
    SubscribeToChannel(channel: string, handler: (raw: string) => void): Promise<() => void>;
    PublishMessage(channel: string, message: string): void;
}

/**
 * Bridge result returned by {@link AttachRedisClusterPubSub}.
 */
export interface RedisClusterPubSubBridgeResult {
    Engine: PubSubEngine;
    Dispose: () => void;
}

/**
 * Wire envelope exchanged across Redis for cross-replica GraphQL subscriptions.
 */
export interface RedisClusterPubSubWireEnvelope {
    Topic: string;
    Payload: Parameters<PubSubEngine['publish']>[1];
    SourceProcessId: string;
}

/**
 * Optional options for {@link AttachRedisClusterPubSub}.
 */
export interface AttachRedisClusterPubSubOptions {
    ChannelName?: string;
    SourceProcessId?: string;
}

/**
 * Attaches cross-replica GraphQL `@Subscription` fan-out to a local TypeGraphQL `PubSubEngine`.
 *
 * All topics that do not already have dedicated cluster bridges (`PIPELINE_PROGRESS`,
 * `INTEGRATION_PROGRESS`, `TASK_GRAPH_FRAMES`, `REMOTE_OP_PROGRESS`, `CLIENT_TOOL_REQUEST`,
 * `SEARCH_STREAM`, `MCP_OAUTH_EVENTS`, and any custom resolvers) automatically replicate
 * across all MJServer pods over Redis channel `'graphql-pubsub-fanout'`.
 *
 * Guarantees:
 * 1. **No Self-Echo**: Messages published by this process ID are discarded upon receipt.
 * 2. **No Infinite Loops**: Inbound messages from Redis are published via `rawLocalPublish`,
 *    bypassing the wrapper so they never re-publish to Redis.
 * 3. **Fault-Tolerant Delivery**: Redis serialization or network errors are caught and logged
 *    so local GraphQL subscription delivery is never disrupted.
 */
export async function AttachRedisClusterPubSub(
    localEngine: PubSubEngine,
    transport: RedisPubSubChannelTransport,
    channelNameOrOptions?: string | AttachRedisClusterPubSubOptions
): Promise<RedisClusterPubSubBridgeResult> {
    const channelName =
        typeof channelNameOrOptions === 'string'
            ? channelNameOrOptions
            : (channelNameOrOptions?.ChannelName ?? DEFAULT_GRAPHQL_PUBSUB_FANOUT_CHANNEL);
    const sourceProcessId =
        typeof channelNameOrOptions === 'object' && channelNameOrOptions?.SourceProcessId
            ? channelNameOrOptions.SourceProcessId
            : MJGlobal.Instance.ProcessUUID;

    const rawLocalPublish = localEngine.publish.bind(localEngine);

    const unsubscribe = await transport.SubscribeToChannel(channelName, (raw: string) => {
        try {
            const envelope = JSON.parse(raw) as Partial<RedisClusterPubSubWireEnvelope>;
            if (!envelope || typeof envelope !== 'object') {
                return;
            }
            const topic = envelope.Topic;
            if (!topic || typeof topic !== 'string' || IsExcludedClusterPubSubTopic(topic)) {
                return;
            }
            const inboundSourceProcessId = envelope.SourceProcessId;
            if (inboundSourceProcessId === sourceProcessId) {
                return; // Suppress self-echo
            }
            void rawLocalPublish(topic, envelope.Payload);
        } catch {
            // Tolerate malformed wire message
        }
    });

    localEngine.publish = async (...args: Parameters<PubSubEngine['publish']>): Promise<void> => {
        const [routingKey, payload] = args;
        await rawLocalPublish(routingKey, payload);

        if (!IsExcludedClusterPubSubTopic(routingKey)) {
            try {
                const wireMsg: RedisClusterPubSubWireEnvelope = {
                    Topic: routingKey,
                    Payload: payload,
                    SourceProcessId: sourceProcessId,
                };
                transport.PublishMessage(channelName, JSON.stringify(wireMsg));
            } catch {
                // Transient Redis error must not break local GraphQL delivery
            }
        }
    };

    return {
        Engine: localEngine,
        Dispose: () => {
            if (unsubscribe) {
                try {
                    unsubscribe();
                } catch {
                    // Ignore unsubscribe errors
                }
            }
            localEngine.publish = rawLocalPublish;
        },
    };
}
