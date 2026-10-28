/**
 * metadata-sync-queries.checks.ts — the 'metadata-sync-queries' bundle (MSQ1–MSQ7), deterministic
 * tier (IT140).
 *
 * `mj sync push`, through `PushService`, of scratch `MJ: Queries` trees, and the child rows that
 * result:
 *  - MSQ1: children declared under `collections` are stored as declared (their IDs, their
 *    annotations, `Manual`) on a new query, and updated in place when the file changes them; a
 *    column nobody declared still gets its row from extraction;
 *  - MSQ2: the legacy `relatedEntities` format is promoted to the declared collections, so each
 *    declared row is stored once, under its own ID;
 *  - MSQ3: a query with no declared children gets every row from extraction, new and after an SQL edit;
 *  - MSQ4: rows declared in a later push replace the extracted rows of the same name, keeping the
 *    declared IDs;
 *  - MSQ5: a declared parameter removed from the file and the SQL is kept and flagged (the
 *    collection's default `upsert` mode never deletes); a `deleteRecord` entry removes it;
 *  - MSQ6: an unchanged re-push writes no row (snapshots with timestamps compared, not push counts);
 *  - MSQ7: pushing a copy of the shipped `metadata/queries` tree changes no query, field, parameter,
 *    entity or dependency row.
 *
 * Query text is looked up per platform (the SQL dialect by `PlatformKey`). Every query lives in a
 * per-run `zzz-it140` category; Teardown deletes it with its queries and removes the scratch trees.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BaseEngineRegistry, BaseEntity } from '@memberjunction/core';
import type { DatabasePlatform, UserInfo } from '@memberjunction/core';
import type { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { PushService, SyncEngine } from '@memberjunction/metadata-sync';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    CreateFixtureCategory, DeleteFixtureCategory, ForPlatform, PlatformOf, ReadQueryRows, ReloadQuery, RequireQueryDb, RunStamp,
    SnapshotDifference, SnapshotQueryRows,
} from './query-extraction-fixture';
import type { StoredQueryRows } from './query-extraction-fixture';

const BUNDLE = 'metadata-sync-queries';
const PREFIX = 'zzz-it140';
const VENDOR_ENTITY = 'MJ: AI Vendors';

interface SyncQueriesFixture {
    Root: string;
    Platform: DatabasePlatform;
    DialectID: string;
    Category: MJQueryCategoryEntity;
    VendorEntityID: string;
}

let fixture: SyncQueriesFixture | undefined;

function requireFixture(): SyncQueriesFixture {
    if (!fixture) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

// ─── Scratch trees ──────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Writes a one-folder push tree of `MJ: Queries` records. */
function writeQueryTree(dir: string, records: JsonValue[]): string {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'queries'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.mj-sync.json'), JSON.stringify({ version: '1.0.0', push: { autoCreateMissingRecords: true }, directoryOrder: ['queries'] }, null, 2));
    fs.writeFileSync(path.join(dir, 'queries', '.mj-sync.json'), JSON.stringify({ entity: 'MJ: Queries', filePattern: '**/.*.json' }, null, 2));
    fs.writeFileSync(path.join(dir, 'queries', '.queries.json'), JSON.stringify(records, null, 2));
    return dir;
}

/** The SQL every MSQ query is built from: two columns of a core view and one parameter. */
function vendorSQL(platform: DatabasePlatform, extra = '', where = 'WHERE v.[Name] = {{ VendorName | sqlString }}'): string {
    return ForPlatform(`SELECT v.[ID], v.[Name]${extra} FROM __mj.[vwAIVendors] v ${where}`.trim(), platform);
}

interface QueryRecordOptions {
    ID: string;
    Name: string;
    SQL: string;
    Collections?: { [key: string]: JsonValue[] };
    RelatedEntities?: { [key: string]: JsonValue[] };
}

function queryRecord(f: SyncQueriesFixture, o: QueryRecordOptions): JsonValue {
    const record: { [key: string]: JsonValue } = {
        primaryKey: { ID: o.ID },
        fields: {
            Name: `${PREFIX} ${o.Name}`, CategoryID: f.Category.ID, SQL: o.SQL, Status: 'Approved', SQLDialectID: f.DialectID,
            AuditQueryRuns: false, CacheEnabled: false, Reusable: false, IsMaterialized: false,
        },
    };
    if (o.Collections) record.collections = o.Collections;
    if (o.RelatedEntities) record.relatedEntities = o.RelatedEntities;
    return record;
}

/** A declared child record as a metadata file writes it. */
type ChildRecord = { primaryKey: { ID: string }; fields: { [key: string]: JsonValue } };

function declaredField(id: string, name: string, sequence: number, description: string, extra: { [key: string]: JsonValue } = {}): ChildRecord {
    return {
        primaryKey: { ID: id },
        fields: { Name: name, Description: description, Sequence: sequence, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(50)', IsComputed: false, IsSummary: false, DetectionMethod: 'Manual', ...extra },
    };
}

function declaredParameter(id: string, name: string, description: string, extra: { [key: string]: JsonValue } = {}): ChildRecord {
    return { primaryKey: { ID: id }, fields: { Name: name, Type: 'string', IsRequired: true, Description: description, DetectionMethod: 'Manual', IsServerSet: false, ...extra } };
}

function declaredEntity(id: string, entityID: string, extra: { [key: string]: JsonValue } = {}): ChildRecord {
    return { primaryKey: { ID: id }, fields: { EntityID: entityID, DetectionMethod: 'Manual', ...extra } };
}

// ─── Push ───────────────────────────────────────────────────────────────────

async function runPush(user: UserInfo, dir: string): Promise<void> {
    const engine = new SyncEngine(user);
    await engine.initialize();
    const service = new PushService(engine, user);
    try {
        await service.push({ dir }, {});
    } catch (error) {
        throw new Error(`push of ${path.basename(dir)} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function recordId(record: BaseEntity): string {
    const row: Record<string, unknown> = record.GetAll();
    return String(row['ID'] ?? '');
}

/**
 * A push finds existing records through the engine caches other engines hold, which refresh
 * asynchronously after a save. Before pushing an update, wait until every loaded cache of
 * `MJ: Queries` holds the query the previous push created.
 */
async function waitForQueryCaches(id: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const wanted = NormalizeUUID(id);
    const holds = (records: readonly BaseEntity[]) => new Set(records.filter(r => r instanceof BaseEntity).map(r => NormalizeUUID(recordId(r)))).has(wanted);
    while (Date.now() < deadline) {
        const matches = BaseEngineRegistry.Instance.FindCachedEntity('MJ: Queries', { unfilteredOnly: true });
        if (matches.every(m => holds(m.records))) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

/** Pushes `records` as a fresh tree under `name`, then waits for the caches to hold `queryID`. */
async function pushQueries(ctx: IntegrationCheckContext, name: string, records: JsonValue[], queryID: string): Promise<void> {
    const dir = writeQueryTree(path.join(requireFixture().Root, name), records);
    await runPush(ctx.User, dir);
    await waitForQueryCaches(queryID);
}

// ─── Row assertions ─────────────────────────────────────────────────────────

/** `Name:ID:DetectionMethod:Description` for every parameter, by name. */
function parameterLines(rows: StoredQueryRows): string {
    return rows.Parameters.map(p => `${p.Name}:${NormalizeUUID(p.ID)}:${p.DetectionMethod}:${p.Description ?? ''}`).join(' | ');
}

/** `Name:DetectionMethod` for every field, in order, with the ID when `withIDs`. */
function fieldLines(rows: StoredQueryRows, withIDs = false): string {
    return rows.Fields.map(f => `${f.Name}${withIDs ? `:${NormalizeUUID(f.ID)}` : ''}:${f.DetectionMethod}`).join(' | ');
}

function assertOneRowPerName(rows: StoredQueryRows, label: string): void {
    for (const [what, names] of [['field', rows.Fields.map(f => f.Name)], ['parameter', rows.Parameters.map(p => p.Name)]] as const) {
        const lower = names.map(n => n.toLowerCase());
        AssertEqual(new Set(lower).size, lower.length, `${label}: one ${what} row per name (got ${names.join(', ')})`);
    }
}

function ids(n: number): string[] {
    return Array.from({ length: n }, () => randomUUID().toUpperCase());
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

async function dialectIDFor(ctx: IntegrationCheckContext, platform: DatabasePlatform): Promise<string> {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    const result = await provider.RunView<{ ID: string }>({ EntityName: 'MJ: SQL Dialects', ExtraFilter: `PlatformKey='${platform}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
    if (!result.Success || result.Results.length === 0) throw new Error(`${BUNDLE} Setup: no MJ: SQL Dialects row has PlatformKey '${platform}'`);
    return result.Results[0].ID;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const platform = PlatformOf(ctx, BUNDLE);
        const vendor = ctx.Provider.EntityByName(VENDOR_ENTITY);
        if (!vendor) throw new Error(`${BUNDLE} Setup: ${VENDOR_ENTITY} is not in the metadata`);
        fixture = {
            Root: fs.mkdtempSync(path.join(os.tmpdir(), 'mj-it140-')),
            Platform: platform,
            DialectID: await dialectIDFor(ctx, platform),
            Category: await CreateFixtureCategory(ctx, `${PREFIX} ${RunStamp()}`),
            VendorEntityID: vendor.ID,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await DeleteFixtureCategory(ctx, BUNDLE, fixture?.Category);
        if (fixture) fs.rmSync(fixture.Root, { recursive: true, force: true });
        fixture = undefined;
    },
});

// ─── MSQ1–MSQ2: declared children ───────────────────────────────────────────

async function checkMsq1DeclaredCollections(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const [queryID, fieldID, paramID, entityID] = ids(4);
    const record = (version: string): JsonValue => queryRecord(f, {
        ID: queryID, Name: 'MSQ1 declared', SQL: vendorSQL(f.Platform),
        Collections: {
            Fields: [declaredField(fieldID, 'ID', 1, `The vendor ID (${version}).`, { SQLBaseType: 'uniqueidentifier', SQLFullType: 'uniqueidentifier' })],
            Parameters: [declaredParameter(paramID, 'VendorName', `The vendor to find (${version}).`)],
            Entities: [declaredEntity(entityID, f.VendorEntityID)],
        },
    });
    for (const version of ['v1', 'v2']) {
        await pushQueries(ctx, `msq1-${version}`, [record(version)], queryID);
        const rows = await ReadQueryRows(ctx, BUNDLE, queryID);
        const label = `MSQ1 (${version === 'v1' ? 'new' : 'update'})`;
        AssertEqual(parameterLines(rows), `VendorName:${NormalizeUUID(paramID)}:Manual:The vendor to find (${version}).`, `${label}: the declared parameter`);
        const id = rows.Fields.find(x => x.Name === 'ID');
        AssertEqual(`${NormalizeUUID(id?.ID ?? '')}:${id?.DetectionMethod}:${id?.Description}`, `${NormalizeUUID(fieldID)}:Manual:The vendor ID (${version}).`, `${label}: the declared field`);
        AssertEqual(rows.Fields.find(x => x.Name === 'Name')?.DetectionMethod ?? '(missing)', 'Database', `${label}: the undeclared column's row comes from extraction`);
        AssertEqual(rows.Entities.map(e => `${NormalizeUUID(e.ID)}:${e.DetectionMethod}`).join(','), `${NormalizeUUID(entityID)}:Manual`, `${label}: the declared entity link`);
        assertOneRowPerName(rows, label);
    }
}

async function checkMsq2LegacyRelatedEntitiesPromoted(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const [queryID, fieldID, paramID] = ids(3);
    const child = (item: ChildRecord): ChildRecord => ({ ...item, fields: { QueryID: '@parent:ID', ...item.fields } });
    await pushQueries(ctx, 'msq2', [queryRecord(f, {
        ID: queryID, Name: 'MSQ2 legacy', SQL: vendorSQL(f.Platform),
        RelatedEntities: {
            'MJ: Query Fields': [child(declaredField(fieldID, 'Name', 2, 'The vendor name (legacy).', f.Platform === 'postgresql'
                ? { SQLBaseType: 'character varying', SQLFullType: 'character varying(50)' } : {}))],
            'MJ: Query Parameters': [child(declaredParameter(paramID, 'VendorName', 'The vendor to find (legacy).'))],
        },
    })], queryID);
    const rows = await ReadQueryRows(ctx, BUNDLE, queryID);
    assertOneRowPerName(rows, 'MSQ2');
    AssertEqual(parameterLines(rows), `VendorName:${NormalizeUUID(paramID)}:Manual:The vendor to find (legacy).`, 'MSQ2: the legacy parameter is stored once, under its own ID');
    const name = rows.Fields.find(x => x.Name === 'Name');
    AssertEqual(`${NormalizeUUID(name?.ID ?? '')}:${name?.DetectionMethod}`, `${NormalizeUUID(fieldID)}:Manual`, 'MSQ2: the legacy field is stored once, under its own ID');
}

// ─── MSQ3–MSQ4: extraction, then declared later ─────────────────────────────

async function checkMsq3AutoExtraction(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const [queryID] = ids(1);
    await pushQueries(ctx, 'msq3-new', [queryRecord(f, { ID: queryID, Name: 'MSQ3 auto', SQL: vendorSQL(f.Platform) })], queryID);
    const created = await ReadQueryRows(ctx, BUNDLE, queryID);
    AssertEqual(fieldLines(created), 'ID:Database | Name:Database', 'MSQ3 (new): fields from the describe');
    AssertEqual(created.Parameters.map(p => `${p.Name}:${p.DetectionMethod}:${String(p.IsRequired)}`).join(','), 'VendorName:Parser:true', 'MSQ3 (new): the parameter from the parser');
    AssertEqual(created.Entities.map(e => `${NormalizeUUID(e.EntityID)}:${e.DetectionMethod}`).join(','), `${NormalizeUUID(f.VendorEntityID)}:Parser`, 'MSQ3 (new): the entity link');

    await pushQueries(ctx, 'msq3-update', [queryRecord(f, { ID: queryID, Name: 'MSQ3 auto', SQL: vendorSQL(f.Platform, ', v.[Description]', '') })], queryID);
    const updated = await ReadQueryRows(ctx, BUNDLE, queryID);
    AssertEqual(fieldLines(updated), 'ID:Database | Name:Database | Description:Database', 'MSQ3 (update): the new column has a field');
    AssertEqual(updated.Parameters.length, 0, 'MSQ3 (update): the parameter the SQL dropped is removed');
    const kept = created.Fields.map(x => NormalizeUUID(x.ID)).join(',');
    AssertEqual(updated.Fields.slice(0, 2).map(x => NormalizeUUID(x.ID)).join(','), kept, 'MSQ3 (update): unchanged fields keep their rows');
}

async function checkMsq4DeclaredLaterReplacesExtracted(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const [queryID, fieldID, paramID] = ids(3);
    await pushQueries(ctx, 'msq4-auto', [queryRecord(f, { ID: queryID, Name: 'MSQ4 later', SQL: vendorSQL(f.Platform) })], queryID);
    const extracted = await ReadQueryRows(ctx, BUNDLE, queryID);
    const oldIDs = [...extracted.Fields, ...extracted.Parameters].map(r => NormalizeUUID(r.ID));

    await pushQueries(ctx, 'msq4-declared', [queryRecord(f, {
        ID: queryID, Name: 'MSQ4 later', SQL: vendorSQL(f.Platform),
        Collections: {
            Fields: [declaredField(fieldID, 'Name', 2, 'The vendor name (declared later).', f.Platform === 'postgresql'
                ? { SQLBaseType: 'character varying', SQLFullType: 'character varying(50)' } : {})],
            Parameters: [declaredParameter(paramID, 'VendorName', 'The vendor to find (declared later).')],
        },
    })], queryID);
    const rows = await ReadQueryRows(ctx, BUNDLE, queryID);
    assertOneRowPerName(rows, 'MSQ4');
    const name = rows.Fields.find(x => x.Name === 'Name');
    AssertEqual(`${NormalizeUUID(name?.ID ?? '')}:${name?.DetectionMethod}:${name?.Description}`,
        `${NormalizeUUID(fieldID)}:Manual:The vendor name (declared later).`, 'MSQ4: the declared field replaces the extracted one, keeping its own ID');
    AssertEqual(parameterLines(rows), `VendorName:${NormalizeUUID(paramID)}:Manual:The vendor to find (declared later).`,
        'MSQ4: the declared parameter replaces the extracted one, keeping its own ID');
    const idRow = rows.Fields.find(x => x.Name === 'ID');
    Assert(idRow !== undefined && oldIDs.includes(NormalizeUUID(idRow.ID)), 'MSQ4: the undeclared ID field keeps its extracted row');
    Assert(!oldIDs.includes(NormalizeUUID(name?.ID ?? '')), 'MSQ4: the extracted Name row is gone');
}

// ─── MSQ5: removing a declared parameter ────────────────────────────────────

async function checkMsq5RemovedDeclaredParameter(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const [queryID, vendorParamID, regionParamID] = ids(3);
    const both = vendorSQL(f.Platform, '', 'WHERE v.[Name] = {{ VendorName | sqlString }} AND v.[Description] <> {{ Region | sqlString }}');
    const record = (sql: string, params: JsonValue[]): JsonValue => queryRecord(f, { ID: queryID, Name: 'MSQ5 removed', SQL: sql, Collections: { Parameters: params } });
    const vendorParam = declaredParameter(vendorParamID, 'VendorName', 'The vendor to find.');
    const regionParam = declaredParameter(regionParamID, 'Region', 'A region to exclude.');
    await pushQueries(ctx, 'msq5-both', [record(both, [vendorParam, regionParam])], queryID);
    AssertEqual((await ReadQueryRows(ctx, BUNDLE, queryID)).Parameters.map(p => p.Name).join(','), 'Region,VendorName', 'MSQ5: both declared parameters are stored');

    await pushQueries(ctx, 'msq5-dropped', [record(vendorSQL(f.Platform), [vendorParam])], queryID);
    const kept = await ReadQueryRows(ctx, BUNDLE, queryID);
    AssertEqual(kept.Parameters.map(p => `${p.Name}:${p.DetectionMethod}`).join(','), 'Region:Manual,VendorName:Manual',
        'MSQ5: a declared parameter left out of the file is kept (the default upsert mode deletes nothing)');
    const query = await ReloadQuery(ctx, queryID);
    AssertEqual(query.ExtractionStatus, 'Warning', 'MSQ5: the kept parameter the SQL no longer uses makes the run a Warning');
    Assert((query.ExtractionMessage ?? '').includes('The authored parameter "Region" is not used by the SQL.'),
        `MSQ5: the message flags Region, got: ${query.ExtractionMessage ?? '(none)'}`);

    await pushQueries(ctx, 'msq5-deleted', [record(vendorSQL(f.Platform), [vendorParam, { primaryKey: { ID: regionParamID }, deleteRecord: { delete: true } }])], queryID);
    AssertEqual((await ReadQueryRows(ctx, BUNDLE, queryID)).Parameters.map(p => p.Name).join(','), 'VendorName', 'MSQ5: a deleteRecord entry removes the parameter');
}

// ─── MSQ6–MSQ7: no-op pushes ────────────────────────────────────────────────

async function checkMsq6UnchangedRePushWritesNothing(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const [queryID, fieldID, paramID] = ids(3);
    const records = [queryRecord(f, {
        ID: queryID, Name: 'MSQ6 repush', SQL: vendorSQL(f.Platform),
        Collections: {
            Fields: [declaredField(fieldID, 'ID', 1, 'The vendor ID.', { SQLBaseType: 'uniqueidentifier', SQLFullType: 'uniqueidentifier' })],
            Parameters: [declaredParameter(paramID, 'VendorName', 'The vendor to find.')],
        },
    })];
    const dir = writeQueryTree(path.join(f.Root, 'msq6'), records);
    await runPush(ctx.User, dir);
    await waitForQueryCaches(queryID);
    const before = await SnapshotQueryRows(ctx, BUNDLE, [queryID]);
    await runPush(ctx.User, dir);
    const after = await SnapshotQueryRows(ctx, BUNDLE, [queryID]);
    Assert(before === after, `MSQ6: an unchanged re-push wrote rows: ${SnapshotDifference(before, after)}`);
}

/** Copies the shipped `metadata/queries` folder (records, `.mj-sync.json`, the SQL files) into a scratch tree. */
function copyShippedQueries(target: string): { Dir: string; QueryIDs: string[] } {
    const source = path.join(repoRoot(), 'metadata', 'queries');
    if (!fs.existsSync(source)) SkipCheck(`the shipped queries folder is not at ${source}`);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(source, path.join(target, 'queries'), { recursive: true });
    fs.rmSync(path.join(target, 'queries', '.backups'), { recursive: true, force: true });
    fs.writeFileSync(path.join(target, '.mj-sync.json'), JSON.stringify({ version: '1.0.0', push: { autoCreateMissingRecords: false }, directoryOrder: ['queries'] }, null, 2));
    return { Dir: target, QueryIDs: shippedQueryIDs(path.join(target, 'queries')) };
}

function shippedQueryIDs(dir: string): string[] {
    const found: string[] = [];
    for (const file of fs.readdirSync(dir).filter(n => n.startsWith('.') && n.endsWith('.json') && n !== '.mj-sync.json')) {
        const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        for (const record of Array.isArray(parsed) ? parsed : [parsed]) {
            const id = (record as { primaryKey?: { ID?: string } }).primaryKey?.ID;
            if (id) found.push(id);
        }
    }
    return found;
}

function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'mj.config.cjs')) && fs.existsSync(path.join(dir, 'metadata'))) return dir;
        dir = path.dirname(dir);
    }
    SkipCheck(`the repo root (mj.config.cjs and metadata/) could not be found from ${process.cwd()}`);
}

async function checkMsq7ShippedQueriesPushIsANoOp(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const tree = copyShippedQueries(path.join(f.Root, 'msq7'));
    Assert(tree.QueryIDs.length > 0, 'MSQ7: the shipped queries folder holds no records');
    const before = await SnapshotQueryRows(ctx, BUNDLE, tree.QueryIDs);
    await runPush(ctx.User, tree.Dir);
    const after = await SnapshotQueryRows(ctx, BUNDLE, tree.QueryIDs);
    Assert(before === after, `MSQ7: pushing the shipped queries again changed rows: ${SnapshotDifference(before, after)}`);
}

export const MetadataSyncQueriesChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.MSQ1`, Name: 'MSQ1: declared collections are stored as declared on a new query and updated in place', Fn: checkMsq1DeclaredCollections },
    { Id: `${BUNDLE}.MSQ2`, Name: 'MSQ2: the legacy relatedEntities format is promoted, so each declared row is stored once under its own ID', Fn: checkMsq2LegacyRelatedEntitiesPromoted },
    { Id: `${BUNDLE}.MSQ3`, Name: 'MSQ3: a query with no declared children gets its rows from extraction, new and after an SQL edit', Fn: checkMsq3AutoExtraction },
    { Id: `${BUNDLE}.MSQ4`, Name: 'MSQ4: rows declared in a later push replace the extracted rows of the same name, keeping their IDs', Fn: checkMsq4DeclaredLaterReplacesExtracted },
    { Id: `${BUNDLE}.MSQ5`, Name: 'MSQ5: a declared parameter left out of the file is kept and flagged; a deleteRecord entry removes it', Fn: checkMsq5RemovedDeclaredParameter },
    { Id: `${BUNDLE}.MSQ6`, Name: 'MSQ6: an unchanged re-push writes no row', Fn: checkMsq6UnchangedRePushWritesNothing },
    { Id: `${BUNDLE}.MSQ7`, Name: 'MSQ7: pushing a copy of the shipped metadata/queries tree changes no query or child row', Fn: checkMsq7ShippedQueriesPushIsANoOp },
];

for (const check of MetadataSyncQueriesChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
