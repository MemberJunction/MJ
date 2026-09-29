import {
    DatabaseProviderBase,
    IMetadataProvider,
    LogError,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import { IsSystemUser, SystemUserID } from './systemUser.js';
import { UserCache } from './UserCache.js';
import { RegisterClassEx } from '@memberjunction/global';

/**
 * The server-side {@link WellKnownUserSource}: resolves MJ's built-in accounts straight out of
 * the core-schema user views.
 *
 * **Why this lives here rather than in the dialect packages.** Both `SQLServerDataProvider` and
 * `PostgreSQLDataProvider` depend on this package, and this package depends on neither, so one
 * registration here serves both dialects — the implementations would otherwise be identical.
 * Any process holding a database provider has necessarily loaded this module, which makes
 * "the registration exists" line up exactly with "this process has a Database provider". A
 * registration in a server package like MJServer would instead leave every CLI and job process
 * (MJCLI, CodeGen, MetadataSync, AICLI) silently without a system user.
 *
 * **Cache first, query as the cold-start fallback.** {@link UserCache} now lives in this same
 * package, so reading it here is a plain in-process lookup rather than the inverted dependency it
 * used to be. The query remains, and is load-bearing rather than vestigial:
 *   - It answers before any `Refresh` has run. A cold cache is the normal state for a process that
 *     resolves a system user during its own bootstrap, which is exactly when {@link BaseEngine}
 *     asks.
 *   - It answers when the cache was refreshed against a different connection. `UserCache` is a
 *     process-global singleton, so in a multi-connection host its contents are not necessarily
 *     this `provider`'s users.
 *
 * Deliberately **not** memoized privately: a long-lived copy would drift from `UserCache` after a
 * role sync, and that drift was the flaw in an earlier attempt at this. Reading the cache directly
 * shares whatever every other `UserCache` consumer sees, so there is no second copy to go stale.
 */
// No key: there is exactly one well-known-user source per process, not keyed variants,
// so the factory's "registration has no key" advisory does not apply here.
@RegisterClassEx(WellKnownUserSource, { skipNullKeyWarning: true })
export class DatabaseWellKnownUserSource extends WellKnownUserSource {
    /**
     * The synchronous half of the contract: identity recognition, no I/O. Consumed by permission
     * checks in shared code (field-level security, notably) that cannot await, and by anything
     * else that needs to know "is this the platform's own account?" without fetching it.
     */
    public override IsSystemUser(user: UserInfo | null | undefined): boolean {
        return IsSystemUser(user);
    }

    /**
     * Resolves the system user from {@link UserCache} when it is warm, and otherwise reads it (with
     * its roles) from `vwUsers`/`vwUserRoles` on the given provider's connection. Returns null —
     * never throws — when the provider can't run SQL, the row is absent, or the query fails, so
     * callers degrade rather than crash.
     */
    public override async GetSystemUser(provider: IMetadataProvider): Promise<UserInfo | null> {
        // Only a database provider can answer this; anything else (a Network provider that
        // somehow reached us in a hybrid process) has no connection to query.
        if (!(provider instanceof DatabaseProviderBase)) {
            return null;
        }

        // Warm cache: no query, and no second copy of the "load users + roles" logic. Returns
        // undefined on a cold cache rather than throwing, since `_users` defaults to `[]`.
        const cached = UserCache.Instance.GetSystemUser();
        if (cached) {
            return cached;
        }

        return this.querySystemUser(provider);
    }

    /**
     * The cold-cache path: one row from `vwUsers` plus its `vwUserRoles`, built with the provider's
     * own quoting so a single implementation serves both dialects.
     */
    private async querySystemUser(provider: DatabaseProviderBase): Promise<UserInfo | null> {
        try {
            const schema = provider.MJCoreSchemaName;
            const userSQL =
                `SELECT * FROM ${provider.QuoteSchemaAndView(schema, 'vwUsers')} ` +
                `WHERE ${provider.QuoteIdentifier('ID')} = ${provider.BuildParameterPlaceholder(0)}`;
            const users = await provider.ExecuteSQL<Record<string, unknown>>(userSQL, [SystemUserID]);
            if (!users || users.length === 0) {
                return null; // no system user on this database — the caller decides how to degrade
            }

            // Roles matter: entity permissions and RLS are role-driven. Only field-level
            // security keys off the user ID alone.
            const rolesSQL =
                `SELECT * FROM ${provider.QuoteSchemaAndView(schema, 'vwUserRoles')} ` +
                `WHERE ${provider.QuoteIdentifier('UserID')} = ${provider.BuildParameterPlaceholder(0)}`;
            const roles = await provider.ExecuteSQL<Record<string, unknown>>(rolesSQL, [SystemUserID]);

            // A fresh instance built from this provider's own rows. `UserInfo` holds no per-request
            // state — its constructor keeps the row data and roles and nothing else — so the warm
            // path above can safely hand back `UserCache`'s shared instance instead.
            return new UserInfo(provider, { ...users[0], UserRoles: roles ?? [] });
        } catch (e) {
            LogError(e);
            return null;
        }
    }
}
