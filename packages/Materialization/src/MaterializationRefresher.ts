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
 * SQL Server only for now (Phase 1); PostgreSQL follows.
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
     * Full-rebuild refresh of a single materialized result, then updates LastRefreshedAt / RowCount /
     * Status='Active'. Returns a structured result rather than throwing (errors are logged + reported).
     */
    public async RefreshOne(matResult: MJMaterializedResultEntity, contextUser: UserInfo, provider: IMetadataProvider): Promise<MaterializationRefreshResult> {
        try {
            const sourceSelect = await this.resolveSourceSelect(matResult, contextUser, provider);
            if (!sourceSelect) {
                return { Success: false, ErrorMessage: `Could not resolve a source SELECT for materialization ${matResult.ID} (${matResult.SourceType})` };
            }

            const surrogateColumn = matResult.SourceType === 'Query' ? MATERIALIZATION_SURROGATE_COLUMN : undefined;
            const statements = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
                schema: matResult.SchemaName,
                tableName: matResult.TableName,
                viewName: matResult.ViewName,
                sourceSelect,
                surrogateColumn,
            });

            const exec = provider as unknown as ISQLExecutor;
            for (const sql of statements) {
                await exec.ExecuteSQL(sql);
            }

            const countRows = await exec.ExecuteSQL<{ n: number }>(`SELECT COUNT(*) AS n FROM [${matResult.SchemaName}].[${matResult.ViewName}]`);
            const rowCount = countRows?.[0]?.n ?? 0;

            matResult.Status = 'Active';
            matResult.LastRefreshedAt = new Date();
            matResult.RowCount = rowCount;
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
    private async resolveSourceSelect(matResult: MJMaterializedResultEntity, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
        if (matResult.SourceType === 'EntityBaseView') {
            if (!matResult.SourceEntityID) return null;
            const entity = provider.Entities.find((e) => e.ID === matResult.SourceEntityID);
            if (!entity || !entity.BaseView) return null;
            return `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}]`;
        }
        // Query case — unparameterized queries only (enforced at materialization time), so SQL is static.
        if (!matResult.SourceQueryID) return null;
        const query = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', contextUser);
        await query.Load(matResult.SourceQueryID);
        return query.SQL && query.SQL.trim().length > 0 ? query.SQL : null;
    }
}
