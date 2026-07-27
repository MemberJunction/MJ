import { LogError, Metadata, UserInfo } from "@memberjunction/core";
import type { IMetadataProvider } from "@memberjunction/core";
import { BaseSingleton, UUIDsEqual } from "@memberjunction/global";
import sql from 'mssql';

const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';

/**
 * A single row from the `vwUsers` / `vwUserRoles` views.
 *
 * Deliberately an open record: the mssql and pg drivers each hand back whatever columns the
 * view projects, and `UserInfo` copies them across by name. Restating a view's column list
 * here would drift the moment the view changes.
 */
export type UserCacheRow = Record<string, unknown>;

/**
 * Server side cache of users and their roles.
 *
 * Uses BaseSingleton to guarantee a single instance across the entire process,
 * even if bundlers duplicate this module across multiple execution paths.
 */
export class UserCache extends BaseSingleton<UserCache> {
    /**
     * Initialized eagerly because callers dereference {@link Users} without guarding
     * (e.g. `UserCache.Instance.Users.find(...)` in setupSQLServerClient). Keeping this an
     * array on every path — including after a failed refresh — is what makes those call
     * sites safe.
     */
    private _users: UserInfo[] = [];

    /**
     * Use UserCache.Instance to get the singleton instance.
     */
    public constructor() {
      super();
    }

    public get SYSTEM_USER_ID(): string {
      return SYSTEM_USER_ID;
    }

    public GetSystemUser(): UserInfo {
      return this.Users.find((u) => u.ID.toLowerCase() === UserCache.Instance.SYSTEM_USER_ID.toLowerCase());
    }

    /**
     * Replaces the cache contents from already-fetched `vwUsers` / `vwUserRoles` rows.
     *
     * This is the platform-neutral seam. Every backend fetches the two row sets in its own
     * dialect — bracket-quoted T-SQL in {@link Refresh}, double-quoted SQL in the PostgreSQL
     * feeders — and hands the rows here, so the user-shaping logic (role join plus `UserInfo`
     * construction) exists exactly once instead of being re-implemented per platform.
     *
     * Fails loud by design. An empty user cache is indistinguishable from a working one at
     * the call sites — `GetSystemUser()` simply returns `undefined` — which is how
     * empty-cache misconfigurations reach production unnoticed. On any throw `_users` is left
     * exactly as it was, so {@link Users} keeps its never-undefined postcondition and a
     * transient failure cannot wipe a good cache.
     *
     * @param users - rows from `vwUsers`; must contain at least one row
     * @param roles - rows from `vwUserRoles`; may be empty, since a user with no roles is legal
     * @param provider - the provider these rows were read through. Explicit rather than read
     *   from `Metadata.Provider` so this API does not bake the global-provider assumption
     *   into every future caller.
     * @throws when `provider` is missing, or when `users` is missing or empty
     */
    public RefreshFromRows(users: UserCacheRow[], roles: UserCacheRow[], provider: IMetadataProvider): void {
      if (!provider) {
        throw new Error('UserCache.RefreshFromRows: a metadata provider is required to construct UserInfo objects.');
      }
      if (!users) {
        throw new Error('UserCache.RefreshFromRows: the user row set is missing — the vwUsers query returned no result set.');
      }
      if (users.length === 0) {
        throw new Error(
          'UserCache.RefreshFromRows: the vwUsers query returned zero users. MemberJunction cannot resolve ' +
          'a context user against an empty user cache — verify the target database is migrated and seeded, ' +
          'and that the connecting login is permitted to read vwUsers.'
        );
      }

      const roleRows = roles ?? [];
      this._users = users.map(user => new UserInfo(provider, {
        ...user,
        UserRoles: roleRows.filter(role => UUIDsEqual(role.UserID as string, user.ID as string))
      }));
    }

    /**
     * Refreshes the cache from SQL Server: runs the two T-SQL queries, then hands the rows to
     * {@link RefreshFromRows}.
     *
     * Retains catch-and-log rather than adopting RefreshFromRows' fail-loud contract, because
     * SQL Server callers have always treated a refresh failure as non-fatal; tightening that
     * is tracked separately. One behavior does shift as a result of delegating: an empty
     * `vwUsers` result used to assign `[]` silently and keep the auto-refresh timer alive, and
     * now logs the RefreshFromRows error and — like every other refresh failure — does not
     * re-arm the timer.
     *
     * @param pool - the connection pool to use to refresh the cache
     * @param autoRefreshIntervalMS - optional, if provided, the cache will be refreshed every interval as specified - denominated in milliseconds
     */
    public async Refresh(pool: sql.ConnectionPool, autoRefreshIntervalMS?: number): Promise<void> {
      try {
        const coreSchema = Metadata.Provider.ConfigData.MJCoreSchemaName; // global-provider-ok: data provider implementation, owns its provider context
        const request = new sql.Request(pool);
        const uResult = await request.query(`SELECT * FROM [${coreSchema}].vwUsers`);
        const rRequest = new sql.Request(pool);
        const rResult = await rRequest.query(`SELECT * FROM [${coreSchema}].vwUserRoles`);

        this.RefreshFromRows(uResult.recordset, rResult.recordset, Metadata.Provider); // global-provider-ok: data provider implementation, owns its provider context

        // refresh this every interval noted above to ensure we have the latest data
        if (autoRefreshIntervalMS && autoRefreshIntervalMS > 0)
          setTimeout(() => {
            this.Refresh(pool, autoRefreshIntervalMS);
          }, autoRefreshIntervalMS);
      }
      catch (err) {
        LogError(err);
      }
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
}
  