import 'reflect-metadata';
import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver, Root, Subscription } from 'type-graphql';
import { Metadata, UserInfo } from '@memberjunction/core';
import {
    CacheInvalidationBroadcastManager,
} from '../broadcast/index.js';

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

    @Field(() => Int, { nullable: true })
    Sequence?: number;
}

@ObjectType()
export class CacheInvalidationCatchUpResult {
    @Field(() => Boolean)
    RequiresFullRefresh!: boolean;

    @Field(() => Int)
    CurrentSequence!: number;

    @Field(() => String)
    ServerProcessID!: string;

    @Field(() => [CacheInvalidationNotification])
    Events!: CacheInvalidationNotification[];
}

@ObjectType()
export class CacheBroadcastConnectionToken {
    @Field(() => String)
    Provider!: string;

    @Field(() => String)
    Url!: string;

    @Field(() => String, { nullable: true })
    Token?: string;

    @Field(() => [String])
    Groups!: string[];

    @Field(() => String)
    ExpiresAt!: string;

    @Field(() => String)
    ServerProcessID!: string;

    @Field(() => Int)
    CurrentSequence!: number;
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
    sequence?: number;
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
 * roles, memoized per `(payload, entityName, roleFingerprint)` by the active
 * {@link BaseCacheInvalidationBroadcastProvider} so $N$ connected subscribers sharing $R$ role
 * combinations only run `GetUserPermisions` $R$ times per event.
 */
export function CacheInvalidationFilter(data: {
    payload: CacheInvalidationPayload;
    context: CacheInvalidationFilterContext | undefined;
}): boolean {
    const user = data.context?.userPayload?.userRecord as UserInfo | undefined;
    if (!user) {
        return false;
    }
    return CacheInvalidationBroadcastManager.Instance.Provider.EvaluateEntityReadAccess(
        data.payload,
        user,
        (entityName) => new Metadata().EntityByName(entityName) // global-provider-ok: subscription filter — server-wide metadata, no request-scoped provider exists here
    );
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
    return CacheInvalidationBroadcastManager.Instance.Provider.ReadIsRowFiltered(entity, user);
}

/**
 * The event as one subscriber may see it. A subscriber whose read of the entity is row-filtered gets the entity, the action and
 * the time, and neither the key nor the row: "something in this entity changed", which the client already takes as a
 * whole-entity invalidation (a null key on `remote-invalidate`). Everyone else gets the event as published.
 *
 * Memoized per `(payload, entity, roleFingerprint)` via the active broadcast provider so $N$ subscribers
 * sharing $R$ role buckets only allocate and evaluate `ReadIsRowFiltered` $R$ times per event.
 */
export function ShapeCacheInvalidationEvent(
    payload: CacheInvalidationPayload,
    user: RoleHolder | undefined,
    entity: { Permissions: ReadonlyArray<ReadPermissionRow> } | null | undefined,
): CacheInvalidationNotification {
    return CacheInvalidationBroadcastManager.Instance.Provider.ShapeEventForSubscriber(payload, user, entity);
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
     * Delivery is filtered by ENTITY-level read permission (see {@link CacheInvalidationFilter})
     * and shaped per role-fingerprint bucket (see {@link ShapeCacheInvalidationEvent}).
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
        const provider = CacheInvalidationBroadcastManager.Instance.Provider;
        const entity = payload?.entityName ? provider.ResolveEntityForPayload(payload) : null;
        return provider.ShapeEventForSubscriber(payload, user, entity);
    }

    /**
     * Returns all permission-allowed, RLS-shaped cache invalidation events strictly after
     * `sinceSequence` from the server's bounded circular ring buffer.
     *
     * Invoked by `GraphQLDataProvider` when an HTTP response's `X-MJ-Cache-Seq` header or a
     * WebSocket reconnect reveals missed invalidation sequence numbers.
     */
    @Query(() => CacheInvalidationCatchUpResult)
    GetCacheInvalidationsSince(
        @Arg('sinceSequence', () => Int) sinceSequence: number,
        @Ctx() context: CacheInvalidationFilterContext | undefined
    ): CacheInvalidationCatchUpResult {
        const user = context?.userPayload?.userRecord as UserInfo | undefined;
        return CacheInvalidationBroadcastManager.Instance.Provider.GetChangesSince(sinceSequence, user);
    }

    /**
     * Negotiates a client broadcast connection (URL, signed token, and authorized role-bucket groups)
     * for the active {@link BaseCacheInvalidationBroadcastProvider}.
     */
    @Query(() => CacheBroadcastConnectionToken)
    async NegotiateCacheBroadcastConnection(
        @Ctx() context: CacheInvalidationFilterContext | undefined
    ): Promise<CacheBroadcastConnectionToken> {
        const user = context?.userPayload?.userRecord as UserInfo | undefined;
        if (!user) {
            throw new Error('Authentication required to negotiate cache broadcast connection.');
        }
        return CacheInvalidationBroadcastManager.Instance.Provider.NegotiateClientConnection(user);
    }
}
