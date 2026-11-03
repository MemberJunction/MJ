/**
 * sqlpipe-oracle.ts — runs the scenario matrix's oracles and compares MJ's answers with them.
 *
 * - Rows: the oracle SQL runs directly on the database (no MJ rendering); the expected page is
 *   cut from its rows in TypeScript, exactly as `MaxRows` / `StartRow` define it.
 * - Columns: the oracle is described by the server itself (SQL Server
 *   `sys.dm_exec_describe_first_result_set`; PostgreSQL a probe view read from `pg_attribute`),
 *   independently of MJ's own describe, and the stored Query Fields must match it.
 */
import { QueryExecutionSpec, RunQuery } from '@memberjunction/core';
import type { DatabasePlatform, DatabaseProviderBase, RunQueryParams, RunQueryResult, UserInfo } from '@memberjunction/core';
import { NormalizeValue } from './runquery-rendering-matrix';
import { MOCK_SCHEMA } from './sqlpipe-schema';
import type { ScenarioRun } from './sqlpipe-scenarios';

/** A described output column. */
export interface DescribedColumn {
    readonly Name: string;
    readonly Type: string;
    /** null where the platform does not report it. */
    readonly Nullable: boolean | null;
}

/** Runs and describes oracle SQL, caching by text (the oracle data never changes during a run). */
export class OracleRunner {
    private readonly rows = new Map<string, Record<string, unknown>[]>();
    private readonly described = new Map<string, DescribedColumn[]>();

    constructor(private readonly provider: DatabaseProviderBase, private readonly user: UserInfo, private readonly platform: DatabasePlatform) {}

    async Rows(sql: string): Promise<Record<string, unknown>[]> {
        const cached = this.rows.get(sql);
        if (cached) return cached;
        const result = await this.provider.ExecuteSQL<Record<string, unknown>>(sql, undefined, { description: 'sqlpipe oracle' }, this.user);
        this.rows.set(sql, result);
        return result;
    }

    async Describe(sql: string): Promise<DescribedColumn[]> {
        const cached = this.described.get(sql);
        if (cached) return cached;
        const columns = this.platform === 'postgresql' ? await this.describePostgres(sql) : await this.describeSqlServer(sql);
        this.described.set(sql, columns);
        return columns;
    }

    private async describeSqlServer(sql: string): Promise<DescribedColumn[]> {
        const probe = `SELECT name, system_type_name, is_nullable, error_message FROM sys.dm_exec_describe_first_result_set(N'${sql.replace(/'/g, "''")}', NULL, 0) ` +
            'WHERE is_hidden = 0 OR is_hidden IS NULL ORDER BY column_ordinal';
        const rows = await this.provider.ExecuteSQL<{ name: string; system_type_name: string; is_nullable: boolean; error_message: string | null }>(probe, undefined, undefined, this.user);
        const error = rows.find(r => r.error_message);
        if (error) throw new Error(`the oracle could not be described: ${error.error_message}`);
        return rows.map(r => ({ Name: r.name, Type: r.system_type_name, Nullable: Boolean(r.is_nullable) }));
    }

    private async describePostgres(sql: string): Promise<DescribedColumn[]> {
        const view = `${MOCK_SCHEMA}."zz_probe"`;
        await this.provider.ExecuteSQL(`DROP VIEW IF EXISTS ${view}`, undefined, undefined, this.user);
        await this.provider.ExecuteSQL(`CREATE VIEW ${view} AS ${sql}`, undefined, undefined, this.user);
        try {
            const rows = await this.provider.ExecuteSQL<{ attname: string; type: string }>(
                `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid = '${view}'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
                undefined, undefined, this.user);
            return rows.map(r => ({ Name: r.attname, Type: r.type, Nullable: null }));
        } finally {
            await this.provider.ExecuteSQL(`DROP VIEW IF EXISTS ${view}`, undefined, undefined, this.user);
        }
    }
}

/** The page a call must return from the oracle's rows, as `MaxRows` / `StartRow` define it. */
export function ExpectedPage<T>(rows: readonly T[], maxRows: number | undefined, startRow: number | undefined): T[] {
    const start = startRow !== undefined && startRow >= 0 ? startRow : 0;
    if (maxRows !== undefined && maxRows > 0) return rows.slice(start, start + maxRows);
    return startRow !== undefined ? rows.slice(start) : [...rows];
}

function normalizedRow(row: Record<string, unknown>, columns: readonly string[]): string {
    return JSON.stringify(columns.map(c => NormalizeValue(row[c])));
}

/** Calls RunQuery the way the scenario's path does. */
/** A transient spec's parameter values: text, as the TestQuerySQL resolver takes them; no value is left out. */
function specParameters(values: Readonly<Record<string, unknown>>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined) continue;
        out[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return out;
}

export async function CallScenario(run: ScenarioRun, queryID: string | null, categoryPath: string, user: UserInfo): Promise<RunQueryResult> {
    if (run.Path === 'spec') {
        return new RunQuery().ExecuteFromSpec(new QueryExecutionSpec({ SQL: run.Query.SQL, Parameters: specParameters(run.Parameters), UsesTemplate: true, MaxRows: run.MaxRows }), user);
    }
    const params: RunQueryParams = run.Path === 'adhoc'
        ? { SQL: run.Query.SQL }
        : run.Path === 'byName'
            ? { QueryName: run.Query.Name, CategoryPath: categoryPath, Parameters: run.Parameters }
            : { QueryID: queryID ?? undefined, Parameters: run.Parameters };
    if (run.MaxRows !== undefined) params.MaxRows = run.MaxRows;
    if (run.StartRow !== undefined) params.StartRow = run.StartRow;
    return new RunQuery().RunQuery(params, user);
}

/** Compares one call's result with the oracle; returns a description of each difference. */
export function CompareWithOracle(run: ScenarioRun, result: RunQueryResult, oracleRows: readonly Record<string, unknown>[]): string[] {
    if (run.Expect.Kind !== 'rows') return [];
    if (!result.Success) return [`failed: ${(result.ErrorMessage ?? '').slice(0, 300)}`];
    const columns = oracleRows.length > 0 ? Object.keys(oracleRows[0]) : null;
    const actual = result.Results ?? [];
    const problems: string[] = [];
    if (columns && actual.length > 0 && Object.keys(actual[0]).join(',') !== columns.join(',')) {
        problems.push(`columns ${Object.keys(actual[0]).join(',')} != oracle ${columns.join(',')}`);
    }
    const keys = columns ?? (actual.length > 0 ? Object.keys(actual[0]) : []);
    const expected = ExpectedPage(oracleRows, run.MaxRows, run.StartRow).map(r => normalizedRow(r, keys));
    const got = actual.map(r => normalizedRow(r, keys));
    problems.push(...rowDifferences(run, got, expected, oracleRows.map(r => normalizedRow(r, keys))));
    // A transient spec caps its rows and reports what it returned, not the whole result's count.
    if (run.Path !== 'spec' && Number(result.TotalRowCount) !== oracleRows.length) problems.push(`TotalRowCount ${result.TotalRowCount}, oracle ${oracleRows.length}`);
    return problems;
}

function rowDifferences(run: ScenarioRun, got: string[], expected: string[], all: readonly string[]): string[] {
    if (run.Expect.Kind === 'rows' && run.Expect.CountOnly) {
        return got.length === expected.length ? [] : [`got ${got.length} row(s), expected ${expected.length} (only the count is fixed)`];
    }
    const ordered = run.Expect.Kind === 'rows' && run.Expect.Ordered;
    const whole = expected.length === all.length;
    if (!ordered && !whole) {
        if (got.length !== expected.length) return [`got ${got.length} row(s), expected ${expected.length} (unordered page)`];
        const pool = [...all];
        const missing = got.filter(r => { const i = pool.indexOf(r); if (i < 0) return true; pool.splice(i, 1); return false; });
        return missing.length > 0 ? [`page rows not in the oracle's result: ${missing[0].slice(0, 200)}`] : [];
    }
    const a = ordered ? got : [...got].sort();
    const e = ordered ? expected : [...expected].sort();
    if (a.length === e.length && a.every((v, i) => v === e[i])) return [];
    const at = a.findIndex((v, i) => v !== e[i]);
    const index = at < 0 ? Math.min(a.length, e.length) : at;
    return [`got ${a.length} row(s), expected ${e.length}; first difference at ${index}: got ${(a[index] ?? '(none)').slice(0, 160)}, expected ${(e[index] ?? '(none)').slice(0, 160)}`];
}

/** Checks a call that must fail: it fails, and its message carries the expected text. */
export function CompareWithExpectedError(run: ScenarioRun, result: RunQueryResult): string[] {
    if (run.Expect.Kind !== 'error') return [];
    if (result.Success) return [`succeeded with ${result.RowCount} row(s); it must fail${run.Expect.Includes ? ` with "${run.Expect.Includes}"` : ''}`];
    const message = result.ErrorMessage ?? '';
    return run.Expect.Includes && !message.includes(run.Expect.Includes) ? [`failed with "${message.slice(0, 200)}", expected "${run.Expect.Includes}"`] : [];
}
