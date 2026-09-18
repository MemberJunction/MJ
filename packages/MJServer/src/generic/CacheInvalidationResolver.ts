import { Field, ObjectType, Resolver, Root, Subscription } from 'type-graphql';

export const CACHE_INVALIDATION_TOPIC = 'CACHE_INVALIDATION';

/**
 * Entities whose rows may ride along with an invalidation event. Empty until the server entry point
 * supplies the configured list, so the default — including in any process that never configures it
 * — is to broadcast nothing.
 */
let allowedRecordDataEntities: readonly string[] = [];

/**
 * Supply the configured allowlist. Called once from the server entry point during bootstrap.
 *
 * INJECTED rather than read from `configInfo` here, deliberately. `config.ts` runs `loadConfig()` at
 * module scope, so importing it from this module would drag full config validation into every
 * import chain that touches the resolver — including unit tests, which have no server config and
 * would fail at import with "Configuration validation failed". This module deliberately imports
 * nothing but type-graphql.
 */
export function ConfigureRecordDataBroadcast(entities: readonly string[] | undefined | null): void {
  allowedRecordDataEntities = entities ?? [];
}

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
  if (allowedRecordDataEntities.length === 0) return false;
  if (allowedRecordDataEntities.includes('*')) return true;
  const name = entityName.trim().toLowerCase();
  return allowedRecordDataEntities.some((e) => e.trim().toLowerCase() === name);
}

/**
 * May the record's primary key ride along?
 *
 * On a DELETE, yes: both consumers use it to drop that one row from their caches
 * (`LocalCacheManager.parseCompositeKeyFromJSON` -> `RemoveSingleEntity`, `BaseEngine.applyRemoteDelete`),
 * and a delete carries no row content to withhold in the first place. Omitting it would force a
 * whole-entity invalidation on every delete for no privacy gain.
 *
 * On a SAVE, only when the row itself is going too. Both consumers build their key from
 * `recordData` on that path (`buildCompositeKeyFromRow`) and NEVER read `primaryKeyValues`; with the
 * row withheld they fall through to invalidating the entity's cached results either way. So a key
 * sent alongside a withheld row is read by nobody and discloses the id of a record the subscriber
 * may not be entitled to — cost without benefit. Saves are also the bulk of the traffic.
 */
export function MayBroadcastPrimaryKey(action: string, entityName: string): boolean {
  return action === 'delete' || MayBroadcastRecordData(entityName);
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
