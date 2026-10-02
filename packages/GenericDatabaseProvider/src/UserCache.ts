import {
    BaseEntity, CacheCategory, CacheChangedEvent, LocalCacheManager, LogError, LogStatusEx, LogWarning, UserInfo,
    type BaseEntityEvent, type DatabaseProviderBase,
} from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IsSystemUser, SystemUserID } from './systemUser.js';

/**
 * Shape of a single row returned from `vwUsers`. Only `ID` is read directly here — the rest of the
 * columns are handed to `UserInfo` verbatim, which maps them onto its own strongly-typed properties.
 */
type UserRow = Record<string, unknown> & { ID: string };

/**
 * Shape of a single row returned from `vwUserRoles`. Only `UserID` is read directly here.
 */
type UserRoleRow = Record<string, unknown> & { UserID: string };

/** What the database reports for the two views this cache is built from. */
interface UserDatabaseStamp {
    UserCount: number;
    RoleCount: number;
    MaxUpdatedAt: string;
}

/**
 * Key this cache writes to the shared store to tell other processes that users changed. It lives in
 * the default category, which MJAPI publishes as a key-only notice (see `MJServer/src/sharedCache.ts`),
 * so a change costs one small message per server rather than a payload.
 */
export const USER_CACHE_STAMP_KEY = '__MJ_UserCache_Stamp__';

/** The entities this cache is built from; a save or delete of either makes it stale. */
const USERS_ENTITY = 'MJ: Users';
const USER_ROLES_ENTITY = 'MJ: User Roles';
const USER_ENTITY_NAMES: ReadonlySet<string> = new Set([USERS_ENTITY.toLowerCase(), USER_ROLES_ENTITY.toLowerCase()]);

/**
 * Server side cache of users and their roles.
 *
 * Dialect-neutral: {@link UserCache.Refresh} takes a {@link DatabaseProviderBase} and reads through
 * `ExecuteSQL` / `QuoteSchemaAndView`, so SQL Server and PostgreSQL processes share one
 * implementation rather than each hand-rolling a `vwUsers` + `vwUserRoles` load.
 *
 * **Staying current.** This cache used to be refreshed only by whichever process happened
 * to call {@link Refresh}, so a user created on one server was invisible to every other server until
 * it restarted — and consumers read a miss as "no such user" (a new organization's first API key was
 * rejected as "invalid or expired" until the next restart). It now keeps itself current:
 * 1. **Local writes.** It listens for `MJ: Users` / `MJ: User Roles` save and delete events and
 *    refreshes, so the process that made the change no longer has to remember to.
 * 2. **Other processes.** After refreshing for a local write it writes {@link USER_CACHE_STAMP_KEY}
 *    to the shared store; every other server hears the notice and refreshes. A tool that clears the
 *    shared cache (`mj sync push`, `mj codegen`, `mj migrate`) also makes servers refresh.
 * 3. **Everything else.** {@link RefreshIfChangedInDatabase} compares two counts and a timestamp
 *    with the database and reloads only when they differ, for writers that bypass both paths (raw
 *    SQL, another application). MJAPI runs it on the engine-sweep interval.
 * 4. **A miss is not a negative fact.** {@link FindUser} falls back to an authoritative single-row
 *    read, so a user this process has not heard about yet is found rather than denied.
 *
 * Uses BaseSingleton to guarantee a single instance across the entire process,
 * even if bundlers duplicate this module across multiple execution paths.
 *
 * NOTE: the class name `UserCache` is load-bearing — `BaseSingleton` keys its global store on the
 * constructor name, so renaming it would hand every existing holder a second, empty instance.
 */
export class UserCache extends BaseSingleton<UserCache> {
    /**
     * Defaults to an empty array so that a `Refresh` that never ran — or one that failed and was
     * swallowed into `LogError` below — yields an empty cache rather than a `TypeError` off
     * `.find()`. Callers already treat a missing system user as `undefined`.
     */
    private _users: UserInfo[] = [];

    /** The provider the last {@link Refresh} read through; every self-refresh reuses it. */
    private _provider: DatabaseProviderBase | null = null;

    /** Event subscriptions are made once per process. */
    private _wired: boolean = false;
    private _unsubscribeCacheEvents: (() => void) | null = null;

    private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
    /** Consecutive windows the pending reload has waited for an open transaction. */
    private _transactionWaits: number = 0;
    /**
     * The providers that raised the pending changes, so the reload waits for THEIR transactions.
     * MJServer builds a provider per request, and a resolver's save runs on that one — not on the
     * process-wide provider this cache reads through, whose depth is always 0. Waiting on the
     * wrong provider is the same as not waiting at all.
     */
    private readonly _pendingWriters = new Set<DatabaseProviderBase>();
    /**
     * Whether the pending reload has a change of OUR OWN to announce. Sticky, because a local
     * change and an incoming peer notice collapse into one reload: carrying the intent on the timer
     * meant whichever event scheduled last decided it, so a peer notice landing inside the debounce
     * window demoted a local write to "someone else's change" and no peer ever heard about it. The
     * transaction wait stretches that window to seconds.
     */
    private _announcePending: boolean = false;
    private _stalenessTimer: ReturnType<typeof setInterval> | null = null;
    /** The periodic full reload. See {@link scheduleAutoRefresh}. */
    private _autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    /** In-flight reload, so a burst of events costs one database read. */
    private _refreshInFlight: Promise<void> | null = null;
    /** What the database reported at the last reload; the staleness check compares against it. */
    private _lastStamp: UserDatabaseStamp | null = null;
    /** Lookups that missed both the cache and the database recently, so a retry storm cannot form. */
    private readonly _recentMisses = new Map<string, number>();

    /** How long a burst of user changes is collected before one reload runs. */
    public static ChangeDebounceMs: number = 250;

    /**
     * Upper bound of the random extra delay before reloading after another server's notice, so a
     * fleet does not query the database in lockstep.
     */
    public static PeerNoticeJitterMs: number = 500;

    /** How long {@link FindUser} remembers that a lookup found nothing, before it asks again. */
    public static MissRetryIntervalMs: number = 5000;

    /** How long to wait before re-checking whether the writing transaction has settled. */
    public static TransactionWaitMs: number = 250;

    /**
     * How many {@link TransactionWaitMs} windows a pending reload waits for an open transaction
     * before giving up. At the defaults that is 15 s; a unit of work still open after that is
     * stuck, and the periodic staleness check will catch whatever it eventually commits.
     */
    public static MaxTransactionWaits: number = 60;

    /** Upper bound on remembered misses, so a probing attacker cannot grow the map without limit. */
    public static MaxRememberedMisses: number = 500;

    /**
     * Use UserCache.Instance to get the singleton instance.
     */
    public constructor() {
      super();
    }

    public get SYSTEM_USER_ID(): string {
      return SystemUserID;
    }

    /**
     * Returns the system user, or `undefined` when the cache has not been refreshed or the row is
     * absent — every caller already guards for that, and with `_users` defaulting to `[]` this can
     * no longer throw. The declared return type stays `UserInfo` because widening it to
     * `UserInfo | undefined` is a read-surface change, and Phase 1 of the provider refactor moves
     * this class without touching its read surface. The new home compiles under `strict`, hence the
     * explicit assertion where the old one silently inferred the same lie.
     */
    public GetSystemUser(): UserInfo {
      return this.Users.find((u) => u.ID.toLowerCase() === UserCache.Instance.SYSTEM_USER_ID.toLowerCase()) as UserInfo;
    }

    /**
     * This method will refresh the cache with the latest data from the database, and subscribes this
     * process to the changes that make it stale (see the class comment).
     * @param provider - the configured database provider to read through. Works on any dialect —
     *                   the SQL is built with the provider's own quoting and core-schema name.
     * @param autoRefreshIntervalMS - optional; when set, the whole cache is also reloaded on this
     *                   interval. The subscriptions make that unnecessary for most hosts;
     *                   {@link StartStalenessChecks} is the cheaper periodic safety net.
     */
    public async Refresh(provider: DatabaseProviderBase, autoRefreshIntervalMS?: number): Promise<void> {
      this._provider = provider;
      this.wire();
      try {
        const users = await this.LoadUsers(provider);
        if (users) {
          this._users = users;
          this._recentMisses.clear();
          this._lastStamp = await this.readDatabaseStamp(provider);

          this.scheduleAutoRefresh(provider, autoRefreshIntervalMS);
        }
      }
      catch (err) {
        LogError(err);
      }
    }

    /**
     * Replace the cached set with users the caller already materialized.
     *
     * The seam exists for callers that cannot take {@link Refresh}'s path — the PostgreSQL
     * bootstrap in `testing-cli` builds its `UserInfo[]` before there is a `DatabaseProviderBase`
     * to read through, so it holds users but has nothing to hand `Refresh`.
     *
     * Without this, that caller reached in and assigned the private field by string index:
     *
     *     (UserCache.Instance as unknown as Record<string, unknown>)['_users'] = userInfos;
     *
     * which type-checks forever and fails silently: rename `_users` and the cache is simply never
     * populated — no compile error, no exception, and the symptom ("no users") surfaces arbitrarily
     * far from the cause. A public method makes that rename a build error instead.
     *
     * Deliberately does NOT start the auto-refresh timer: the caller supplied this data, so there
     * is no provider to re-read it through. Use {@link Refresh} when there is one.
     */
    public SetUsers(users: UserInfo[]): void {
      this._users = users;
      this._recentMisses.clear();
    }

    /**
     * Reads the users and user-roles base views through the provider and stitches each user's roles
     * onto it.
     *
     * **Why not `RunView`?** `DatabaseProviderBase` is an `IRunViewProvider`, so this could go
     * through the standard read path and inherit its shared-cache invalidation. It deliberately does
     * not, for three reasons:
     * 1. **Bootstrap.** Server-side `RunView` requires a `contextUser` and throws without one
     *    (`CheckUserReadPermissions`). This cache is what produces the system user MJAPI then passes
     *    to everything else, so at first load there is no `UserInfo` to read as.
     * 2. **It must be unfiltered.** `RunView` applies the reading user's entity permission, row-level
     *    security and field-level projection (`buildFieldSecuritySelectList`). This cache is
     *    process-global and answers "who is this?" for every request, so a set scoped to whichever
     *    user happened to bootstrap — or missing `Email` because a deployment denied that field to
     *    their role — would silently break identity for everyone else.
     * 3. **It would put the user table in the shared cache.** `MJ: Users` is cacheable, so a
     *    `RunView` load would publish every user row (names, emails, employee links) into Redis,
     *    where today nothing about users is stored.
     *
     * The freshness that `RunView` would have brought is provided instead by the subscriptions on
     * this class — see the class comment.
     * @param whereClause - optional predicate on `vwUsers` (already quoted and escaped), for
     *                      {@link FindUser}'s single-row read.
     */
    protected async LoadUsers(provider: DatabaseProviderBase, whereClause?: string): Promise<UserInfo[] | undefined> {
      const where = whereClause ? ` WHERE ${whereClause}` : '';
      const users = await provider.ExecuteSQL<UserRow>(`SELECT * FROM ${this.viewFor(provider, USERS_ENTITY, 'vwUsers')}${where}`);
      if (!users) {
        return undefined;
      }
      // A single-user read must not scan the whole role table: FindUser runs this on every miss,
      // and a login attempt with an unknown address is a miss.
      const rolesWhere = whereClause ? this.rolesForUsersPredicate(provider, users) : '';
      const roles = rolesWhere === null
        ? []
        : await provider.ExecuteSQL<UserRoleRow>(`SELECT * FROM ${this.viewFor(provider, USER_ROLES_ENTITY, 'vwUserRoles')}${rolesWhere}`);

      return users.map((user) => {
        user.UserRoles = (roles ?? []).filter((role) => UUIDsEqual(role.UserID, user.ID));
        return new UserInfo(provider, user);
      });
    }

    /**
     * ` WHERE UserID IN (…)` for the users just loaded, or null when there are none (no query at
     * all then). IDs come from the database, and are still shape-checked before interpolation.
     */
    private rolesForUsersPredicate(provider: DatabaseProviderBase, users: UserRow[]): string | null {
      const ids = users.map(u => String(u.ID)).filter(id => /^[0-9A-Fa-f-]{1,64}$/.test(id));
      if (ids.length === 0) {
        return null;
      }
      const list = ids.map(id => `'${EscapeSQLString(id)}'`).join(', ');
      return ` WHERE ${provider.QuoteIdentifier('UserID')} IN (${list})`;
    }

    /**
     * The quoted schema and base view for an entity, from metadata when it is loaded (a deployment
     * may point the entity at a different view), falling back to the core schema and the
     * conventional name — this cache is loaded during bootstrap, before metadata on some hosts.
     */
    private viewFor(provider: DatabaseProviderBase, entityName: string, defaultView: string): string {
      const entity = provider.Entities?.length ? provider.EntityByName(entityName) : undefined;
      return provider.QuoteSchemaAndView(entity?.SchemaName || provider.MJCoreSchemaName, entity?.BaseView || defaultView);
    }

    public static get Instance(): UserCache {
      return UserCache.getInstance<UserCache>();
    }

    public get Users(): UserInfo[] {
      return this._users;
    }

    static get Users(): UserInfo[] {
      return UserCache.Instance.Users;
    }

    /**
     * Convenience method to get a user by their name
     * @param name - name of the user
     * @param caseSensitive - optional, if true, the search will be case sensitive
     * @returns
     */
    public UserByName(name: string, caseSensitive: boolean = false): UserInfo | undefined {
      return UserCache.Users.find(u => {
        const comparisonItem = u.Name.trim();
        const item = name.trim();
        return caseSensitive ? comparisonItem === item : comparisonItem.toLowerCase() === item.toLowerCase();
      });
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // Finding a user: a miss is a question for the database, not an answer
    // ────────────────────────────────────────────────────────────────────────────────────────────

    /**
     * Finds a user by ID or email. **Prefer this over `Users.find(...)` on any path that decides
     * whether a request is allowed.** A plain `find` renders "this process has not loaded that user"
     * as "that user does not exist", which is how a newly created account is rejected as invalid
     * until the server restarts.
     *
     * A miss here is checked against the database (one indexed row read) and, when the user is
     * really there, added to the cache so later lookups are free. A user that the database does not
     * have either is remembered as absent for {@link MissRetryIntervalMs}, so a bad credential
     * cannot turn into a query per request.
     *
     * @returns The user, or undefined when neither the cache nor the database has it.
     */
    public async FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined> {
      const cached = this.findCached(criteria);
      if (cached || !this._provider) {
        return cached;
      }
      const key = this.missKey(criteria);
      if (!key) {
        return undefined;
      }
      const lastMiss = this._recentMisses.get(key);
      if (lastMiss !== undefined && Date.now() - lastMiss < UserCache.MissRetryIntervalMs) {
        return undefined; // asked recently and the database did not have it either
      }
      try {
        const loaded = await this.LoadUsers(this._provider, this.whereFor(criteria));
        const user = loaded?.[0];
        if (!user) {
          this.rememberMiss(key);
          return undefined;
        }
        // Keep the array instance: callers (MJServer auth) hold and push to it.
        const index = this._users.findIndex(u => UUIDsEqual(u.ID, user.ID));
        if (index >= 0) {
          this._users[index] = user;
        } else {
          this._users.push(user);
        }
        LogStatusEx({ message: `UserCache: loaded user ${user.ID} on demand — it was created after this process last refreshed`, verboseOnly: true });
        return user;
      } catch (e) {
        LogError(`UserCache.FindUser failed: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      }
    }

    /**
     * Remembers that the database did not have this lookup either, pruning as it goes: the map is
     * keyed by whatever a caller asked for, so a credential-stuffing run of distinct addresses
     * would otherwise grow it without limit.
     */
    private rememberMiss(key: string): void {
      const now = Date.now();
      for (const [k, at] of this._recentMisses) {
        if (now - at >= UserCache.MissRetryIntervalMs) {
          this._recentMisses.delete(k);
        }
      }
      while (this._recentMisses.size >= UserCache.MaxRememberedMisses) {
        const oldest = this._recentMisses.keys().next();
        if (oldest.done) {
          break;
        }
        this._recentMisses.delete(oldest.value);
      }
      this._recentMisses.set(key, now);
    }

    /** The cached answer for {@link FindUser}'s criteria, without touching the database. */
    private findCached(criteria: { ID?: string; Email?: string }): UserInfo | undefined {
      if (criteria.ID) {
        return this._users.find(u => UUIDsEqual(u.ID, criteria.ID as string));
      }
      const email = criteria.Email?.trim().toLowerCase();
      return email ? this._users.find(u => u.Email?.trim().toLowerCase() === email) : undefined;
    }

    private missKey(criteria: { ID?: string; Email?: string }): string | null {
      if (criteria.ID) return `id:${criteria.ID.trim().toLowerCase()}`;
      const email = criteria.Email?.trim().toLowerCase();
      return email ? `email:${email}` : null;
    }

    /** Predicate for the single-row read; values are escaped, and the ID is checked for shape. */
    private whereFor(criteria: { ID?: string; Email?: string }): string {
      const provider = this._provider as DatabaseProviderBase;
      if (criteria.ID) {
        return `${provider.QuoteIdentifier('ID')} = '${EscapeSQLString(criteria.ID.trim())}'`;
      }
      return `LOWER(${provider.QuoteIdentifier('Email')}) = '${EscapeSQLString((criteria.Email ?? '').trim().toLowerCase())}'`;
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // Staying current
    // ────────────────────────────────────────────────────────────────────────────────────────────

    /**
     * Subscribes this process to what makes the cache stale: local writes to the two entities, and
     * shared-cache events from other processes. Runs once.
     */
    private wire(): void {
      if (this._wired) {
        return;
      }
      this._wired = true;
      MJGlobal.Instance.GetEventListener(false).subscribe((mjEvent) => {
        if (mjEvent.event !== MJEventType.ComponentEvent || mjEvent.eventCode !== BaseEntity.BaseEventCode) {
          return;
        }
        this.handleEntityEvent(mjEvent.args as BaseEntityEvent | undefined);
      });
      this._unsubscribeCacheEvents = LocalCacheManager.Instance.RegisterChangeCallback(
        USER_CACHE_STAMP_KEY, (event) => this.handleSharedCacheEvent(event));
    }

    /** A user or user-role row changed in THIS process: reload, then tell the others. */
    private handleEntityEvent(event: BaseEntityEvent | undefined): void {
      if (!event || (event.type !== 'save' && event.type !== 'delete')) {
        return;
      }
      const entityName = event.baseEntity?.EntityInfo?.Name ?? event.entityName;
      if (!entityName || !USER_ENTITY_NAMES.has(entityName.trim().toLowerCase())) {
        return;
      }
      const writer = this.writerOf(event);
      if (writer) {
        this._pendingWriters.add(writer);
      }
      this.scheduleRefresh(UserCache.ChangeDebounceMs, true);
    }

    /**
     * Another process changed users (the stamp key), or a tool cleared the shared cache after
     * changing the database (a RunView category clear). Either way this cache may be stale.
     */
    private handleSharedCacheEvent(event: CacheChangedEvent): void {
      const isClear = event.Action === 'category_cleared' && event.Category === CacheCategory.RunViewCache;
      const isStamp = event.CacheKey === USER_CACHE_STAMP_KEY && event.Action !== 'category_cleared';
      if (!isClear && !isStamp) {
        return;
      }
      this.scheduleRefresh(UserCache.ChangeDebounceMs + Math.floor(Math.random() * UserCache.PeerNoticeJitterMs), false);
    }

    /**
     * Reloads after `delayMs`, collecting a burst into one read.
     * @param publishToPeers - true when this process made the change, so other processes are told.
     */
    private scheduleRefresh(delayMs: number, publishToPeers: boolean): void {
      this._announcePending ||= publishToPeers; // never cleared by a later event, only by publishing
      if (this._refreshTimer) {
        clearTimeout(this._refreshTimer);
      }
      const timer = setTimeout(() => {
        this._refreshTimer = null;
        // A save raises its event while the transaction that made it is still open, and this
        // cache's own writers (new-user creation on first login, the magic-link service, SaaS's
        // provisioning handler) all save inside one. Reloading now reads the database WITHOUT the
        // uncommitted row — on PostgreSQL or under RCSI it simply is not there — so the cache
        // would be rebuilt without the very user that triggered it, and the peer notice would make
        // every other server reload too early. Wait for the transaction to settle.
        if (this.transactionStillOpen()) {
          this._transactionWaits++;
          this.scheduleRefresh(UserCache.TransactionWaitMs, false); // the flag already carries the intent
          return;
        }
        this._transactionWaits = 0;
        this._pendingWriters.clear();
        const announce = this._announcePending;
        this.RefreshNow()
          .then(async () => {
            if (announce) {
              await this.publishStamp();
              this._announcePending = false; // cleared only once peers have actually been told
            }
          })
          .catch((e: unknown) => LogError(`UserCache refresh failed: ${e instanceof Error ? e.message : String(e)}`));
      }, delayMs);
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref(): void }).unref();
      }
      this._refreshTimer = timer;
    }

    /**
     * The provider a save or delete was made through: the entity's own, which on a server is the
     * per-request instance. Falls back to the event's provider (`remote-invalidate` carries it
     * there and has no entity).
     */
    private writerOf(event: BaseEntityEvent): DatabaseProviderBase | null {
      const candidate = (event.baseEntity as unknown as { ProviderToUse?: unknown })?.ProviderToUse ?? event.provider;
      return this.isDatabaseProvider(candidate) ? candidate : null;
    }

    /** Whether a provider tracks transaction depth, which is all this cache needs from it. */
    private isDatabaseProvider(candidate: unknown): candidate is DatabaseProviderBase {
      return !!candidate && typeof (candidate as DatabaseProviderBase).TransactionDepth === 'number';
    }

    /**
     * True while a provider that raised one of the pending changes still has an open transaction,
     * and the reload should keep waiting. Bounded: a transaction that never settles (a leaked
     * handle) must not hold the reload forever — the periodic staleness check is the backstop, and
     * the next user write re-arms this one.
     */
    private transactionStillOpen(): boolean {
      for (const writer of this._pendingWriters) {
        if ((writer.TransactionDepth ?? 0) <= 0) {
          this._pendingWriters.delete(writer); // settled; stop holding a reference to it
        }
      }
      const depth = this._pendingWriters.size > 0
        ? Math.max(...[...this._pendingWriters].map(w => w.TransactionDepth ?? 0))
        : (this._provider?.TransactionDepth ?? 0);
      if (depth <= 0) {
        return false;
      }
      if (this._transactionWaits >= UserCache.MaxTransactionWaits) {
        LogWarning(`UserCache waited ${this._transactionWaits} windows for an open transaction before reloading anyway; the writing unit of work has not settled`, 'Cache');
        this._transactionWaits = 0;
        this._pendingWriters.clear();
        return false;
      }
      return true;
    }

    /**
     * Reloads the cache from the provider it was last refreshed through. Concurrent calls share one
     * read. Does nothing when this process never had a provider (a host that only calls
     * {@link SetUsers}).
     */
    public async RefreshNow(): Promise<void> {
      if (!this._provider) {
        return;
      }
      if (this._refreshInFlight) {
        return this._refreshInFlight;
      }
      const provider = this._provider;
      this._refreshInFlight = (async () => {
        try {
          const users = await this.LoadUsers(provider);
          if (users) {
            this._users = users;
            this._recentMisses.clear();
            this._lastStamp = await this.readDatabaseStamp(provider);
          }
        } finally {
          this._refreshInFlight = null;
        }
      })();
      return this._refreshInFlight;
    }

    /**
     * Tells other processes that users changed, by writing {@link USER_CACHE_STAMP_KEY} to the
     * shared store. A store that is private to this process publishes nothing, so this is a no-op
     * there. Never throws: failing to notify peers must not fail the write that caused it.
     */
    private async publishStamp(): Promise<void> {
      const storage = this._provider?.LocalStorageProvider;
      if (!storage?.SharedAcrossProcesses) {
        return;
      }
      try {
        await storage.SetItem(USER_CACHE_STAMP_KEY, new Date().toISOString(), CacheCategory.Default);
      } catch (e) {
        LogWarning(`UserCache could not notify other servers that users changed (${e instanceof Error ? e.message : String(e)}); they will see the change at the next staleness check`, 'Cache');
      }
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // Periodic safety net
    // ────────────────────────────────────────────────────────────────────────────────────────────

    /**
     * Compares the database with what this cache was built from — two counts and the newest
     * `__mj_UpdatedAt` — and reloads only when they differ. Two small aggregate queries, so it is
     * cheap enough to run on an interval; it exists for writers that reach neither of the event
     * paths (raw SQL, another application, a restore).
     *
     * @returns true when the cache was reloaded.
     */
    public async RefreshIfChangedInDatabase(): Promise<boolean> {
      if (!this._provider || !this.usersMayChangeWithoutAnEvent()) {
        return false;
      }
      try {
        const stamp = await this.readDatabaseStamp(this._provider);
        if (!stamp || (this._lastStamp && this.stampsMatch(stamp, this._lastStamp))) {
          return false;
        }
        await this.RefreshNow();
        return true;
      } catch (e) {
        LogError(`UserCache staleness check failed: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    }

    /**
     * Arms the periodic full reload of users and roles, replacing any previous schedule.
     *
     * The timer ticks every `intervalMs`, but it reads the database **only when `MJ: Users` or
     * `MJ: User Roles` declares `TrustServerCacheCompletely = false`** — see
     * {@link usersMayChangeWithoutAnEvent}. A tick with nothing declared costs one in-memory lookup
     * and issues no query, so an entity marked later is honoured on the next tick without a restart.
     *
     * Why the reload is conditional: a recurring query prevents a serverless database from pausing,
     * and when every mutation flows through `BaseEntity` there is nothing for a reload to discover —
     * a local save raises an event, a save on another process publishes the shared stamp, and
     * {@link FindUser} falls back to an authoritative read on a miss. The reload therefore earns its
     * cost only where rows can appear without an event.
     *
     * `Refresh` may be called more than once in a process (a bootstrap pass, then host
     * configuration); each call re-arms this single timer rather than starting another chain.
     *
     * @param intervalMs Tick interval. `0` or absent leaves the timer off.
     */
    private scheduleAutoRefresh(provider: DatabaseProviderBase, intervalMs?: number): void {
      if (this._autoRefreshTimer) {
        clearTimeout(this._autoRefreshTimer);
        this._autoRefreshTimer = null;
      }
      if (!intervalMs || intervalMs <= 0) {
        return;
      }
      const timer = setTimeout(() => {
        this._autoRefreshTimer = null;
        if (this.usersMayChangeWithoutAnEvent()) {
          void this.Refresh(provider, intervalMs); // reloads, and re-arms from there
        } else {
          this.scheduleAutoRefresh(provider, intervalMs); // keep ticking, ask the database nothing
        }
      }, intervalMs);
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref(): void }).unref();
      }
      this._autoRefreshTimer = timer;
    }

    /**
     * Whether `MJ: Users` or `MJ: User Roles` has **declared** that its rows can change without
     * firing an event — the only thing a periodic database check can discover.
     *
     * `Entity.TrustServerCacheCompletely` is that declaration: true (the default) means every
     * mutation flows through `BaseEntity.Save()`, which this cache already hears. Polling such an
     * entity buys nothing and costs a recurring query, which on Azure SQL serverless prevents
     * auto-pause outright — the interval cannot fix that, only not running can.
     *
     * Nothing is lost for the case that motivated this cache's rework (#4247, a new user unable to
     * log in): a save in any process raises an event, a save in another process publishes the shared
     * stamp, and a lookup that misses still falls back to an authoritative read in `FindUser`. So
     * even a user inserted by raw SQL can authenticate without this poll — it is the backstop for
     * out-of-band writes, and now runs only where those are declared.
     */
    private usersMayChangeWithoutAnEvent(): boolean {
      const provider = this._provider;
      if (!provider) {
        return false;
      }
      return [USERS_ENTITY, USER_ROLES_ENTITY]
        .some(name => provider.EntityByName(name)?.TrustServerCacheCompletely === false);
    }

    /** Runs {@link RefreshIfChangedInDatabase} on an interval. `intervalMs <= 0` stops it. */
    public StartStalenessChecks(intervalMs: number): void {
      this.StopStalenessChecks();
      if (!intervalMs || intervalMs <= 0) {
        return;
      }
      this._stalenessTimer = setInterval(() => {
        this.RefreshIfChangedInDatabase().catch(() => undefined); // already logged
      }, intervalMs);
      if (typeof this._stalenessTimer === 'object' && this._stalenessTimer !== null && 'unref' in this._stalenessTimer) {
        (this._stalenessTimer as { unref(): void }).unref();
      }
    }

    public StopStalenessChecks(): void {
      if (this._stalenessTimer) {
        clearInterval(this._stalenessTimer);
        this._stalenessTimer = null;
      }
    }

    private stampsMatch(a: UserDatabaseStamp, b: UserDatabaseStamp): boolean {
      return a.UserCount === b.UserCount && a.RoleCount === b.RoleCount && a.MaxUpdatedAt === b.MaxUpdatedAt;
    }

    /**
     * Row counts and the newest update timestamp across both views. A user row's own
     * `__mj_UpdatedAt` covers edits and deactivations; the counts cover creates and deletes.
     */
    private async readDatabaseStamp(provider: DatabaseProviderBase): Promise<UserDatabaseStamp | null> {
      try {
        const updatedAt = provider.QuoteIdentifier('__mj_UpdatedAt');
        const count = provider.QuoteIdentifier('RowCount');
        const newest = provider.QuoteIdentifier('MaxUpdatedAt');
        const scope = provider.QuoteIdentifier('Scope');
        // One round trip for both views.
        const rows = await provider.ExecuteSQL<{ Scope: string; RowCount: number; MaxUpdatedAt: Date | string | null }>(
          `SELECT 'users' AS ${scope}, COUNT(*) AS ${count}, MAX(${updatedAt}) AS ${newest} FROM ${this.viewFor(provider, USERS_ENTITY, 'vwUsers')}` +
          ` UNION ALL ` +
          `SELECT 'roles' AS ${scope}, COUNT(*) AS ${count}, MAX(${updatedAt}) AS ${newest} FROM ${this.viewFor(provider, USER_ROLES_ENTITY, 'vwUserRoles')}`);
        const users = rows?.find(r => r.Scope === 'users');
        const roles = rows?.find(r => r.Scope === 'roles');
        if (!users || !roles) {
          return null;
        }
        const latest = [users.MaxUpdatedAt, roles.MaxUpdatedAt]
          .map(v => (v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : ''))
          .sort()
          .at(-1) ?? '';
        return { UserCount: Number(users.RowCount), RoleCount: Number(roles.RowCount), MaxUpdatedAt: latest };
      } catch (e) {
        LogError(`UserCache could not read the user/role stamp: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }

    /** Stops the timers and event subscriptions this cache owns. For tests and clean shutdown. */
    public Dispose(): void {
      this.StopStalenessChecks();
      if (this._refreshTimer) {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = null;
      }
      this._unsubscribeCacheEvents?.();
      this._unsubscribeCacheEvents = null;
      this._wired = false;
    }
}
