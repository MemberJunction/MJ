import { PubSubEngine } from 'type-graphql';
import { BaseSingleton } from '@memberjunction/global';

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
     */
    public SetPubSubEngine(pubSub: PubSubEngine): void {
        this._pubSub = pubSub;
    }

    /**
     * Gets the current PubSubEngine instance, or null if not yet configured.
     */
    public get PubSubEngine(): PubSubEngine | null {
        return this._pubSub;
    }

    /**
     * Publishes a payload to the specified topic via the PubSubEngine.
     * No-op if the PubSubEngine has not been configured yet.
     */
    public Publish(topic: string, payload: Record<string, unknown>): void {
        if (this._pubSub) {
            console.log(`[PubSubManager] Publishing to topic "${topic}":`, JSON.stringify(payload).substring(0, 200));
            this._pubSub.publish(topic, payload);
        } else {
            console.warn(`[PubSubManager] Cannot publish to "${topic}" — PubSubEngine not set`);
        }
    }
}
