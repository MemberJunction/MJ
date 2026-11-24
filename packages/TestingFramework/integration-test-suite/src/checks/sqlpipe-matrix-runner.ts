/**
 * sqlpipe-matrix-runner.ts — the state and steps the scenario-matrix bundles share: the fixture
 * (category, dependency queries, the saved scenario queries), saving scenario queries (and
 * checking the refused ones were refused and wrote nothing), running scenarios against their
 * oracles, and the extraction property checks on every saved query.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import type { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { DEP_ORDER, DepAvailable, DepByKey } from './sqlpipe-composition';
import type { DepKey, DepNaming } from './sqlpipe-composition';
import { CallScenario, CompareWithExpectedError, CompareWithOracle } from './sqlpipe-oracle';
import type { DescribedColumn } from './sqlpipe-oracle';
import { BuildQuery, BuildRun } from './sqlpipe-scenarios';
import type { BuildEnvironment, ScenarioPoint, ScenarioQuery, ScenarioRun } from './sqlpipe-scenarios';
import { Sql, SourceFor } from './sqlpipe-schema';
import type { SchemaKey } from './sqlpipe-schema';
import { ErrorMessageOf, FixtureCategoryPath } from './query-extraction-fixture';
import type { StoredQueryRows } from './query-extraction-fixture';
import type { MatrixBackend, SavedRecord } from './sqlpipe-backend';

/** A saved scenario query, or why it has none. */
interface SavedQuery {
    readonly Query: ScenarioQuery;
    readonly Record: SavedRecord | null;
}

/** Everything a matrix bundle's checks share. */
export class MatrixFixture {
    readonly Saved = new Map<string, SavedQuery>();
    readonly Deps = new Map<string, SavedRecord>();
    CategoryPath = '';
    readonly Env: BuildEnvironment;

    constructor(readonly Ctx: IntegrationCheckContext, readonly Backend: MatrixBackend, readonly Category: MJQueryCategoryEntity, readonly Prefix: string,
        readonly Schemas: readonly SchemaKey[] = ['mock', 'core']) {
        this.Env = {
            Platform: Backend.Platform, Context: { UserEmail: Ctx.User.Email }, Prefix,
            Naming: (schema: SchemaKey): DepNaming => ({ Path: (dep: DepKey) => `${this.CategoryPath}/${this.DepName(schema, dep)}` }),
        };
    }

    get Platform(): DatabasePlatform {
        return this.Backend.Platform;
    }

    /** The name of a dependency query of this fixture. */
    DepName(schema: SchemaKey, dep: DepKey): string {
        return `${this.Prefix} ${schema} ${dep}`;
    }
}

// ─── Dependencies ──────────────────────────────────────────────────────────

/** Creates every dependency query available on the platform, for the fixture's schemas, in dependency order. */
export async function CreateDependencies(f: MatrixFixture): Promise<void> {
    for (const schema of f.Schemas) {
        const sql = new Sql(f.Platform, SourceFor(schema));
        for (const key of DEP_ORDER) {
            const dep = DepByKey(key);
            if (!DepAvailable(dep, f.Platform, schema)) continue;
            const saved = await f.Backend.SaveQuery(f.Category.ID, { Name: f.DepName(schema, key), SQL: sql.Text(dep.MJ(sql, f.Env.Naming(schema))), Reusable: true });
            if (!saved.Record) throw new Error(`dependency ${f.DepName(schema, key)} was not saved: ${saved.Message}`);
            f.Deps.set(`${schema}:${key}`, saved.Record);
            if (!f.CategoryPath) {
                await f.Backend.RefreshQueries();
                f.CategoryPath = FixtureCategoryPath(f.Category);
            }
        }
    }
    await f.Backend.RefreshQueries();
}

// ─── Concurrency helper ────────────────────────────────────────────────────

/** Bounds parallel SaveQuery writes so SQL Server/PG connection pools and metadata locks stay unsaturated. */
const DEFAULT_SAVE_CONCURRENCY = 4;
/** Bounds parallel read-only scenario execution/extraction requests to saturate CI DB I/O without starving MJAPI. */
const DEFAULT_RUN_CONCURRENCY = 6;
/** Upper bound for SQLPIPE_CONCURRENCY override so a misconfigured env var cannot exhaust the DB connection pool. */
const MAX_SQLPIPE_CONCURRENCY = 16;

/** Resolves bounded worker concurrency from SQLPIPE_CONCURRENCY (1..16), or the provided default. */
export function MatrixConcurrency(defaultLimit: number): number {
    const raw = process.env.SQLPIPE_CONCURRENCY;
    if (!raw) return defaultLimit;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
    return Math.min(parsed, MAX_SQLPIPE_CONCURRENCY);
}

/** Runs `worker` across `items` with at most `limit` in-flight promises, preserving input order. */
export async function RunWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return [];
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));

    const runWorker = async (): Promise<void> => {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await worker(items[current], current);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
}

// ─── Saving scenario queries ───────────────────────────────────────────────

async function saveSingleScenarioQuery(
    f: MatrixFixture,
    query: ScenarioQuery,
): Promise<{ Saved: SavedQuery; Created: boolean; Failures: string[] }> {
    const localFailures: string[] = [];
    const { Record: record, Message: message } = await f.Backend.SaveQuery(f.Category.ID, {
        Name: query.Name,
        SQL: query.SQL,
        Cached: query.Cached,
    });
    if (query.Refusal) {
        if (record) localFailures.push(`${query.Name}: saved, but must be refused with ${query.Refusal}`);
        else if (!message.includes(query.Refusal)) localFailures.push(`${query.Name}: refused with "${message.slice(0, 200)}", expected ${query.Refusal}`);
        else if (await f.Backend.CountQueries(f.Category.ID, query.Name) !== 0) localFailures.push(`${query.Name}: refused, but a query row was written`);
        return { Saved: { Query: query, Record: null }, Created: false, Failures: localFailures };
    }
    if (!record) localFailures.push(`${query.Name}: save failed: ${message.slice(0, 300)}\n      SQL: ${query.SQL.slice(0, 400)}`);
    return { Saved: { Query: query, Record: record }, Created: true, Failures: localFailures };
}

/** Saves each unique query not saved yet using bounded concurrency. A refused query must be refused with its code and write nothing. */
export async function SaveScenarioQueries(f: MatrixFixture, queries: readonly ScenarioQuery[], failures: string[]): Promise<void> {
    const unique: ScenarioQuery[] = [];
    const seen = new Set<string>();
    for (const query of queries) {
        if (f.Saved.has(query.Key) || seen.has(query.Key)) continue;
        seen.add(query.Key);
        unique.push(query);
    }
    if (unique.length === 0) return;

    const outcomes = await RunWithConcurrency(unique, MatrixConcurrency(DEFAULT_SAVE_CONCURRENCY), (query) =>
        saveSingleScenarioQuery(f, query),
    );

    let created = 0;
    for (const outcome of outcomes) {
        f.Saved.set(outcome.Saved.Query.Key, outcome.Saved);
        failures.push(...outcome.Failures);
        if (outcome.Created) created++;
    }
    if (created > 0) await f.Backend.RefreshQueries();
}

// ─── Running scenarios ─────────────────────────────────────────────────────

/** Builds, saves and runs a list of points with bounded concurrency; returns every difference found, and the number of runs. */
export async function RunPoints(f: MatrixFixture, points: readonly ScenarioPoint[]): Promise<{ Failures: string[]; Runs: number; Queries: number }> {
    const failures: string[] = [];
    const queries = points.map(p => BuildQuery(f.Env, p));
    const transient = (path: string) => path === 'adhoc' || path === 'spec';
    await SaveScenarioQueries(f, queries.filter((_q, i) => !transient(points[i].Path)), failures);

    const work: Array<{ Run: ScenarioRun; QueryID: string | null }> = [];
    for (const [index, point] of points.entries()) {
        const run = BuildRun(f.Env, point, queries[index]);
        if (!run) continue;
        const saved = f.Saved.get(run.Query.Key);
        if (!transient(point.Path) && !saved?.Record) continue;
        work.push({ Run: run, QueryID: saved?.Record?.ID ?? null });
    }

    const perPointFailures = await RunWithConcurrency(work, MatrixConcurrency(DEFAULT_RUN_CONCURRENCY), async (item) => {
        const found = await runOne(f, item.Run, item.QueryID);
        return found.map(m => `${item.Run.Label}: ${m}`);
    });
    for (const itemFailures of perPointFailures) {
        failures.push(...itemFailures);
    }

    return { Failures: failures, Runs: work.length, Queries: new Set(queries.map(q => q.Key)).size };
}

async function runOne(f: MatrixFixture, run: ScenarioRun, queryID: string | null): Promise<string[]> {
    const calls = run.Path === 'cached' ? 2 : 1;
    const problems: string[] = [];
    let oracleRows: Record<string, unknown>[] = [];
    if (run.Expect.Kind === 'rows') {
        try {
            oracleRows = await f.Backend.Rows(run.Expect.Oracle);
        } catch (e) {
            return [`the oracle failed (a harness error): ${ErrorMessageOf(e).slice(0, 200)}\n      oracle: ${run.Expect.Oracle.slice(0, 400)}`];
        }
    }
    for (let call = 0; call < calls; call++) {
        const result = await CallScenario(run, queryID, f.CategoryPath, f.Ctx.User);
        const found = run.Expect.Kind === 'rows' ? CompareWithOracle(run, result, oracleRows) : CompareWithExpectedError(run, result);
        problems.push(...found.map(m => (calls > 1 ? `call ${call + 1}: ${m}` : m)));
    }
    return problems;
}

// ─── Extraction properties ─────────────────────────────────────────────────

/** Checks the child rows extraction wrote for every saved scenario query using bounded concurrency; returns the differences. */
export async function CheckExtractionProperties(f: MatrixFixture): Promise<{ Failures: string[]; Checked: number }> {
    const savedRecords = [...f.Saved.values()].filter((s): s is { readonly Query: ScenarioQuery; readonly Record: SavedRecord } => s.Record !== null);

    const perQueryFailures = await RunWithConcurrency(savedRecords, MatrixConcurrency(DEFAULT_RUN_CONCURRENCY), async (saved) => {
        try {
            const rows = await f.Backend.ReadRows(saved.Record.ID);
            return (await queryProperties(f, saved.Query, saved.Record, rows)).map(m => `${saved.Query.Name}: ${m}`);
        } catch (e) {
            return [`${saved.Query.Name}: ${ErrorMessageOf(e).slice(0, 300)}`];
        }
    });

    const failures: string[] = [];
    for (const qFailures of perQueryFailures) {
        failures.push(...qFailures);
    }
    return { Failures: failures, Checked: savedRecords.length };
}

async function queryProperties(f: MatrixFixture, query: ScenarioQuery, record: SavedRecord, rows: StoredQueryRows): Promise<string[]> {
    const problems: string[] = [];
    if (record.ExtractionStatus !== 'OK') problems.push(`ExtractionStatus ${record.ExtractionStatus}: ${(record.ExtractionMessage ?? '').slice(0, 300)}`);
    problems.push(...parameterProblems(query, rows), ...dependencyProblems(f, query, rows), ...entityProblems(f, query, rows));
    if (query.DescribeOracle) problems.push(...fieldProblems(f, query, rows, await f.Backend.Describe(query.DescribeOracle)));
    return problems;
}

function parameterProblems(query: ScenarioQuery, rows: StoredQueryRows): string[] {
    const expected = query.Parameters.map(p => `${p.Name}:${p.Type}:${p.IsRequired}`).sort().join(', ');
    const actual = rows.Parameters.map(p => `${p.Name}:${p.Type}:${p.IsRequired}`).sort().join(', ');
    const problems = expected === actual ? [] : [`parameters [${actual}], expected [${expected}]`];
    for (const p of query.Parameters) {
        const row = rows.Parameters.find(r => r.Name === p.Name);
        if (!row) continue;
        if (p.DefaultValue !== undefined && (row.DefaultValue ?? null) !== p.DefaultValue) problems.push(`${p.Name}.DefaultValue ${row.DefaultValue}, expected ${p.DefaultValue}`);
        if (p.Description !== undefined && (row.Description ?? null) !== p.Description) problems.push(`${p.Name}.Description "${row.Description}", expected "${p.Description}"`);
        if (row.DetectionMethod !== 'Parser') problems.push(`${p.Name}.DetectionMethod ${row.DetectionMethod}, expected Parser`);
    }
    return problems;
}

function canonicalMapping(text: string | null): string {
    if (!text) return 'null';
    const parsed = JSON.parse(text) as Record<string, string>;
    return JSON.stringify(Object.keys(parsed).sort().map(k => [k, parsed[k]]));
}

function dependencyProblems(f: MatrixFixture, query: ScenarioQuery, rows: StoredQueryRows): string[] {
    const naming = f.Env.Naming(query.Schema);
    const byID = new Map([...f.Deps.entries()].map(([key, q]) => [NormalizeUUID(q.ID), key.split(':')[1] as DepKey]));
    const expected = query.Dependencies.map(d => `${d.Dep}|${naming.Path(d.Dep)}|${d.Alias === undefined ? '*' : d.Alias ?? 'null'}|${canonicalMapping(d.Mapping ? JSON.stringify(d.Mapping) : null)}`).sort();
    const actual = rows.Dependencies.map(d => {
        const alias = query.Dependencies.find(x => x.Alias === undefined) ? '*' : d.Alias ?? 'null';
        return `${byID.get(NormalizeUUID(d.DependsOnQueryID)) ?? d.DependsOnQueryID}|${d.ReferencePath}|${alias}|${canonicalMapping(d.ParameterMapping)}`;
    }).sort();
    return expected.join(' ; ') === actual.join(' ; ') ? [] : [`dependencies [${actual.join(' ; ')}], expected [${expected.join(' ; ')}]`];
}

function entityProblems(f: MatrixFixture, query: ScenarioQuery, rows: StoredQueryRows): string[] {
    if (query.CompositionKey !== 'none') return [];
    const source = SourceFor(query.Schema);
    const entity = source.EntityName ? f.Ctx.Provider.EntityByName(source.EntityName) : undefined;
    const expected = entity ? [NormalizeUUID(entity.ID)] : [];
    const actual = rows.Entities.map(e => NormalizeUUID(e.EntityID)).sort();
    return actual.join(',') === expected.join(',') ? [] : [`Query Entities [${actual.join(',')}], expected [${expected.join(',')}] (${source.EntityName ?? 'no entity'})`];
}

function fieldProblems(f: MatrixFixture, query: ScenarioQuery, rows: StoredQueryRows, described: readonly DescribedColumn[]): string[] {
    const expected = described.map(c => `${c.Name}:${c.Type.toLowerCase()}:${String(c.Nullable)}`).join(', ');
    const actual = rows.Fields.map(r => `${r.Name}:${(r.SQLFullType ?? '').toLowerCase()}:${String(r.IsNullable)}`).join(', ');
    const problems = expected === actual ? [] : [`fields [${actual}], the server describes [${expected}]`];
    problems.push(...rows.Fields.filter((r, i) => r.Sequence !== i + 1).map(r => `${r.Name}.Sequence ${r.Sequence}`));
    for (const [name, description] of Object.entries(query.FieldDescriptions)) {
        const row = rows.Fields.find(r => r.Name === name);
        if (row && row.Description !== description) problems.push(`${name}.Description "${row.Description}", expected "${description}"`);
    }
    for (const name of query.Shape.Computed ?? []) {
        const row = rows.Fields.find(r => r.Name === name);
        if (row && (!row.IsComputed || row.SourceEntityFieldID)) problems.push(`${name} must be computed with no source`);
    }
    return [...problems, ...bindingProblems(f, query, rows)];
}

/** On the core view, each pass-through column binds to the MJ: Entity Fields field of its name. */
function bindingProblems(f: MatrixFixture, query: ScenarioQuery, rows: StoredQueryRows): string[] {
    const source = SourceFor(query.Schema);
    const entity = source.EntityName ? f.Ctx.Provider.EntityByName(source.EntityName) : undefined;
    if (!entity) return rows.Fields.filter(r => r.SourceEntityFieldID).map(r => `${r.Name} binds to an entity field, but the source backs no entity`);
    if (['twice', 'inFor'].includes(query.CompositionKey)) return [];
    const pass = query.Shape.PassThrough;
    const names = pass === '*' ? rows.Fields.filter(r => !(query.Shape.Computed ?? []).includes(r.Name)).map(r => r.Name) : pass.map(c => source.Columns[c] ?? c);
    const problems: string[] = [];
    for (const name of names) {
        const row = rows.Fields.find(r => r.Name === name);
        const field = entity.Fields.find(x => x.Name === name);
        if (!row || !field) continue;
        if (!UUIDsEqual(row.SourceEntityFieldID, field.ID) || !UUIDsEqual(row.SourceEntityID, entity.ID)) {
            problems.push(`${name} must bind to ${entity.Name}.${name} (got entity ${row.SourceEntityID ?? 'null'}, field ${row.SourceEntityFieldID ?? 'null'})`);
        }
    }
    return problems;
}
