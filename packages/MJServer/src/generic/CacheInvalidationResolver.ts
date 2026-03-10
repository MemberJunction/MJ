import { Field, ObjectType, Resolver, Root, Subscription } from 'type-graphql';

export const CACHE_INVALIDATION_TOPIC = 'CACHE_INVALIDATION';

@ObjectType()
export class CacheInvalidationNotification {
    @Field(() => String)
    EntityName!: string;

    @Field(() => String, { nullable: true })
    PrimaryKeyValues?: string;

    @Field(() => String)
    Action!: string;

    @Field(() => String)
    SourceServerID!: string;

    @Field(() => Date)
    Timestamp!: Date;

    @Field(() => String, { nullable: true })
    OriginSessionID?: string;

    @Field(() => String, { nullable: true })
    RecordData?: string;
}

/**
 * Payload interface for publishing cache invalidation events.
 * Used by PubSubManager.Publish() to send events from Redis callbacks.
 */
export interface CacheInvalidationPayload {
    entityName: string;
    primaryKeyValues: string | null;
    action: string;
    sourceServerId: string;
    timestamp: Date;
    originSessionId?: string;
    recordData?: string;
}

@Resolver()
export class CacheInvalidationResolver {
    /**
     * Subscription that broadcasts cache invalidation events to ALL connected clients.
     * No session filter — every browser connected via WebSocket receives every event.
     * This enables cross-server cache invalidation to propagate to browser clients.
     */
    @Subscription(() => CacheInvalidationNotification, {
        topics: CACHE_INVALIDATION_TOPIC,
    })
    cacheInvalidation(
        @Root() payload: CacheInvalidationPayload
    ): CacheInvalidationNotification {
        return {
            EntityName: payload.entityName,
            PrimaryKeyValues: payload.primaryKeyValues ?? undefined,
            Action: payload.action,
            SourceServerID: payload.sourceServerId,
            Timestamp: payload.timestamp,
            OriginSessionID: payload.originSessionId ?? undefined,
            RecordData: payload.recordData ?? undefined,
        };
    }
}
