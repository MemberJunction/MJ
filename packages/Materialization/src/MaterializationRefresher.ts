import { IMetadataProvider, UserInfo, LogError } from '@memberjunction/core';
import { MJMaterializedResultEntity, MJQueryEntity } from '@memberjunction/core-entities';

/**
 * Synthetic surrogate key column name for query-materialized tables. MUST match CodeGenLib's
 * `MATERIALIZATION_SURROGATE_COLUMN` (materializationAnalysis.ts) — CodeGen creates the column with
 * this name and the refresher must regenerate it on every rebuild. (A shared low-level home for this
 * constant is a follow-up; duplicated deliberately to avoid a runtime dependency on the dev-time CodeGenLib.)
 */
export const MATERIALIZATION_SURROGATE_COLUMN = '__mj_MaterializedRowID';

/**
 * Minimal structural type for a runtime SQL-executing provider. Both SQLServerDataProvider and
 * PostgreSQLDataProvider expose `ExecuteSQL`; we depend on the shape, not the concrete class, to
 * avoid coupling this engine to a specific provider package.
 */
export interface ISQLExecutor {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ExecuteSQL<T = any>(sql: string): Promise<T[]>;
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
    }): string[] {
        const { schema, tableName, viewName, sourceSelect, surrogateColumn } = opts;
        const shadow = `${tableName}__shadow`;
        const obj = (n: string) => `[${schema}].[${n}]`;
        const selectInto = surrogateColumn
            ? `SELECT IDENTITY(int, 1, 1) AS [${surrogateColumn}], src.* INTO ${obj(shadow)} FROM (${sourceSelect}) AS src`
            : `SELECT * INTO ${obj(shadow)} FROM (${sourceSelect}) AS src`;
        return [
            // 1) Build a fresh shadow from the source (clear any leftover from a prior failed run).
            `IF OBJECT_ID('[${schema}].[${shadow}]', 'U') IS NOT NULL DROP TABLE ${obj(shadow)}`,
            selectInto,
            // 2) Atomic repoint — readers immediately see the freshly-built shadow.
            `CREATE OR ALTER VIEW ${obj(viewName)} AS SELECT * FROM ${obj(shadow)}`,
            // 3) Drop the stale table, rename the shadow into the canonical name, repoint the view back
            //    (keeps the canonical `materialized_<Name>` name stable for migration-reuse detection, §12).
            `IF OBJECT_ID('[${schema}].[${tableName}]', 'U') IS NOT NULL DROP TABLE ${obj(tableName)}`,
            `EXEC sp_rename '${schema}.${shadow}', '${tableName}'`,
            `CREATE OR ALTER VIEW ${obj(viewName)} AS SELECT * FROM ${obj(tableName)}`,
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
    }): string[] {
        const { schema, tableName, viewName, sourceSelect, surrogateColumn } = opts;
        const shadow = `${tableName}__shadow`;
        const obj = (n: string) => `${schema}."${n}"`;
        const createShadow = surrogateColumn
            ? `CREATE TABLE ${obj(shadow)} AS SELECT ROW_NUMBER() OVER () AS "${surrogateColumn}", src.* FROM (${sourceSelect}) AS src`
            : `CREATE TABLE ${obj(shadow)} AS SELECT * FROM (${sourceSelect}) AS src`;
        return [
            // 1) Build a fresh shadow (CASCADE clears any leftover shadow + transient view dependency).
            `DROP TABLE IF EXISTS ${obj(shadow)} CASCADE`,
            createShadow,
            // 2) Atomic repoint — readers immediately see the freshly-built shadow.
            `CREATE OR REPLACE VIEW ${obj(viewName)} AS SELECT * FROM ${obj(shadow)}`,
            // 3) Drop the stale table, rename the shadow into the canonical name, repoint the view back
            //    (keeps the canonical `materialized_<name>` name stable for migration-reuse detection, §12).
            `DROP TABLE IF EXISTS ${obj(tableName)} CASCADE`,
            `ALTER TABLE ${obj(shadow)} RENAME TO "${tableName}"`,
            `CREATE OR REPLACE VIEW ${obj(viewName)} AS SELECT * FROM ${obj(tableName)}`,
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
        try {
            const exec = provider as unknown as ISQLExecutor;
            const isPostgres = exec.PlatformKey === 'postgresql';

            const sourceSelect = await this.resolveSourceSelect(matResult, contextUser, provider, isPostgres);
            if (!sourceSelect) {
                return { Success: false, ErrorMessage: `Could not resolve a source SELECT for materialization ${matResult.ID} (${matResult.SourceType})` };
            }

            const surrogateColumn = matResult.SourceType === 'Query' ? MATERIALIZATION_SURROGATE_COLUMN : undefined;
            const buildOpts = {
                schema: matResult.SchemaName,
                tableName: matResult.TableName,
                viewName: matResult.ViewName,
                sourceSelect,
                surrogateColumn,
            };
            const statements = isPostgres
                ? MaterializationRefresher.buildFullRebuildStatementsPostgreSQL(buildOpts)
                : MaterializationRefresher.buildFullRebuildStatementsSQLServer(buildOpts);

            for (const sql of statements) {
                await exec.ExecuteSQL(sql);
            }

            const countTarget = isPostgres
                ? `${matResult.SchemaName}."${matResult.ViewName}"`
                : `[${matResult.SchemaName}].[${matResult.ViewName}]`;
            const countRows = await exec.ExecuteSQL<{ n: number }>(`SELECT COUNT(*) AS n FROM ${countTarget}`);
            const rowCount = countRows?.[0]?.n ?? 0;

            matResult.Status = 'Active';
            matResult.LastRefreshedAt = new Date();
            matResult.RowCount = rowCount;
            if (options && Object.prototype.hasOwnProperty.call(options, 'nextRefreshAt')) {
                matResult.NextRefreshAt = options.nextRefreshAt ?? null;
            }
            const saved = await matResult.Save();
            if (!saved) {
                return { Success: false, RowCount: rowCount, ErrorMessage: `Refresh ran but the MaterializedResult update failed: ${matResult.LatestResult?.CompleteMessage ?? 'unknown error'}` };
            }
            return { Success: true, RowCount: rowCount };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`MaterializationRefresher.RefreshOne failed for materialization ${matResult.ID}: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    /**
     * Resolves the source SELECT a refresh rebuilds from: the source entity's base view (base-view case)
     * or the stored Query's SQL (query case). Returns null when the source can't be resolved.
     */
    private async resolveSourceSelect(matResult: MJMaterializedResultEntity, contextUser: UserInfo, provider: IMetadataProvider, isPostgres: boolean): Promise<string | null> {
        if (matResult.SourceType === 'EntityBaseView') {
            if (!matResult.SourceEntityID) return null;
            const entity = provider.Entities.find((e) => e.ID === matResult.SourceEntityID);
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
        if (matResult.ParamMode === 'RowFilterBroad') {
            return matResult.BroadSQL && matResult.BroadSQL.trim().length > 0 ? matResult.BroadSQL : null;
        }
        const query = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', contextUser);
        await query.Load(matResult.SourceQueryID);
        return query.SQL && query.SQL.trim().length > 0 ? query.SQL : null;
    }
}
