import { LogError, UserInfo, type DatabaseProviderBase } from '@memberjunction/core';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
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

/**
 * Server side cache of users and their roles.
 *
 * Dialect-neutral: {@link UserCache.Refresh} takes a {@link DatabaseProviderBase} and reads through
 * `ExecuteSQL` / `QuoteSchemaAndView`, so SQL Server and PostgreSQL processes share one
 * implementation rather than each hand-rolling a `vwUsers` + `vwUserRoles` load.
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
     * This method will refresh the cache with the latest data from the database
     * @param provider - the configured database provider to read through. Works on any dialect —
     *                   the SQL is built with the provider's own quoting and core-schema name.
     * @param autoRefreshIntervalMS - optional, if provided, the cache will be refreshed every interval as specified - denominated in milliseconds
     */
    public async Refresh(provider: DatabaseProviderBase, autoRefreshIntervalMS?: number): Promise<void> {
      try {
        const users = await this.LoadUsers(provider);
        if (users) {
          this._users = users;

          // refresh this every interval noted above to ensure we have the latest data
          if (autoRefreshIntervalMS && autoRefreshIntervalMS > 0)
            setTimeout(() => {
              this.Refresh(provider, autoRefreshIntervalMS);
            }, autoRefreshIntervalMS);
        }
      }
      catch (err) {
        LogError(err);
      }
    }

    /**
     * Reads `vwUsers` + `vwUserRoles` through the provider and stitches each user's roles onto it.
     */
    protected async LoadUsers(provider: DatabaseProviderBase): Promise<UserInfo[] | undefined> {
      const coreSchema = provider.MJCoreSchemaName;
      const users = await provider.ExecuteSQL<UserRow>(`SELECT * FROM ${provider.QuoteSchemaAndView(coreSchema, 'vwUsers')}`);
      const roles = await provider.ExecuteSQL<UserRoleRow>(`SELECT * FROM ${provider.QuoteSchemaAndView(coreSchema, 'vwUserRoles')}`);
      if (!users)
        return undefined;

      return users.map((user) => {
        user.UserRoles = (roles ?? []).filter((role) => UUIDsEqual(role.UserID, user.ID));
        return new UserInfo(provider, user);
      });
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
