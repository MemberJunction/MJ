import { randomUUID } from 'node:crypto';
import { IMetadataProvider, UserInfo, LogError, EntityInfo, ExternalDataSourceReadRouter } from '@memberjunction/core';
import { MJMaterializedResultEntity, MJQueryEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { SQLParser } from '@memberjunction/sql-parser';
import { GetDialect } from '@memberjunction/sql-dialect';

/**
 * Synthetic surrogate key column name for query-materialized tables. MUST match CodeGenLib's
 * `MATERIALIZATION_SURROGATE_COLUMN` (materializationAnalysis.ts) — CodeGen creates the column with
 * this name and the refresher must regenerate it on every rebuild. (A shared low-level home for this
 * constant is a follow-up; duplicated deliberately to avoid a runtime dependency on the dev-time CodeGenLib.)
 */
export const MATERIALIZATION_SURROGATE_COLUMN = '__mj_MaterializedRowID';

/**
 * Force a full rebuild after this many consecutive incremental (Incremental/DirtyGroupRecompute)
 * refreshes. The incremental delete-detection guard only trips on a NET source row-count drop; a
 * delete BALANCED by an insert in the same window (net-zero change) leaves the deleted row's group
 * stale until another change touches it. This periodic full rebuild bounds that drift to at most
 * this many refresh cycles without requiring the author to schedule a manual FullRebuild.
 */
export const FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES = 10;

/**
 * Safety lag subtracted from the probed `MAX(__mj_UpdatedAt)` before it is persisted as the incremental
 * watermark. Closes a commit-ordering skew: a source row whose `__mj_UpdatedAt` was stamped at write-time T1
 * but whose transaction COMMITS after the fingerprint probe (which already read a higher `MAX = T2 > T1`) would,
 * without this lag, be permanently excluded by the strict `__mj_UpdatedAt > watermark` filter on the next pass.
 * Storing `MAX - overlap` makes the next incremental RE-scan the last `overlap` window; the MERGE/`ON CONFLICT`
 * upsert is idempotent so re-scanning already-applied rows is harmless. The overlap only needs to exceed the
 * source's typical commit latency — longer skews are still backstopped by {@link FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES}.
 */
export const WATERMARK_SAFETY_OVERLAP_MS = 10_000;

/**
 * Minimal structural type for a runtime SQL-executing provider. Both SQLServerDataProvider and
 * PostgreSQLDataProvider expose `ExecuteSQL`; we depend on the shape, not the concrete class, to
 * avoid coupling this engine to a specific provider package.
 */
export interface ISQLExecutor {
    /**
     * Execute SQL, optionally with positional bind parameters. `parameters` is a positional array bound
     * as `@p0,@p1,…` on SQL Server (`request.input('p'+i)`) and `$1,$2,…` on PostgreSQL (node-pg values) —
     * both MJ data providers accept this shape. Omit it for plain (DDL / no-value) statements.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ExecuteSQL<T = any>(sql: string, parameters?: unknown): Promise<T[]>;
    /** Database platform of the executing provider ('sqlserver' | 'postgresql'); absent => treated as SQL Server. */
    PlatformKey?: string;
}

/** Outcome of refreshing a single materialized result. */
export interface MaterializationRefreshResult {
    Success: boolean;
    RowCount?: number;
    ErrorMessage?: string;
}

/**
 * Runtime engine that refreshes materialized query/entity results (materialization plan §11).
 *
 * v1: **full rebuild** with an **atomic wrapper-view swap** — build a shadow table from the source,
 * repoint the stable wrapper view at it, then drop the stale table and rename the shadow into the
 * canonical name. Readers (via the wrapper view) never see a half-populated or locked result.
 * Cross-engine: SQL Server and PostgreSQL — the swap statements differ per engine (see the two
 * `buildFullRebuild*` methods), selected at runtime from the provider's `PlatformKey`.
 *
 * Invoked by the scheduled-job refresh driver, and reusable by a manual "refresh now" path.
 */
export class MaterializationRefresher {
    /**
     * Forced-full-rebuild cadence decision: should this refresh be forced to a full rebuild? True once the
     * count of consecutive incremental refreshes since the last full rebuild has reached
     * {@link FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES}. Pure (no IO) so the cadence boundary is
     * unit-testable without a provider/DB. Null-safe: an unset counter is treated as 0.
     */
    public static shouldForceFullRebuild(refreshesSinceFullRebuild: number | null | undefined): boolean {
        return (refreshesSinceFullRebuild ?? 0) >= FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES;
    }

    /**
     * Forced-full-rebuild cadence counter transition. Increments on a genuine incremental refresh; resets to
     * 0 on any full rebuild — so the counter measures how many refreshes we've gone WITHOUT a full reconcile.
     * Pure (no IO) so the increment/reset semantics are unit-testable. Null-safe: an unset counter is 0.
     */
    public static nextRefreshesSinceFullRebuild(current: number | null | undefined, ranIncremental: boolean): number {
        return ranIncremental ? (current ?? 0) + 1 : 0;
    }

    /**
     * Builds the ordered SQL statements for a SQL Server full rebuild with atomic swap (plan §11.2).
     * Pure (no IO) so the swap sequence is unit-testable. Each returned string runs as its own batch.
     *
     * - query case (`surrogateColumn` set): the synthetic IDENTITY surrogate is (re)generated via
     *   `SELECT IDENTITY(int,1,1) AS <surrogate>, src.* INTO <shadow>`;
     * - base-view case (no surrogate): `SELECT * INTO <shadow>` copies the source shape (incl. its PK column).
     */
    public static buildFullRebuildStatementsSQLServer(opts: {
        schema: string;
        tableName: string;
        viewName: string;
        sourceSelect: string;
        surrogateColumn?: string;
        hashKeyColumns?: { name: string; type: string }[];
        /** Run-unique shadow table name (see {@link makeShadowTableName}) so two concurrent refreshes of the
         *  same materialization never share a shadow. Defaults to the legacy fixed name when omitted. */
        shadowName?: string;
    }): string[] {
        const { schema, tableName, viewName, sourceSelect, surrogateColumn, hashKeyColumns } = opts;
        const shadow = opts.shadowName ?? `${tableName}__shadow`;
        const obj = (n: string) => `[${schema}].[${n}]`;
        // Surrogate: a stable HASH of the key columns (Phase 3 — keyed/aggregation materializations, the
        // match key for incremental refresh) when key columns are supplied; otherwise a synthetic IDENTITY.
        const surrogateExpr = hashKeyColumns && hashKeyColumns.length
            ? MaterializationRefresher.buildHashKeyExpression(hashKeyColumns, false)
            : 'IDENTITY(int, 1, 1)';
        const selectInto = surrogateColumn
            ? `SELECT ${surrogateExpr} AS [${surrogateColumn}], src.* INTO ${obj(shadow)} FROM (${sourceSelect}) AS src`
            : `SELECT * INTO ${obj(shadow)} FROM (${sourceSelect}) AS src`;
        // The shadow (built by SELECT…INTO) carries no constraints, so restore the surrogate's UNIQUE index
        // the query case relies on: it IS the minted entity's PK and the match key the Incremental MERGE
        // upserts onto. Created INSIDE the swap transaction so no window exposes an un-indexed table.
        // Fixed, SHORT index name: SQL Server index names must be unique only WITHIN the table (not the DB),
        // so a per-table constant is safe and — unlike `UQ_<tableName>_surrogate` — can never exceed the
        // 128-char sysname limit for a long materialized_<longName> table (which would throw inside the
        // XACT_ABORT swap transaction and roll the whole refresh back). The PG path uses an unnamed index.
        const indexLine = surrogateColumn
            ? `  CREATE UNIQUE INDEX [UQ_MJ_Materialized_Surrogate] ON ${obj(tableName)} ([${surrogateColumn}]);\n`
            : '';
        return [
            // 1) Build a fresh shadow from the source (clear any leftover from a prior failed run). The
            //    expensive read happens OUTSIDE the swap transaction, taking no locks on the canonical table.
            `IF OBJECT_ID('[${schema}].[${shadow}]', 'U') IS NOT NULL DROP TABLE ${obj(shadow)}`,
            selectInto,
            // 2) ATOMIC swap in a single transactional batch — drop the stale table, rename the shadow into
            //    the canonical name (kept stable for migration-reuse detection, §12), refresh the wrapper
            //    view's cached column list, restore the surrogate index. Wrapping in one transaction closes
            //    the window where a concurrent reader could hit the wrapper view mid-swap: the earlier design
            //    repointed the view at the shadow and then renamed the shadow away BEFORE repointing back, so
            //    a reader in between saw "Invalid object name …__shadow". Here the view is only ever pointed
            //    at the canonical name, and the Sch-M lock the transaction holds blocks readers until commit,
            //    so they see either the whole old snapshot or the whole new one — never a half-swapped view.
            //    CREATE VIEW must be the sole statement of its batch, so it runs via EXEC() inside the tran.
            //    SET XACT_ABORT ON so a mid-swap statement error rolls the transaction back rather than
            //    leaving it open on the pooled connection (which would poison the next reuse of it).
            `SET XACT_ABORT ON;\n` +
                `BEGIN TRANSACTION;\n` +
                `  IF OBJECT_ID('[${schema}].[${tableName}]', 'U') IS NOT NULL DROP TABLE ${obj(tableName)};\n` +
                `  EXEC sp_rename '${schema}.${shadow}', '${tableName}';\n` +
                `  EXEC('CREATE OR ALTER VIEW ${obj(viewName)} AS SELECT * FROM ${obj(tableName)}');\n` +
                indexLine +
                `COMMIT TRANSACTION;`,
        ];
    }

    /**
     * Builds the ordered SQL statements for a PostgreSQL full rebuild with atomic swap (plan §11.2) —
     * the PG counterpart to {@link buildFullRebuildStatementsSQLServer}. Pure (no IO), unit-testable.
     *
     * Engine differences vs. SQL Server:
     * - **Identifier quoting:** schema bare, object double-quoted (`__mj."materialized_x"`), matching the
     *   CodeGen provider's `QuoteSchema` convention so the view repoint references the same names.
     * - **Surrogate (query case):** the synthetic surrogate is generated **as the first column** via
     *   `ROW_NUMBER() OVER ()` (a stable 1..N snapshot id; deterministic hashing is §5/Phase 3). It MUST
     *   be first because CodeGen prepends the surrogate, and PG's `CREATE OR REPLACE VIEW` is strict about
     *   column order (SQLSTATE 42P16) — an appended surrogate would break the repoint.
     * - **Swap:** `CREATE OR REPLACE VIEW` (not `CREATE OR ALTER`), `ALTER TABLE ... RENAME TO` (not
     *   `sp_rename`), and `DROP TABLE IF EXISTS ... CASCADE` (PG blocks dropping a table a view depends on;
     *   CASCADE clears a transient wrapper-view dependency from a partially-failed prior run — the view is
     *   recreated within this sequence, so the stable contract is restored before the method returns).
     */
    public static buildFullRebuildStatementsPostgreSQL(opts: {
        schema: string;
        tableName: string;
        viewName: string;
        sourceSelect: string;
        surrogateColumn?: string;
        hashKeyColumns?: { name: string; type: string }[];
        /** Run-unique shadow table name (see {@link makeShadowTableName}) so two concurrent refreshes of the
         *  same materialization never share a shadow. Defaults to the legacy fixed name when omitted. */
        shadowName?: string;
    }): string[] {
        const { schema, tableName, viewName, sourceSelect, surrogateColumn, hashKeyColumns } = opts;
        const shadow = opts.shadowName ?? `${tableName}__shadow`;
        const obj = (n: string) => `${schema}."${n}"`;
        // Surrogate: a stable HASH of the key columns (Phase 3 keyed/aggregation materializations) when
        // supplied; otherwise the synthetic ROW_NUMBER snapshot id. Kept FIRST for CREATE-OR-REPLACE-VIEW
        // column-order stability (see the doc above).
        const surrogateExpr = hashKeyColumns && hashKeyColumns.length
            ? MaterializationRefresher.buildHashKeyExpression(hashKeyColumns, true)
            : 'ROW_NUMBER() OVER ()';
        const createShadow = surrogateColumn
            ? `CREATE TABLE ${obj(shadow)} AS SELECT ${surrogateExpr} AS "${surrogateColumn}", src.* FROM (${sourceSelect}) AS src`
            : `CREATE TABLE ${obj(shadow)} AS SELECT * FROM (${sourceSelect}) AS src`;
        // CREATE TABLE AS carries no constraints, so restore the surrogate's UNIQUE index the query case relies
        // on: PG's `INSERT … ON CONFLICT (surrogate)` (the Incremental upsert) REQUIRES a unique index on the
        // conflict target — without it every rebuild would break the next incremental pass. Unnamed → PG
        // auto-generates a collision-free name (avoids the 63-char identifier-truncation trap). Restored INSIDE
        // the swap transaction below so a partial swap can never leave the canonical table un-indexed. (Base-view
        // case has no surrogate + never runs incremental — nothing to add.)
        const swapIndexLine = surrogateColumn
            ? `  CREATE UNIQUE INDEX ON ${obj(tableName)} ("${surrogateColumn}");\n`
            : '';
        return [
            // 1) Build a fresh shadow (IF EXISTS clears a same-named leftover from a crashed prior run). There is
            //    deliberately NO interim view repoint here: the wrapper view stays pointed at the OLD canonical
            //    table until the atomic swap below, so readers see the COMPLETE old snapshot until commit — exactly
            //    matching the SQL Server path's atomicity. (An earlier design repointed the view at the shadow at
            //    this step, OUTSIDE the swap transaction; that statement auto-committed independently, so a
            //    rolled-back swap left the view pointing at the shadow, and the step-1 `DROP ... CASCADE` on a
            //    subsequent run could then take the wrapper view down with it.)
            `DROP TABLE IF EXISTS ${obj(shadow)} CASCADE`,
            createShadow,
            // 2) ATOMIC swap in a SINGLE transaction (PG DDL is transactional) — drop the stale table, rename
            //    the shadow into the canonical name (kept stable for migration-reuse detection, §12), (re)create
            //    the wrapper view on the new table, and restore the surrogate index. The view is only ever
            //    created/repointed INSIDE this transaction, so readers see either the whole old snapshot or the
            //    whole new one. A mid-swap failure (lock timeout on RENAME, disk pressure on the index) rolls the
            //    ENTIRE swap back, leaving the OLD snapshot fully intact.
            `BEGIN;\n` +
                `  DROP TABLE IF EXISTS ${obj(tableName)} CASCADE;\n` +
                `  ALTER TABLE ${obj(shadow)} RENAME TO "${tableName}";\n` +
                `  CREATE OR REPLACE VIEW ${obj(viewName)} AS SELECT * FROM ${obj(tableName)};\n` +
                swapIndexLine +
                `COMMIT;`,
        ];
    }

    /**
     * Selects the materializations due for refresh: those with no `NextRefreshAt` (never run) or whose
     * `NextRefreshAt` is at/before `now`. Pure (unit-testable); the caller supplies the candidate rows
     * (e.g. all non-disabled, scheduled materializations).
     */
    public static filterDue<T extends { NextRefreshAt?: Date | null }>(rows: T[], now: Date): T[] {
        return rows.filter((r) => !r.NextRefreshAt || new Date(r.NextRefreshAt) <= now);
    }

    /**
     * Full-rebuild refresh of a single materialized result, then updates LastRefreshedAt / RowCount /
     * Status='Active' (and `NextRefreshAt` when provided via options). Returns a structured result
     * rather than throwing (errors are logged + reported).
     */
    public async RefreshOne(
        matResult: MJMaterializedResultEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        options?: { nextRefreshAt?: Date | null },
    ): Promise<MaterializationRefreshResult> {
        // Run-unique shadow-table name so two concurrent refreshes of THIS materialization never collide on the
        // shadow (see makeShadowTableName). Declared before the try so the catch below can best-effort drop it.
        const runShadowName = MaterializationRefresher.makeShadowTableName();
        try {
            // Refuse to refresh a row held for review or disabled — a successful refresh below sets
            // Status='Active', which would SILENTLY clear a DriftHold (§13/§17.2: a drifted materialization
            // is held for human review, not auto-rebuilt) or re-activate a Disabled one. The scheduled sweep
            // already filters these out; this guards a manual "refresh now" path from overriding the state.
            if (matResult.Status === 'DriftHold' || matResult.Status === 'Disabled') {
                return { Success: false, ErrorMessage: `Materialization ${matResult.ID} is ${matResult.Status} — refusing to refresh (resolve/re-enable it first to clear the status).` };
            }

            const exec = provider as unknown as ISQLExecutor;
            const isPostgres = exec.PlatformKey === 'postgresql';

            let rowCount: number;
            // Full-rebuild source fingerprint (watermark + source count), captured BEFORE the rebuild reads the
            // source but held in a LOCAL — it is applied to matResult ONLY on the success path below, NEVER on a
            // failure path. Persisting an advanced watermark for a rebuild that then threw would leave the next
            // incremental pass filtering `__mj_UpdatedAt > <watermark ahead of the actual data>`, permanently
            // skipping every row that changed before it (silent staleness). null ⇒ not a single-__mj_UpdatedAt
            // source ⇒ keep full-rebuilding (correct by construction).
            let fullRebuildFingerprint: { watermark: Date | null; count: number } | null = null;
            // Forced-full-rebuild cadence: true only when the incremental path handled this refresh. Drives the
            // RefreshesSinceFullRebuild counter in the success block (incremented on incremental, reset on any
            // full rebuild — external, base-view, first-run, count-drop fallback, or the forced periodic rebuild).
            let ranIncremental = false;
            // Phase 1.5 (EDS composition): an EDS-backed source (external entity base view OR external
            // query) can't be read via local SQL — fetch its rows through the EDS driver and persist
            // them. Local sources take the SQL path below.
            const externalEntity = this.resolveExternalEntity(matResult, provider);
            // Query source: load the stored Query ONCE here, then reuse it below (external rebuild OR the
            // local source-SELECT) instead of loading it a second time in resolveSourceSelect.
            const sourceQuery = externalEntity ? null : await this.resolveSourceQuery(matResult, contextUser, provider);
            if (externalEntity) {
                // SECURITY (Leak 1 runtime gate): refuse to (re)populate a local mirror of an external
                // read-RLS-protected entity. Its rows are read-REFUSED live under RLS (MJ can't enforce RLS on a
                // remote system), and a local mirror is readable UNSCOPED via any raw query over the wrapper view.
                // The CodeGen mint/drift gates also cover this, but they run only per codegen pass; this runtime
                // refusal closes the window between an entity gaining RLS and the next codegen run, during which
                // the scheduled sweep would otherwise keep refilling the mirror with the now-protected rows.
                if (MaterializationRefresher.entityHasReadRLS(externalEntity)) {
                    return await this.failRefresh(matResult, options, `Refusing to refresh base-view materialization of external RLS-protected entity "${externalEntity.Name}": a local mirror would expose rows the live path refuses under RLS.`);
                }
                const ext = await this.rebuildFromExternalEntity(matResult, externalEntity, exec, isPostgres, contextUser, provider, runShadowName);
                if (!ext.Success) return await this.failRefresh(matResult, options, ext.ErrorMessage ?? `External entity rebuild failed for materialization ${matResult.ID}`);
                rowCount = ext.RowCount ?? 0;
            } else if (sourceQuery?.externalSql) {
                const ext = await this.rebuildFromExternalQuery(matResult, sourceQuery.query, sourceQuery.externalSql, exec, isPostgres, contextUser, provider, runShadowName);
                if (!ext.Success) return await this.failRefresh(matResult, options, ext.ErrorMessage ?? `External query rebuild failed for materialization ${matResult.ID}`);
                rowCount = ext.RowCount ?? 0;
            } else {
                const sourceSelect = await this.resolveSourceSelect(matResult, contextUser, provider, isPostgres, sourceQuery?.query);
                if (!sourceSelect) {
                    return await this.failRefresh(matResult, options, `Could not resolve a source SELECT for materialization ${matResult.ID} (${matResult.SourceType})`);
                }

                const surrogateColumn = matResult.SourceType === 'Query' ? MATERIALIZATION_SURROGATE_COLUMN : undefined;
                // Phase 3: a keyed materialization (KeyColumns metadata set) hashes those columns into the
                // surrogate (the stable incremental-refresh match key); otherwise the synthetic surrogate.
                const hashKeyColumns = MaterializationRefresher.parseKeyColumns(matResult.KeyColumns);

                // Phase 3/4: for an eligible keyed aggregation (RefreshStrategy = DirtyGroupRecompute or
                // Incremental, with a watermark baseline), incrementally refresh only the changed groups IN
                // PLACE. Falls back to a full rebuild on the first run (no baseline), a source-count drop
                // (deletes can't be localized), or any ineligibility — the §10 refuse-under-uncertainty bias.
                // Forced-full-rebuild cadence: after N consecutive incremental refreshes, force a full rebuild to
                // reconcile any drift a balanced delete+insert (net-zero source count) left uncaught by the
                // delete-detection guard. Signalled into tryRefreshIncremental so it declines → full rebuild here.
                const forceFullRebuild = MaterializationRefresher.shouldForceFullRebuild(matResult.RefreshesSinceFullRebuild);
                const incremental = await this.tryRefreshIncremental(matResult, sourceSelect, hashKeyColumns, surrogateColumn, exec, isPostgres, forceFullRebuild);
                if (incremental.handled) {
                    rowCount = incremental.rowCount;
                    ranIncremental = true;
                } else {
                    const buildOpts = {
                        schema: matResult.SchemaName,
                        tableName: matResult.TableName,
                        viewName: matResult.ViewName,
                        sourceSelect,
                        surrogateColumn,
                        hashKeyColumns,
                        shadowName: runShadowName,
                    };
                    const statements = isPostgres
                        ? MaterializationRefresher.buildFullRebuildStatementsPostgreSQL(buildOpts)
                        : MaterializationRefresher.buildFullRebuildStatementsSQLServer(buildOpts);

                    // Compute the source fingerprint (watermark + row count) BEFORE the rebuild reads the
                    // source, so the NEXT refresh can go incremental. Order matters: computing AFTER the read
                    // would absorb a concurrent-update timestamp Tu into the watermark while the shadow still
                    // holds that row's OLD value — the strict `__mj_UpdatedAt > watermark` incremental filter
                    // would then exclude it forever, leaving its group's aggregate permanently stale. Computing
                    // before means the watermark can never exceed a value we actually persisted; at worst a row
                    // updated DURING the rebuild is harmlessly RE-processed next pass (recompute is idempotent).
                    // The source table is only read (never mutated) by the rebuild, so it's identical here.
                    // It is only APPLIED to matResult on success (below) — a thrown rebuild leaves it unpersisted.
                    fullRebuildFingerprint = await this.computeSourceFingerprint(matResult, sourceSelect, exec, isPostgres);

                    for (const sql of statements) {
                        await exec.ExecuteSQL(sql);
                    }

                    rowCount = await this.countMaterialized(matResult, exec, isPostgres);
                }
            }

            matResult.Status = 'Active';
            matResult.LastRefreshedAt = new Date();
            matResult.RowCount = rowCount;
            // Apply the full-rebuild fingerprint ONLY here, after the rebuild succeeded (see the local's note).
            if (fullRebuildFingerprint) {
                matResult.Watermark = fullRebuildFingerprint.watermark;
                matResult.SourceRowCount = fullRebuildFingerprint.count;
            }
            // Forced-full-rebuild cadence: count consecutive incremental refreshes, resetting to 0 on any full
            // rebuild (so the counter measures how long we've gone WITHOUT a full reconcile). At the threshold the
            // next refresh is forced to full-rebuild (see above), which resets it here.
            matResult.RefreshesSinceFullRebuild = MaterializationRefresher.nextRefreshesSinceFullRebuild(matResult.RefreshesSinceFullRebuild, ranIncremental);
            if (options && Object.prototype.hasOwnProperty.call(options, 'nextRefreshAt')) {
                matResult.NextRefreshAt = options.nextRefreshAt ?? null;
            }
            const saved = await matResult.Save();
            if (!saved) {
                // Do NOT route through failRefresh here. matResult already holds the full success state
                // (Status='Active', LastRefreshedAt, Watermark, …), and failRefresh would RE-Save it — so a
                // succeeding retry would mark the row Active/fresh with an advanced watermark while this method
                // returns {Success:false}, a self-contradictory outcome (an operator sees a "failed" refresh
                // that is actually Active). BaseEntity.Save is atomic, so this failed Save left the DB row
                // unchanged; report the failure plainly and let the next sweep re-attempt (the rebuild is
                // idempotent). Backoff is intentionally skipped — a MaterializedResult-row Save failing while
                // the rebuild SQL succeeded is an unusual transient infrastructure error, and a prompt retry
                // is the right recovery (not a rebuild storm risk the way a persistently bad source is).
                return { Success: false, RowCount: rowCount, ErrorMessage: `Refresh ran but the MaterializedResult update failed: ${matResult.LatestResult?.CompleteMessage ?? 'unknown error'}` };
            }
            return { Success: true, RowCount: rowCount };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`MaterializationRefresher.RefreshOne failed for materialization ${matResult.ID}: ${msg}`);
            // Best-effort: drop this run's shadow so a failed rebuild leaves no orphan table. (On success the
            // shadow is renamed INTO the canonical name, so there's nothing to drop.) Never let a cleanup error
            // mask the original failure. `exec`/`isPostgres` are re-derived because they're scoped to the try.
            await this.dropShadowTableBestEffort(provider, matResult.SchemaName, runShadowName);
            return await this.failRefresh(matResult, options, msg);
        }
    }

    /**
     * Drops a run's shadow table if it exists, swallowing any error (used only on the RefreshOne failure path so
     * a crashed/failed rebuild leaves no orphan). Uses IF EXISTS so it's a no-op when the shadow was never
     * created or was already renamed into the canonical table on success.
     */
    private async dropShadowTableBestEffort(provider: IMetadataProvider, schema: string, shadowName: string): Promise<void> {
        try {
            const exec = provider as unknown as ISQLExecutor;
            const isPostgres = exec.PlatformKey === 'postgresql';
            const sql = isPostgres
                ? `DROP TABLE IF EXISTS ${schema}."${shadowName}" CASCADE`
                : `IF OBJECT_ID('[${schema}].[${shadowName}]', 'U') IS NOT NULL DROP TABLE [${schema}].[${shadowName}]`;
            await exec.ExecuteSQL(sql);
        } catch (cleanupErr) {
            LogError(`MaterializationRefresher: best-effort shadow cleanup for '${shadowName}' failed (ignored): ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`);
        }
    }

    /**
     * Common failure exit for RefreshOne. Advances `NextRefreshAt` so a persistently-failing materialization
     * backs off to its configured cadence instead of being retried on every sweep (the driver's filterDue
     * treats an unchanged past/null NextRefreshAt as still-due — an unbounded rebuild/read storm against the
     * source DB). Called only from PRE-SUCCESS failure paths: thrown errors caught in RefreshOne AND the
     * returned {Success:false} paths for external-entity/query read failure and unresolvable source. (The
     * post-success Save-failure path deliberately does NOT use this — see the comment there — because matResult
     * would carry the full success state and re-Saving it would contradict the reported failure.)
     *
     * Status is deliberately NOT set here, so a concurrent DriftHold/Disabled can't be clobbered. RefreshOne
     * assigns Watermark/SourceRowCount/Status/LastRefreshedAt/RowCount only on the SUCCESS path, so on these
     * pre-success failures matResult carries no dirty field except the NextRefreshAt this sets — the Save writes
     * just that. Best-effort and non-throwing: a Save failure is logged, not thrown (the next sweep re-attempts). No-op when the
     * caller supplied no schedule (a manual "refresh now" with no options).
     */
    private async failRefresh(
        matResult: MJMaterializedResultEntity,
        options: { nextRefreshAt?: Date | null } | undefined,
        errorMessage: string,
    ): Promise<MaterializationRefreshResult> {
        if (options && Object.prototype.hasOwnProperty.call(options, 'nextRefreshAt')) {
            try {
                matResult.NextRefreshAt = options.nextRefreshAt ?? null;
                const saved = await matResult.Save();
                if (!saved) {
                    LogError(`MaterializationRefresher: could not persist NextRefreshAt backoff for ${matResult.ID}: ${matResult.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            } catch (e) {
                LogError(`MaterializationRefresher: could not persist NextRefreshAt backoff for ${matResult.ID}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return { Success: false, ErrorMessage: errorMessage };
    }

    /**
     * Phase 3/4: attempt an incremental in-place refresh of a keyed aggregation, recomputing only the
     * groups whose source rows changed since the watermark. Two strategies share ALL eligibility/guard
     * logic and differ only in how the recomputed groups are applied:
     *   - `DirtyGroupRecompute` (Phase 3) — DELETE the dirty groups then INSERT their fresh values;
     *   - `Incremental` (Phase 4) — UPSERT (MERGE / INSERT…ON CONFLICT) the fresh values onto the
     *     surrogate key, updating a surviving group's row in place (no churn). CodeGen assigns this to
     *     keyed single-source ADDITIVE aggregations.
     * Returns `{handled:true}` when it ran; `{handled:false}` (caller then full-rebuilds) on any
     * ineligibility OR a tripped guard. Guards (conservative — §10 refuse-under-uncertainty):
     *  - opt-in strategy for a keyed Query aggregation with a surrogate;
     *  - a watermark baseline must exist (first run full-rebuilds to establish it);
     *  - the source must be a SINGLE table exposing `__mj_UpdatedAt` and all key columns;
     *  - the current source row count must not be LOWER than the last (a net decrease = deletes → full
     *    rebuild self-heals).
     * On success it advances the watermark + source-count on `matResult` (persisted by the caller's Save).
     */
    private async tryRefreshIncremental(
        matResult: MJMaterializedResultEntity,
        sourceSelect: string,
        hashKeyColumns: { name: string; type: string }[] | undefined,
        surrogateColumn: string | undefined,
        exec: ISQLExecutor,
        isPostgres: boolean,
        forceFullRebuild: boolean,
    ): Promise<{ handled: boolean; rowCount: number }> {
        const notHandled = { handled: false, rowCount: 0 };
        // Periodic full-rebuild reconcile (RefreshOne's forced-cadence): decline so the caller full-rebuilds,
        // which reconciles any balanced-delete drift the incremental delete-detection guard can't catch.
        if (forceFullRebuild) return notHandled;
        const strategy = matResult.RefreshStrategy;
        if (strategy !== 'DirtyGroupRecompute' && strategy !== 'Incremental') return notHandled;
        if (matResult.SourceType !== 'Query') return notHandled;
        if (!hashKeyColumns || hashKeyColumns.length === 0 || !surrogateColumn) return notHandled;
        if (matResult.Watermark == null) return notHandled; // no baseline yet → full rebuild establishes it

        const src = this.resolveSingleSourceTable(sourceSelect, exec.PlatformKey);
        if (!src) return notHandled; // not a single-table source → can't localize with one watermark

        const updatedAtColumn = '__mj_UpdatedAt';
        const sourceCols = await this.getTableColumns(src.schema, src.table, exec);
        const sourceColSet = new Set(sourceCols.map((c) => c.toLowerCase()));
        if (!sourceColSet.has(updatedAtColumn.toLowerCase())) return notHandled; // no watermark column on source
        if (!hashKeyColumns.every((k) => sourceColSet.has(k.name.toLowerCase()))) return notHandled; // key col not a plain source column

        // Delete-detection guard: a NET drop in source rows means deletes we can't localize → full rebuild.
        // This catches only a net COUNT decrease. A delete BALANCED by an insert in the same window (delete
        // from group A, insert into group B — count unchanged) does NOT trip the guard, and group A is not
        // recomputed unless another change touches it, so A's aggregate would stay stale until then. That
        // residual drift is now bounded by the forced-full-rebuild cadence (RefreshesSinceFullRebuild +
        // FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES, applied in RefreshOne): every N incremental refreshes a
        // full rebuild reconciles the whole materialization, so a balanced-delete-stale group self-heals within
        // at most N cycles. Authors of very delete-heavy sources can still pin RefreshStrategy='FullRebuild'.
        const fp = await this.probeSourceFingerprint(src.schema, src.table, updatedAtColumn, exec, isPostgres);
        // No baseline source count → we CAN'T run the delete-detection guard, so we can't rule out deletions
        // since the last refresh → fall back to a full rebuild (which self-heals). This can happen if a
        // Watermark was established before SourceRowCount existed/was populated (e.g. the column added NULL).
        // Normally computeSourceFingerprint sets both together, so this is the defensive edge, not the norm.
        if (matResult.SourceRowCount == null) return notHandled;
        if (fp.count < matResult.SourceRowCount) return notHandled;

        // Data columns = the materialized table's columns minus the surrogate, in ordinal order.
        const matCols = await this.getTableColumns(matResult.SchemaName, matResult.TableName, exec);
        const dataColumns = matCols.filter((c) => c.toLowerCase() !== surrogateColumn.toLowerCase());
        if (dataColumns.length === 0) return notHandled;

        const opts = {
            schema: matResult.SchemaName, tableName: matResult.TableName,
            sourceSchema: src.schema, sourceTable: src.table,
            keyColumns: hashKeyColumns, aggregationSelect: sourceSelect,
            surrogateColumn, dataColumns, updatedAtColumn,
            watermarkSql: MaterializationRefresher.sqlDateTimeLiteral(matResult.Watermark),
        };
        if (strategy === 'Incremental') {
            // Single atomic UPSERT (MERGE / INSERT…ON CONFLICT) — no intermediate state for a reader to see.
            const statements = isPostgres
                ? MaterializationRefresher.buildIncrementalMergeStatementsPostgreSQL(opts)
                : MaterializationRefresher.buildIncrementalMergeStatementsSQLServer(opts);
            for (const sql of statements) {
                await exec.ExecuteSQL(sql);
            }
        } else {
            // DirtyGroupRecompute = DELETE the dirty groups, then INSERT their fresh values. Run BOTH inside
            // ONE transaction so a concurrent reader of the wrapper view never lands in the deleted-but-not-
            // yet-reinserted window (which would return those groups as missing / undercounted). SET XACT_ABORT
            // ON (SQL Server) rolls the transaction back on a mid-batch error instead of leaving it open.
            const dg = isPostgres
                ? MaterializationRefresher.buildDirtyGroupRecomputeStatementsPostgreSQL(opts)
                : MaterializationRefresher.buildDirtyGroupRecomputeStatementsSQLServer(opts);
            const batch = isPostgres
                ? `BEGIN;\n${dg.join(';\n')};\nCOMMIT;`
                : `SET XACT_ABORT ON;\nBEGIN TRANSACTION;\n${dg.join(';\n')};\nCOMMIT TRANSACTION;`;
            await exec.ExecuteSQL(batch);
        }

        // Count FIRST, then advance the fingerprint — so that if countMaterialized throws (transient DB error)
        // the exception reaches RefreshOne's catch → failRefresh with matResult's Watermark/SourceRowCount
        // still UNMUTATED. Advancing them before the count would let failRefresh persist a moved-forward
        // watermark for a refresh reported {Success:false} (the same watermark-on-failure hazard the
        // full-rebuild path avoids via a success-only local). The merge/dirty-group SQL has already committed,
        // so a failed count merely defers the fingerprint advance to the next pass (an idempotent re-process).
        const rowCount = await this.countMaterialized(matResult, exec, isPostgres);
        // Advance the fingerprint (new high-water + source count) for the next incremental pass.
        matResult.Watermark = fp.watermark;
        matResult.SourceRowCount = fp.count;
        return { handled: true, rowCount };
    }

    /**
     * Phase 3: compute a Query materialization's source fingerprint (watermark = MAX(__mj_UpdatedAt) + source
     * row count) so a subsequent DirtyGroupRecompute pass has a baseline. Returns null — meaning no baseline,
     * so the materialization keeps full-rebuilding (correct by construction) — unless the source is a single
     * table exposing `__mj_UpdatedAt`. PURE w.r.t. matResult: it does NOT mutate the entity; the caller applies
     * the returned fingerprint ONLY on the success path, so a failed rebuild never advances the persisted
     * watermark past data it didn't actually materialize.
     */
    private async computeSourceFingerprint(matResult: MJMaterializedResultEntity, sourceSelect: string, exec: ISQLExecutor, isPostgres: boolean): Promise<{ watermark: Date | null; count: number } | null> {
        if (matResult.SourceType !== 'Query') return null;
        const src = this.resolveSingleSourceTable(sourceSelect, exec.PlatformKey);
        if (!src) return null;
        // The single source must be a BASE TABLE, not a VIEW. A view can expose a `__mj_UpdatedAt` column, but that
        // value doesn't track changes in the view's UNDERLYING tables — so a watermark taken from a view would let
        // the incremental pass MISS changed groups. Decline (→ null → keep full-rebuilding) unless it's a base table.
        if (!(await this.sourceIsBaseTable(src.schema, src.table, exec))) return null;
        const updatedAtColumn = '__mj_UpdatedAt';
        const cols = await this.getTableColumns(src.schema, src.table, exec);
        if (!cols.some((c) => c.toLowerCase() === updatedAtColumn.toLowerCase())) return null;
        return await this.probeSourceFingerprint(src.schema, src.table, updatedAtColumn, exec, isPostgres);
    }

    /** Extracts the single source table of an aggregation SELECT, or null if it isn't exactly one table. */
    private resolveSingleSourceTable(sql: string, platformKey: string | undefined): { schema: string; table: string } | null {
        const refs = SQLParser.ExtractTableRefs(sql, GetDialect(platformKey ?? 'sqlserver'));
        if (!refs || refs.length !== 1 || !refs[0].TableName) return null;
        return { schema: refs[0].SchemaName, table: refs[0].TableName };
    }

    /** Column names of a table (ordinal order) via INFORMATION_SCHEMA (identical query on both engines). */
    private async getTableColumns(schema: string, table: string, exec: ISQLExecutor): Promise<string[]> {
        const esc = (s: string) => s.replace(/'/g, "''");
        const rows = await exec.ExecuteSQL<{ cn: string }>(
            `SELECT COLUMN_NAME AS cn FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='${esc(schema)}' AND TABLE_NAME='${esc(table)}' ORDER BY ORDINAL_POSITION`,
        );
        return (rows ?? []).map((r) => r.cn);
    }

    /**
     * True only if (schema, table) is a BASE TABLE (not a view) per INFORMATION_SCHEMA.TABLES — used to gate
     * incremental eligibility, since a watermark is only meaningful on a real table whose `__mj_UpdatedAt` tracks
     * its own row changes. `TABLE_TYPE = 'BASE TABLE'` is standard on both SQL Server and PostgreSQL. Returns
     * false when the object isn't found (fail-safe → no incremental).
     */
    private async sourceIsBaseTable(schema: string, table: string, exec: ISQLExecutor): Promise<boolean> {
        const esc = (s: string) => s.replace(/'/g, "''");
        const rows = await exec.ExecuteSQL<{ tt: string }>(
            `SELECT TABLE_TYPE AS tt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${esc(schema)}' AND TABLE_NAME='${esc(table)}'`,
        );
        return (rows?.[0]?.tt ?? '').toUpperCase() === 'BASE TABLE';
    }

    /**
     * Probes the source fingerprint used for incremental refresh: MAX(__mj_UpdatedAt) + COUNT(*).
     *
     * PRECISION SAFETY: the source column is datetimeoffset (100ns) but JS Date is millisecond-precision, so
     * `new Date(w)` TRUNCATES the sub-millisecond part — and per the ECMAScript spec Date always truncates
     * toward the past, never rounds up. That direction is the safe one: the strict incremental filter
     * `__mj_UpdatedAt > watermark` then treats the exact boundary row (the row whose timestamp WAS the max) as
     * still `>` the truncated watermark, so it is harmlessly RE-processed next pass (recompute is idempotent)
     * rather than skipped. A round-UP would be the dangerous case (permanently excluding that row) — which
     * cannot happen with Date truncation.
     */
    private async probeSourceFingerprint(schema: string, table: string, updatedAtColumn: string, exec: ISQLExecutor, isPostgres: boolean): Promise<{ watermark: Date | null; count: number }> {
        const obj = isPostgres ? `${schema}."${table}"` : `[${schema}].[${table}]`;
        const col = isPostgres ? `"${updatedAtColumn}"` : `[${updatedAtColumn}]`;
        const rows = await exec.ExecuteSQL<{ w: string | Date | null; c: number }>(`SELECT MAX(${col}) AS w, COUNT(*) AS c FROM ${obj}`);
        const w = rows?.[0]?.w ?? null;
        const rawMax = w == null ? null : w instanceof Date ? w : new Date(w);
        // Persist MAX - overlap (see applyWatermarkSafetyOverlap / WATERMARK_SAFETY_OVERLAP_MS) so a row committed
        // late (its __mj_UpdatedAt earlier than this MAX but its commit landing after this probe) is re-scanned by
        // the next incremental pass rather than skipped forever.
        const watermark = MaterializationRefresher.applyWatermarkSafetyOverlap(rawMax);
        return { watermark, count: Number(rows?.[0]?.c ?? 0) };
    }

    /** Counts the rows currently in the materialized wrapper view. */
    private async countMaterialized(matResult: MJMaterializedResultEntity, exec: ISQLExecutor, isPostgres: boolean): Promise<number> {
        const countTarget = isPostgres
            ? `${matResult.SchemaName}."${matResult.ViewName}"`
            : `[${matResult.SchemaName}].[${matResult.ViewName}]`;
        const rows = await exec.ExecuteSQL<{ n: number }>(`SELECT COUNT(*) AS n FROM ${countTarget}`);
        return Number(rows?.[0]?.n ?? 0);
    }

    /** A SQL datetime literal (ISO-8601 UTC) parsed by both SQL Server and PostgreSQL. */
    public static sqlDateTimeLiteral(date: Date): string {
        return `'${date.toISOString()}'`;
    }

    /**
     * A globally-unique, length-safe shadow-table name for one refresh run. Deliberately NOT derived from the
     * materialized table name: two refreshes of the SAME materialization (a manual "refresh now" racing the
     * scheduled sweep, or overlapping sweeps under `ConcurrencyMode=Concurrent`) must not share a shadow, or one
     * run's `DROP TABLE …__shadow` would yank the table the other is mid-build. A fixed short prefix + a random
     * token keeps it well under both engines' identifier limits (PG 63 / SQL Server 128) regardless of how long
     * the canonical table name is. The shadow is renamed INTO the canonical name on success (so it leaves no
     * residue), and dropped by RefreshOne's failure cleanup on a caught error; only a hard process crash between
     * shadow creation and swap can leak one — a harmless orphan table with no dependents.
     */
    public static makeShadowTableName(): string {
        return `mj_mat_shd_${randomUUID().replace(/-/g, '')}`;
    }

    /**
     * Applies the incremental-watermark safety overlap: returns `rawMax - WATERMARK_SAFETY_OVERLAP_MS` (null
     * passes through). Persisting the reduced value makes the next incremental pass RE-scan the last `overlap`
     * window, so a source row whose transaction commits after the fingerprint probe — but whose `__mj_UpdatedAt`
     * predates the probed MAX — is re-processed (idempotent MERGE) instead of being skipped forever. Pure and
     * unit-testable; extracted from probeSourceFingerprint so the skew-safety math is verifiable in isolation.
     */
    public static applyWatermarkSafetyOverlap(rawMax: Date | null): Date | null {
        return rawMax == null ? null : new Date(rawMax.getTime() - WATERMARK_SAFETY_OVERLAP_MS);
    }

    /**
     * True if an entity is read-RLS-protected — any of its role permissions carries a non-empty `ReadRLSFilterID`.
     * Matches CodeGenLib's `entityHasRowLevelSecurity` (and MJ's `GetUserRowLevelSecurityWhereClause`, which
     * sources the read filter solely from `EntityPermission.ReadRLSFilterID`). Used by the runtime leak gate to
     * refuse refreshing a local mirror of an EXTERNAL RLS-protected entity — a mirror can't reproduce remote RLS.
     */
    public static entityHasReadRLS(entity: EntityInfo): boolean {
        return entity.Permissions.some((p) => !!p.ReadRLSFilterID && p.ReadRLSFilterID.trim().length > 0);
    }

    /**
     * Resolves the source SELECT a refresh rebuilds from: the source entity's base view (base-view case)
     * or the stored Query's SQL (query case). Returns null when the source can't be resolved.
     */
    private async resolveSourceSelect(matResult: MJMaterializedResultEntity, contextUser: UserInfo, provider: IMetadataProvider, isPostgres: boolean, preloadedQuery?: MJQueryEntity): Promise<string | null> {
        if (matResult.SourceType === 'EntityBaseView') {
            if (!matResult.SourceEntityID) return null;
            const entity = provider.EntityByID(matResult.SourceEntityID);
            if (!entity || !entity.BaseView) return null;
            return isPostgres
                ? `SELECT * FROM ${entity.SchemaName}."${entity.BaseView}"`
                : `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}]`;
        }
        // Query case. For a RowFilterBroad materialization (Phase 2d) the BROAD source SELECT — the
        // query with its row-filter WHERE predicate(s) removed — is persisted on the row at
        // materialization time; the refresh rebuilds it broad and the filter is re-applied at read
        // (ExtraFilter on the materialized VE). Unparameterized queries use the static query SQL.
        if (!matResult.SourceQueryID) return null;
        let rawSql: string | null;
        if (matResult.ParamMode === 'RowFilterBroad') {
            rawSql = matResult.BroadSQL && matResult.BroadSQL.trim().length > 0 ? matResult.BroadSQL : null;
        } else {
            // Reuse the query loaded by resolveSourceQuery (RefreshOne) when available; only Load if not passed.
            let query = preloadedQuery;
            if (!query) {
                query = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', contextUser);
                await query.Load(matResult.SourceQueryID);
            }
            rawSql = query.SQL && query.SQL.trim().length > 0 ? query.SQL : null;
        }
        // Strip a top-level ORDER BY before this SELECT is wrapped in a derived table by the rebuild
        // (SELECT … INTO shadow FROM (<sql>) AS src): SQL Server rejects ORDER BY inside a derived table /
        // subquery without TOP/OFFSET (error 1033), so an analytics query ending in ORDER BY would fail
        // every refresh. A materialized snapshot has no inherent row order (readers apply their own ORDER
        // BY at read time), so dropping the source ordering is semantically safe.
        return rawSql == null ? null : MaterializationRefresher.stripTopLevelOrderBy(rawSql, isPostgres);
    }

    /**
     * Remove a TOP-LEVEL ORDER BY from a source SELECT so it can be wrapped in a derived table for the rebuild.
     * See resolveSourceSelect for why (SQL Server error 1033) and why it's safe (a snapshot is unordered).
     *
     * Two guards keep this from corrupting results:
     *  - **PostgreSQL is a no-op** — PG permits ORDER BY inside a derived table, so there's nothing to fix and
     *    we skip the parser round-trip entirely.
     *  - **A query with a row-LIMITING clause (SQL Server TOP or OFFSET/FETCH) is left UNCHANGED** — there the
     *    ORDER BY is both (a) LEGAL in a derived table and (b) SEMANTICALLY REQUIRED: it decides WHICH rows
     *    TOP/FETCH keep, so stripping it would materialize an arbitrary subset (a silent wrong-data bug). Only a
     *    BARE top-level ORDER BY (pure presentation sort, no limiting) is both illegal-in-derived-table and safe
     *    to drop.
     *
     * Uses the SQL parser; on any parse/shape surprise, or no top-level ORDER BY, returns the SQL unchanged
     * (an ORDER BY nested inside a subquery is legal and left intact).
     */
    public static stripTopLevelOrderBy(sql: string, isPostgres: boolean): string {
        if (isPostgres) return sql; // PG allows ORDER BY in a derived table → nothing to strip
        try {
            const dialect = GetDialect('sqlserver');
            const parsed = SQLParser.Astify(sql, dialect);
            if (!parsed.astParsed || parsed.ast == null) return sql;
            // Walk the AST opaquely (it's a discriminated union of many node shapes) via an unknown-typed
            // intermediate + guarded property access — the standard generic-AST-walk pattern.
            const stmtNode: unknown = Array.isArray(parsed.ast) ? (parsed.ast.length === 1 ? parsed.ast[0] : null) : parsed.ast;
            if (stmtNode == null || typeof stmtNode !== 'object') return sql;
            const s = stmtNode as Record<string, unknown>;
            if (s.type !== 'select' || s.orderby == null) return sql; // no top-level ORDER BY → nothing to strip
            // Keep the ORDER BY when a row-limiting clause is present (legal in a derived table + required to
            // pick the right rows): SQL Server `TOP` (s.top set) or `OFFSET…/FETCH…` (s.limit.offset/fetch set).
            const limit = s.limit as { offset?: unknown; fetch?: unknown } | null;
            const hasRowLimit = s.top != null || (limit != null && (limit.offset != null || limit.fetch != null));
            if (hasRowLimit) return sql;
            s.orderby = null;
            return SQLParser.SqlifyAST(parsed.ast as Parameters<typeof SQLParser.SqlifyAST>[0], dialect);
        } catch {
            return sql; // unparseable → leave as-is (no worse than before; a residual ORDER BY still errors → failRefresh)
        }
    }

    /**
     * Phase 1.5 (EDS composition): if this materialization is backed by an EXTERNAL entity base view
     * (the source entity carries an `ExternalDataSourceID`), returns that entity — the signal to rebuild
     * by fetching remote rows through the EDS driver rather than by local SQL. Returns null otherwise
     * (local sources, and — for now — external *queries*, which fall through to the local path).
     */
    private resolveExternalEntity(matResult: MJMaterializedResultEntity, provider: IMetadataProvider): EntityInfo | null {
        if (matResult.SourceType !== 'EntityBaseView' || !matResult.SourceEntityID) return null;
        const entity = provider.EntityByID(matResult.SourceEntityID);
        return entity && entity.ExternalDataSourceID ? entity : null;
    }

    /**
     * Phase 3: parse the materialization's `KeyColumns` metadata (JSON array of `{name, type}`) into the
     * hash-key column list, or undefined when it isn't keyed. A null/empty/malformed value yields undefined
     * — the caller then uses the synthetic IDENTITY/ROW_NUMBER surrogate (Phase 1/2 behavior).
     */
    public static parseKeyColumns(raw: string | null | undefined): { name: string; type: string }[] | undefined {
        if (!raw || raw.trim().length === 0) return undefined;
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed) && parsed.every((c) =>
                c != null && typeof (c as { name?: unknown }).name === 'string' && typeof (c as { type?: unknown }).type === 'string')) {
                return parsed as { name: string; type: string }[];
            }
        } catch {
            // Malformed metadata → treat as not keyed (fall through to the synthetic surrogate) rather than
            // failing the refresh; a bad KeyColumns value is a config error, not a reason to block rebuilds.
        }
        return undefined;
    }

    /**
     * Phase 1.5: rebuild a materialized result from an EXTERNAL entity — "mirror external → join locally".
     * Remote rows can't be read via local SQL, so we fetch them through the EDS read router (read-only)
     * and persist into the MJ-managed shadow table (CREATE + batched INSERT), then reuse the Phase-1
     * atomic wrapper-view swap. Once persisted the data is an ordinary local MJ table, joinable with
     * internal entities.
     *
     * RLS is NOT downgraded here (§6.1): base-view materialization REUSES the source entity (no new entity,
     * no changed permissions), so its `ReadRLSFilterID` is enforced at read time by the standard read
     * pipeline against the materialized wrapper view exactly as it would be against the live base view
     * (`DataSource:'Materialized'` only swaps the FROM). The physical mirror holding all rows is correct —
     * RLS filters at READ, like any base table. (This is why only the QUERY case — a new, differently-shaped
     * entity that loses source RLS — carries a mint-time refusal gate, not the base-view case.)
     */
    private async rebuildFromExternalEntity(
        matResult: MJMaterializedResultEntity,
        entity: EntityInfo,
        exec: ISQLExecutor,
        isPostgres: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        shadowName: string,
    ): Promise<MaterializationRefreshResult> {
        const router = MJGlobal.Instance.ClassFactory.CreateInstance<ExternalDataSourceReadRouter>(ExternalDataSourceReadRouter);
        if (!router) {
            return { Success: false, ErrorMessage: 'No ExternalDataSourceReadRouter is registered — ensure @memberjunction/external-data-sources and its driver are loaded in the refresh process.' };
        }
        const view = await router.RunViewExternal<Record<string, unknown>>(
            entity,
            { EntityName: entity.Name, ResultType: 'simple' },
            contextUser,
            provider,
        );
        if (!view.Success) {
            return { Success: false, ErrorMessage: `External read failed for '${entity.Name}': ${view.ErrorMessage}` };
        }
        const rows = (view.Results as Record<string, unknown>[] | undefined) ?? [];

        // Mirror the external entity's non-virtual fields (name + SQL type) into a local table so the
        // result becomes an ordinary joinable MJ table.
        const columns = entity.Fields.filter((f) => !f.IsVirtual).map((f) => ({ name: f.Name, sqlType: f.SQLFullType }));
        if (columns.length === 0) {
            return { Success: false, ErrorMessage: `External entity '${entity.Name}' has no columns to materialize.` };
        }

        await MaterializationRefresher.executeExternalRebuildPlan(matResult, columns, rows, exec, isPostgres, undefined, shadowName);
        return { Success: true, RowCount: rows.length };
    }

    /**
     * Runs a {@link buildExternalRebuildPlan}: DDL, then the parameterized insert batches (value binding —
     * not literal inlining), then the atomic swap. Shared by the external-entity and external-query paths.
     */
    private static async executeExternalRebuildPlan(
        matResult: MJMaterializedResultEntity,
        columns: { name: string; sqlType: string }[],
        rows: Record<string, unknown>[],
        exec: ISQLExecutor,
        isPostgres: boolean,
        surrogateColumn?: string,
        shadowName?: string,
    ): Promise<void> {
        const plan = MaterializationRefresher.buildExternalRebuildPlan({
            schema: matResult.SchemaName, tableName: matResult.TableName, viewName: matResult.ViewName,
            columns, rows, isPostgres, surrogateColumn, shadowName,
        });
        for (const sql of plan.preStatements) await exec.ExecuteSQL(sql);
        for (const batch of plan.insertBatches) await exec.ExecuteSQL(batch.sql, batch.params);
        for (const sql of plan.postStatements) await exec.ExecuteSQL(sql);
    }

    /**
     * Loads the materialization's source stored Query ONCE (Query source type only) and classifies it:
     * returns the loaded `query` plus `externalSql` — the SQL to run remotely when the query is EXTERNAL
     * (carries an ExternalDataSourceID: BroadSQL for RowFilterBroad, else the static query SQL), or null
     * when it's a LOCAL query. The caller reuses this same loaded `query` to build the local source SELECT
     * (no second Load). Returns null when the source isn't a stored Query.
     */
    private async resolveSourceQuery(
        matResult: MJMaterializedResultEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ query: MJQueryEntity; externalSql: string | null } | null> {
        if (matResult.SourceType !== 'Query' || !matResult.SourceQueryID) return null;
        const query = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', contextUser);
        await query.Load(matResult.SourceQueryID);
        if (!query.ExternalDataSourceID) return { query, externalSql: null };
        const sql = matResult.ParamMode === 'RowFilterBroad' ? (matResult.BroadSQL ?? '') : (query.SQL ?? '');
        return { query, externalSql: sql.trim().length > 0 ? sql : null };
    }

    /**
     * Phase 1.5: rebuild a materialized result from an EXTERNAL stored query. Runs the (broad, for
     * RowFilterBroad) query through the EDS native-query path, then persists the returned rows into the
     * MJ-managed shadow. Query results have no natural PK, so — mirroring the local query case — a synthetic
     * surrogate (MATERIALIZATION_SURROGATE_COLUMN) is prepended, populated by 1-based row index; column
     * types are inferred from the returned values. Row-filter re-application at read is the caller's
     * ExtraFilter (the Phase-2 convention), same as local RowFilterBroad materializations.
     */
    private async rebuildFromExternalQuery(
        matResult: MJMaterializedResultEntity,
        query: MJQueryEntity,
        sql: string,
        exec: ISQLExecutor,
        isPostgres: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        shadowName: string,
    ): Promise<MaterializationRefreshResult> {
        if (!query.ExternalDataSourceID) {
            return { Success: false, ErrorMessage: `Query '${query.Name}' is not backed by an external data source.` };
        }
        const router = MJGlobal.Instance.ClassFactory.CreateInstance<ExternalDataSourceReadRouter>(ExternalDataSourceReadRouter);
        if (!router) {
            return { Success: false, ErrorMessage: 'No ExternalDataSourceReadRouter is registered — ensure @memberjunction/external-data-sources and its driver are loaded in the refresh process.' };
        }
        const rq = await router.RunQueryExternal(query.ExternalDataSourceID, query.ID, query.Name, sql, { QueryID: query.ID }, contextUser, provider);
        if (!rq.Success) {
            return { Success: false, ErrorMessage: `External query read failed for '${query.Name}': ${rq.ErrorMessage}` };
        }
        const rawRows = (rq.Results as Record<string, unknown>[] | undefined) ?? [];

        // Data columns from the union of returned row keys; types inferred from the values. The synthetic
        // surrogate is prepended and populated per row (1-based) so the shared external rebuild builder
        // (which reads row[column]) handles it uniformly. Column types are ALWAYS SQL-Server-style here —
        // buildExternalRebuildPlan maps them to the PG native type for a PG target (mapSqlTypeToPostgres);
        // feeding PG-native names in would double-convert everything down to `text` (broken sorts/joins).
        const surrogate = MATERIALIZATION_SURROGATE_COLUMN;
        const dataColNames = [...new Set(rawRows.flatMap((r) => Object.keys(r)))];
        // Refuse if the external result already has a column named like the surrogate — prepending ours
        // would emit a duplicate column and the CREATE TABLE / INSERT would fail on every refresh. (Parity
        // with the local path's analyzeQueryForMaterialization shadow-check; here it's a runtime guard.)
        if (dataColNames.some((n) => n.trim().toLowerCase() === surrogate.toLowerCase())) {
            return { Success: false, ErrorMessage: `External query '${query.Name}' returns a column named "${surrogate}", which collides with the materialization surrogate key. Alias it in the query.` };
        }
        const columns = [
            // Surrogate is a 1-based row index whose column type MUST match the mint's surrogate PK type on
            // THIS engine (getMaterializedSurrogateColumnType): `int IDENTITY` on SQL Server, `bigint GENERATED
            // ALWAYS AS IDENTITY` on PostgreSQL. So feed the SS-style keyword that maps (via
            // buildExternalRebuildPlan → mapSqlTypeToPostgres for a PG target) to the mint type on each engine:
            // 'int' → SS int / 'bigint' → PG bigint. Using a fixed 'int' would leave the PG rebuild's surrogate
            // as `integer` while the minted entity's PK metadata says bigint — a mint-vs-refresh type mismatch.
            // (The value is a row index; on SS int caps at ~2.1B rows, but the EDS read materializes every row
            // in Node memory first, so such a set OOMs long before the surrogate could overflow.)
            { name: surrogate, sqlType: isPostgres ? 'bigint' : 'int' },
            ...dataColNames.map((name) => ({ name, sqlType: MaterializationRefresher.inferSqlType(rawRows.map((r) => r[name]), false) })),
        ];
        const rows = rawRows.map((r, i) => ({ [surrogate]: i + 1, ...r }));

        // Pass the surrogate so the plan restores its UNIQUE index post-swap (the minted entity's PK).
        await MaterializationRefresher.executeExternalRebuildPlan(matResult, columns, rows, exec, isPostgres, surrogate, shadowName);
        return { Success: true, RowCount: rawRows.length };
    }

    /**
     * Infer a column's SQL type from its fetched values (external-query materialization, where no field
     * metadata is available). All-null → nvarchar(max)/text; ALL-numbers → int/integer (bigint when any
     * value exceeds signed-32-bit) else float/double precision; ALL-booleans → bit/boolean; ALL Date OBJECTS
     * → datetime2/timestamptz; ANYTHING ELSE, including a column whose values are HETEROGENEOUS across rows or
     * arrive as date STRINGS → nvarchar(max)/text.
     *
     * The type is decided from EVERY present value, not just the first: a loosely-typed source (REST/GraphQL)
     * can return a field that is a number in one row and a string in another; typing the column from row 1
     * would make later rows fail to bind. Falling back to text (which accepts any value) is the safe answer.
     *
     * Date-like STRINGS (ISO-8601 over JSON transport) are deliberately kept as text, NOT coerced to a
     * temporal column: coerceExternalParamValue binds the raw string and relies on implicit conversion, which
     * can reject offset-bearing / edge ISO forms and fail the entire rebuild. Text loses nothing that matters
     * here — fixed-format ISO-8601 strings sort and range-compare CHRONOLOGICALLY under lexicographic text
     * ordering, so ORDER BY / `> 'YYYY-MM-DD…'` filters stay correct. Only genuine Date objects, whose bind is
     * well-defined, are typed as datetime2/timestamptz.
     */
    public static inferSqlType(values: unknown[], isPostgres: boolean): string {
        const text = isPostgres ? 'text' : 'nvarchar(max)';
        const present = values.filter((v) => v !== null && v !== undefined);
        if (present.length === 0) return text;
        if (present.every((v) => typeof v === 'number')) {
            const nums = present as number[];
            const allInt = nums.every((v) => Number.isInteger(v));
            if (!allInt) return isPostgres ? 'double precision' : 'float';
            // A JS number can exceed even signed-64-bit range (e.g. an epoch-nanosecond field or a synthetic
            // 1e19 id). Binding such a value to a bigint column overflows → the whole INSERT batch throws and
            // the refresh fails every pass. Fall to float/double precision (which holds the magnitude, if not
            // full integer precision — a value that large is already past JS's 2^53 exact-integer range anyway).
            const BIGINT_MAX = 9223372036854775807; // parsed by JS to the nearest double; fine for a >range guard
            if (nums.some((v) => v > BIGINT_MAX || v < -BIGINT_MAX - 1)) return isPostgres ? 'double precision' : 'float';
            // Widen to bigint when any value exceeds signed 32-bit range (bigint IDs, row counts > 2.1B,
            // epoch-millisecond timestamps) — an `int`/`integer` column would overflow on INSERT.
            const needsBig = nums.some((v) => v > 2147483647 || v < -2147483648);
            return needsBig ? 'bigint' : (isPostgres ? 'integer' : 'int');
        }
        if (present.every((v) => typeof v === 'boolean')) return isPostgres ? 'boolean' : 'bit';
        if (present.every((v) => v instanceof Date && !Number.isNaN(v.getTime()))) return isPostgres ? 'timestamptz' : 'datetime2';
        return text;
    }

    /**
     * External-source full rebuild PLAN (Phase 1.5), cross-engine and PARAMETERIZED. Pure (no IO) →
     * fully unit-testable (asserts on the emitted SQL + the params arrays). Three parts, run in order:
     *
     *  - `preStatements`  — DROP + CREATE the shadow table (pure DDL, no params).
     *  - `insertBatches`  — batched multi-row INSERTs as `{sql, params}`. NON-NULL values are bound as
     *    positional parameters (`@pN` on SQL Server, `$N` on PostgreSQL) instead of inlined as literals;
     *    NULLs are emitted as the literal `NULL` (no bind param — sidesteps driver null-typing quirks and
     *    carries no injection risk). This keeps the SQL TEXT small and constant regardless of row width or
     *    value size, so a large external mirror no longer builds enormous statements that pressure the Node
     *    heap or blow the database's parser/packet limits (the prior inline-VALUES limitation). Batches are
     *    sized by the engine's bind-parameter ceiling (SQL Server 2100 / PostgreSQL 65535, with headroom),
     *    capped at 1000 rows/statement.
     *  - `postStatements` — the atomic wrapper-view swap: transactional on SQL Server (the view only ever
     *    points at the canonical name; the transaction's Sch-M lock keeps readers on the old snapshot until
     *    commit — no "Invalid object name …__shadow" window; CREATE VIEW runs via EXEC() as its own batch),
     *    CASCADE-repoint sequence on PostgreSQL.
     *
     * NOTE: the source rows are already fully materialized in memory by the EDS read (RunViewExternal /
     * RunQueryExternal return the complete result set), so this fixes the SQL-text/packet half of the scale
     * problem; true end-to-end streaming would require a streaming read API on the EDS router (future work).
     */
    public static buildExternalRebuildPlan(opts: {
        schema: string; tableName: string; viewName: string;
        columns: { name: string; sqlType: string }[];
        rows: Record<string, unknown>[];
        isPostgres: boolean;
        /** Query case: the synthetic surrogate column to restore a UNIQUE index on post-swap (the minted
         *  entity's PK). Omit for the base-view case (the source PK column carries its own identity). */
        surrogateColumn?: string;
        /** Run-unique shadow table name (see {@link makeShadowTableName}) so two concurrent refreshes of the
         *  same materialization never share a shadow. Defaults to the legacy fixed name when omitted. */
        shadowName?: string;
    }): { preStatements: string[]; insertBatches: { sql: string; params: unknown[] }[]; postStatements: string[] } {
        const { schema, tableName, viewName, columns, rows, isPostgres, surrogateColumn } = opts;
        const shadow = opts.shadowName ?? `${tableName}__shadow`;
        // Escape the engine's identifier delimiter so a hostile external column name (these come from the
        // remote result-set keys — untrusted) can't break out of its quoting: `]`→`]]` (SQL Server),
        // `"`→`""` (PostgreSQL). Applied to every interpolated identifier (columns especially).
        const escId = (n: string) => (isPostgres ? n.replace(/"/g, '""') : n.replace(/]/g, ']]'));
        const q = (n: string) => (isPostgres ? `"${escId(n)}"` : `[${escId(n)}]`);
        const obj = (n: string) => (isPostgres ? `${schema}."${escId(n)}"` : `[${schema}].[${escId(n)}]`);
        const colDefs = columns
            .map((c) => (isPostgres ? `${q(c.name)} ${MaterializationRefresher.mapSqlTypeToPostgres(c.sqlType)}` : `${q(c.name)} ${c.sqlType} NULL`))
            .join(', ');
        const colList = columns.map((c) => q(c.name)).join(', ');

        const preStatements = isPostgres
            ? [`DROP TABLE IF EXISTS ${obj(shadow)} CASCADE`, `CREATE TABLE ${obj(shadow)} (${colDefs})`]
            : [`IF OBJECT_ID('[${schema}].[${shadow}]', 'U') IS NOT NULL DROP TABLE ${obj(shadow)}`, `CREATE TABLE ${obj(shadow)} (${colDefs})`];

        // Batch by the engine's bind-parameter ceiling (with headroom), capped at 1000 rows/statement.
        const maxParams = isPostgres ? 60000 : 2000;
        const rowsPerBatch = Math.max(1, Math.min(1000, Math.floor(maxParams / Math.max(1, columns.length))));
        const insertBatches: { sql: string; params: unknown[] }[] = [];
        for (let i = 0; i < rows.length; i += rowsPerBatch) {
            const batch = rows.slice(i, i + rowsPerBatch);
            const params: unknown[] = [];
            const tuples = batch.map((row) => {
                const placeholders = columns.map((c) => {
                    const v = MaterializationRefresher.coerceExternalParamValue(row[c.name]);
                    if (v === null) return 'NULL'; // literal — no bind param (driver null-typing quirk + injection-safe)
                    params.push(v);
                    return isPostgres ? `$${params.length}` : `@p${params.length - 1}`;
                });
                return `(${placeholders.join(', ')})`;
            });
            insertBatches.push({ sql: `INSERT INTO ${obj(shadow)} (${colList}) VALUES ${tuples.join(', ')}`, params });
        }

        const postStatements = isPostgres
            ? [
                  // ATOMIC swap in a SINGLE transaction (PG DDL is transactional) — drop the stale table,
                  // rename the shadow into the canonical name, (re)create the view on the new table, restore the
                  // surrogate index. NO interim repoint outside the transaction (parity with
                  // buildFullRebuildStatementsPostgreSQL): the wrapper view is only ever repointed INSIDE this
                  // transaction, so readers see the whole old snapshot until commit and a mid-swap failure rolls
                  // the ENTIRE swap back, leaving the OLD snapshot intact. The surrogate index is restored inside
                  // the tran (unnamed → PG auto-names).
                  `BEGIN;\n` +
                      `  DROP TABLE IF EXISTS ${obj(tableName)} CASCADE;\n` +
                      `  ALTER TABLE ${obj(shadow)} RENAME TO "${escId(tableName)}";\n` +
                      `  CREATE OR REPLACE VIEW ${obj(viewName)} AS SELECT * FROM ${obj(tableName)};\n` +
                      (surrogateColumn ? `  CREATE UNIQUE INDEX ON ${obj(tableName)} (${q(surrogateColumn)});\n` : '') +
                      `COMMIT;`,
              ]
            : [
                  // SET XACT_ABORT ON so a mid-swap error rolls the transaction back instead of leaving it
                  // open on the pooled connection. Restore the surrogate UNIQUE index (query case) inside the
                  // tran — parity with buildFullRebuildStatements* so the minted entity's PK is enforced.
                  `SET XACT_ABORT ON;\n` +
                      `BEGIN TRANSACTION;\n` +
                      `  IF OBJECT_ID('[${schema}].[${tableName}]', 'U') IS NOT NULL DROP TABLE ${obj(tableName)};\n` +
                      `  EXEC sp_rename '${schema}.${shadow}', '${tableName}';\n` +
                      `  EXEC('CREATE OR ALTER VIEW ${obj(viewName)} AS SELECT * FROM ${obj(tableName)}');\n` +
                      // Fixed SHORT index name (unique per-table on SS) so a long materialized_<longName>
                      // table can't overflow the 128-char sysname limit and roll back the swap — matches
                      // buildFullRebuildStatementsSQLServer.
                      (surrogateColumn ? `  CREATE UNIQUE INDEX [UQ_MJ_Materialized_Surrogate] ON ${obj(tableName)} (${q(surrogateColumn)});\n` : '') +
                      `COMMIT TRANSACTION;`,
              ];

        return { preStatements, insertBatches, postStatements };
    }

    /**
     * Coerce a JS value fetched from an external source into a driver-bindable parameter value:
     * null/undefined → null (the caller emits a literal `NULL` for these); non-finite numbers → null;
     * plain objects → JSON text (matches the `inferSqlType` text mapping for object columns); Date and
     * primitives (boolean/number/string) pass through — the driver binds them to the shadow column type.
     */
    public static coerceExternalParamValue(value: unknown): unknown {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
        return value; // boolean, Date, string
    }

    /** Map a SQL-Server-style `SQLFullType` (e.g. `nvarchar(255)`, `int`, `bit`) to a PostgreSQL column type. */
    public static mapSqlTypeToPostgres(sqlFullType: string): string {
        const base = sqlFullType.trim().toLowerCase().replace(/\(.*\)$/, '');
        switch (base) {
            case 'bit': return 'boolean';
            case 'tinyint': case 'smallint': return 'smallint';
            case 'int': return 'integer';
            case 'bigint': return 'bigint';
            case 'decimal': case 'numeric': case 'money': case 'smallmoney': return 'numeric';
            case 'float': case 'real': return 'double precision';
            case 'date': return 'date';
            case 'time': return 'time';
            case 'datetime': case 'datetime2': case 'smalldatetime': return 'timestamp';
            case 'datetimeoffset': return 'timestamptz';
            case 'uniqueidentifier': return 'uuid';
            case 'char': case 'nchar': case 'varchar': case 'nvarchar': case 'text': case 'ntext': case 'xml': return 'text';
            case 'varbinary': case 'binary': case 'image': return 'bytea';
            // Pass through already-PG-native type names — on a PostgreSQL deployment an external entity's
            // SQLFullType is already PG-native (e.g. mirroring a PG external source), so these must NOT fall
            // to the `text` default (which would silently stringify numbers/dates/uuids). Unknown → text.
            case 'integer': return 'integer';
            case 'boolean': case 'bool': return 'boolean';
            case 'double precision': return 'double precision';
            case 'timestamp': case 'timestamp without time zone': return 'timestamp';
            case 'timestamptz': case 'timestamp with time zone': return 'timestamptz';
            case 'uuid': return 'uuid';
            case 'bytea': return 'bytea';
            case 'json': case 'jsonb': return base;
            case 'character varying': case 'character': return 'text';
            default: return 'text';
        }
    }

    /**
     * Quote a SQL identifier for the engine, ESCAPING the closing delimiter so a column name that contains
     * it can't break out of the quotes: `]`→`]]` (SQL Server), `"`→`""` (PostgreSQL). Column names in the
     * keyed/incremental builders are CodeGen-derived (entity field / KeyColumns names), so this is a
     * consistency + robustness guard (matching buildExternalRebuildPlan's escId), not a live-injection fix.
     */
    public static quoteIdent(name: string, isPostgres: boolean): string {
        return isPostgres ? `"${name.replace(/"/g, '""')}"` : `[${name.replace(/]/g, ']]')}]`;
    }

    /**
     * Phase 3: SQL expression producing the CANONICAL TEXT of one key column for the combined-key
     * surrogate hash (§17.1). Deterministic within an engine; a NULL is replaced by a control-char-wrapped
     * sentinel (CHAR(30)) so it can't collide with a literal value. `type` is the column's SQL-Server-style
     * type (EntityFieldInfo.SQLFullType); the base type drives the canonical cast.
     */
    public static canonicalKeyColumnSql(name: string, type: string, isPostgres: boolean): string {
        const base = type.trim().toLowerCase().replace(/\(.*\)$/, '');
        const col = MaterializationRefresher.quoteIdent(name, isPostgres);
        const nullSentinel = isPostgres ? `chr(30) || 'NULL' || chr(30)` : `CHAR(30) + 'NULL' + CHAR(30)`;
        let canonical: string;
        if (isPostgres) {
            switch (base) {
                case 'uniqueidentifier': case 'uuid': canonical = `lower(${col}::text)`; break;
                // WHEN IS NULL → NULL first, so a NULL boolean flows to the COALESCE null-sentinel below
                // instead of colliding with false ('0'). Without it, `CASE WHEN col ...` returns '0' for NULL.
                case 'bit': case 'boolean': canonical = `(CASE WHEN ${col} IS NULL THEN NULL WHEN ${col} THEN '1' ELSE '0' END)`; break;
                case 'date': canonical = `to_char(${col}::date, 'YYYY-MM-DD')`; break;
                // TZ-AWARE: convert to UTC wall-clock deterministically (the value already carries a zone).
                case 'datetimeoffset': case 'timestamptz':
                    canonical = `to_char((${col} AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`; break;
                // NAIVE (no zone): format the stored wall-clock AS-IS, appending a literal Z. Casting a naive
                // timestamp to timestamptz would interpret it in the SESSION TimeZone — a within-engine
                // determinism break if the session zone ever differs between refreshes. Mirror the SQL Server
                // plain-datetime branch (which appends Z without a tz shift).
                case 'datetime': case 'datetime2': case 'smalldatetime': case 'timestamp':
                    canonical = `to_char(${col}::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`; break;
                // Fixed-point numeric text. `money::text` is lc_monetary-dependent (currency symbol + group
                // separators) — route through ::numeric so the canonical form is locale-independent.
                case 'decimal': case 'numeric': case 'money': case 'smallmoney': canonical = `(${col}::numeric)::text`; break;
                default: canonical = `${col}::text`; // integers, strings
            }
        } else {
            switch (base) {
                case 'uniqueidentifier': canonical = `LOWER(CONVERT(varchar(36), ${col}))`; break;
                // WHEN IS NULL → NULL first, so a NULL bit flows to the COALESCE null-sentinel below instead
                // of colliding with false ('0'). Without it, `col = 1` is UNKNOWN for NULL → ELSE '0'.
                case 'bit': canonical = `(CASE WHEN ${col} IS NULL THEN NULL WHEN ${col} = 1 THEN '1' ELSE '0' END)`; break;
                case 'date': canonical = `CONVERT(varchar(10), ${col}, 23)`; break;
                case 'datetimeoffset':
                    canonical = `FORMAT(CAST(${col} AT TIME ZONE 'UTC' AS datetime2(3)), 'yyyy-MM-ddTHH:mm:ss.fffZ')`; break;
                case 'datetime': case 'datetime2': case 'smalldatetime':
                    canonical = `FORMAT(CAST(${col} AS datetime2(3)), 'yyyy-MM-ddTHH:mm:ss.fffZ')`; break;
                case 'decimal': case 'numeric': case 'money': case 'smallmoney': canonical = `CONVERT(varchar(50), ${col})`; break;
                default: canonical = `CONVERT(nvarchar(max), ${col})`; // integers, strings
            }
        }
        return `COALESCE(${canonical}, ${nullSentinel})`;
    }

    /**
     * Phase 3: SQL expression computing the combined-key surrogate — `SHA2_256` (lowercase hex) over the
     * canonical key columns in declared key order (§17.1). Deterministic WITHIN an engine (the
     * incremental-MERGE / dirty-group match key); cross-engine identity is best-effort.
     *
     * COLLISION SAFETY: each canonical part is hashed to a FIXED-WIDTH 64-char hex string FIRST, and the
     * per-part hashes are what get delimited + hashed. A naive `part1 + CHAR(31) + part2` collides when a
     * key value itself contains the CHAR(31) delimiter (or the CHAR(30) NULL sentinel) — e.g. ('x\x1f','y')
     * and ('x','\x1fy') both flatten to `x\x1f\x1fy`. Hashing each part first makes every part pure hex
     * (0-9a-f), which can NEVER contain a control char, so the delimiter is unambiguous and distinct tuples
     * can no longer canonicalize to the same string. Each canonical part is NULL-free (COALESCE'd), so the
     * inner hash inputs are never NULL. (This feature is unreleased, so no existing surrogates need
     * migrating; a full rebuild regenerates them under the new scheme.)
     * NOTE: the PostgreSQL `digest()` used here requires the `pgcrypto` extension. MJ's PostgreSQL baseline
     * already runs `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`, so keyed PG materializations get it for free;
     * a deployment that dropped that baseline step would see refreshes fail with a clear `function digest(...)
     * does not exist` — provision pgcrypto to resolve.
     */
    public static buildHashKeyExpression(keyColumns: { name: string; type: string }[], isPostgres: boolean): string {
        if (keyColumns.length === 0) {
            throw new Error('buildHashKeyExpression requires at least one key column.');
        }
        const canonical = keyColumns.map((c) => MaterializationRefresher.canonicalKeyColumnSql(c.name, c.type, isPostgres));
        if (isPostgres) {
            const hashedParts = canonical.map((p) => `encode(digest(convert_to(${p}, 'UTF8'), 'sha256'), 'hex')`);
            const joined = hashedParts.join(` || chr(31) || `);
            return `encode(digest(convert_to(${joined}, 'UTF8'), 'sha256'), 'hex')`;
        }
        const hashedParts = canonical.map((p) => `CONVERT(varchar(64), HASHBYTES('SHA2_256', ${p}), 2)`);
        const joined = hashedParts.join(` + CHAR(31) + `);
        return `LOWER(CONVERT(varchar(64), HASHBYTES('SHA2_256', ${joined}), 2))`;
    }

    /**
     * Phase 3 (DirtyGroupRecompute): a NULL-safe equality predicate matching the key columns of two
     * aliases (`(a.[k] = b.[k] OR (a.[k] IS NULL AND b.[k] IS NULL)) AND ...`). Two NULL keys are treated
     * as equal (a materialized aggregation can legitimately have a NULL grouping value — it's one group).
     * Portable across SQL Server and PostgreSQL (the `OR ... IS NULL` form works on both; we avoid
     * `IS NOT DISTINCT FROM`, which SQL Server lacks pre-2022). Pure/unit-testable.
     */
    public static buildKeyMatchPredicate(aliasA: string, aliasB: string, keyColumns: { name: string }[], isPostgres: boolean): string {
        const q = (n: string) => MaterializationRefresher.quoteIdent(n, isPostgres);
        return keyColumns
            .map((c) => {
                const a = `${aliasA}.${q(c.name)}`;
                const b = `${aliasB}.${q(c.name)}`;
                return `(${a} = ${b} OR (${a} IS NULL AND ${b} IS NULL))`;
            })
            .join(' AND ');
    }

    /**
     * Phase 3 (DirtyGroupRecompute): the ordered statements that incrementally refresh a keyed aggregation
     * IN PLACE (no shadow swap) by recomputing only the groups whose SOURCE rows changed since `watermarkSql`.
     * Pure (no IO), so the sequence is unit-testable. Engine-agnostic core; {@link buildDirtyGroupRecomputeStatementsSQLServer}
     * / {@link buildDirtyGroupRecomputeStatementsPostgreSQL} supply the per-engine quoting + DELETE syntax.
     *
     * Semantics (correct within the documented delete caveat — see RefreshOne):
     *  1. DELETE every materialized row whose group has ANY source row updated since the watermark
     *     (removes stale values, AND removes a group that shrank/emptied among the changed groups);
     *  2. INSERT the freshly-computed values for exactly those dirty groups (from the aggregation SELECT,
     *     filtered by the same "group has a changed source row" predicate), stamping the same hash surrogate
     *     the full rebuild uses so the key stays stable.
     * A group whose rows were ALL deleted without any surviving-row update is NOT seen here (the deleted
     * rows are gone); that case is caught by the source-count-drop → full-rebuild guard in RefreshOne.
     */
    private static buildDirtyGroupRecomputeCore(opts: {
        matTable: string;         // fully-qualified, engine-quoted materialized table
        sourceTable: string;      // fully-qualified, engine-quoted source table
        deleteHead: string;       // engine-specific "DELETE ... FROM <matTable> AS m"
        keyColumns: { name: string; type: string }[];
        aggregationSelect: string;
        surrogateColumn: string;
        dataColumns: string[];    // ordered aggregation output columns (key + measures), excluding surrogate
        updatedAtColumn: string;
        watermarkSql: string;     // a SQL datetime literal/expression (already quoted)
        isPostgres: boolean;
    }): string[] {
        const { matTable, sourceTable, deleteHead, keyColumns, aggregationSelect, surrogateColumn, dataColumns, updatedAtColumn, watermarkSql, isPostgres } = opts;
        const q = (n: string) => MaterializationRefresher.quoteIdent(n, isPostgres);
        const changedSince = `s.${q(updatedAtColumn)} > ${watermarkSql}`;
        const deleteMatch = MaterializationRefresher.buildKeyMatchPredicate('m', 's', keyColumns, isPostgres);
        const insertMatch = MaterializationRefresher.buildKeyMatchPredicate('agg', 's', keyColumns, isPostgres);
        const hashExpr = MaterializationRefresher.buildHashKeyExpression(keyColumns, isPostgres);
        const colList = [surrogateColumn, ...dataColumns].map(q).join(', ');
        const selectList = [hashExpr, ...dataColumns.map((c) => `agg.${q(c)}`)].join(', ');
        return [
            // 1) Remove all rows for the changed (dirty) groups.
            `${deleteHead} WHERE EXISTS (SELECT 1 FROM ${sourceTable} AS s WHERE ${changedSince} AND ${deleteMatch})`,
            // 2) Re-insert fresh values for the dirty groups that still exist.
            `INSERT INTO ${matTable} (${colList}) SELECT ${selectList} FROM (${aggregationSelect}) AS agg ` +
                `WHERE EXISTS (SELECT 1 FROM ${sourceTable} AS s WHERE ${changedSince} AND ${insertMatch})`,
        ];
    }

    /** SQL Server dirty-group recompute (see {@link buildDirtyGroupRecomputeCore}). */
    public static buildDirtyGroupRecomputeStatementsSQLServer(opts: {
        schema: string; tableName: string;
        sourceSchema: string; sourceTable: string;
        keyColumns: { name: string; type: string }[];
        aggregationSelect: string; surrogateColumn: string; dataColumns: string[];
        updatedAtColumn: string; watermarkSql: string;
    }): string[] {
        const matTable = `[${opts.schema}].[${opts.tableName}]`;
        const sourceTable = `[${opts.sourceSchema}].[${opts.sourceTable}]`;
        return MaterializationRefresher.buildDirtyGroupRecomputeCore({
            matTable, sourceTable,
            deleteHead: `DELETE m FROM ${matTable} AS m`,
            keyColumns: opts.keyColumns, aggregationSelect: opts.aggregationSelect,
            surrogateColumn: opts.surrogateColumn, dataColumns: opts.dataColumns,
            updatedAtColumn: opts.updatedAtColumn, watermarkSql: opts.watermarkSql, isPostgres: false,
        });
    }

    /** PostgreSQL dirty-group recompute (see {@link buildDirtyGroupRecomputeCore}). */
    public static buildDirtyGroupRecomputeStatementsPostgreSQL(opts: {
        schema: string; tableName: string;
        sourceSchema: string; sourceTable: string;
        keyColumns: { name: string; type: string }[];
        aggregationSelect: string; surrogateColumn: string; dataColumns: string[];
        updatedAtColumn: string; watermarkSql: string;
    }): string[] {
        const matTable = `${opts.schema}."${opts.tableName}"`;
        const sourceTable = `${opts.sourceSchema}."${opts.sourceTable}"`;
        return MaterializationRefresher.buildDirtyGroupRecomputeCore({
            matTable, sourceTable,
            deleteHead: `DELETE FROM ${matTable} AS m`,
            keyColumns: opts.keyColumns, aggregationSelect: opts.aggregationSelect,
            surrogateColumn: opts.surrogateColumn, dataColumns: opts.dataColumns,
            updatedAtColumn: opts.updatedAtColumn, watermarkSql: opts.watermarkSql, isPostgres: true,
        });
    }

    /**
     * Phase 4 (RefreshStrategy = 'Incremental'): incrementally refresh a keyed ADDITIVE aggregation by
     * recomputing only the changed groups and UPSERTING them onto the surrogate key — an in-place MERGE
     * (SQL Server) / INSERT…ON CONFLICT (PostgreSQL) rather than the DirtyGroupRecompute delete-then-insert.
     * The recomputed source is identical (the aggregation restricted to groups with a source row changed
     * since the watermark); the difference is that a surviving group's row is UPDATED in place — no churn,
     * no transient absence, one atomic statement. Correct for insert/update; a net source-count drop
     * (deletes) still falls back to full rebuild via the RefreshOne guard. Requires the surrogate to be
     * unique (it is the materialized table's PK). Pure (no IO) / unit-testable.
     */
    public static buildIncrementalMergeStatementsSQLServer(opts: {
        schema: string; tableName: string;
        sourceSchema: string; sourceTable: string;
        keyColumns: { name: string; type: string }[];
        aggregationSelect: string; surrogateColumn: string; dataColumns: string[];
        updatedAtColumn: string; watermarkSql: string;
    }): string[] {
        const matTable = `[${opts.schema}].[${opts.tableName}]`;
        const sourceTable = `[${opts.sourceSchema}].[${opts.sourceTable}]`;
        const q = (n: string) => MaterializationRefresher.quoteIdent(n, false);
        const changedSince = `s.${q(opts.updatedAtColumn)} > ${opts.watermarkSql}`;
        const match = MaterializationRefresher.buildKeyMatchPredicate('agg', 's', opts.keyColumns, false);
        const hashExpr = MaterializationRefresher.buildHashKeyExpression(opts.keyColumns, false);
        const insertCols = [opts.surrogateColumn, ...opts.dataColumns].map(q).join(', ');
        const insertVals = [`src.${q(opts.surrogateColumn)}`, ...opts.dataColumns.map((c) => `src.${q(c)}`)].join(', ');
        const setList = opts.dataColumns.map((c) => `t.${q(c)} = src.${q(c)}`).join(', ');
        const selectList = [`${hashExpr} AS ${q(opts.surrogateColumn)}`, ...opts.dataColumns.map((c) => `agg.${q(c)}`)].join(', ');
        return [
            // WITH (HOLDLOCK) on the MERGE target takes a range lock so a concurrent MERGE can't slip between the
            // MATCHED probe and the INSERT — the classic SQL Server MERGE upsert race (duplicate-key / lost update).
            // This mirrors PostgreSQL's INSERT … ON CONFLICT, which is atomically race-safe by construction.
            `MERGE INTO ${matTable} WITH (HOLDLOCK) AS t ` +
                `USING (SELECT ${selectList} FROM (${opts.aggregationSelect}) AS agg ` +
                `WHERE EXISTS (SELECT 1 FROM ${sourceTable} AS s WHERE ${changedSince} AND ${match})) AS src ` +
                `ON t.${q(opts.surrogateColumn)} = src.${q(opts.surrogateColumn)} ` +
                `WHEN MATCHED THEN UPDATE SET ${setList} ` +
                `WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals});`,
        ];
    }

    /** PostgreSQL incremental upsert — the INSERT…ON CONFLICT counterpart of the SQL Server MERGE above. */
    public static buildIncrementalMergeStatementsPostgreSQL(opts: {
        schema: string; tableName: string;
        sourceSchema: string; sourceTable: string;
        keyColumns: { name: string; type: string }[];
        aggregationSelect: string; surrogateColumn: string; dataColumns: string[];
        updatedAtColumn: string; watermarkSql: string;
    }): string[] {
        const matTable = `${opts.schema}."${opts.tableName}"`;
        const sourceTable = `${opts.sourceSchema}."${opts.sourceTable}"`;
        const q = (n: string) => MaterializationRefresher.quoteIdent(n, true);
        const changedSince = `s.${q(opts.updatedAtColumn)} > ${opts.watermarkSql}`;
        const match = MaterializationRefresher.buildKeyMatchPredicate('agg', 's', opts.keyColumns, true);
        const hashExpr = MaterializationRefresher.buildHashKeyExpression(opts.keyColumns, true);
        const insertCols = [opts.surrogateColumn, ...opts.dataColumns].map(q).join(', ');
        const selectList = [hashExpr, ...opts.dataColumns.map((c) => `agg.${q(c)}`)].join(', ');
        const setList = opts.dataColumns.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ');
        return [
            `INSERT INTO ${matTable} (${insertCols}) ` +
                `SELECT ${selectList} FROM (${opts.aggregationSelect}) AS agg ` +
                `WHERE EXISTS (SELECT 1 FROM ${sourceTable} AS s WHERE ${changedSince} AND ${match}) ` +
                `ON CONFLICT (${q(opts.surrogateColumn)}) DO UPDATE SET ${setList};`,
        ];
    }
}
