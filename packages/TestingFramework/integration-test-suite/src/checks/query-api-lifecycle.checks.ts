/**
 * query-api-lifecycle.checks.ts — the 'query-api-lifecycle' bundle (QAL1–QAL12), client transport (IT141).
 *
 * Drives a saved query's whole life through MJAPI's GraphQL API, as an API caller does, and reads
 * every row back over GraphQL:
 *  - QAL1: `CreateQueryExtended` creates a query whose SQL has a header doc comment, a trailing
 *    `--:` description, required and optional parameters with different filters, a default, a CTE,
 *    core MJ views and a composition of a Reusable fixture query; the mutation's own Fields,
 *    Parameters, Entities and Permissions agree column by column with the rows stored;
 *  - QAL2: the query row records its SQL, `ExtractionStatus`, `ExtractionMessage`,
 *    `ExtractedSQLHash` and `UsesTemplate`;
 *  - QAL3–QAL5: every column of every stored `MJ: Query Fields`, `MJ: Query Parameters`,
 *    `MJ: Query Entities` and `MJ: Query Dependencies` row, and of the composed query's own rows;
 *  - QAL6: `UpdateQueryExtended` with new SQL (a column dropped, one added, a parameter's filter
 *    changed, a required parameter made optional) corrects the rows: kept rows keep their IDs and
 *    the annotations set by hand, the dropped field is gone, the new one is added;
 *  - QAL7–QAL8: a create, and an update, whose SQL puts a tag inside a string literal is refused
 *    with the diagnostic line format and writes nothing;
 *  - QAL9: the `Query.RefreshExtraction` remote operation, run over the wire for the fixture
 *    category, refreshes the composed query before the query composing it, reports both
 *    `Unchanged`, streams one progress event per query, and writes nothing (every stored column,
 *    timestamps included);
 *  - QAL10: after a stored field's full type and nullability are tampered with over GraphQL, a dry
 *    run reports the field with BOTH columns changed and writes nothing;
 *  - QAL11: the real refresh corrects both columns of that row only, and a refresh after it is
 *    `Unchanged` and leaves `__mj_UpdatedAt` where it was;
 *  - QAL12: a refresh of a query ID that does not exist is reported `Unavailable` with the
 *    non-disclosing message, and a request with no selector is refused.
 *
 * Setup creates the per-run `zzz-it141 <stamp>` category and the composed query (with the generic
 * `CreateMJQuery` mutation); every row lives in that category. Every field and parameter carries
 * a description in the SQL, so no save queues the LLM description pass. Teardown deletes the
 * permissions, the queries (the composing query first, with `DeleteQueryExtended`), then the
 * category. The query text is written in T-SQL bracket style and converted for PostgreSQL. The
 * platform comes from the runner's `DB_PLATFORM` (the setting the runner and MJAPI share),
 * cross-checked in Setup against what the server describes.
 */
import { createHash } from 'node:crypto';
import { RunView } from '@memberjunction/core';
import type { BaseEntity, DatabasePlatform, EntityInfo, RemoteOpProgress } from '@memberjunction/core';
import { QueryRefreshExtractionOperation } from '@memberjunction/core-entities';
import type { MJQueryCategoryEntity, MJQueryEntity, MJQueryFieldEntity, MJQueryParameterEntity, QueryRefreshExtractionOutput, QueryRefreshQueryReport } from '@memberjunction/core-entities';
import { QueryRefreshUnavailableMessage } from '@memberjunction/core-entities-server';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { IndexByUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { CanonicalRows, ForPlatform, RunStamp, SnapshotDifference } from './query-extraction-fixture';

const BUNDLE = 'query-api-lifecycle';
const PREFIX = 'zzz-it141';
const TARGET_NAME = `${PREFIX} Roles`;
const MAIN_NAME = `${PREFIX} User Roles`;
const REFUSED_NAME = `${PREFIX} Refused`;
/** A query ID no row has: the refresh must report it as unavailable. */
const MISSING_QUERY_ID = '4C1A7F3E-2B9D-4E61-9A0C-141141141141';
/** The role the created query is shared with (a `MJ: Query Permissions` row). */
const PERMISSION_ROLE = 'UI';

interface LifecycleFixture {
    Platform: DatabasePlatform;
    Category: MJQueryCategoryEntity;
    TargetID: string;
    MainID: string | null;
    /** Row IDs of the created query's child rows, by `collection:name`, recorded by QAL3/QAL4. */
    CreatedRowIDs: Map<string, string>;
}

let fixture: LifecycleFixture | undefined;

function requireFixture(): LifecycleFixture {
    if (!fixture) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

function requireMainID(): string {
    const id = requireFixture().MainID;
    if (!id) throw new Error(`${BUNDLE}: QAL1 did not create the query the later checks use`);
    return id;
}

function requireWire(ctx: IntegrationCheckContext): GraphQLDataProvider {
    if (!(ctx.Provider instanceof GraphQLDataProvider)) {
        throw new Error(`${BUNDLE} needs the client transport: the context provider is not a GraphQLDataProvider.`);
    }
    return ctx.Provider;
}

function requireEntity(ctx: IntegrationCheckContext, name: string): EntityInfo {
    const entity = ctx.Provider.EntityByName(name);
    if (!entity) throw new Error(`${BUNDLE}: ${name} is not in the metadata`);
    return entity;
}

// ─── Query text ─────────────────────────────────────────────────────────────

/** The Reusable query the created query composes. */
const TARGET_SQL = [
    '{#',
    '  Every role but one.',
    '  @param RoleName A role to leave out.',
    '  @field ID The role\'s ID.',
    '  @field Name The role\'s name.',
    '#}',
    'SELECT r.[ID], r.[Name] FROM __mj.[vwRoles] r WHERE r.[Name] <> {{ RoleName | sqlString }}',
].join('\n');

const HEADER = [
    '{#',
    '  Users with their role counts.',
    '  @param MinRoles Only users with at least this many roles.',
    '  @param NameSearch Part of the user\'s name to match.',
    '  @param Since Only users created on or after this time.',
    '  @param ExcludeType A user type to leave out.',
    '  @param RoleFilter A role to leave out of the role list.',
    '  @field ID The user\'s ID.',
    '  @field UserName The user\'s display name.',
    '  @field IsActive Whether the user may sign in.',
    '  @field RoleCount How many roles the user has.',
    '  @field RoleName A role the user could hold.',
    '#}',
];

const ROLE_COUNTS_CTE = [
    'WITH [RoleCounts] AS (',
    '    SELECT ur.[UserID], COUNT(*) AS [RoleCount] FROM __mj.[vwUserRoles] ur GROUP BY ur.[UserID]',
    ')',
];

function fromClause(targetPath: string): string[] {
    return [
        'FROM __mj.[vwUsers] u',
        'LEFT JOIN [RoleCounts] rc ON rc.[UserID] = u.[ID]',
        `CROSS JOIN {{query:"${targetPath}(RoleName=RoleFilter)"}} ro`,
    ];
}

/** The created query: MinRoles required (number), Since a string, Email described by a trailing comment. */
function createdSQL(targetPath: string): string {
    return [
        ...HEADER, ...ROLE_COUNTS_CTE,
        'SELECT u.[ID],',
        '       u.[Name] AS [UserName],',
        '       u.[Email], --: Where the user gets mail.',
        '       rc.[RoleCount],',
        '       ro.[Name] AS [RoleName]',
        ...fromClause(targetPath),
        'WHERE rc.[RoleCount] >= {{ MinRoles | sqlNumber }}',
        '{% if NameSearch %} AND u.[Name] LIKE {{ NameSearch | sqlLikeContains }}{% endif %}',
        '{% if Since %} AND u.[__mj_CreatedAt] >= {{ Since | sqlString }}{% endif %}',
        "  AND u.[Type] <> {{ ExcludeType | default('None') | sqlString }}",
    ].join('\n');
}

/** The edited query: Email dropped, IsActive added, MinRoles optional, Since a date. */
function editedSQL(targetPath: string): string {
    return [
        ...HEADER, ...ROLE_COUNTS_CTE,
        'SELECT u.[ID],',
        '       u.[Name] AS [UserName],',
        '       u.[IsActive],',
        '       rc.[RoleCount],',
        '       ro.[Name] AS [RoleName]',
        ...fromClause(targetPath),
        'WHERE 1 = 1',
        '{% if MinRoles %} AND rc.[RoleCount] >= {{ MinRoles | sqlNumber }}{% endif %}',
        '{% if NameSearch %} AND u.[Name] LIKE {{ NameSearch | sqlLikeContains }}{% endif %}',
        '{% if Since %} AND u.[__mj_CreatedAt] >= {{ Since | sqlDate }}{% endif %}',
        "  AND u.[Type] <> {{ ExcludeType | default('None') | sqlString }}",
    ].join('\n');
}

/** A tag inside a string literal, on line 2 column 31: refused at save. */
const REFUSED_SQL = "SELECT u.[ID] FROM __mj.[vwUsers] u\nWHERE u.[Name] = 'x{{ Name | sqlString }}'";

function sqlFor(sql: string): string {
    return ForPlatform(sql, requireFixture().Platform);
}

function targetPath(): string {
    return `${requireFixture().Category.Name}/${TARGET_NAME}`;
}

// ─── GraphQL ────────────────────────────────────────────────────────────────

const FIELD_COLUMNS = 'ID QueryID Name Description Sequence SQLBaseType SQLFullType SourceEntityID SourceFieldName IsComputed ComputationDescription ' +
    'IsSummary SummaryDescription DetectionMethod AutoDetectConfidenceScore SourceEntityFieldID IsNullable SourceObjectName';
const PARAMETER_COLUMNS = 'ID QueryID Name Type IsRequired DefaultValue Description SampleValue ValidationFilters DetectionMethod AutoDetectConfidenceScore IsServerSet';
const ENTITY_COLUMNS = 'ID QueryID EntityID DetectionMethod AutoDetectConfidenceScore AlternateBaseViewID';

const MUTATION_RESULT = `Success ErrorMessage
    Query { ID Name SQL Description UsesTemplate ExtractionStatus ExtractionMessage ExtractedSQLHash }
    Fields { ${FIELD_COLUMNS} }
    Parameters { ${PARAMETER_COLUMNS} }
    Entities { ${ENTITY_COLUMNS} }
    Permissions { QueryID RoleID }`;

const CREATE_MUTATION = `mutation CreateQueryExtended($input: CreateQuerySystemUserInput!) { CreateQueryExtended(input: $input) { ${MUTATION_RESULT} } }`;
const UPDATE_MUTATION = `mutation UpdateQueryExtended($input: UpdateQuerySystemUserInput!) { UpdateQueryExtended(input: $input) { ${MUTATION_RESULT} } }`;

type WireRow = Record<string, string | number | boolean | null>;

/** The `QueryMutationResultType` as the client receives it. */
interface QueryMutationResult {
    Success: boolean;
    ErrorMessage: string | null;
    Query: WireRow | null;
    Fields: WireRow[] | null;
    Parameters: WireRow[] | null;
    Entities: WireRow[] | null;
    Permissions: WireRow[] | null;
}

interface CreateInput {
    Name: string;
    CategoryID: string;
    SQL: string;
    Status: 'Approved';
    Permissions?: Array<{ RoleID: string }>;
    ParameterHints?: Array<{ Name: string; Value: string }>;
}

interface UpdateInput {
    ID: string;
    SQL: string;
}

async function createOverWire(ctx: IntegrationCheckContext, input: CreateInput): Promise<QueryMutationResult> {
    const response: { CreateQueryExtended: QueryMutationResult } = await requireWire(ctx).ExecuteGQL(CREATE_MUTATION, { input });
    return response.CreateQueryExtended;
}

async function updateOverWire(ctx: IntegrationCheckContext, input: UpdateInput): Promise<QueryMutationResult> {
    const response: { UpdateQueryExtended: QueryMutationResult } = await requireWire(ctx).ExecuteGQL(UPDATE_MUTATION, { input });
    return response.UpdateQueryExtended;
}

/** Runs `Query.RefreshExtraction` over the wire for one query, failing when the operation itself fails. */
async function refreshOverWire(ctx: IntegrationCheckContext, queryID: string, dryRun: boolean): Promise<QueryRefreshExtractionOutput> {
    const result = await new QueryRefreshExtractionOperation().Execute({ queryIDs: [queryID], dryRun }, { provider: requireWire(ctx) });
    Assert(result.Success && result.Output !== undefined, `Query.RefreshExtraction failed over the wire: ${result.ErrorMessage ?? '(no message)'}`);
    return result.Output!;
}

function onlyReport(output: QueryRefreshExtractionOutput, label: string): QueryRefreshQueryReport {
    AssertEqual(output.reports.length, 1, `${label}: one report for one query`);
    return output.reports[0];
}

function describeReport(report: QueryRefreshQueryReport): string {
    const changes = (list: QueryRefreshQueryReport['added']) => list.map(c => `${c.collection}:${c.name}${c.changedColumns.length ? `(${c.changedColumns.join('+')})` : ''}`).join(',');
    return `${report.outcome}/${report.extractionStatus ?? '-'} +[${changes(report.added)}] ~[${changes(report.updated)}] -[${changes(report.removed)}] ` +
        `cols[${report.queryColumns.join(',')}] flagged[${report.flagged.join(',')}] diag[${report.diagnostics.join(' / ')}]`;
}

// ─── Reading rows over GraphQL ──────────────────────────────────────────────

interface WireQueryRows {
    Fields: MJQueryFieldEntity[];
    Parameters: MJQueryParameterEntity[];
    Entities: BaseEntity[];
    Dependencies: BaseEntity[];
}

/** One query's child rows read over GraphQL (fields by Sequence, parameters by Name), every cache bypassed. */
async function readRows(ctx: IntegrationCheckContext, queryID: string): Promise<WireQueryRows> {
    const filter = `QueryID='${queryID}'`;
    const view = (entityName: string, orderBy?: string) => ({ EntityName: entityName, ExtraFilter: filter, OrderBy: orderBy, ResultType: 'entity_object' as const, BypassCache: true });
    const results = await new RunView(requireWire(ctx)).RunViews([
        view('MJ: Query Fields', 'Sequence'), view('MJ: Query Parameters', 'Name'), view('MJ: Query Entities'), view('MJ: Query Dependencies'),
    ], ctx.User);
    for (const result of results) Assert(result.Success, `${BUNDLE}: reading query ${queryID}'s rows over GraphQL failed: ${result.ErrorMessage}`);
    return {
        Fields: results[0].Results as MJQueryFieldEntity[],
        Parameters: results[1].Results as MJQueryParameterEntity[],
        Entities: results[2].Results as BaseEntity[],
        Dependencies: results[3].Results as BaseEntity[],
    };
}

async function readQuery(ctx: IntegrationCheckContext, queryID: string): Promise<MJQueryEntity> {
    const result = await new RunView(requireWire(ctx)).RunView<MJQueryEntity>({ EntityName: 'MJ: Queries', ExtraFilter: `ID='${queryID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User);
    Assert(result.Success && result.Results.length === 1, `${BUNDLE}: reading query ${queryID} over GraphQL failed: ${result.ErrorMessage ?? `${result.Results.length} rows`}`);
    return result.Results[0];
}

async function countQueriesNamed(ctx: IntegrationCheckContext, name: string): Promise<number> {
    const result = await new RunView(requireWire(ctx)).RunView({
        EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${requireFixture().Category.ID}' AND Name='${name}'`, ResultType: 'count_only', BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `${BUNDLE}: counting queries named ${name} failed: ${result.ErrorMessage}`);
    return result.TotalRowCount;
}

/** Every stored column of the queries and their child rows, timestamps included, as one canonical string. */
async function snapshot(ctx: IntegrationCheckContext, ...queryIDs: string[]): Promise<string> {
    const list = queryIDs.map(id => `'${id}'`).join(',');
    const entities: Array<[string, string]> = [['MJ: Queries', 'ID'], ['MJ: Query Fields', 'QueryID'], ['MJ: Query Parameters', 'QueryID'],
        ['MJ: Query Entities', 'QueryID'], ['MJ: Query Dependencies', 'QueryID']];
    const results = await new RunView(requireWire(ctx)).RunViews(entities.map(([entityName, key]) => ({
        EntityName: entityName, ExtraFilter: `${key} IN (${list})`, OrderBy: 'ID', ResultType: 'simple' as const, BypassCache: true,
    })), ctx.User);
    return results.map((result, index) => {
        Assert(result.Success, `${BUNDLE}: snapshot of ${entities[index][0]} failed: ${result.ErrorMessage}`);
        return CanonicalRows(result.Results as ReadonlyArray<Record<string, unknown>>, entities[index][0]);
    }).filter(part => part.length > 0).join('\n');
}

// ─── Row comparison ─────────────────────────────────────────────────────────

type Expected = Record<string, string | number | boolean | null>;

/** Columns a comparison leaves out: the row's own ID and the timestamps, which the checks compare separately. */
const UNCOMPARED = new Set(['ID', '__mj_CreatedAt', '__mj_UpdatedAt']);

function comparable(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return NormalizeUUID(value);
    return JSON.stringify(value);
}

/** Asserts a stored row has exactly the expected columns (every column but its ID and timestamps) with the expected values. */
function assertRow(row: BaseEntity, expected: Expected, label: string): void {
    const all = row.GetAll();
    const columns = Object.keys(all).filter(k => !UNCOMPARED.has(k)).sort();
    AssertEqual(columns.join(','), Object.keys(expected).sort().join(','), `${label}: the columns compared are every column of the row`);
    const differences = columns.filter(c => comparable(all[c]) !== comparable(expected[c]))
        .map(c => `${c}: expected ${comparable(expected[c])}, got ${comparable(all[c])}`);
    Assert(differences.length === 0, `${label}: ${differences.join('; ')}`);
}

function assertRows(rows: readonly BaseEntity[], expected: readonly Expected[], keyOf: (row: Expected) => string, label: string): void {
    const actualKeys = rows.map(r => keyOf(r.GetAll() as Expected));
    AssertEqual(actualKeys.join(','), expected.map(keyOf).join(','), `${label}: the rows, in order`);
    rows.forEach((row, index) => assertRow(row, expected[index], `${label} ${actualKeys[index]}`));
}

/** Asserts a mutation's returned rows carry the same values as the stored rows, column by column. */
function assertMutationRowsMatch(returned: readonly WireRow[] | null, stored: readonly BaseEntity[], columns: string, label: string): void {
    Assert(returned !== null, `${label}: the mutation returned no rows`);
    AssertEqual(returned!.length, stored.length, `${label}: the mutation returned as many rows as are stored`);
    const returnedByID = IndexByUUID(returned!, r => String(r.ID));
    for (const row of stored) {
        const all = row.GetAll();
        const match = returnedByID.Get(String(all.ID));
        Assert(match !== undefined, `${label}: stored row ${String(all.ID)} is missing from the mutation result`);
        const differences = columns.split(' ').filter(c => comparable(match![c]) !== comparable(all[c]))
            .map(c => `${c}: stored ${comparable(all[c])}, returned ${comparable(match![c])}`);
        Assert(differences.length === 0, `${label} ${String(all.Name ?? all.EntityID)}: the mutation result disagrees with the stored row: ${differences.join('; ')}`);
    }
}

// ─── Expected rows ──────────────────────────────────────────────────────────

/** Type names per platform, as each server's describe reports them. */
interface PlatformTypes {
    Guid: [string, string];
    Text100: [string, string];
    Text50: [string, string];
    Bit: [string, string];
    Count: [string, string];
}

const SQLSERVER_TYPES: PlatformTypes = {
    Guid: ['uniqueidentifier', 'uniqueidentifier'], Text100: ['nvarchar', 'nvarchar(100)'], Text50: ['nvarchar', 'nvarchar(50)'],
    Bit: ['bit', 'bit'], Count: ['int', 'int'],
};

const POSTGRES_TYPES: PlatformTypes = {
    Guid: ['uuid', 'uuid'], Text100: ['character varying', 'character varying(100)'], Text50: ['character varying', 'character varying(50)'],
    Bit: ['boolean', 'boolean'], Count: ['bigint', 'bigint'],
};

function types(): PlatformTypes {
    return requireFixture().Platform === 'postgresql' ? POSTGRES_TYPES : SQLSERVER_TYPES;
}

/** Nullability as the platform's describe reports it: PostgreSQL's statement describe reports none. */
function nullable(value: boolean): boolean | null {
    return requireFixture().Platform === 'postgresql' ? null : value;
}

interface FieldSpec {
    Name: string;
    Type: [string, string];
    Nullable: boolean;
    /** `Entity.Field` the column binds to; `null` for a computed column. */
    Source: [string, string] | null;
    Description: string;
    Annotations?: Partial<Pick<Expected, 'ComputationDescription' | 'IsSummary' | 'SummaryDescription'>>;
}

function fieldRow(ctx: IntegrationCheckContext, queryID: string, queryName: string, spec: FieldSpec, sequence: number): Expected {
    const entity = spec.Source ? requireEntity(ctx, spec.Source[0]) : null;
    const field = entity && spec.Source ? entity.Fields.find(f => f.Name === spec.Source![1]) : undefined;
    if (spec.Source && !field) throw new Error(`${BUNDLE}: ${spec.Source.join('.')} is not in the metadata`);
    return {
        QueryID: queryID, Query: queryName, Name: spec.Name, Sequence: sequence, Description: spec.Description,
        SQLBaseType: spec.Type[0], SQLFullType: spec.Type[1], IsNullable: nullable(spec.Nullable), IsComputed: spec.Source === null,
        SourceEntityID: entity?.ID ?? null, SourceEntity: entity?.Name ?? null, SourceEntityFieldID: field?.ID ?? null,
        SourceEntityField: field?.Name ?? null, SourceFieldName: field?.Name ?? null, SourceObjectName: null,
        ComputationDescription: null, IsSummary: false, SummaryDescription: null, ...spec.Annotations,
        DetectionMethod: 'Database', AutoDetectConfidenceScore: null,
    };
}

interface ParameterSpec {
    Name: string;
    Type: string;
    Required: boolean;
    Default: string | null;
    Sample: string | null;
    Description: string;
}

function parameterRow(queryID: string, queryName: string, spec: ParameterSpec): Expected {
    return {
        QueryID: queryID, Query: queryName, Name: spec.Name, Type: spec.Type, IsRequired: spec.Required, DefaultValue: spec.Default,
        SampleValue: spec.Sample, Description: spec.Description, ValidationFilters: null, IsServerSet: false,
        DetectionMethod: 'Parser', AutoDetectConfidenceScore: null,
    };
}

function entityRow(ctx: IntegrationCheckContext, queryID: string, queryName: string, entityName: string): Expected {
    const entity = requireEntity(ctx, entityName);
    return {
        QueryID: queryID, Query: queryName, EntityID: entity.ID, Entity: entity.Name, AlternateBaseViewID: null, AlternateBaseView: null,
        DetectionMethod: 'Parser', AutoDetectConfidenceScore: 1,
    };
}

const CREATED_FIELDS = (): FieldSpec[] => [
    { Name: 'ID', Type: types().Guid, Nullable: false, Source: ['MJ: Users', 'ID'], Description: 'The user\'s ID.' },
    { Name: 'UserName', Type: types().Text100, Nullable: false, Source: ['MJ: Users', 'Name'], Description: 'The user\'s display name.' },
    { Name: 'Email', Type: types().Text100, Nullable: false, Source: ['MJ: Users', 'Email'], Description: 'Where the user gets mail.' },
    { Name: 'RoleCount', Type: types().Count, Nullable: true, Source: null, Description: 'How many roles the user has.' },
    { Name: 'RoleName', Type: types().Text50, Nullable: false, Source: ['MJ: Roles', 'Name'], Description: 'A role the user could hold.' },
];

const CREATED_PARAMETERS: ParameterSpec[] = [
    { Name: 'ExcludeType', Type: 'string', Required: false, Default: 'None', Sample: null, Description: 'A user type to leave out.' },
    { Name: 'MinRoles', Type: 'number', Required: true, Default: null, Sample: null, Description: 'Only users with at least this many roles.' },
    { Name: 'NameSearch', Type: 'string', Required: false, Default: null, Sample: null, Description: 'Part of the user\'s name to match.' },
    // Passed to the composed query's RoleName: typed from that parameter; its own doc comment wins over the inherited one.
    { Name: 'RoleFilter', Type: 'string', Required: true, Default: null, Sample: null, Description: 'A role to leave out of the role list.' },
    // The sample is the caller's ParameterHints value; extraction invents no sample of its own.
    { Name: 'Since', Type: 'string', Required: false, Default: null, Sample: '2024-01-01', Description: 'Only users created on or after this time.' },
];

/**
 * The entities the query's own SQL reads, the CTE body included. MJ: Roles is read only by the
 * composed query, so it is on that query's rows, not these (its column still binds to MJ: Roles.Name).
 */
const MAIN_ENTITIES = ['MJ: User Roles', 'MJ: Users'];

function sortedEntityRows(rows: readonly BaseEntity[]): BaseEntity[] {
    const name = (row: BaseEntity) => String(row.GetAll().Entity ?? '');
    return [...rows].sort((a, b) => name(a).localeCompare(name(b)));
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

function platformFromRunner(): DatabasePlatform {
    return process.env.DB_PLATFORM?.toLowerCase() === 'postgresql' ? 'postgresql' : 'sqlserver';
}

async function createCategory(ctx: IntegrationCheckContext): Promise<MJQueryCategoryEntity> {
    const category = await requireWire(ctx).GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
    category.NewRecord();
    category.Name = `${PREFIX} ${RunStamp()}`;
    category.UserID = ctx.User.ID;
    if (!await category.Save()) throw new Error(`${BUNDLE} Setup: the category save failed over GraphQL: ${category.LatestResult?.CompleteMessage}`);
    return category;
}

/** A query's ID and name, as Teardown lists them. */
type QueryKey = Pick<MJQueryEntity, 'ID' | 'Name'>;

const CREATE_GENERIC_MUTATION = `mutation CreateMJQuery($input: CreateMJQueryInput!) { CreateMJQuery(input: $input) { ID } }`;
const DELETE_MUTATION = `mutation DeleteQueryExtended($ID: String!) { DeleteQueryExtended(ID: $ID) { Success ErrorMessage } }`;

/**
 * The composed query, created with the generic GraphQL create a client's entity save sends, and
 * marked Reusable. Sent as raw GraphQL, not through an entity object: in this process `MJ: Queries`
 * resolves to the server subclass, whose save would run extraction a second time, client side.
 */
async function createTarget(ctx: IntegrationCheckContext, f: LifecycleFixture): Promise<string> {
    const input = { Name: TARGET_NAME, CategoryID: f.Category.ID, SQL: ForPlatform(TARGET_SQL, f.Platform), Status: 'Approved', Reusable: true };
    const response: { CreateMJQuery: { ID: string } | null } = await requireWire(ctx).ExecuteGQL(CREATE_GENERIC_MUTATION, { input });
    if (!response.CreateMJQuery?.ID) throw new Error(`${BUNDLE} Setup: the composed query's GraphQL create returned no record`);
    return response.CreateMJQuery.ID;
}

/** Deletes a query with `DeleteQueryExtended` (raw GraphQL, for the reason {@link createTarget} gives). Never throws. */
async function deleteQueryOverWire(ctx: IntegrationCheckContext, query: QueryKey): Promise<void> {
    try {
        const response: { DeleteQueryExtended: { Success: boolean; ErrorMessage: string | null } } = await requireWire(ctx).ExecuteGQL(DELETE_MUTATION, { ID: query.ID });
        if (!response.DeleteQueryExtended.Success) console.error(`${BUNDLE} teardown warning: query '${query.Name}' delete failed: ${response.DeleteQueryExtended.ErrorMessage}`);
    } catch (e) {
        console.error(`${BUNDLE} teardown warning: query '${query.Name}' delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** The server's describe of the composed query's ID column names the platform; it must agree with the runner's. */
async function assertPlatformAgrees(ctx: IntegrationCheckContext, f: LifecycleFixture): Promise<void> {
    const rows = await readRows(ctx, f.TargetID);
    const id = rows.Fields.find(r => r.Name === 'ID');
    const described: DatabasePlatform = id?.SQLBaseType === 'uuid' ? 'postgresql' : 'sqlserver';
    AssertEqual(described, f.Platform, `${BUNDLE} Setup: the runner's DB_PLATFORM must name the platform MJAPI runs on (the composed query's ID is ${id?.SQLBaseType ?? 'missing'})`);
}

async function deleteRows(rows: readonly BaseEntity[], label: string): Promise<void> {
    for (const row of rows) {
        if (!await row.Delete()) console.error(`${BUNDLE} teardown warning: ${label} delete failed: ${row.LatestResult?.CompleteMessage}`);
    }
}

async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    const f = fixture;
    if (!f) return;
    try {
        const rv = new RunView(requireWire(ctx));
        const queries = await rv.RunView<QueryKey>({ EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${f.Category.ID}'`, Fields: ['ID', 'Name'], OrderBy: '__mj_CreatedAt DESC', ResultType: 'simple', BypassCache: true }, ctx.User);
        const ids = (queries.Results ?? []).map(q => `'${q.ID}'`).join(',');
        if (ids.length > 0) {
            const permissions = await rv.RunView<BaseEntity>({ EntityName: 'MJ: Query Permissions', ExtraFilter: `QueryID IN (${ids})`, ResultType: 'entity_object', BypassCache: true }, ctx.User);
            await deleteRows(permissions.Results ?? [], 'query permission');
        }
        for (const query of queries.Results ?? []) await deleteQueryOverWire(ctx, query);
        await deleteRows([f.Category], 'category');
    } catch (e) {
        console.error(`${BUNDLE} teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        fixture = undefined;
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        requireWire(ctx);
        const category = await createCategory(ctx);
        fixture = { Platform: platformFromRunner(), Category: category, TargetID: '', MainID: null, CreatedRowIDs: new Map() };
        fixture.TargetID = await createTarget(ctx, fixture);
        await assertPlatformAgrees(ctx, fixture);
    },
    Teardown: teardown,
});

// ─── QAL1–QAL5: create ──────────────────────────────────────────────────────

async function checkQal1CreateOverGraphQL(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const role = ctx.Provider.Roles.find(r => r.Name === PERMISSION_ROLE);
    Assert(role !== undefined, `QAL1: the ${PERMISSION_ROLE} role is missing`);
    const result = await createOverWire(ctx, {
        Name: MAIN_NAME, CategoryID: f.Category.ID, SQL: sqlFor(createdSQL(targetPath())), Status: 'Approved',
        Permissions: [{ RoleID: role!.ID }], ParameterHints: [{ Name: 'Since', Value: '2024-01-01' }],
    });
    Assert(result.Success && result.Query !== null, `QAL1: CreateQueryExtended failed: ${result.ErrorMessage ?? '(no message)'}`);
    f.MainID = String(result.Query!.ID);
    const rows = await readRows(ctx, f.MainID);
    assertMutationRowsMatch(result.Fields, rows.Fields, FIELD_COLUMNS, 'QAL1 Fields');
    assertMutationRowsMatch(result.Parameters, rows.Parameters, PARAMETER_COLUMNS, 'QAL1 Parameters');
    assertMutationRowsMatch(result.Entities, rows.Entities, ENTITY_COLUMNS, 'QAL1 Entities');
    AssertEqual((result.Permissions ?? []).map(p => `${NormalizeUUID(String(p.QueryID))}:${NormalizeUUID(String(p.RoleID))}`).join(','),
        `${NormalizeUUID(f.MainID)}:${NormalizeUUID(role!.ID)}`, 'QAL1: the mutation returns the one permission row it created');
}

async function checkQal2QueryRow(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const query = await readQuery(ctx, requireMainID());
    AssertEqual(query.SQL, sqlFor(createdSQL(targetPath())), 'QAL2: the SQL is stored as sent');
    AssertEqual(query.ExtractionStatus, 'OK', `QAL2: ExtractionStatus (message: ${query.ExtractionMessage ?? ''})`);
    AssertEqual(query.ExtractionMessage, null, 'QAL2: ExtractionMessage');
    AssertEqual(query.ExtractedSQLHash, createHash('sha256').update(`${f.Platform}\n${query.SQL}`).digest('hex'),
        'QAL2: ExtractedSQLHash is the SHA-256 of the dialect key and the SQL');
    AssertEqual(query.UsesTemplate, true, 'QAL2: UsesTemplate');
    AssertEqual(query.Status, 'Approved', 'QAL2: Status');
}

function recordIDs(rows: readonly BaseEntity[], collection: string): void {
    const ids = requireFixture().CreatedRowIDs;
    for (const row of rows) ids.set(`${collection}:${String(row.GetAll().Name)}`, String(row.GetAll().ID));
}

async function checkQal3Fields(ctx: IntegrationCheckContext): Promise<void> {
    const id = requireMainID();
    const rows = await readRows(ctx, id);
    const expected = CREATED_FIELDS().map((spec, index) => fieldRow(ctx, id, MAIN_NAME, spec, index + 1));
    assertRows(rows.Fields, expected, r => String(r.Name), 'QAL3 field');
    recordIDs(rows.Fields, 'Fields');
}

async function checkQal4Parameters(ctx: IntegrationCheckContext): Promise<void> {
    const id = requireMainID();
    const rows = await readRows(ctx, id);
    assertRows(rows.Parameters, CREATED_PARAMETERS.map(spec => parameterRow(id, MAIN_NAME, spec)), r => String(r.Name), 'QAL4 parameter');
    recordIDs(rows.Parameters, 'Parameters');
}

/** The composed query's own rows, created by the generic GraphQL create: it reads MJ: Roles. */
async function assertTargetRows(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const rows = await readRows(ctx, f.TargetID);
    const fields: FieldSpec[] = [
        { Name: 'ID', Type: types().Guid, Nullable: false, Source: ['MJ: Roles', 'ID'], Description: 'The role\'s ID.' },
        { Name: 'Name', Type: types().Text50, Nullable: false, Source: ['MJ: Roles', 'Name'], Description: 'The role\'s name.' },
    ];
    assertRows(rows.Fields, fields.map((spec, index) => fieldRow(ctx, f.TargetID, TARGET_NAME, spec, index + 1)), r => String(r.Name), 'QAL5 composed-query field');
    assertRows(rows.Parameters, [parameterRow(f.TargetID, TARGET_NAME, { Name: 'RoleName', Type: 'string', Required: true, Default: null, Sample: null, Description: 'A role to leave out.' })],
        r => String(r.Name), 'QAL5 composed-query parameter');
    assertRows(rows.Entities, [entityRow(ctx, f.TargetID, TARGET_NAME, 'MJ: Roles')], r => String(r.Entity), 'QAL5 composed-query entity');
    AssertEqual(rows.Dependencies.length, 0, 'QAL5: the composed query composes nothing');
}

async function checkQal5EntitiesAndDependencies(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const id = requireMainID();
    await assertTargetRows(ctx);
    const rows = await readRows(ctx, id);
    assertRows(sortedEntityRows(rows.Entities), MAIN_ENTITIES.map(name => entityRow(ctx, id, MAIN_NAME, name)), r => String(r.Entity), 'QAL5 entity');
    assertRows(rows.Dependencies, [{
        QueryID: id, Query: MAIN_NAME, DependsOnQueryID: f.TargetID, DependsOnQuery: TARGET_NAME, ReferencePath: targetPath(),
        Alias: 'ro', ParameterMapping: '{"RoleName":"@RoleFilter"}', DetectionMethod: 'Auto',
    }], r => String(r.ReferencePath), 'QAL5 dependency');
}

// ─── QAL6: edit ─────────────────────────────────────────────────────────────

/** Annotations set by hand over GraphQL before the edit; the edit must keep them. */
async function annotateOverWire(ctx: IntegrationCheckContext, id: string): Promise<void> {
    const rows = await readRows(ctx, id);
    const roleCount = rows.Fields.find(r => r.Name === 'RoleCount');
    const nameSearch = rows.Parameters.find(r => r.Name === 'NameSearch');
    Assert(roleCount !== undefined && nameSearch !== undefined, 'QAL6: the RoleCount field or the NameSearch parameter is missing before the edit');
    roleCount!.ComputationDescription = 'COUNT(*) of the user\'s role rows.';
    roleCount!.IsSummary = true;
    roleCount!.SummaryDescription = 'Roles per user.';
    nameSearch!.SampleValue = 'adm';
    Assert(await roleCount!.Save(), `QAL6: annotating RoleCount over GraphQL failed: ${roleCount!.LatestResult?.CompleteMessage}`);
    Assert(await nameSearch!.Save(), `QAL6: annotating NameSearch over GraphQL failed: ${nameSearch!.LatestResult?.CompleteMessage}`);
}

const EDITED_FIELDS = (): FieldSpec[] => [
    CREATED_FIELDS()[0], CREATED_FIELDS()[1],
    { Name: 'IsActive', Type: types().Bit, Nullable: false, Source: ['MJ: Users', 'IsActive'], Description: 'Whether the user may sign in.' },
    { ...CREATED_FIELDS()[3], Annotations: { ComputationDescription: 'COUNT(*) of the user\'s role rows.', IsSummary: true, SummaryDescription: 'Roles per user.' } },
    CREATED_FIELDS()[4],
];

const EDITED_PARAMETERS: ParameterSpec[] = [
    CREATED_PARAMETERS[0],
    { ...CREATED_PARAMETERS[1], Required: false },
    { ...CREATED_PARAMETERS[2], Sample: 'adm' },
    CREATED_PARAMETERS[3],
    { ...CREATED_PARAMETERS[4], Type: 'date' },
];

/** Kept rows keep the IDs they had at create; the added field has a new ID; the dropped one is gone. */
function assertIDsKept(rows: WireQueryRows): void {
    const created = requireFixture().CreatedRowIDs;
    Assert(created.size > 0, 'QAL6: QAL3/QAL4 recorded no row IDs');
    const notes: string[] = [];
    for (const [collection, list] of [['Fields', rows.Fields], ['Parameters', rows.Parameters]] as const) {
        for (const row of list) {
            const before = created.get(`${collection}:${row.Name}`);
            if (row.Name === 'IsActive') { if (before !== undefined) notes.push('IsActive was not new'); continue; }
            if (!before || !UUIDsEqual(before, row.ID)) notes.push(`${collection}:${row.Name} has ID ${row.ID}, not ${before ?? '(none)'}`);
        }
    }
    Assert(notes.length === 0, `QAL6: kept rows keep their IDs: ${notes.join('; ')}`);
}

async function checkQal6UpdateOverGraphQL(ctx: IntegrationCheckContext): Promise<void> {
    const id = requireMainID();
    await annotateOverWire(ctx, id);
    const result = await updateOverWire(ctx, { ID: id, SQL: sqlFor(editedSQL(targetPath())) });
    Assert(result.Success, `QAL6: UpdateQueryExtended failed: ${result.ErrorMessage ?? '(no message)'}`);
    const rows = await readRows(ctx, id);
    assertRows(rows.Fields, EDITED_FIELDS().map((spec, index) => fieldRow(ctx, id, MAIN_NAME, spec, index + 1)), r => String(r.Name), 'QAL6 field');
    assertRows(rows.Parameters, EDITED_PARAMETERS.map(spec => parameterRow(id, MAIN_NAME, spec)), r => String(r.Name), 'QAL6 parameter');
    assertIDsKept(rows);
    assertMutationRowsMatch(result.Fields, rows.Fields, FIELD_COLUMNS, 'QAL6 Fields');
    assertMutationRowsMatch(result.Parameters, rows.Parameters, PARAMETER_COLUMNS, 'QAL6 Parameters');
    const query = await readQuery(ctx, id);
    AssertEqual(`${query.ExtractionStatus}|${query.ExtractionMessage ?? ''}`, 'OK|', 'QAL6: the edited query extracts cleanly');
    AssertEqual(query.ExtractedSQLHash, createHash('sha256').update(`${requireFixture().Platform}\n${query.SQL}`).digest('hex'), 'QAL6: ExtractedSQLHash follows the new SQL');
}

// ─── QAL7–QAL8: refusals ────────────────────────────────────────────────────

/** The refused save's diagnostic: `CODE at line L, column C: Message Fix: Hint`. */
const TAG_IN_STRING = /^MJQ_TAG_IN_STRING_LITERAL at line 2, column \d+: .+ Fix: .+$/m;

function assertTagInStringRefusal(message: string | null, label: string): void {
    const text = message ?? '';
    Assert(TAG_IN_STRING.test(text), `${label}: the refusal carries the diagnostic line (CODE at line L, column C: Message Fix: Hint), got: ${text || '(none)'}`);
}

async function checkQal7CreateRefused(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const result = await createOverWire(ctx, { Name: REFUSED_NAME, CategoryID: f.Category.ID, SQL: sqlFor(REFUSED_SQL), Status: 'Approved' });
    Assert(!result.Success, 'QAL7: a create whose SQL puts a tag inside a string literal must be refused');
    AssertEqual(result.Query, null, 'QAL7: a refused create returns no query');
    assertTagInStringRefusal(result.ErrorMessage, 'QAL7');
    AssertEqual(await countQueriesNamed(ctx, REFUSED_NAME), 0, 'QAL7: nothing was written');
}

async function checkQal8UpdateRefused(ctx: IntegrationCheckContext): Promise<void> {
    const id = requireMainID();
    const before = await snapshot(ctx, id);
    const result = await updateOverWire(ctx, { ID: id, SQL: sqlFor(REFUSED_SQL) });
    Assert(!result.Success, 'QAL8: an update whose SQL puts a tag inside a string literal must be refused');
    assertTagInStringRefusal(result.ErrorMessage, 'QAL8');
    const after = await snapshot(ctx, id);
    Assert(before === after, `QAL8: a refused update writes nothing: ${SnapshotDifference(before, after)}`);
}

// ─── QAL9–QAL12: refresh ────────────────────────────────────────────────────

const UNCHANGED_REPORT = 'Unchanged/OK +[] ~[] -[] cols[] flagged[] diag[]';

/** Refreshes the fixture category over the wire: both queries, the composed one first, with one progress event per query. */
async function checkQal9UnchangedRefresh(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const id = requireMainID();
    const before = await snapshot(ctx, f.TargetID, id);
    const events: RemoteOpProgress[] = [];
    const result = await new QueryRefreshExtractionOperation().Execute({ categoryPath: f.Category.Name }, { provider: requireWire(ctx), onProgress: p => events.push(p) });
    Assert(result.Success && result.Output !== undefined, `QAL9: Query.RefreshExtraction failed over the wire: ${result.ErrorMessage ?? '(no message)'}`);
    const reports = result.Output!.reports;
    AssertEqual(reports.map(r => `${r.queryName}=${describeReport(r)}`).join(' | '), `${TARGET_NAME}=${UNCHANGED_REPORT} | ${MAIN_NAME}=${UNCHANGED_REPORT}`,
        'QAL9: both queries are Unchanged, the composed query refreshed before the query composing it');
    AssertEqual(reports.map(r => NormalizeUUID(r.queryID)).join(','), [f.TargetID, id].map(NormalizeUUID).join(','), 'QAL9: the reports name the queries by ID');
    AssertEqual(result.Output!.summary, '2 queries: 0 refreshed, 2 unchanged, 0 failed.', 'QAL9: the summary');
    const after = await snapshot(ctx, f.TargetID, id);
    Assert(before === after, `QAL9: an unchanged refresh writes nothing: ${SnapshotDifference(before, after)}`);
    const progress = events.filter(e => e.OperationKey === 'Query.RefreshExtraction').map(e => `${e.Processed}/${e.Total}`);
    AssertEqual(progress.join(','), '1/2,2/2', `QAL9: one progress event per query arrives over the wire (got ${events.length} events)`);
}

/** Tampers with the stored UserName field over GraphQL: a wrong full type, and the nullability the describe does not report. */
async function tamperUserName(ctx: IntegrationCheckContext, id: string): Promise<void> {
    const field = (await readRows(ctx, id)).Fields.find(r => r.Name === 'UserName');
    Assert(field !== undefined, 'QAL10: the UserName field is missing');
    field!.SQLFullType = `${types().Text100[0]}(999)`;
    // SQL Server stores false here and PostgreSQL null. Only true differs from both for an entity's
    // dirty check (it reads null and false of a bit column as equal), so only true reaches the row.
    field!.IsNullable = true;
    Assert(await field!.Save(), `QAL10: tampering with UserName over GraphQL failed: ${field!.LatestResult?.CompleteMessage}`);
}

const TAMPERED_REPORT = 'Refreshed/OK +[] ~[Fields:UserName(SQLFullType+IsNullable)] -[] cols[] flagged[] diag[]';

async function checkQal10DryRunAfterTamper(ctx: IntegrationCheckContext): Promise<void> {
    const id = requireMainID();
    await tamperUserName(ctx, id);
    const before = await snapshot(ctx, id);
    const output = await refreshOverWire(ctx, id, true);
    AssertEqual(output.dryRun, true, 'QAL10: the output says it was a dry run');
    AssertEqual(describeReport(onlyReport(output, 'QAL10')), TAMPERED_REPORT,
        'QAL10: the dry run reports the tampered field with both its full type and its nullability changed');
    Assert(output.summary.includes('dry run'), `QAL10: the summary says nothing was written, got: ${output.summary}`);
    const after = await snapshot(ctx, id);
    Assert(before === after, `QAL10: a dry run writes nothing: ${SnapshotDifference(before, after)}`);
}

async function userNameRow(ctx: IntegrationCheckContext, id: string): Promise<MJQueryFieldEntity> {
    const field = (await readRows(ctx, id)).Fields.find(r => r.Name === 'UserName');
    Assert(field !== undefined, 'the UserName field is missing');
    return field!;
}

async function checkQal11RealRefresh(ctx: IntegrationCheckContext): Promise<void> {
    const id = requireMainID();
    const before = await snapshot(ctx, id);
    const output = await refreshOverWire(ctx, id, false);
    AssertEqual(output.dryRun, false, 'QAL11: the output says it was not a dry run');
    AssertEqual(describeReport(onlyReport(output, 'QAL11')), TAMPERED_REPORT, 'QAL11: the refresh reports what it corrected');
    const field = await userNameRow(ctx, id);
    assertRow(field, fieldRow(ctx, id, MAIN_NAME, EDITED_FIELDS()[1], 2), 'QAL11 field UserName');
    const changedRows = SnapshotDifference(before, await snapshot(ctx, id)).split(' ; ').filter(n => n.length > 0);
    AssertEqual(changedRows.length, 1, `QAL11: only the tampered row is written (${changedRows.join(' ; ')})`);
    Assert(changedRows[0].includes(`MJ: Query Fields#${field.ID}`), `QAL11: the written row is UserName's, got: ${changedRows[0]}`);

    const updatedAt = field.__mj_UpdatedAt.toISOString();
    const settled = await snapshot(ctx, id);
    AssertEqual(describeReport(onlyReport(await refreshOverWire(ctx, id, false), 'QAL11 again')), UNCHANGED_REPORT,
        'QAL11: a refresh after the correction is Unchanged');
    AssertEqual((await userNameRow(ctx, id)).__mj_UpdatedAt.toISOString(), updatedAt, 'QAL11: the unchanged refresh leaves __mj_UpdatedAt where it was');
    const final = await snapshot(ctx, id);
    Assert(settled === final, `QAL11: the unchanged refresh writes nothing: ${SnapshotDifference(settled, final)}`);
}

async function checkQal12Unavailable(ctx: IntegrationCheckContext): Promise<void> {
    const report = onlyReport(await refreshOverWire(ctx, MISSING_QUERY_ID, false), 'QAL12');
    AssertEqual(`${report.outcome}|${report.queryID}|${report.queryName}|${report.extractionStatus ?? '-'}`, `Unavailable|${MISSING_QUERY_ID}||-`,
        'QAL12: a query ID that does not exist is Unavailable, named by the ID given');
    AssertEqual(report.diagnostics.join(' / '), QueryRefreshUnavailableMessage(MISSING_QUERY_ID), 'QAL12: the not-found message, the same one an unauthorized caller gets');
    const empty = await new QueryRefreshExtractionOperation().Execute({ dryRun: true }, { provider: requireWire(ctx) });
    Assert(!empty.Success, 'QAL12: a refresh with no selector must be refused');
    Assert((empty.ErrorMessage ?? '').includes('Give at least one selector'), `QAL12: the refusal says what is missing, got: ${empty.ErrorMessage ?? '(none)'}`);
}

export const QueryApiLifecycleChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.QAL1`, Name: 'QAL1: CreateQueryExtended creates the query; its returned rows agree column by column with the stored rows', Fn: checkQal1CreateOverGraphQL },
    { Id: `${BUNDLE}.QAL2`, Name: 'QAL2: the created query row records its extraction status, message, SQL hash and UsesTemplate', Fn: checkQal2QueryRow },
    { Id: `${BUNDLE}.QAL3`, Name: 'QAL3: every column of every field row: types, nullability, entity-field source, doc-comment descriptions', Fn: checkQal3Fields },
    { Id: `${BUNDLE}.QAL4`, Name: 'QAL4: every column of every parameter row: type from its filter, required, default, sample, description', Fn: checkQal4Parameters },
    { Id: `${BUNDLE}.QAL5`, Name: 'QAL5: every column of the Query Entities and Query Dependencies rows, and of the composed query\'s own rows', Fn: checkQal5EntitiesAndDependencies },
    { Id: `${BUNDLE}.QAL6`, Name: 'QAL6: UpdateQueryExtended with new SQL corrects the rows, keeping row IDs and hand-set annotations', Fn: checkQal6UpdateOverGraphQL },
    { Id: `${BUNDLE}.QAL7`, Name: 'QAL7: a create with a tag inside a string literal is refused with the diagnostic line and writes nothing', Fn: checkQal7CreateRefused },
    { Id: `${BUNDLE}.QAL8`, Name: 'QAL8: an update with a tag inside a string literal is refused and writes nothing', Fn: checkQal8UpdateRefused },
    { Id: `${BUNDLE}.QAL9`, Name: 'QAL9: Query.RefreshExtraction of a category over the wire: dependency order, Unchanged, per-query progress, nothing written', Fn: checkQal9UnchangedRefresh },
    { Id: `${BUNDLE}.QAL10`, Name: 'QAL10: after a field\'s type and nullability are tampered with, a dry run reports both columns and writes nothing', Fn: checkQal10DryRunAfterTamper },
    { Id: `${BUNDLE}.QAL11`, Name: 'QAL11: the refresh corrects only the tampered row; a refresh after it is Unchanged and moves no timestamp', Fn: checkQal11RealRefresh },
    { Id: `${BUNDLE}.QAL12`, Name: 'QAL12: a missing query ID is reported Unavailable with the non-disclosing message; no selector is refused', Fn: checkQal12Unavailable },
];

for (const check of QueryApiLifecycleChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
