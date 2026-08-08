import {
    DatabaseProviderBase,
    IMetadataProvider,
    LogError,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import { IsSystemUser, SystemUserID } from './systemUser.js';
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
 * **Why it queries rather than reading `UserCache`.** `UserCache` lives in
 * `@memberjunction/sqlserver-dataprovider`; importing it here would invert the dependency. That
 * constraint turns out to be a benefit:
 *   - PostgreSQL gets a real answer for the first time. It has no user cache of its own — today
 *     MJServer writes `UserCache`'s private `_users` field through a cast to fake one — so a PG
 *     process outside MJServer currently has no system user at all.
 *   - It works on a cold cache. `UserCache.GetSystemUser()` throws outright before its first
 *     successful refresh, which is why several existing callers silently skip their checks.
 *
 * Deliberately **not** memoized beyond the caller's own reuse: a long-lived private copy would
 * drift from `UserCache` after a role sync, and that drift was the flaw in an earlier attempt at
 * this. Callers resolve rarely — {@link BaseEngine} resolves at most once per engine — so a
 * lookup per call is cheap and always current.
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
     * Reads the system user (and its roles) from `vwUsers`/`vwUserRoles` on the given provider's
     * connection. Returns null — never throws — when the provider can't run SQL, the row is
     * absent, or the query fails, so callers degrade rather than crash.
     */
    public override async GetSystemUser(provider: IMetadataProvider): Promise<UserInfo | null> {
        // Only a database provider can answer this; anything else (a Network provider that
        // somehow reached us in a hybrid process) has no connection to query.
        if (!(provider instanceof DatabaseProviderBase)) {
            return null;
        }

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

            // A dedicated instance, never a shared cached one — per-request context stamped onto
            // a shared UserInfo leaks across sessions.
            return new UserInfo(provider, { ...users[0], UserRoles: roles ?? [] });
        } catch (e) {
            LogError(e);
            return null;
        }
    }
}
