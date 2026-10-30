/**
 * query-extraction-fixture.ts — what the `query-extraction` and `query-refresh` bundles share:
 * platform-aware fixture SQL, a per-run query category, saving fixture queries with extraction
 * left on, reading back the child rows extraction wrote, and before/after row snapshots.
 *
 * Fixture query text is written once in T-SQL bracket style (`c.[Name]`) and converted for
 * PostgreSQL by {@link ForPlatform}, which turns every `[Name]` into `"Name"`. Fixture tables are
 * created with PascalCase names, quoted on PostgreSQL, so the same names reach both servers.
 */
import { DatabaseProviderBase } from '@memberjunction/core';
import type { DatabasePlatform, IMetadataProvider } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type {
    MJQueryCategoryEntity,
    MJQueryDependencyEntity,
    MJQueryEntityEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
} from '@memberjunction/core-entities';
import { MJQueryEntityServer } from '@memberjunction/core-entities-server';
import { UUIDsEqual } from '@memberjunction/global';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';

/** The context's provider as a database provider; the bundles need the server transport. */
export function RequireQueryDb(provider: IMetadataProvider, bundle: string): DatabaseProviderBase {
    if (!(provider instanceof DatabaseProviderBase)) {
        throw new Error(`${bundle} needs the server transport: the context provider is not a database provider.`);
    }
    return provider;
}

/** The platform the bundle runs against. */
export function PlatformOf(ctx: IntegrationCheckContext, bundle: string): DatabasePlatform {
    return RequireQueryDb(ctx.Provider, bundle).PlatformKey;
}

/** Query text for `platform`: bracket-quoted names become double-quoted on PostgreSQL. */
export function ForPlatform(sql: string, platform: DatabasePlatform): string {
    return platform === 'postgresql' ? sql.replace(/\[([^\]]+)\]/g, '"$1"') : sql;
}

/** Runs fixture DDL statements in order, as the context user. */
export async function RunFixtureSQL(ctx: IntegrationCheckContext, bundle: string, statements: readonly string[]): Promise<void> {
    const provider = RequireQueryDb(ctx.Provider, bundle);
    for (const sql of statements) {
        await provider.ExecuteSQL(sql, undefined, { description: `${bundle} fixture` }, ctx.User);
    }
}

/** Runs fixture DDL statements, logging (never throwing) a failure: for teardown. */
export async function RunFixtureSQLQuietly(ctx: IntegrationCheckContext, bundle: string, statements: readonly string[]): Promise<void> {
    try {
        await RunFixtureSQL(ctx, bundle, statements);
    } catch (e) {
        console.error(`${bundle} teardown warning (schema): ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** Statements that drop a fixture schema and everything in it, on either platform. */
export function DropSchemaStatements(platform: DatabasePlatform, schema: string, viewsFirst: readonly string[], tables: readonly string[]): string[] {
    if (platform === 'postgresql') return [`DROP SCHEMA IF EXISTS "${schema}" CASCADE`];
    return [
        ...viewsFirst.map(v => `DROP VIEW IF EXISTS ${schema}.${v}`),
        ...tables.map(t => `DROP TABLE IF EXISTS ${schema}.${t}`),
        `IF SCHEMA_ID('${schema}') IS NOT NULL EXEC('DROP SCHEMA ${schema}')`,
    ];
}

/** The statement that creates a fixture schema. */
export function CreateSchemaStatement(platform: DatabasePlatform, schema: string): string {
    return platform === 'postgresql' ? `CREATE SCHEMA "${schema}"` : `EXEC('CREATE SCHEMA ${schema}')`;
}

/** A schema-qualified fixture object name for DDL: quoted on PostgreSQL. */
export function ObjectName(platform: DatabasePlatform, schema: string, name: string): string {
    return platform === 'postgresql' ? `"${schema}"."${name}"` : `${schema}.${name}`;
}

/** A column name for DDL: quoted on PostgreSQL. */
export function ColumnName(platform: DatabasePlatform, name: string): string {
    return platform === 'postgresql' ? `"${name}"` : name;
}

/** Creates the per-run category that owns every fixture query of a bundle. */
export async function CreateFixtureCategory(ctx: IntegrationCheckContext, name: string): Promise<MJQueryCategoryEntity> {
    const category = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
    category.NewRecord();
    category.Name = name;
    category.UserID = ctx.User.ID;
    if (!await category.Save()) {
        throw new Error(`Fixture category '${name}' save failed: ${category.LatestResult?.CompleteMessage}`);
    }
    return category;
}

/** How a fixture query is saved. */
export interface FixtureQuerySpec {
    Name: string;
    SQL: string;
    Reusable?: boolean;
    ExternalDataSourceID?: string;
    /** Extraction for this save; `Auto` (the default) extracts a new query. */
    Override?: MJQueryEntityServer['ExtractionOverride'];
}

/** Builds (does not save) a fixture query in `categoryID`. */
export async function NewFixtureQuery(ctx: IntegrationCheckContext, categoryID: string, spec: FixtureQuerySpec): Promise<MJQueryEntityServer> {
    const query = await ctx.Provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', ctx.User);
    if (!(query instanceof MJQueryEntityServer)) {
        throw new Error('MJ: Queries did not resolve to the server query entity, so extraction cannot run.');
    }
    query.NewRecord();
    query.Name = spec.Name;
    query.CategoryID = categoryID;
    query.SQL = spec.SQL;
    query.Status = 'Approved';
    query.Reusable = spec.Reusable ?? false;
    if (spec.ExternalDataSourceID) query.ExternalDataSourceID = spec.ExternalDataSourceID;
    query.ExtractionOverride = spec.Override ?? 'Auto';
    return query;
}

/** Saves a query built by {@link NewFixtureQuery} (or edited), failing with the save's message. */
export async function SaveFixtureQuery(query: MJQueryEntityServer): Promise<MJQueryEntityServer> {
    if (!await query.Save(FixtureQuerySaveOptions())) {
        throw new Error(`Fixture query '${query.Name}' save failed: ${query.LatestResult?.CompleteMessage}`);
    }
    return query;
}

/** Creates and saves a fixture query, then refreshes the QueryEngine so compositions can find it. */
export async function CreateFixtureQuery(ctx: IntegrationCheckContext, categoryID: string, spec: FixtureQuerySpec): Promise<MJQueryEntityServer> {
    const query = await SaveFixtureQuery(await NewFixtureQuery(ctx, categoryID, spec));
    await QueryEngine.Instance.Config(true, ctx.User, ctx.Provider);
    return query;
}

/** The full path of a fixture category, as composition tokens write it. */
export function FixtureCategoryPath(category: MJQueryCategoryEntity): string {
    const engineQuery = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.CategoryID, category.ID));
    return engineQuery?.CategoryPath ?? category.Name;
}

/** The child rows extraction wrote for one query, read from the database. */
export interface StoredQueryRows {
    Fields: MJQueryFieldEntity[];
    Parameters: MJQueryParameterEntity[];
    Entities: MJQueryEntityEntity[];
    Dependencies: MJQueryDependencyEntity[];
}

/** Reads one query's child rows (fields by Sequence, parameters by Name), bypassing every cache. */
export async function ReadQueryRows(ctx: IntegrationCheckContext, bundle: string, queryID: string): Promise<StoredQueryRows> {
    const provider = RequireQueryDb(ctx.Provider, bundle);
    const filter = `QueryID='${queryID}'`;
    const [fields, parameters, entities, dependencies] = await provider.RunViews([
        { EntityName: 'MJ: Query Fields', ExtraFilter: filter, OrderBy: 'Sequence', ResultType: 'entity_object', BypassCache: true },
        { EntityName: 'MJ: Query Parameters', ExtraFilter: filter, OrderBy: 'Name', ResultType: 'entity_object', BypassCache: true },
        { EntityName: 'MJ: Query Entities', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
        { EntityName: 'MJ: Query Dependencies', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
    ], ctx.User);
    for (const result of [fields, parameters, entities, dependencies]) {
        if (!result.Success) throw new Error(`${bundle}: reading the child rows of query ${queryID} failed: ${result.ErrorMessage}`);
    }
    return {
        Fields: fields.Results as MJQueryFieldEntity[],
        Parameters: parameters.Results as MJQueryParameterEntity[],
        Entities: entities.Results as MJQueryEntityEntity[],
        Dependencies: dependencies.Results as MJQueryDependencyEntity[],
    };
}

/** Reloads a query from the database, bypassing the entity object a check already holds. */
export async function ReloadQuery(ctx: IntegrationCheckContext, queryID: string): Promise<MJQueryEntityServer> {
    const query = await ctx.Provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', ctx.User);
    if (!await query.Load(queryID)) throw new Error(`query ${queryID} could not be loaded`);
    return query;
}

/** The entities whose rows a snapshot covers, with the key column that ties a row to its query. */
const SNAPSHOT_ENTITIES: ReadonlyArray<[string, string]> = [
    ['MJ: Queries', 'ID'],
    ['MJ: Query Fields', 'QueryID'],
    ['MJ: Query Parameters', 'QueryID'],
    ['MJ: Query Entities', 'QueryID'],
    ['MJ: Query Dependencies', 'QueryID'],
];

/**
 * Every stored column of the given queries and their child rows (timestamps included), as one
 * canonical string, one line per row: two snapshots are equal only when no row was added,
 * removed or written. With `childRowsOnly`, the query rows themselves are left out.
 */
export async function SnapshotQueryRows(ctx: IntegrationCheckContext, bundle: string, queryIDs: readonly string[], childRowsOnly = false): Promise<string> {
    const provider = RequireQueryDb(ctx.Provider, bundle);
    const list = queryIDs.map(id => `'${id}'`).join(',');
    const entities = childRowsOnly ? SNAPSHOT_ENTITIES.filter(([name]) => name !== 'MJ: Queries') : SNAPSHOT_ENTITIES;
    const results = await provider.RunViews(entities.map(([entityName, key]) => ({
        EntityName: entityName, ExtraFilter: `${key} IN (${list})`, OrderBy: 'ID', ResultType: 'simple' as const, BypassCache: true,
    })), ctx.User);
    const parts: string[] = [];
    for (const [index, result] of results.entries()) {
        if (!result.Success) throw new Error(`${bundle}: snapshot of ${entities[index][0]} failed: ${result.ErrorMessage}`);
        parts.push(CanonicalRows(result.Results as ReadonlyArray<Record<string, unknown>>, entities[index][0]));
    }
    return parts.filter(p => p.length > 0).join('\n');
}

/** Rows as a stable string, one `label#ID :: column=value|…` line each: sorted, dates as ISO text, vectors left out. */
export function CanonicalRows(rows: ReadonlyArray<Record<string, unknown>>, label = 'row'): string {
    const canonical = rows.map(row => {
        const keys = Object.keys(row).filter(k => k !== 'Embedding' && k !== 'EmbeddingVector').sort();
        return `${label}#${canonicalValue(row['ID'])} :: ${keys.map(k => `${k}=${canonicalValue(row[k])}`).join('|')}`;
    });
    return canonical.sort().join('\n');
}

function canonicalValue(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (value === null || value === undefined) return 'null';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Reports which rows two snapshots disagree on, naming the columns that differ, for a failure message. */
export function SnapshotDifference(before: string, after: string): string {
    const a = rowsByKey(before);
    const b = rowsByKey(after);
    const notes: string[] = [];
    for (const [key, columns] of a) {
        const other = b.get(key);
        if (other === undefined) notes.push(`removed ${key}`);
        else if (JSON.stringify([...other]) !== JSON.stringify([...columns])) notes.push(`changed ${key}: ${changedColumns(columns, other)}`);
    }
    for (const key of b.keys()) if (!a.has(key)) notes.push(`added ${key}`);
    return notes.slice(0, 8).join(' ; ').slice(0, 2000);
}

function rowsByKey(snapshot: string): Map<string, Map<string, string>> {
    const rows = new Map<string, Map<string, string>>();
    for (const line of snapshot.split('\n').filter(l => l.length > 0)) {
        const [key, body] = line.split(' :: ');
        rows.set(key, new Map((body ?? '').split('|').map(kv => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])));
    }
    return rows;
}

function changedColumns(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string {
    return [...before.keys()].filter(k => before.get(k) !== after.get(k))
        .map(k => `${k} ${String(before.get(k)).slice(0, 40)} -> ${String(after.get(k)).slice(0, 40)}`).join(', ');
}

/** Deletes every query in a category (composers first, as they were created last), then the category. Never throws. */
export async function DeleteFixtureCategory(ctx: IntegrationCheckContext, bundle: string, category: MJQueryCategoryEntity | undefined): Promise<void> {
    if (!category) return;
    try {
        const provider = RequireQueryDb(ctx.Provider, bundle);
        const queries = await provider.RunView<MJQueryEntityServer>({
            EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${category.ID}'`, OrderBy: '__mj_CreatedAt DESC', ResultType: 'entity_object', BypassCache: true,
        }, ctx.User);
        await deleteQueryPermissions(ctx, provider, (queries.Results ?? []).map(q => q.ID));
        for (const query of queries.Results ?? []) {
            if (!await query.Delete()) console.error(`${bundle} teardown warning: query '${query.Name}' delete failed: ${query.LatestResult?.CompleteMessage}`);
        }
        if (!await category.Delete()) console.error(`${bundle} teardown warning: category delete failed: ${category.LatestResult?.CompleteMessage}`);
    } catch (e) {
        console.error(`${bundle} teardown warning (queries): ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function deleteQueryPermissions(ctx: IntegrationCheckContext, provider: DatabaseProviderBase, queryIDs: readonly string[]): Promise<void> {
    if (queryIDs.length === 0) return;
    const rows = await provider.RunView({
        EntityName: 'MJ: Query Permissions', ExtraFilter: `QueryID IN (${queryIDs.map(id => `'${id}'`).join(',')})`, ResultType: 'entity_object', BypassCache: true,
    }, ctx.User);
    for (const row of rows.Results ?? []) await row.Delete();
}

/** A generic description of an error, for messages. */
export function ErrorMessageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** Category names carry the bundle prefix and a run stamp, so concurrent runs never share one. */
export function RunStamp(): string {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}
