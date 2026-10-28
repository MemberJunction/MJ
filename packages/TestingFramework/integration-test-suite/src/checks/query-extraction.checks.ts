/**
 * query-extraction.checks.ts — the 'query-extraction' bundle (QE1–QE11), deterministic tier (IT138).
 *
 * Saves fixture queries with extraction ON (a normal save) and asserts exactly what extraction
 * wrote, on SQL Server and PostgreSQL:
 *  - QE1: output fields of a query over plain tables — name, order, base and full type, nullability,
 *    computed, and the `schema.object` source of a column no entity backs;
 *  - QE2: a query over a view built on another view keeps the inner types and names the view it reads;
 *  - QE3: a query over a core MJ view binds each column to its entity field;
 *  - QE4: Query Entities lists every entity read anywhere (a CTE body, a join, an EXISTS subquery)
 *    and never a CTE name, even one spelled like an entity's view;
 *  - QE5: parameters — required only when a use sits outside every `{% if %}`, types from filters,
 *    defaults, and doc-comment / trailing `--:` descriptions on the right rows;
 *  - QE6: the union of every branch render's columns, with a note naming the branch-only one;
 *  - QE7: an external-data-source query is not described (`Skipped`) and gets no fields;
 *  - QE8: a query whose table is named by a template parameter keeps its declared fields;
 *  - QE9: a query returning two columns with one name is refused at save, and nothing is written;
 *  - QE10: `ExtractionStatus`, `ExtractedSQLHash` and `UsesTemplate` are recorded on the query row;
 *  - QE11: a composition that leaves out a required parameter of its target is refused at save;
 *    one that passes it records a dependency row by full path, with the argument mapping.
 *
 * The fixture schema `mjit_extract` (two tables, a view over a view) is created in Setup and
 * dropped in Teardown. Every query lives in a per-run `zzz-it138` category, deleted in Teardown.
 */
import { createHash } from 'node:crypto';
import type { DatabasePlatform } from '@memberjunction/core';
import type { MJExternalDataSourceEntity, MJQueryCategoryEntity, MJQueryFieldEntity } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    ColumnName, CreateFixtureCategory, CreateFixtureQuery, FixtureCategoryPath, CreateSchemaStatement, DeleteFixtureCategory, DropSchemaStatements,
    ForPlatform, NewFixtureQuery, ObjectName, PlatformOf, ReadQueryRows, RequireQueryDb, RunFixtureSQL, RunFixtureSQLQuietly, RunStamp,
} from './query-extraction-fixture';
import type { FixtureQuerySpec } from './query-extraction-fixture';
import type { MJQueryEntityServer } from '@memberjunction/core-entities-server';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';

const BUNDLE = 'query-extraction';
const PREFIX = 'zzz-it138';
const SCHEMA = 'mjit_extract';
const VIEWS = ['vwCustomerTop', 'vwCustomerBase'];
const TABLES = ['Customer', 'Region'];

interface ExtractionFixture {
    Platform: DatabasePlatform;
    Category: MJQueryCategoryEntity;
    ExternalSource: MJExternalDataSourceEntity | null;
}

let fixture: ExtractionFixture | undefined;

function requireFixture(): ExtractionFixture {
    if (!fixture) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

// ─── Fixture schema ─────────────────────────────────────────────────────────

function createStatements(platform: DatabasePlatform): string[] {
    const t = (name: string) => ObjectName(platform, SCHEMA, name);
    const c = (name: string) => ColumnName(platform, name);
    const text = platform === 'postgresql' ? 'VARCHAR' : 'NVARCHAR';
    const decimal = platform === 'postgresql' ? 'NUMERIC' : 'DECIMAL';
    const stamp = platform === 'postgresql' ? 'TIMESTAMPTZ' : 'DATETIMEOFFSET';
    return [
        CreateSchemaStatement(platform, SCHEMA),
        `CREATE TABLE ${t('Region')} (${c('ID')} INTEGER NOT NULL PRIMARY KEY, ${c('RegionName')} ${text}(50) NOT NULL)`,
        `CREATE TABLE ${t('Customer')} (${c('ID')} INTEGER NOT NULL PRIMARY KEY, ${c('Name')} ${text}(50) NOT NULL, ${c('Code')} VARCHAR(50) NULL, ` +
            `${c('Balance')} ${decimal}(12,3) NULL, ${c('JoinedAt')} ${stamp} NOT NULL, ${c('RegionID')} INTEGER NULL)`,
        `CREATE VIEW ${t('vwCustomerBase')} AS SELECT ${c('ID')}, ${c('Name')}, ${c('Balance')}, ${c('RegionID')} FROM ${t('Customer')}`,
        `CREATE VIEW ${t('vwCustomerTop')} AS SELECT ${c('ID')}, ${c('Name')}, ${c('Balance')} FROM ${t('vwCustomerBase')} WHERE ${c('Balance')} > 0`,
    ];
}

async function createExternalSource(ctx: IntegrationCheckContext, stamp: string): Promise<MJExternalDataSourceEntity | null> {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    const types = await provider.RunView<{ ID: string }>({ EntityName: 'MJ: External Data Source Types', Fields: ['ID'], OrderBy: 'Name', ResultType: 'simple' }, ctx.User);
    if (!types.Success || types.Results.length === 0) return null;
    const source = await provider.GetEntityObject<MJExternalDataSourceEntity>('MJ: External Data Sources', ctx.User);
    source.NewRecord();
    source.Name = `${PREFIX} external ${stamp}`;
    source.TypeID = types.Results[0].ID;
    source.Status = 'Disabled';
    if (!await source.Save()) throw new Error(`${BUNDLE} Setup: the external data source save failed: ${source.LatestResult?.CompleteMessage}`);
    return source;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const platform = PlatformOf(ctx, BUNDLE);
        await RunFixtureSQL(ctx, BUNDLE, [...DropSchemaStatements(platform, SCHEMA, VIEWS, TABLES), ...createStatements(platform)]);
        const stamp = RunStamp();
        const category = await CreateFixtureCategory(ctx, `${PREFIX} ${stamp}`);
        fixture = { Platform: platform, Category: category, ExternalSource: await createExternalSource(ctx, stamp) };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await DeleteFixtureCategory(ctx, BUNDLE, fixture?.Category);
        if (fixture?.ExternalSource) {
            await fixture.ExternalSource.Delete().catch(() => undefined);
        }
        await RunFixtureSQLQuietly(ctx, BUNDLE, DropSchemaStatements(PlatformOf(ctx, BUNDLE), SCHEMA, VIEWS, TABLES));
        fixture = undefined;
    },
});

// ─── Expectations ───────────────────────────────────────────────────────────

/** One expected field row. `Object` is the `schema.object` source of a column no entity backs. */
interface ExpectedField {
    Name: string;
    Base: string;
    Full: string;
    Nullable: boolean | null;
    Computed: boolean;
    Object: string | null;
    SourceField: string | null;
}

/** Type names per platform, as each server's describe reports them. */
interface PlatformTypes {
    Int: [string, string];
    Big: [string, string];
    Text50: [string, string];
    Text100: [string, string];
    Varchar50: [string, string];
    Decimal: [string, string];
    Stamp: [string, string];
    Guid: [string, string];
    /** `Balance * 2`. */
    Doubled: [string, string];
    /** `COUNT(*)`. */
    Count: [string, string];
}

const SQLSERVER_TYPES: PlatformTypes = {
    Int: ['int', 'int'], Big: ['bigint', 'bigint'], Text50: ['nvarchar', 'nvarchar(50)'], Text100: ['nvarchar', 'nvarchar(100)'],
    Varchar50: ['varchar', 'varchar(50)'], Decimal: ['decimal', 'decimal(12,3)'], Stamp: ['datetimeoffset', 'datetimeoffset(7)'],
    Guid: ['uniqueidentifier', 'uniqueidentifier'], Doubled: ['decimal', 'decimal(14,3)'], Count: ['int', 'int'],
};

const POSTGRES_TYPES: PlatformTypes = {
    Int: ['integer', 'integer'], Big: ['bigint', 'bigint'], Text50: ['character varying', 'character varying(50)'],
    Text100: ['character varying', 'character varying(100)'], Varchar50: ['character varying', 'character varying(50)'],
    Decimal: ['numeric', 'numeric(12,3)'], Stamp: ['timestamp with time zone', 'timestamp with time zone'],
    Guid: ['uuid', 'uuid'], Doubled: ['numeric', 'numeric'], Count: ['bigint', 'bigint'],
};

function typesFor(platform: DatabasePlatform): PlatformTypes {
    return platform === 'postgresql' ? POSTGRES_TYPES : SQLSERVER_TYPES;
}

/**
 * Nullability as the platform's describe reports it: SQL Server reports it per column;
 * PostgreSQL's statement describe does not, so every field is `null` there.
 */
function nullable(platform: DatabasePlatform, value: boolean): boolean | null {
    return platform === 'postgresql' ? null : value;
}

function column(platform: DatabasePlatform, name: string, type: [string, string], isNullable: boolean, object: string): ExpectedField {
    return { Name: name, Base: type[0], Full: type[1], Nullable: nullable(platform, isNullable), Computed: false, Object: `${SCHEMA}.${object}`, SourceField: name };
}

function computed(platform: DatabasePlatform, name: string, type: [string, string]): ExpectedField {
    return { Name: name, Base: type[0], Full: type[1], Nullable: nullable(platform, true), Computed: true, Object: null, SourceField: null };
}

function fieldShape(f: MJQueryFieldEntity): ExpectedField {
    return {
        Name: f.Name, Base: f.SQLBaseType, Full: f.SQLFullType, Nullable: f.IsNullable, Computed: f.IsComputed,
        Object: f.SourceObjectName, SourceField: f.SourceFieldName,
    };
}

function assertFields(actual: readonly MJQueryFieldEntity[], expected: readonly ExpectedField[], label: string): void {
    AssertEqual(actual.map(f => f.Name).join(','), expected.map(f => f.Name).join(','), `${label}: field names in order`);
    for (const [index, field] of actual.entries()) {
        AssertEqual(field.Sequence, index + 1, `${label}: ${field.Name}.Sequence`);
        AssertEqual(JSON.stringify(fieldShape(field)), JSON.stringify(expected[index]), `${label}: field ${field.Name}`);
    }
}

function spec(name: string, sql: string, platform: DatabasePlatform, extra: Partial<FixtureQuerySpec> = {}): FixtureQuerySpec {
    return { Name: `${PREFIX} ${name}`, SQL: ForPlatform(sql, platform), ...extra };
}

async function saveQuery(ctx: IntegrationCheckContext, name: string, sql: string, extra: Partial<FixtureQuerySpec> = {}): Promise<MJQueryEntityServer> {
    const f = requireFixture();
    return CreateFixtureQuery(ctx, f.Category.ID, spec(name, sql, f.Platform, extra));
}

// ─── QE1–QE3: output fields ─────────────────────────────────────────────────

const CUSTOMER_COLUMNS_SQL = 'SELECT c.[ID], c.[Name], c.[Code], c.[Balance], c.[JoinedAt], c.[Balance] * 2 AS [Doubled], r.[RegionName] ' +
    'FROM mjit_extract.[Customer] c LEFT JOIN mjit_extract.[Region] r ON r.[ID] = c.[RegionID]';

async function checkQe1TableColumns(ctx: IntegrationCheckContext): Promise<void> {
    const { Platform: p } = requireFixture();
    const t = typesFor(p);
    const query = await saveQuery(ctx, 'QE1 customer columns', CUSTOMER_COLUMNS_SQL);
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    assertFields(rows.Fields, [
        column(p, 'ID', t.Int, false, 'Customer'),
        column(p, 'Name', t.Text50, false, 'Customer'),
        column(p, 'Code', t.Varchar50, true, 'Customer'),
        column(p, 'Balance', t.Decimal, true, 'Customer'),
        column(p, 'JoinedAt', t.Stamp, false, 'Customer'),
        computed(p, 'Doubled', t.Doubled),
        // NOT NULL in its table, nullable here: it comes through a LEFT JOIN.
        column(p, 'RegionName', t.Text50, true, 'Region'),
    ], 'QE1');
    Assert(rows.Fields.every(f => f.SourceEntityID === null && f.SourceEntityFieldID === null), 'QE1: no fixture column maps to an entity');
    AssertEqual(rows.Entities.length, 0, 'QE1: the fixture tables back no entity, so there are no Query Entities rows');
    Assert(rows.Fields.every(f => f.DetectionMethod === 'Database'), 'QE1: every field row comes from the database describe');
}

async function checkQe2ViewOverView(ctx: IntegrationCheckContext): Promise<void> {
    const { Platform: p } = requireFixture();
    const t = typesFor(p);
    const query = await saveQuery(ctx, 'QE2 view over view', 'SELECT t.[ID], t.[Name], t.[Balance] FROM mjit_extract.[vwCustomerTop] t');
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    assertFields(rows.Fields, [
        column(p, 'ID', t.Int, false, 'vwCustomerTop'),
        column(p, 'Name', t.Text50, false, 'vwCustomerTop'),
        column(p, 'Balance', t.Decimal, true, 'vwCustomerTop'),
    ], 'QE2');
}

async function checkQe3CoreViewBindsEntityFields(ctx: IntegrationCheckContext): Promise<void> {
    const { Platform: p } = requireFixture();
    const t = typesFor(p);
    const users = ctx.Provider.EntityByName('MJ: Users');
    Assert(users !== undefined, 'QE3: MJ: Users is not in the metadata');
    const query = await saveQuery(ctx, 'QE3 core users', 'SELECT u.[ID], u.[Name], u.[Email], COUNT(*) OVER () AS [Total] FROM __mj.[vwUsers] u');
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    AssertEqual(rows.Fields.map(f => `${f.Name}:${f.SQLFullType}:${String(f.IsNullable)}:${f.IsComputed}`).join(','),
        [`ID:${t.Guid[1]}:${String(nullable(p, false))}:false`, `Name:${t.Text100[1]}:${String(nullable(p, false))}:false`,
            `Email:${t.Text100[1]}:${String(nullable(p, false))}:false`, `Total:${t.Count[1]}:${String(nullable(p, true))}:true`].join(','),
        'QE3: field names, types, nullability, computed');
    for (const name of ['ID', 'Name', 'Email']) {
        const row = rows.Fields.find(f => f.Name === name);
        const entityField = users!.Fields.find(f => f.Name === name);
        Assert(row !== undefined && entityField !== undefined, `QE3: ${name} is missing`);
        Assert(UUIDsEqual(row!.SourceEntityID, users!.ID), `QE3: ${name}.SourceEntityID must be MJ: Users (got ${row!.SourceEntityID})`);
        Assert(UUIDsEqual(row!.SourceEntityFieldID, entityField!.ID), `QE3: ${name}.SourceEntityFieldID must be the MJ: Users.${name} field`);
        AssertEqual(row!.SourceFieldName, name, `QE3: ${name}.SourceFieldName`);
        AssertEqual(row!.SourceObjectName, null, `QE3: ${name}.SourceObjectName is empty when an entity field is the source`);
    }
    const total = rows.Fields.find(f => f.Name === 'Total');
    Assert(total?.SourceEntityID === null && total?.SourceObjectName === null, 'QE3: the computed Total has no source');
    AssertEqual(rows.Entities.map(e => NormalizeUUID(e.EntityID)).join(','), NormalizeUUID(users!.ID), 'QE3: Query Entities is exactly MJ: Users');
}

// ─── QE4: entities read ─────────────────────────────────────────────────────

async function checkQe4EntitiesReadAnywhere(ctx: IntegrationCheckContext): Promise<void> {
    const query = await saveQuery(ctx, 'QE4 entity reads',
        'WITH [vwApplications] AS (SELECT ur.[RoleID], COUNT(*) AS [N] FROM __mj.[vwUserRoles] ur GROUP BY ur.[RoleID])\n' +
        'SELECT r.[Name], a.[N] FROM [vwApplications] a JOIN __mj.[vwRoles] r ON r.[ID] = a.[RoleID]\n' +
        'WHERE EXISTS (SELECT 1 FROM __mj.[vwUsers] u WHERE u.[Name] = r.[Name])');
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    const entityNames = new Map(ctx.Provider.Entities.map(x => [NormalizeUUID(x.ID), x.Name]));
    const names = rows.Entities.map(e => entityNames.get(NormalizeUUID(e.EntityID)) ?? e.EntityID).sort();
    AssertEqual(names.join(','), 'MJ: Roles,MJ: User Roles,MJ: Users',
        'QE4: an entity read only in a CTE (User Roles) or only in an EXISTS subquery (Users) is listed; the CTE named vwApplications is not MJ: Applications');
    Assert(rows.Entities.every(e => e.DetectionMethod === 'Parser' && e.AlternateBaseViewID === null), 'QE4: entity links come from the parser, on base views');
    const name = rows.Fields.find(f => f.Name === 'Name');
    const roles = ctx.Provider.EntityByName('MJ: Roles');
    Assert(name !== undefined && UUIDsEqual(name.SourceEntityID, roles?.ID), 'QE4: the Name column is sourced from MJ: Roles');
    AssertEqual(rows.Fields.find(f => f.Name === 'N')?.IsComputed ?? null, true, 'QE4: the CTE\'s COUNT(*) is computed');
}

// ─── QE5: parameters ────────────────────────────────────────────────────────

const PARAMETERS_SQL = [
    '{#',
    '  Customers in one region.',
    '  @param RegionID The region to list.',
    '  @param MinBalance Only customers with at least this balance.',
    '#}',
    'SELECT c.[ID],',
    "       c.[Name] AS [CustomerName], --: The customer's display name.",
    '       c.[Balance]',
    'FROM mjit_extract.[Customer] c',
    'WHERE c.[RegionID] = {{ RegionID | sqlNumber }}',
    '{% if MinBalance %} AND c.[Balance] >= {{ MinBalance | sqlNumber }}{% endif %}',
    '{% if Search %} AND c.[Name] LIKE {{ Search | sqlLikeContains }}{% endif %}',
    '{% if Since %} AND c.[JoinedAt] >= {{ Since | sqlDate }}{% endif %}',
    " AND c.[Code] <> {{ Code | default('X') | sqlString }}",
    '{% if Tier %} AND c.[Balance] > 0{% endif %}',
    ' AND c.[ID] <> {{ Tier | sqlNumber }}',
].join('\n');

/** `Name:Type:IsRequired:DefaultValue:Description`, by name. */
const EXPECTED_PARAMETERS = [
    'Code:string:false:X:',
    'MinBalance:number:false::Only customers with at least this balance.',
    'RegionID:number:true::The region to list.',
    'Search:string:false::',
    'Since:date:false::',
    // Used inside an {% if %} condition AND outside every block: the outside use makes it required.
    'Tier:number:true::',
];

async function checkQe5Parameters(ctx: IntegrationCheckContext): Promise<void> {
    const query = await saveQuery(ctx, 'QE5 parameters', PARAMETERS_SQL);
    AssertEqual(query.ExtractionStatus, 'OK', `QE5: extraction status (message: ${query.ExtractionMessage ?? ''})`);
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    const actual = rows.Parameters.map(r => `${r.Name}:${r.Type}:${String(r.IsRequired)}:${r.DefaultValue ?? ''}:${r.Description ?? ''}`).sort();
    AssertEqual(actual.join(' | '), EXPECTED_PARAMETERS.join(' | '), 'QE5: parameter rows');
    Assert(rows.Parameters.every(r => r.DetectionMethod === 'Parser'), 'QE5: parameter rows come from the parser');
    const described = rows.Fields.map(f => `${f.Name}=${f.Description ?? ''}`).join(',');
    AssertEqual(described, "ID=,CustomerName=The customer's display name.,Balance=",
        'QE5: the trailing --: description lands on the aliased field only');
}

// ─── QE6: branch union ──────────────────────────────────────────────────────

async function checkQe6BranchUnion(ctx: IntegrationCheckContext): Promise<void> {
    const query = await saveQuery(ctx, 'QE6 branch union',
        'SELECT c.[ID]{% if WithCode %}, c.[Code]{% endif %}{% if Short %}, c.[Name] AS [Nm]{% else %}, c.[Balance] AS [Bal]{% endif %} ' +
        'FROM mjit_extract.[Customer] c');
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    AssertEqual(rows.Fields.map(f => f.Name).join(','), 'ID,Code,Nm,Bal', 'QE6: every branch render\'s columns, the base render\'s first');
    AssertEqual(query.ExtractionStatus, 'OK', 'QE6: a branch-only column is a note, not a warning');
    const note = query.ExtractionMessage ?? '';
    Assert(note.includes('Columns only some branches of the template return:') && /\bBal \(render \d+\)/.test(note)
        && /\bCode \(not in render \d+\)/.test(note) && /\bNm \(not in render \d+\)/.test(note),
        `QE6: the note names every column only some branches return (Code, Nm and the else-branch Bal), got: ${note || '(none)'}`);
    AssertEqual(rows.Parameters.map(r => `${r.Name}:${String(r.IsRequired)}`).join(','), 'Short:false,WithCode:false',
        'QE6: condition-only parameters are optional');
}

// ─── QE7–QE9: not described, declared, refused ──────────────────────────────

async function checkQe7ExternalSourceSkipped(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    Assert(f.ExternalSource !== null, 'QE7: no MJ: External Data Source Types row exists to create a fixture external source with');
    const query = await saveQuery(ctx, 'QE7 external', 'SELECT ID, Name FROM remote_customers', { ExternalDataSourceID: f.ExternalSource!.ID });
    AssertEqual(query.ExtractionStatus, 'Skipped', 'QE7: an external-source query is not described');
    Assert((query.ExtractionMessage ?? '').startsWith('The query reads an external data source'), `QE7: message, got: ${query.ExtractionMessage ?? '(none)'}`);
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    AssertEqual(`${rows.Fields.length}/${rows.Entities.length}`, '0/0', 'QE7: no field or entity rows are derived for an external query');
}

async function checkQe8ParameterNamedSourceKeepsDeclaredFields(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const query = await NewFixtureQuery(ctx, f.Category.ID, spec('QE8 parameter source', 'SELECT * FROM mjit_extract.{{ TableName | sqlIdentifier }}', f.Platform));
    const declared: Array<[string, string, string]> = [['DeclaredA', 'int', 'int'], ['DeclaredB', 'nvarchar', 'nvarchar(50)']];
    for (const [index, [name, base, full]] of declared.entries()) {
        const field = await query.DeclaredFields.Create();
        field.Name = name;
        field.Sequence = index + 1;
        field.SQLBaseType = base;
        field.SQLFullType = full;
    }
    Assert(await query.Save(FixtureQuerySaveOptions()), `QE8: save failed: ${query.LatestResult?.CompleteMessage}`);
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    AssertEqual(rows.Fields.map(r => `${r.Name}:${r.SQLFullType}:${r.DetectionMethod}`).join(','), 'DeclaredA:int:Manual,DeclaredB:nvarchar(50):Manual',
        'QE8: the declared fields are stored as declared');
    Assert((query.ExtractionMessage ?? '').includes('named by a template parameter'), `QE8: the note says why, got: ${query.ExtractionMessage ?? '(none)'}`);
    AssertEqual(rows.Parameters.map(r => `${r.Name}:${r.Type}:${String(r.IsRequired)}`).join(','), 'TableName:string:true', 'QE8: the table parameter');
}

async function checkQe9DuplicateOutputRefused(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const name = `${PREFIX} QE9 duplicate`;
    const query = await NewFixtureQuery(ctx, f.Category.ID, spec('QE9 duplicate',
        'SELECT c.[ID], r.[ID] FROM mjit_extract.[Customer] c JOIN mjit_extract.[Region] r ON r.[ID] = c.[RegionID]', f.Platform));
    Assert(!await query.Save(FixtureQuerySaveOptions()), 'QE9: a query returning two columns named ID must be refused');
    const message = query.LatestResult?.CompleteMessage ?? '';
    Assert(message.includes('returns more than one column named "ID"'), `QE9: the refusal names the column, got: ${message}`);
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    const stored = await provider.RunView({ EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${f.Category.ID}' AND Name='${name}'`, ResultType: 'count_only', BypassCache: true }, ctx.User);
    AssertEqual(stored.TotalRowCount, 0, 'QE9: nothing was written');
}

// ─── QE10: the query row's extraction columns ───────────────────────────────

async function checkQe10ExtractionColumns(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const cases: Array<[string, string, boolean]> = [
        ['QE10 plain', CUSTOMER_COLUMNS_SQL, false],
        ['QE10 template', 'SELECT c.[ID] FROM mjit_extract.[Customer] c WHERE c.[RegionID] = {{ RegionID | sqlNumber }}', true],
    ];
    for (const [name, sql, usesTemplate] of cases) {
        const query = await saveQuery(ctx, name, sql);
        const expectedHash = createHash('sha256').update(`${f.Platform}\n${query.SQL}`).digest('hex');
        AssertEqual(query.ExtractionStatus, 'OK', `${name}: ExtractionStatus`);
        AssertEqual(query.ExtractionMessage, null, `${name}: ExtractionMessage`);
        AssertEqual(query.ExtractedSQLHash, expectedHash, `${name}: ExtractedSQLHash is the SHA-256 of the dialect key and the SQL`);
        AssertEqual(query.UsesTemplate, usesTemplate, `${name}: UsesTemplate`);
    }
}

// ─── QE11: compositions ─────────────────────────────────────────────────────

async function checkQe11CompositionArguments(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const target = await saveQuery(ctx, 'QE11 target', 'SELECT c.[ID], c.[Name] FROM mjit_extract.[Customer] c WHERE c.[RegionID] = {{ RegionID | sqlNumber }}', { Reusable: true });
    const path = `${FixtureCategoryPath(f.Category)}/${target.Name}`;
    const missing = await NewFixtureQuery(ctx, f.Category.ID, spec('QE11 missing argument', `SELECT x.[ID] FROM {{query:"${path}"}} x`, f.Platform));
    Assert(!await missing.Save(FixtureQuerySaveOptions()), 'QE11: composing a query without its required parameter must be refused');
    const message = missing.LatestResult?.CompleteMessage ?? '';
    Assert(message.includes('MJQ_COMPOSITION_MISSING_ARGUMENT') && message.includes('RegionID'), `QE11: the refusal carries its code and the parameter, got: ${message}`);

    const composer = await saveQuery(ctx, 'QE11 composer', `SELECT x.[ID], x.[Name] FROM {{query:"${path}(RegionID=Region)"}} x`);
    const rows = await ReadQueryRows(ctx, BUNDLE, composer.ID);
    AssertEqual(rows.Dependencies.map(d => `${NormalizeUUID(d.DependsOnQueryID)}|${d.ReferencePath}|${d.Alias ?? ''}|${d.ParameterMapping ?? ''}`).join(','),
        `${NormalizeUUID(target.ID)}|${path}|x|{"RegionID":"@Region"}`, 'QE11: the dependency row names the target by its full path, with the argument mapping');
    AssertEqual(rows.Parameters.map(p => `${p.Name}:${String(p.IsRequired)}`).join(','), 'Region:true', 'QE11: the pass-through argument makes Region a parameter of the composer');
    AssertEqual(rows.Fields.map(x => x.Name).join(','), 'ID,Name', 'QE11: the composer is described through the composed query');
}

export const QueryExtractionChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.QE1`, Name: 'QE1: a query over tables gets exact field rows: order, base and full type, nullability, computed, schema.object source', Fn: checkQe1TableColumns },
    { Id: `${BUNDLE}.QE2`, Name: 'QE2: a query over a view built on a view keeps the inner types and names the view it reads', Fn: checkQe2ViewOverView },
    { Id: `${BUNDLE}.QE3`, Name: 'QE3: a query over a core MJ view binds each column to its entity field', Fn: checkQe3CoreViewBindsEntityFields },
    { Id: `${BUNDLE}.QE4`, Name: 'QE4: Query Entities lists entities read in a CTE, a join and an EXISTS subquery, never a CTE name', Fn: checkQe4EntitiesReadAnywhere },
    { Id: `${BUNDLE}.QE5`, Name: 'QE5: parameters are required only with a use outside every if, typed by filters, described by doc comments', Fn: checkQe5Parameters },
    { Id: `${BUNDLE}.QE6`, Name: 'QE6: the fields are the union of every branch render, with a note naming the branch-only column', Fn: checkQe6BranchUnion },
    { Id: `${BUNDLE}.QE7`, Name: 'QE7: an external-data-source query is not described and gets no field rows', Fn: checkQe7ExternalSourceSkipped },
    { Id: `${BUNDLE}.QE8`, Name: 'QE8: a query whose table is named by a template parameter keeps its declared fields', Fn: checkQe8ParameterNamedSourceKeepsDeclaredFields },
    { Id: `${BUNDLE}.QE9`, Name: 'QE9: a query returning two columns with one name is refused at save and writes nothing', Fn: checkQe9DuplicateOutputRefused },
    { Id: `${BUNDLE}.QE10`, Name: 'QE10: ExtractionStatus, ExtractedSQLHash and UsesTemplate are recorded on the query row', Fn: checkQe10ExtractionColumns },
    { Id: `${BUNDLE}.QE11`, Name: 'QE11: a composition must pass every required parameter of its target; its dependency row names the full path', Fn: checkQe11CompositionArguments },
];

for (const check of QueryExtractionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
