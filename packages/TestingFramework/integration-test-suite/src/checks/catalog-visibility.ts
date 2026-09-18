/**
 * catalog-visibility.ts — shared gate for checks that inspect the SQL Server catalog
 * (`sys.objects`, `sys.sql_modules`, `OBJECT_DEFINITION`, …) through `ctx.Pool`.
 *
 * SQL Server's metadata-visibility rules hide an object from a login that holds NO
 * permission on it, and hide every module DEFINITION from a login without VIEW DEFINITION.
 * On a least-privilege application login (e.g. `MJ_Connect`: cdp_* + datareader/datawriter,
 * not db_owner) that makes correctly-generated objects look "missing": a generated CRUD proc
 * no role has EXECUTE on simply does not appear in `sys.objects`, and every
 * `OBJECT_DEFINITION()` comes back NULL. Those are properties of the LOGIN, not defects in
 * the catalog — so catalog-auditing checks must skip (loudly) on such logins rather than
 * report phantom drift. CI and dev bootstraps that connect as sa / db_owner keep the full
 * assertions.
 *
 * (These checks silently never ran under `mj test` before the driver learned to recover the
 * CLI's pool — the gap surfaced the moment they executed on a least-privilege login.)
 */
import type sql from 'mssql';

/** Memoized per pool — the permission set cannot change mid-run. */
const visibilityByPool = new WeakMap<sql.ConnectionPool, Promise<boolean>>();

/**
 * True when the pool's login can see the full catalog: database-wide VIEW DEFINITION (or
 * CONTROL, which db_owner/sa imply). False on least-privilege application logins.
 */
export function hasFullCatalogVisibility(pool: sql.ConnectionPool): Promise<boolean> {
    let cached = visibilityByPool.get(pool);
    if (!cached) {
        cached = pool.request()
            .query(`SELECT COUNT(*) AS n FROM sys.fn_my_permissions(NULL, 'DATABASE')
                    WHERE permission_name IN ('VIEW DEFINITION', 'CONTROL')`)
            .then(r => ((r.recordset?.[0] as { n: number } | undefined)?.n ?? 0) > 0)
            .catch(() => false);
        visibilityByPool.set(pool, cached);
    }
    return cached;
}
