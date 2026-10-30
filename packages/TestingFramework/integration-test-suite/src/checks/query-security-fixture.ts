/**
 * query-security-fixture.ts — what the `query-security` bundle shares: the canary table every
 * write probe aims at, the per-run query category, the three paths caller and saved SQL take
 * (ad hoc RunQuery, the execution-spec path TestQuerySQL runs, a saved query by ID), and the
 * check that a probe wrote nothing.
 *
 * The canary is `mjit_security.Canary` (three rows) in a schema the bundle creates in Setup and
 * drops in Teardown. After each probe the canary is compared with its seeded rows and the schema
 * must still hold exactly that one table, so an INSERT/UPDATE/DELETE, a dropped or created table
 * and a `SELECT … INTO` copy are all caught. A probe that did change it is reported and the
 * canary is reseeded, so later probes are still judged on a clean table.
 */
import { RunQuery } from '@memberjunction/core';
import type { DatabasePlatform, UserInfo } from '@memberjunction/core';
import type { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import type { MJQueryEntityServer } from '@memberjunction/core-entities-server';
import { QueryEngine } from '@memberjunction/core-entities';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import {
    ColumnName, CreateFixtureCategory, CreateSchemaStatement, DropSchemaStatements, ErrorMessageOf, ForPlatform, NewFixtureQuery,
    ObjectName, PlatformOf, RequireQueryDb, RunFixtureSQL, RunFixtureSQLQuietly, RunStamp,
} from './query-extraction-fixture';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';

export const SECURITY_BUNDLE = 'query-security';
export const SECURITY_PREFIX = 'zzz-it142';
export const SECURITY_SCHEMA = 'mjit_security';
const TABLES = ['Canary', 'Stolen', 'Made'];

/** The canary's rows as seeded, `ID:Note` joined by `|`. */
const CANARY_SEEDED = '1:alpha|2:beta|3:gamma';

/** What the bundle's Setup established. */
export interface SecurityFixture {
    Platform: DatabasePlatform;
    Category: MJQueryCategoryEntity;
}

let fixture: SecurityFixture | undefined;

/** The fixture Setup made; throws when Setup did not run. */
export function RequireSecurityFixture(): SecurityFixture {
    if (!fixture) throw new Error(`${SECURITY_BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

function canaryStatements(platform: DatabasePlatform): string[] {
    const t = ObjectName(platform, SECURITY_SCHEMA, 'Canary');
    const c = (name: string) => ColumnName(platform, name);
    return [
        `CREATE TABLE ${t} (${c('ID')} INTEGER NOT NULL PRIMARY KEY, ${c('Note')} VARCHAR(50) NOT NULL)`,
        `INSERT INTO ${t} (${c('ID')}, ${c('Note')}) VALUES (1, 'alpha'), (2, 'beta'), (3, 'gamma')`,
    ];
}

/** Drops and recreates the fixture schema with a freshly seeded canary. */
async function seedSchema(ctx: IntegrationCheckContext, platform: DatabasePlatform): Promise<void> {
    await RunFixtureSQL(ctx, SECURITY_BUNDLE, [
        ...DropSchemaStatements(platform, SECURITY_SCHEMA, [], TABLES),
        CreateSchemaStatement(platform, SECURITY_SCHEMA),
        ...canaryStatements(platform),
    ]);
}

/** Creates the schema, the canary and the per-run category. */
export async function SetupSecurityFixture(ctx: IntegrationCheckContext): Promise<void> {
    const platform = PlatformOf(ctx, SECURITY_BUNDLE);
    await seedSchema(ctx, platform);
    const category = await CreateFixtureCategory(ctx, `${SECURITY_PREFIX} ${RunStamp()}`);
    fixture = { Platform: platform, Category: category };
}

/** Drops the schema. The category and its queries are deleted by the caller first. */
export async function TeardownSecuritySchema(ctx: IntegrationCheckContext): Promise<void> {
    await RunFixtureSQLQuietly(ctx, SECURITY_BUNDLE, DropSchemaStatements(PlatformOf(ctx, SECURITY_BUNDLE), SECURITY_SCHEMA, [], TABLES));
    fixture = undefined;
}

// ─── The canary ─────────────────────────────────────────────────────────────

/** The canary rows and the number of tables in the schema, as one string; `missing` when the table is gone. */
async function canaryState(ctx: IntegrationCheckContext, platform: DatabasePlatform): Promise<string> {
    const provider = RequireQueryDb(ctx.Provider, SECURITY_BUNDLE);
    const tables = platform === 'postgresql'
        ? `SELECT COUNT(*) AS "N" FROM information_schema.tables WHERE table_schema = '${SECURITY_SCHEMA}'`
        : `SELECT COUNT(*) AS N FROM sys.tables WHERE schema_id = SCHEMA_ID('${SECURITY_SCHEMA}')`;
    const count = await provider.ExecuteSQL<{ N: number }>(tables, undefined, { description: `${SECURITY_BUNDLE} canary` }, ctx.User);
    try {
        const rows = await provider.ExecuteSQL<{ ID: number; Note: string }>(
            ForPlatform(`SELECT [ID], [Note] FROM ${SECURITY_SCHEMA}.[Canary] ORDER BY [ID]`, platform), undefined, { description: `${SECURITY_BUNDLE} canary` }, ctx.User);
        return `${rows.map(r => `${r.ID}:${r.Note}`).join('|')} tables=${Number(count[0]?.N)}`;
    } catch (e) {
        return `missing (${ErrorMessageOf(e).slice(0, 120)}) tables=${Number(count[0]?.N)}`;
    }
}

/**
 * Whether the canary is exactly as seeded and the schema holds no other table. When it is not,
 * returns what it found and reseeds it, so the next probe starts clean; `null` when untouched.
 */
export async function CanaryChange(ctx: IntegrationCheckContext): Promise<string | null> {
    const { Platform: platform } = RequireSecurityFixture();
    const state = await canaryState(ctx, platform);
    if (state === `${CANARY_SEEDED} tables=1`) return null;
    await seedSchema(ctx, platform);
    return state;
}

// ─── The three paths ────────────────────────────────────────────────────────

/** What one run gave the caller: a thrown refusal and a reported one look the same here. */
export interface QueryOutcome {
    Success: boolean;
    Rows: Record<string, unknown>[];
    Error: string;
}

function outcomeOf(result: { Success: boolean; Results?: unknown[]; ErrorMessage?: string }): QueryOutcome {
    return { Success: result.Success, Rows: (result.Results ?? []) as Record<string, unknown>[], Error: result.ErrorMessage ?? '' };
}

async function guarded(run: () => Promise<QueryOutcome>): Promise<QueryOutcome> {
    try {
        return await run();
    } catch (e) {
        return { Success: false, Rows: [], Error: ErrorMessageOf(e) };
    }
}

/** Ad hoc SQL through `RunQuery({ SQL })`. */
export function RunAdhoc(sql: string, user: UserInfo): Promise<QueryOutcome> {
    return guarded(async () => outcomeOf(await new RunQuery().RunQuery({ SQL: sql }, user)));
}

/** Caller SQL through the execution-spec path, the one `TestQuerySQL` runs. */
export function RunSpec(sql: string, user: UserInfo, parameters?: Record<string, string>): Promise<QueryOutcome> {
    return guarded(async () => outcomeOf(await new RunQuery().ExecuteFromSpec({ SQL: sql, MaxRows: 50, Parameters: parameters, UsesTemplate: !!parameters }, user)));
}

/** A saved query by ID, with parameters. */
export function RunSaved(queryID: string, user: UserInfo, parameters?: Record<string, unknown>): Promise<QueryOutcome> {
    return guarded(async () => outcomeOf(await new RunQuery().RunQuery({ QueryID: queryID, Parameters: parameters }, user)));
}

/** A saved query by category path and name. */
export function RunSavedByName(categoryPath: string, name: string, user: UserInfo, parameters?: Record<string, unknown>): Promise<QueryOutcome> {
    return guarded(async () => outcomeOf(await new RunQuery().RunQuery({ QueryName: name, CategoryPath: categoryPath, Parameters: parameters }, user)));
}

// ─── Saving probes ──────────────────────────────────────────────────────────

/** Tries to save `sql` as a new query in the fixture category (extraction on); returns the save's message, or null when it saved. */
export async function TrySave(ctx: IntegrationCheckContext, label: string, sql: string): Promise<string | null> {
    const f = RequireSecurityFixture();
    const query = await NewFixtureQuery(ctx, f.Category.ID, { Name: `${SECURITY_PREFIX} save ${label}`, SQL: sql });
    if (await query.Save(FixtureQuerySaveOptions())) return null;
    return query.LatestResult?.CompleteMessage ?? '(no message)';
}

/** How many queries in the fixture category carry `label`'s save name: a refused save must leave none. */
export async function SavedCount(ctx: IntegrationCheckContext, label: string): Promise<number> {
    const f = RequireSecurityFixture();
    const name = `${SECURITY_PREFIX} save ${label}`.replace(/'/g, "''");
    const result = await RequireQueryDb(ctx.Provider, SECURITY_BUNDLE).RunView({
        EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${f.Category.ID}' AND Name='${name}'`, ResultType: 'count_only', BypassCache: true,
    }, ctx.User);
    return result.TotalRowCount ?? 0;
}

/**
 * Stores `sql` as a query without extraction (`ExtractionOverride` `Skip`), the way a row written
 * before the save-time rules, or by a bulk load, reaches the database. Returns the stored row.
 */
export async function StoreBypassingSave(ctx: IntegrationCheckContext, label: string, sql: string, usesTemplate = false): Promise<MJQueryEntityServer> {
    const f = RequireSecurityFixture();
    const query = await NewFixtureQuery(ctx, f.Category.ID, { Name: `${SECURITY_PREFIX} stored ${label}`, SQL: sql, Override: 'Skip' });
    query.UsesTemplate = usesTemplate;
    if (!await query.Save(FixtureQuerySaveOptions())) {
        throw new Error(`${SECURITY_BUNDLE}: storing '${label}' with extraction skipped failed: ${query.LatestResult?.CompleteMessage}`);
    }
    return query;
}

/** Reloads the QueryEngine so the provider finds queries stored since the last load. */
export async function RefreshQueries(ctx: IntegrationCheckContext): Promise<void> {
    await QueryEngine.Instance.Config(true, ctx.User, ctx.Provider);
}

/** Throws one error listing every mismatch, or logs how many cases matched. */
export function FailOnFindings(label: string, findings: readonly string[], exercised: number): void {
    if (findings.length > 0) {
        const sample = findings.slice(0, 30).join('\n    ');
        const more = findings.length > 30 ? `\n    …and ${findings.length - 30} more` : '';
        throw new Error(`${label}: ${findings.length} finding(s) across ${exercised} case(s):\n    ${sample}${more}`);
    }
    console.log(`      → ${label}: ${exercised} case(s) exercised, all as expected`);
}
