/**
 * View dependency capture — the metadata-collection half of the 42P16
 * recovery flow for PostgreSQL base views.
 *
 * PostgreSQL's `CREATE OR REPLACE VIEW` rejects any change that isn't purely
 * additive at the end of the column list (rename, reorder, drop, type change
 * all raise SQLSTATE `42P16 invalid_table_definition`). The standard recovery
 * is to DROP VIEW ... CASCADE and recreate — but CASCADE silently destroys
 * every dependent view, function, grant, and comment. This module provides
 * the read side of a safe recovery: capture every object that CASCADE would
 * destroy, so the later drop/recreate step can restore them.
 *
 * The fallback writer lives elsewhere (to be added once these captures have
 * proved correct via integration tests). This module is intentionally
 * stateless and side-effect-free — every function just runs SELECTs.
 *
 * All queries target a specific view by (schema, name); the first thing each
 * does is resolve to `oid` so the rest of the query can join by `oid`.
 */

import type { Client, PoolClient } from 'pg';

/** A pg client or pool-client — anything with `.query`. */
export type PGQueryable = Pick<Client | PoolClient, 'query'>;

/** A dependent view or materialized view found via pg_depend / pg_rewrite. */
export interface DependentView {
    /** Schema name (preserves case). */
    schema: string;
    /** View name (preserves case). */
    name: string;
    /** Distance in the dependency graph. 1 = direct dependent, 2 = transitive, ... */
    depth: number;
    /** PG relkind: 'v' = regular view, 'm' = materialized view. */
    relkind: 'v' | 'm';
    /** SELECT clause of the view definition as returned by `pg_get_viewdef`. */
    definition: string;
}

/** A dependent function (e.g. one that RETURNS SETOF the target view). */
export interface DependentFunction {
    schema: string;
    name: string;
    /** Result of `pg_get_function_identity_arguments` — stable signature string. */
    argTypes: string;
    /** Full `CREATE OR REPLACE FUNCTION ...` text from `pg_get_functiondef`. */
    definition: string;
}

/** A single GRANT on the target view. */
export interface ViewGrant {
    /** Role receiving the privilege. */
    grantee: string;
    /** SELECT / INSERT / UPDATE / DELETE / etc. */
    privilege: string;
    /** Whether WITH GRANT OPTION is set. */
    withGrantOption: boolean;
}

/** Ownership + comment metadata on the target view. */
export interface ViewMetadata {
    /** Role name returned by `pg_get_userbyid`. */
    owner: string;
    /** Free-form description set via `COMMENT ON VIEW ...` — null if unset. */
    comment: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves `(schema, name)` to a `pg_class.oid`. Returns null if the target
 * doesn't exist — callers can treat that as "nothing to capture".
 */
export async function resolveViewOid(
    db: PGQueryable,
    schema: string,
    name: string
): Promise<number | null> {
    const res = await db.query(
        `SELECT c.oid::int AS oid
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1
            AND c.relname = $2
            AND c.relkind IN ('v', 'm')
          LIMIT 1`,
        [schema, name]
    );
    if (res.rowCount === 0) return null;
    return res.rows[0].oid as number;
}

// ─── Dependent views ─────────────────────────────────────────────────────

/**
 * Walks the dependency graph for views/materialized views that depend on the
 * target, direct and transitive. Uses a recursive CTE over pg_rewrite (a view's
 * rewrite rule is the object pg_depend tracks) and groups by (oid) so a view
 * reached through multiple paths shows its deepest depth.
 *
 * Ordered shallowest-first so a caller restoring dependents can replay the
 * array in order without needing a separate topological sort.
 */
export async function captureDependentViews(
    db: PGQueryable,
    targetOid: number
): Promise<DependentView[]> {
    const res = await db.query(
        `WITH RECURSIVE deps AS (
            SELECT c.oid, c.relname AS name, n.nspname AS schema,
                   c.relkind::text AS relkind, 1 AS depth
              FROM pg_rewrite r
              JOIN pg_depend d ON d.objid = r.oid
              JOIN pg_class c ON c.oid = r.ev_class
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE d.refobjid = $1
               AND d.deptype = 'n'
               AND c.oid <> $1
               AND c.relkind IN ('v', 'm')
            UNION
            SELECT c.oid, c.relname, n.nspname, c.relkind::text, p.depth + 1
              FROM deps p
              JOIN pg_rewrite r ON TRUE
              JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
              JOIN pg_class c ON c.oid = r.ev_class
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('v', 'm')
               AND c.oid <> p.oid
         )
         SELECT oid::int AS oid, name, schema, relkind,
                MAX(depth)::int AS depth,
                pg_catalog.pg_get_viewdef(oid, true) AS definition
           FROM deps
          GROUP BY oid, name, schema, relkind
          ORDER BY MAX(depth) ASC, name ASC`,
        [targetOid]
    );
    return res.rows.map(r => ({
        schema: r.schema as string,
        name: r.name as string,
        depth: r.depth as number,
        relkind: r.relkind as 'v' | 'm',
        definition: r.definition as string,
    }));
}

// ─── Dependent functions ─────────────────────────────────────────────────

/**
 * Functions that reference the target view's rowtype — most commonly a
 * `RETURNS SETOF {schema}.{view}` function (PG's CRUD fn_create_* / fn_update_*
 * pattern). These get dropped by CASCADE when the view's type is dropped, so
 * the fallback needs to recreate them from the captured text.
 *
 * We follow pg_depend from pg_proc rows to the view's composite type row
 * (pg_class.reltype), rather than to the view itself — function -> type is the
 * actual dependency PG records.
 */
export async function captureDependentFunctions(
    db: PGQueryable,
    targetOid: number
): Promise<DependentFunction[]> {
    const res = await db.query(
        `SELECT p.proname AS name,
                n.nspname AS schema,
                pg_catalog.pg_get_function_identity_arguments(p.oid) AS arg_types,
                pg_catalog.pg_get_functiondef(p.oid) AS definition
           FROM pg_depend d
           JOIN pg_class c ON c.reltype = d.refobjid
           JOIN pg_proc  p ON p.oid = d.objid
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE d.classid = 'pg_proc'::regclass
            AND d.refclassid = 'pg_type'::regclass
            AND c.oid = $1
          ORDER BY n.nspname, p.proname`,
        [targetOid]
    );
    return res.rows.map(r => ({
        schema: r.schema as string,
        name: r.name as string,
        argTypes: r.arg_types as string,
        definition: r.definition as string,
    }));
}

// ─── Permissions ─────────────────────────────────────────────────────────

/**
 * Captures every non-owner grant on the target view. The owner always has full
 * privileges implicitly and those show up in `relacl` too — we filter them out
 * since `ALTER VIEW ... OWNER TO` already conveys them after the recreate.
 */
export async function captureGrants(
    db: PGQueryable,
    schema: string,
    name: string
): Promise<ViewGrant[]> {
    // information_schema gives us a clean per-grant row view. We query by
    // table_schema + table_name rather than oid because information_schema
    // deliberately doesn't expose oid — name-based lookup is the supported path.
    const res = await db.query(
        `SELECT grantee, privilege_type, is_grantable
           FROM information_schema.role_table_grants
          WHERE table_schema = $1
            AND table_name   = $2
          ORDER BY grantee, privilege_type`,
        [schema, name]
    );
    // Filter out the implicit owner grant — information_schema exposes the owner
    // with every privilege; we don't want to replay those as explicit GRANTs
    // because ALTER VIEW ... OWNER TO sets them up naturally. We detect it by
    // asking pg_class for the owner name.
    const ownerRes = await db.query(
        `SELECT pg_catalog.pg_get_userbyid(c.relowner) AS owner
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2`,
        [schema, name]
    );
    const owner = (ownerRes.rows[0]?.owner as string | undefined) ?? null;

    return res.rows
        .filter(r => r.grantee !== owner)
        .map(r => ({
            grantee: r.grantee as string,
            privilege: r.privilege_type as string,
            withGrantOption: r.is_grantable === 'YES',
        }));
}

// ─── Comment + owner ─────────────────────────────────────────────────────

/**
 * Reads the COMMENT ON VIEW text and owner role name for the target. Both
 * need replay after a DROP + CREATE, since CREATE VIEW sets the owner to
 * the connected role and doesn't inherit comments.
 */
export async function captureMetadata(
    db: PGQueryable,
    targetOid: number
): Promise<ViewMetadata> {
    const res = await db.query(
        `SELECT pg_catalog.pg_get_userbyid(c.relowner) AS owner,
                (
                    SELECT description
                      FROM pg_description
                     WHERE objoid = c.oid
                       AND objsubid = 0
                ) AS comment
           FROM pg_class c
          WHERE c.oid = $1`,
        [targetOid]
    );
    if (res.rowCount === 0) {
        throw new Error(`Cannot capture metadata for oid ${targetOid} — not found.`);
    }
    return {
        owner: res.rows[0].owner as string,
        comment: (res.rows[0].comment as string | null) ?? null,
    };
}
