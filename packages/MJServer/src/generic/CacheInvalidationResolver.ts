import { Field, ObjectType, Resolver, Root, Subscription } from 'type-graphql';
import { Metadata, UserInfo } from '@memberjunction/core';

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
  // Normalised HERE, once, rather than at each comparison. The wildcard used to be matched raw
  // (`includes('*')`) while entity names were trimmed and lowercased two lines below, so a
  // hand-edited `[' * ']` matched neither branch and silently opted nothing in — a config that
  // looks like it disables the gate while leaving it fully on. Empty entries are dropped so a
  // stray `''` cannot match an entity whose name is somehow blank.
  allowedRecordDataEntities = (entities ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/**
 * May the full row of `entityName` be broadcast alongside its cache-invalidation event?
 *
 * The subscription below is filtered only by ENTITY-level read permission, so anything included
 * here is disclosed to every signed-in session that may read the entity at all — regardless of
 * row-level security or any tenant scoping a consumer applies on the read path, neither of which
 * this push traverses. The answer is therefore NO unless a deployment has explicitly opted the
 * entity in via `cacheSettings.recordDataBroadcastEntities`.
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
  return allowedRecordDataEntities.includes(entityName.trim().toLowerCase());
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

/**
 * What the subscription filter needs off the WS connection.
 *
 * Declared structurally rather than importing MJServer's `UserPayload`, which reaches `types.ts`
 * and through it `auth/index.js` and config. Keeping this module's imports minimal is not fussiness
 * — importing `configInfo` here is what previously broke every unit test that touched the resolver,
 * and the import-surface test in this package exists to keep it that way.
 */
export interface CacheInvalidationFilterContext {
    userPayload?: { userRecord?: unknown };
}

/**
 * Should this subscriber hear about this event at all?
 *
 * Entity-level narrowing, raised in review: an event for an entity a session has no read
 * permission on tells that session the record exists, its stable key, and when it changed — and
 * the session could never have read it anyway, so nothing is lost by withholding it. This is a
 * monotonic reduction in disclosure that needs no tenancy model, which is why it is here and the
 * row-level question is not.
 *
 * What it does NOT close: two sessions that both hold read permission on an entity still see each
 * other's keys, because what separates them is row-level. That predicate is tracked separately —
 * see the class docblock below.
 *
 * `GetUserPermisions` is an in-memory match of the entity's permission rows against the user's
 * roles, so this stays cheap enough to run per subscriber per event. It is not free: it runs for
 * every connected socket on every save, so keep it free of I/O.
 */
export function cacheInvalidationFilter(data: {
    payload: CacheInvalidationPayload;
    context: CacheInvalidationFilterContext | undefined;
}): boolean {
    const user = data.context?.userPayload?.userRecord as UserInfo | undefined;
    // FAIL CLOSED on identity, matching `statusUpdatesFilter`. `onConnect` rejects a socket whose
    // token does not validate, so a subscriber with no user record should not exist; if one does,
    // it is the case least deserving of an unfiltered firehose.
    if (!user) {
        return false;
    }

    const entityName = data.payload?.entityName;
    if (!entityName) {
        return false;
    }

    const entity = new Metadata().Entities.find((e) => e.Name === entityName);
    // DELIVER when the entity is unknown here, deliberately — the opposite of the choice above.
    // A name absent from metadata cannot be permission-checked, and withholding would silently
    // stop invalidating a legitimately cacheable entity, which is a correctness bug rather than a
    // disclosure one. All it discloses is the name and key of something this server cannot
    // describe.
    if (!entity) {
        return true;
    }

    return entity.GetUserPermisions(user).CanRead;
}

@Resolver()
export class CacheInvalidationResolver {
    /**
     * Subscription that broadcasts cache invalidation events to connected clients, so cross-server
     * cache invalidation reaches browsers.
     *
     * Delivery is filtered only by ENTITY-level read permission (see {@link cacheInvalidationFilter}).
     * Every session that may read an entity at all still receives every event for it, from every
     * other session and tenant.
     *
     * Because that narrowing stops well short of row level, `RecordData` is only populated for entities a
     * deployment has opted in through `cacheSettings.recordDataBroadcastEntities` — see
     * {@link MayBroadcastRecordData}, applied at both publish sites.
     *
     * `EntityName`, `PrimaryKeyValues`, `Action` and `Timestamp` ARE still broadcast to every
     * session, and that is a disclosure, not a safe residue. An earlier version of this comment
     * called them "safe to broadcast" on the grounds that reading the record still goes through
     * the access-controlled path — true of the row's CONTENTS, and beside the point for the
     * metadata itself. A session with no relationship to a record still learns that it exists,
     * its stable key, and every time it changes; across entities it learns the cadence and volume
     * of another tenant's activity.
     *
     * The key is kept deliberately, because consumers need it to re-read the record they were
     * told about (see `ResolveEntityEventKey` in @memberjunction/core) and because the alternative
     * — a coarse "something in this entity changed" — forces whole-entity invalidation on the
     * hottest write paths. That is a trade, not an absence of cost. Narrowing it means filtering
     * delivery per subscriber, which needs an authorization predicate cheap enough to run per
     * subscriber per event; entity-level permissions (`EntityInfo.GetUserPermisions`, an in-memory
     * role match) would cover part of it, row-level tenancy would not.
     */
    @Subscription(() => CacheInvalidationNotification, {
        topics: CACHE_INVALIDATION_TOPIC,
        filter: (data: { payload: CacheInvalidationPayload; context: CacheInvalidationFilterContext | undefined }) =>
            cacheInvalidationFilter(data),
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
