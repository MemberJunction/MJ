import { Field, ObjectType, Resolver, Root, Subscription } from 'type-graphql';
import { configInfo } from '../config.js';

export const CACHE_INVALIDATION_TOPIC = 'CACHE_INVALIDATION';

/**
 * May the full row of `entityName` be broadcast alongside its cache-invalidation event?
 *
 * The subscription below reaches EVERY connected client with no per-user filter, so anything
 * included here is disclosed to every signed-in session regardless of row-level security or any
 * tenant scoping a consumer applies on the read path. The answer is therefore NO unless a
 * deployment has explicitly opted the entity in via `cacheSettings.recordDataBroadcastEntities`.
 *
 * Callers that get `false` simply omit `recordData`; the event still carries the entity name and
 * primary key, so clients evict and re-fetch through the normal access-controlled read path.
 *
 * Matching is exact (trimmed, case-insensitive) rather than substring: a loose match would let an
 * allowlisted name drag in every entity whose name contains it.
 */
export function MayBroadcastRecordData(entityName: string): boolean {
  const allowed = configInfo?.cacheSettings?.recordDataBroadcastEntities ?? [];
  if (allowed.length === 0) return false;
  if (allowed.includes('*')) return true;
  const name = entityName.trim().toLowerCase();
  return allowed.some((e) => e.trim().toLowerCase() === name);
}

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
     *
     * Because delivery is unfiltered, `RecordData` is only ever populated for entities a
     * deployment has opted in through `cacheSettings.recordDataBroadcastEntities` — see
     * {@link MayBroadcastRecordData}, applied at both publish sites. EntityName / PrimaryKeyValues
     * are safe to broadcast: they let a client evict, and reading the record still goes through
     * the normal access-controlled path.
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
