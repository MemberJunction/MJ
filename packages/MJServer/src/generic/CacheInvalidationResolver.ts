import { Ctx, Field, ObjectType, Resolver, Root, Subscription } from 'type-graphql';
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
 * nothing from MJServer itself — only type-graphql and `@memberjunction/core` (for the entity
 * permission check in the subscription filter), neither of which loads config.
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
export function CacheInvalidationFilter(data: {
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

    // A pub/sub subscription filter has no per-request provider to thread: it runs on the server's
    // own metadata, which is the one place the entity's permission rows can be answered from.
    const entity = new Metadata().EntityByName(entityName); // global-provider-ok: subscription filter — server-wide metadata, no request-scoped provider exists here
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

/** The part of a permission row and of a user this module reads, so the rule can be tested on plain objects. */
export interface ReadPermissionRow {
    RoleID: string;
    CanRead: boolean | null;
    /** `Deny` rows subtract; they never carry the read the rule looks at. */
    IsDeny?: boolean;
    Type?: string | null;
    ReadRLSFilterID: string | null;
}
export interface RoleHolder {
    UserRoles?: ReadonlyArray<{ RoleID: string }> | null;
}

/**
 * Is this user's read of the entity row-filtered? True when every read the user holds on the entity comes through a permission
 * row that carries a `ReadRLSFilterID`: there is a row-level security filter between them and the rows, so a record's key, its
 * existence and when it changed are not theirs to learn unless the row passes the filter — which a subscription filter cannot
 * evaluate per event. False when any of their read rows is unfiltered (they could read the row anyway), and false when they hold
 * no read at all (the entity-level filter has already withheld the event).
 *
 * The same in-memory match `GetUserPermisions` does, with no I/O, so it can run per subscriber per event.
 */
export function ReadIsRowFiltered(entity: { Permissions: ReadonlyArray<ReadPermissionRow> }, user: RoleHolder): boolean {
    const roles = new Set((user.UserRoles ?? []).map((role) => (role.RoleID ?? '').trim().toLowerCase()));
    let filteredReads = 0;
    for (const row of entity.Permissions) {
        if (!row.CanRead) continue;
        const isDeny = row.IsDeny ?? (row.Type ?? 'Allow').trim().toLowerCase() === 'deny';
        if (isDeny) continue;
        if (!roles.has((row.RoleID ?? '').trim().toLowerCase())) continue;
        if (!row.ReadRLSFilterID) return false;
        filteredReads += 1;
    }
    return filteredReads > 0;
}

/**
 * The event as one subscriber may see it. A subscriber whose read of the entity is row-filtered gets the entity, the action and
 * the time, and neither the key nor the row: "something in this entity changed", which the client already takes as a
 * whole-entity invalidation (a null key on `remote-invalidate`). Everyone else gets the event as published.
 */
export function ShapeCacheInvalidationEvent(
    payload: CacheInvalidationPayload,
    user: RoleHolder | undefined,
    entity: { Permissions: ReadonlyArray<ReadPermissionRow> } | null | undefined,
): CacheInvalidationNotification {
    const withholdKey = !!user && !!entity && ReadIsRowFiltered(entity, user);
    return {
        EntityName: payload.entityName,
        PrimaryKeyValues: withholdKey ? undefined : (payload.primaryKeyValues ?? undefined),
        Action: payload.action,
        SourceServerID: payload.sourceServerId,
        Timestamp: payload.timestamp,
        OriginSessionID: payload.originSessionId ?? undefined,
        RecordData: withholdKey ? undefined : (payload.recordData ?? undefined),
    };
}

/** @deprecated Use {@link CacheInvalidationFilter}. */
export function cacheInvalidationFilter(data: {
    payload: CacheInvalidationPayload;
    context: CacheInvalidationFilterContext | undefined;
}): boolean {
  return CacheInvalidationFilter(data);
}

@Resolver()
export class CacheInvalidationResolver {
    /**
     * Subscription that broadcasts cache invalidation events to connected clients, so cross-server
     * cache invalidation reaches browsers.
     *
     * Delivery is filtered only by ENTITY-level read permission (see {@link CacheInvalidationFilter}).
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
     * The key is kept for a subscriber who could read the row anyway, because consumers need it to
     * re-read the record they were told about (see `ResolveEntityEventKey` in @memberjunction/core),
     * and the coarse "something in this entity changed" forces whole-entity invalidation on the
     * hottest write paths. It is withheld, with the row, from a subscriber whose every read of the
     * entity goes through a row-level security filter ({@link ReadIsRowFiltered}): a filter the
     * subscription cannot evaluate per event stands between them and the row, so they learn only
     * that a row of the entity changed, and their caches refresh the entity as a whole. That is the
     * same in-memory role match as the entity-level filter, once more per subscriber per event.
     */
    @Subscription(() => CacheInvalidationNotification, {
        topics: CACHE_INVALIDATION_TOPIC,
        filter: (data: { payload: CacheInvalidationPayload; context: CacheInvalidationFilterContext | undefined }) =>
            CacheInvalidationFilter(data),
    })
    cacheInvalidation(  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
        @Root() payload: CacheInvalidationPayload,
        @Ctx() context: CacheInvalidationFilterContext | undefined
    ): CacheInvalidationNotification {
        const user = context?.userPayload?.userRecord as UserInfo | undefined;
        // The same server-wide metadata the filter read; an entity unknown here was delivered whole by the filter's own choice
        const entity = payload?.entityName ? new Metadata().EntityByName(payload.entityName) : null; // global-provider-ok: subscription resolver — server-wide metadata, no request-scoped provider exists here
        return ShapeCacheInvalidationEvent(payload, user, entity);
    }
}
