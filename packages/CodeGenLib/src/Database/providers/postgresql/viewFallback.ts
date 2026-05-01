/**
 * 42P16 recovery for PostgreSQL base view regeneration.
 *
 * PG's `CREATE OR REPLACE VIEW` rejects every non-additive change (rename,
 * reorder, drop-column, type-change) with SQLSTATE `42P16 invalid_table_definition`.
 * The industry-standard recovery — `DROP VIEW ... CASCADE; CREATE VIEW ...` —
 * silently destroys every dependent view, function, grant, and comment. This
 * module wraps that recovery so destruction is bounded and reversible:
 *
 *   1. Try `CREATE OR REPLACE VIEW` first (non-destructive happy path).
 *   2. On 42P16: open a transaction, capture every dependent object via
 *      `viewDependencyCapture`, issue DROP CASCADE, run the new CREATE, then
 *      replay the captured dependents in dependency order (shallowest-first
 *      views → functions → grants → comment → owner). Commit on success,
 *      rollback on any failure.
 *   3. On any other error: propagate — it's not a schema-compatibility issue,
 *      so the fallback can't help.
 *
 * Inside the transaction, a single restore failure (e.g. a dependent function
 * body references a column the new view doesn't have) rolls back EVERYTHING,
 * leaving the pre-replace state intact. That's a hard failure the operator
 * should see, not a silent partial success.
 *
 * This module is orchestration only — the capture queries live in
 * `viewDependencyCapture.ts` and the base-view SQL emission stays in
 * `PostgreSQLCodeGenProvider.generateBaseView`. Wiring this into the
 * per-entity regeneration loop is a separate commit.
 */

import {
    type PGQueryable,
    resolveViewOid,
    captureDependentViews,
    captureDependentFunctions,
    captureGrants,
    captureMetadata,
    type DependentView,
    type DependentFunction,
    type ViewGrant,
    type ViewMetadata,
} from './viewDependencyCapture';

const SQLSTATE_INVALID_TABLE_DEFINITION = '42P16';

/**
 * An error thrown from the restore phase. Tagged so callers can distinguish
 * a port regression (restore failed because the new view has incompatible
 * column shape) from an original-CREATE regression.
 */
export class ViewFallbackRestoreError extends Error {
    constructor(
        public readonly phase: 'restore-view' | 'restore-function' | 'restore-grant' | 'restore-comment' | 'restore-owner',
        public readonly target: { schema?: string; name?: string; sql?: string },
        cause: unknown
    ) {
        const causeMsg = cause instanceof Error ? cause.message : String(cause);
        super(`Fallback ${phase} failed for ${target.schema ?? ''}.${target.name ?? ''}: ${causeMsg}`);
        this.name = 'ViewFallbackRestoreError';
    }
}

export interface ExecuteWithFallbackOptions {
    /** A connected pg Client (not a pool) — we issue BEGIN/COMMIT on this. */
    client: PGQueryable;
    schema: string;
    viewName: string;
    /** The exact `CREATE OR REPLACE VIEW ...` SQL the generator produced. */
    createOrReplaceSQL: string;
    /**
     * Optional — set of view names in `schema.name` form that CodeGen will
     * regenerate later in the same run. Dependents in this set are skipped
     * at restore time because CodeGen's own loop will recreate them with
     * their new definitions. Without this, a captured stale definition could
     * break when its own column list no longer matches the regenerated base.
     *
     * Names are compared case-sensitively because PG identifiers are stored
     * as-written when quoted.
     */
    willRegenerate?: Set<string>;
}

/**
 * Attempt CREATE OR REPLACE VIEW; on 42P16, perform the full capture + drop +
 * recreate + restore dance inside a transaction.
 *
 * Caller must pass a connected pg Client. Concurrent usage of the same client
 * from other code is not allowed — this function manages transaction state.
 */
export async function executeWithFallback(opts: ExecuteWithFallbackOptions): Promise<void> {
    const { client, schema, viewName, createOrReplaceSQL } = opts;
    const willRegenerate = opts.willRegenerate ?? new Set<string>();

    // First attempt: happy-path CREATE OR REPLACE. If this succeeds there's
    // nothing to capture or restore.
    try {
        await client.query(createOrReplaceSQL);
        return;
    } catch (e) {
        if (!is42P16(e)) throw e;
    }

    // 42P16 path. Everything from here runs inside a transaction so a failed
    // restore rolls back to the pre-drop state.
    await client.query('BEGIN');
    try {
        const oid = await resolveViewOid(client, schema, viewName);
        // If the view doesn't exist, 42P16 would never have been raised — so
        // this should be impossible, but fail loudly if it happens.
        if (oid === null) {
            throw new Error(
                `Cannot fall back — view ${schema}.${viewName} resolved to no oid after 42P16.`
            );
        }

        const dependents = await captureDependentViews(client, oid);
        const dependentFunctions = await captureDependentFunctions(client, oid);
        const grants = await captureGrants(client, schema, viewName);
        const metadata = await captureMetadata(client, oid);

        const qualified = quoteQualified(schema, viewName);
        await client.query(`DROP VIEW IF EXISTS ${qualified} CASCADE`);
        await client.query(createOrReplaceSQL);

        await restoreDependents(
            client,
            schema,
            viewName,
            dependents,
            dependentFunctions,
            grants,
            metadata,
            willRegenerate
        );

        await client.query('COMMIT');
    } catch (err) {
        await safelyRollback(client);
        throw err;
    }
}

// ─── Restore ─────────────────────────────────────────────────────────────

async function restoreDependents(
    client: PGQueryable,
    targetSchema: string,
    targetName: string,
    dependents: DependentView[],
    dependentFunctions: DependentFunction[],
    grants: ViewGrant[],
    metadata: ViewMetadata,
    willRegenerate: Set<string>
): Promise<void> {
    // 1. Dependent views/matviews in shallowest-first order. The capture query
    //    already returns them sorted, so we just walk the array.
    for (const dep of dependents) {
        const key = `${dep.schema}.${dep.name}`;
        if (willRegenerate.has(key)) continue; // CodeGen will regenerate it with the new def.
        const kind = dep.relkind === 'm' ? 'MATERIALIZED VIEW' : 'VIEW';
        const sql = `CREATE ${kind} ${quoteQualified(dep.schema, dep.name)} AS ${dep.definition}`;
        try {
            await client.query(sql);
        } catch (e) {
            throw new ViewFallbackRestoreError('restore-view', { schema: dep.schema, name: dep.name, sql }, e);
        }
    }

    // 2. Dependent functions via pg_get_functiondef. The captured body is a
    //    full CREATE OR REPLACE FUNCTION statement so we execute verbatim.
    for (const fn of dependentFunctions) {
        const key = `${fn.schema}.${fn.name}`;
        if (willRegenerate.has(key)) continue;
        try {
            await client.query(fn.definition);
        } catch (e) {
            throw new ViewFallbackRestoreError(
                'restore-function',
                { schema: fn.schema, name: fn.name, sql: fn.definition },
                e
            );
        }
    }

    // 3. GRANTs on the target. `pg_depend` doesn't track grants — they live on
    //    the old view's `relacl` which vanished with the CASCADE — so we replay
    //    from what we captured before the drop. PUBLIC is a pseudo-role and
    //    must be unquoted; anything else is quoted to preserve case.
    const qualifiedTarget = quoteQualified(targetSchema, targetName);
    for (const g of grants) {
        const grantee = g.grantee === 'PUBLIC' ? 'PUBLIC' : `"${g.grantee}"`;
        const option = g.withGrantOption ? ' WITH GRANT OPTION' : '';
        const sql = `GRANT ${g.privilege} ON ${qualifiedTarget} TO ${grantee}${option}`;
        try {
            await client.query(sql);
        } catch (e) {
            throw new ViewFallbackRestoreError('restore-grant', { schema: targetSchema, name: targetName, sql }, e);
        }
    }

    // 4. Comment, if one was set. PG's COMMENT ON is DDL — it does NOT accept
    //    parameterized values, so we inline the text with single-quote escaping
    //    (SQL-92: double every internal single-quote).
    if (metadata.comment !== null) {
        const escaped = metadata.comment.replace(/'/g, "''");
        try {
            await client.query(`COMMENT ON VIEW ${qualifiedTarget} IS '${escaped}'`);
        } catch (e) {
            throw new ViewFallbackRestoreError('restore-comment', { schema: targetSchema, name: targetName }, e);
        }
    }

    // 5. Owner. CREATE VIEW sets owner to the session user; restore the
    //    captured owner so grants / default privileges remain consistent.
    try {
        await client.query(`ALTER VIEW ${qualifiedTarget} OWNER TO "${metadata.owner}"`);
    } catch (e) {
        throw new ViewFallbackRestoreError('restore-owner', { schema: targetSchema, name: targetName }, e);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function is42P16(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === SQLSTATE_INVALID_TABLE_DEFINITION;
}

function quoteQualified(schema: string, name: string): string {
    return `"${schema.replace(/"/g, '""')}"."${name.replace(/"/g, '""')}"`;
}

async function safelyRollback(client: PGQueryable): Promise<void> {
    try {
        await client.query('ROLLBACK');
    } catch {
        /* best-effort — if ROLLBACK itself fails the connection is broken anyway */
    }
}
