import { PubSubEngine } from 'type-graphql';
import { BaseSingleton } from '@memberjunction/global';
import {
    CACHE_INVALIDATION_TOPIC,
    type CacheInvalidationPayload,
} from './CacheInvalidationResolver.js';
import {
    GetSessionStatusTopic,
    PUSH_STATUS_UPDATES_TOPIC,
} from './PushStatusResolver.js';
import { CacheInvalidationBroadcastManager } from '../broadcast/index.js';

const _wrappedPubSubEngines = new WeakSet<PubSubEngine>();

/**
 * Wraps a TypeGraphQL `PubSubEngine` so that publishes to {@link PUSH_STATUS_UPDATES_TOPIC}
 * carrying a specific `sessionId` (`sessionId !== '*'`) are dynamically routed in $O(1)$ to
 * `PUSH_STATUS_UPDATES:session:<sessionId>` instead of waking every connected browser tab.
 * Wildcard (`sessionId === '*'`) updates continue to publish on {@link PUSH_STATUS_UPDATES_TOPIC}.
 */
export function CreateSessionRoutingPubSub(pubSub: PubSubEngine): PubSubEngine {
    if (!pubSub || typeof pubSub.publish !== 'function' || _wrappedPubSubEngines.has(pubSub)) {
        return pubSub;
    }
    const rawPublish = pubSub.publish.bind(pubSub);
    pubSub.publish = async (routingKey: string, payload: unknown): Promise<void> => {
        if (
            routingKey === PUSH_STATUS_UPDATES_TOPIC &&
            typeof payload === 'object' &&
            payload !== null
        ) {
            const sessionId = (payload as { sessionId?: unknown }).sessionId;
            if (typeof sessionId === 'string' && sessionId.trim().length > 0 && sessionId.trim() !== '*') {
                await rawPublish(GetSessionStatusTopic(sessionId), payload);
                return;
            }
        }
        await rawPublish(routingKey, payload);
    };
    _wrappedPubSubEngines.add(pubSub);
    return pubSub;
}

/**
 * Singleton manager that holds a reference to the type-graphql PubSubEngine,
 * allowing any server-side code (not just resolvers with @PubSub() injection)
 * to publish events to GraphQL subscriptions.
 */
export class PubSubManager extends BaseSingleton<PubSubManager> {
    private _pubSub: PubSubEngine | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): PubSubManager {
        return super.getInstance<PubSubManager>();
    }

    /**
     * Sets the PubSubEngine instance. Should be called once during server startup
     * after buildSchemaSync creates the PubSub instance.
     * Automatically installs $O(1)$ dynamic session routing for `PUSH_STATUS_UPDATES`.
     */
    public SetPubSubEngine(pubSub: PubSubEngine): void {
        this._pubSub = CreateSessionRoutingPubSub(pubSub);
    }

    /**
     * Gets the current PubSubEngine instance, or null if not yet configured.
     */
    public get PubSubEngine(): PubSubEngine | null {
        return this._pubSub;
    }

    /**
     * Publishes a payload to the specified topic via the PubSubEngine.
     * For `CACHE_INVALIDATION`, automatically stamps a monotonic sequence number and
     * records the event in the active {@link BaseCacheInvalidationBroadcastProvider}'s ring buffer.
     * No-op if the PubSubEngine has not been configured yet.
     */
    public Publish(topic: string, payload: Record<string, unknown>): void {
        if (topic === CACHE_INVALIDATION_TOPIC) {
            const provider = CacheInvalidationBroadcastManager.Instance.Provider;
            const entityName = typeof payload.entityName === 'string' ? payload.entityName : undefined;
            if (!provider.ShouldBroadcastEntity(entityName)) {
                return;
            }
            if (payload.sequence === undefined) {
                provider.RecordInvalidation(payload as unknown as CacheInvalidationPayload);
            }
        }
        if (this._pubSub) {
            this._pubSub.publish(topic, payload);
        } else {
            console.warn(`[PubSubManager] Cannot publish to "${topic}" — PubSubEngine not set`);
        }
    }
}
