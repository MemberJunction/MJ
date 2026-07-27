/**
 * pg-user-cache.ts — populate MJ's UserCache from a PostgreSQL backend.
 *
 * `UserCache.Refresh(pool)` is hard-typed to an mssql `ConnectionPool` and speaks
 * bracket-quoted T-SQL, so it cannot serve PostgreSQL. This module is the PG-side feeder:
 * it runs the two view queries in PG dialect and hands the rows to
 * `UserCache.RefreshFromRows`, which owns the platform-neutral shaping (role join plus
 * `UserInfo` construction).
 *
 * It lives in testing-integration because both testing-framework entry points need it —
 * the in-process server bootstrap (`bootstrap.ts`) and the `mj test` CLI's provider setup —
 * and neither should re-implement it. MJServer and MetadataSync keep their own query calls
 * (a production server must not depend on a testing package) but share the same
 * `RefreshFromRows` seam, so the user-shaping logic exists exactly once repo-wide.
 */
import type { IMetadataProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

/**
 * The slice of a `pg.Pool` / `pg.Client` this feeder needs: one text query returning rows.
 *
 * Structural on purpose. Naming `pg.Pool` here would force testing-integration to take a
 * hard `pg` dependency purely to spell a parameter type, when `pg` is an optional backend;
 * a real `pg.Pool` satisfies this shape with no adapter at the call site.
 */
export interface PostgresQueryable {
    query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Reads `vwUsers` / `vwUserRoles` from a PostgreSQL database and loads them into the
 * process-wide {@link UserCache}.
 *
 * The schema is double-quoted, which preserves a mixed-case schema name rather than letting
 * PostgreSQL fold it to lowercase. (MJServer's own PG feeder leaves the schema unquoted —
 * harmless for the default lowercase `__mj`, divergent for anything else. Tracked separately;
 * this feeder takes the correct form.)
 *
 * Throws rather than logging: a silently empty user cache on PG is precisely the failure this
 * work exists to eliminate, and the caller cannot resolve a context user without it.
 *
 * @param db - anything that can run a text query and return rows (a `pg.Pool` does)
 * @param coreSchema - the MJ core schema, e.g. `__mj`
 * @param provider - the provider these rows are read through, forwarded to `RefreshFromRows`
 * @throws if `coreSchema` is missing, either query fails, or the database returns no users
 */
export async function feedUserCacheFromPG(
    db: PostgresQueryable,
    coreSchema: string,
    provider: IMetadataProvider
): Promise<void> {
    if (!db) {
        throw new Error('feedUserCacheFromPG: a queryable PostgreSQL connection is required.');
    }
    if (!coreSchema) {
        throw new Error('feedUserCacheFromPG: the MJ core schema name is required (e.g. "__mj").');
    }

    let userRows: Record<string, unknown>[];
    let roleRows: Record<string, unknown>[];
    try {
        const users = await db.query(`SELECT * FROM "${coreSchema}"."vwUsers"`);
        const roles = await db.query(`SELECT * FROM "${coreSchema}"."vwUserRoles"`);
        userRows = users.rows;
        roleRows = roles.rows;
    } catch (err) {
        throw new Error(
            `feedUserCacheFromPG: failed reading vwUsers/vwUserRoles from PostgreSQL schema "${coreSchema}" — ` +
            `${err instanceof Error ? err.message : String(err)}. Verify the schema is migrated ` +
            `(migrations-pg) and the connecting role can read both views.`,
            { cause: err }
        );
    }

    UserCache.Instance.RefreshFromRows(userRows, roleRows, provider);
}
