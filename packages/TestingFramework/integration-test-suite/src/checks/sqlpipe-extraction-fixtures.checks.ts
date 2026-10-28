/**
 * sqlpipe-extraction-fixtures.checks.ts — the 'sqlpipe-extraction-fixtures' bundle (IT144),
 * deterministic tier: a fixed set of fixture queries, each with hand-written expected metadata on
 * SQL Server and PostgreSQL, saved with extraction on and compared exactly.
 *
 * Every fixture states the parameter rows (name, type, required, default, description), the field
 * rows (name in order, full type per platform, nullability on SQL Server, computed or not, and the
 * source: a mock-schema object, an MJ entity field, or none), the Query Entities rows, and the
 * Query Dependencies rows. PostgreSQL's describe reports no nullability, so every field's
 * `IsNullable` is null there. Fixtures read the matrix's mock schema (`mjit_sqlpipe`, created and
 * dropped by the bundle) and core MJ views. Each fixture is one check (`EF01`…), so a failure names
 * the query; a SQL-Server-only construct is skipped on PostgreSQL with the reason.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import type { MJQueryEntityServer } from '@memberjunction/core-entities-server';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    CreateFixtureCategory, CreateFixtureQuery, DeleteFixtureCategory, FixtureCategoryPath, PlatformOf, ReadQueryRows, RunFixtureSQL,
    RunFixtureSQLQuietly, RunStamp,
} from './query-extraction-fixture';
import type { StoredQueryRows } from './query-extraction-fixture';
import { BracketsToDoubleQuotes, CreateMockSchemaStatements, DropMockSchemaStatements } from './sqlpipe-schema';
import { FIXTURES } from './sqlpipe-extraction-fixture-set';
import type { ExpectedField, ExtractionFixture } from './sqlpipe-extraction-fixture-set';

const BUNDLE = 'sqlpipe-extraction-fixtures';
const PREFIX = 'zzz-it144';

interface FixtureState {
    Platform: DatabasePlatform;
    Category: MJQueryCategoryEntity;
    CategoryPath: string;
    Targets: Map<string, MJQueryEntityServer>;
}

let state: FixtureState | undefined;

function requireState(): FixtureState {
    if (!state) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return state;
}

/** The reusable queries the composition fixtures compose, by short name. */
const TARGETS: ReadonlyArray<[string, string]> = [
    ['Accounts Above', '{#\n @param Lo The lowest score kept.\n#}\nSELECT a.[ID], a.[Name], a.[Score] FROM mjit_sqlpipe.[Account] a WHERE a.[Score] >= {{ Lo | sqlNumber }}'],
    ['Users By Email', 'SELECT u.[ID], u.[Name], u.[Email] FROM __mj.[vwUsers] u WHERE u.[Email] <> {{ Email | sqlString }}'],
];

async function createTargets(ctx: IntegrationCheckContext, s: FixtureState): Promise<void> {
    for (const [name, sql] of TARGETS) {
        const text = s.Platform === 'postgresql' ? BracketsToDoubleQuotes(sql) : sql;
        s.Targets.set(name, await CreateFixtureQuery(ctx, s.Category.ID, { Name: `${PREFIX} ${name}`, SQL: text, Reusable: true }));
    }
    await QueryEngine.Instance.Config(true, ctx.User, ctx.Provider);
    s.CategoryPath = FixtureCategoryPath(s.Category);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const platform = PlatformOf(ctx, BUNDLE);
        await RunFixtureSQL(ctx, BUNDLE, [...DropMockSchemaStatements(platform), ...CreateMockSchemaStatements(platform)]);
        const category = await CreateFixtureCategory(ctx, `${PREFIX} ${RunStamp()}`);
        state = { Platform: platform, Category: category, CategoryPath: category.Name, Targets: new Map() };
        await createTargets(ctx, state);
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await DeleteFixtureCategory(ctx, BUNDLE, state?.Category);
        await RunFixtureSQLQuietly(ctx, BUNDLE, DropMockSchemaStatements(PlatformOf(ctx, BUNDLE)));
        state = undefined;
    },
});

// ─── Comparison ────────────────────────────────────────────────────────────

function sqlFor(fixture: ExtractionFixture, s: FixtureState): string {
    const raw = typeof fixture.SQL === 'string' ? fixture.SQL : (s.Platform === 'postgresql' ? fixture.SQL.PostgreSQL : fixture.SQL.SqlServer);
    const withPath = raw.replace(/\{PATH\}/g, s.CategoryPath).replace(/\{PREFIX\}/g, PREFIX);
    return s.Platform === 'postgresql' ? BracketsToDoubleQuotes(withPath) : withPath;
}

function baseType(full: string): string {
    return full.replace(/\(.*\)$/, '');
}

/** One expected field as a comparable line, for the platform. */
function expectedFieldLine(ctx: IntegrationCheckContext, f: ExpectedField, platform: DatabasePlatform): string {
    const full = platform === 'postgresql' ? f.PG : f.SS;
    const nullable = platform === 'postgresql' ? null : f.Nullable;
    const source = platform === 'postgresql' && f.PgSource ? f.PgSource : f.Source;
    let src = 'none';
    if (source.startsWith('o:')) src = `object ${source.slice(2)}.${f.SourceColumn ?? f.Name}`;
    if (source.startsWith('e:')) {
        const [entityName, fieldName] = source.slice(2).split('.');
        const entity = ctx.Provider.EntityByName(entityName);
        const field = entity?.Fields.find(x => x.Name === fieldName);
        src = `entity ${NormalizeUUID(entity?.ID ?? 'missing')}/${NormalizeUUID(field?.ID ?? 'missing')}/${fieldName}`;
    }
    return `${f.Name}|${baseType(full)}|${full}|${String(nullable)}|computed=${source === 'c'}|${src}`;
}

function storedFieldLine(row: StoredQueryRows['Fields'][number], source: string): string {
    let src = 'none';
    if (row.SourceEntityFieldID) src = `entity ${NormalizeUUID(row.SourceEntityID ?? '')}/${NormalizeUUID(row.SourceEntityFieldID)}/${row.SourceFieldName}`;
    else if (row.SourceObjectName) src = `object ${row.SourceObjectName}.${row.SourceFieldName}`;
    if (source === '?') src = '?';
    return `${row.Name}|${row.SQLBaseType}|${row.SQLFullType}|${String(row.IsNullable)}|computed=${row.IsComputed}|${src}`;
}

function assertFields(ctx: IntegrationCheckContext, fixture: ExtractionFixture, rows: StoredQueryRows, platform: DatabasePlatform): void {
    const sourceOf = (x: ExpectedField | undefined) => (platform === 'postgresql' && x?.PgSource ? x.PgSource : x?.Source ?? '');
    const expected = fixture.Fields.map(f => {
        const line = expectedFieldLine(ctx, f, platform);
        return sourceOf(f) === '?' ? line.replace(/\|[^|]*$/, '|?') : line;
    });
    const actual = rows.Fields.map((r, i) => storedFieldLine(r, sourceOf(fixture.Fields[i])));
    AssertEqual(actual.join('\n'), expected.join('\n'), `${fixture.Id}: field rows (name|base|full|nullable|computed|source)`);
    AssertEqual(rows.Fields.map(r => r.Sequence).join(','), rows.Fields.map((_r, i) => i + 1).join(','), `${fixture.Id}: field sequence`);
    for (const f of fixture.Fields.filter(x => x.Description !== undefined)) {
        AssertEqual(rows.Fields.find(r => r.Name === f.Name)?.Description ?? null, f.Description ?? null, `${fixture.Id}: ${f.Name}.Description`);
    }
}

function assertParameters(fixture: ExtractionFixture, rows: StoredQueryRows): void {
    const line = (p: { Name: string; Type: string; IsRequired: boolean | null; DefaultValue: string | null; Description: string | null }) =>
        `${p.Name}:${p.Type}:${p.IsRequired}:${p.DefaultValue ?? ''}:${p.Description ?? ''}`;
    const expected = fixture.Parameters.map(p => line({ ...p, DefaultValue: p.DefaultValue ?? null, Description: p.Description?.replace(/\{PREFIX\}/g, PREFIX) ?? null })).sort();
    const actual = rows.Parameters.map(p => line({ Name: p.Name, Type: p.Type, IsRequired: p.IsRequired, DefaultValue: p.DefaultValue, Description: p.Description })).sort();
    AssertEqual(actual.join(' | '), expected.join(' | '), `${fixture.Id}: parameter rows (name:type:required:default:description)`);
}

function assertEntities(ctx: IntegrationCheckContext, fixture: ExtractionFixture, rows: StoredQueryRows): void {
    const names = new Map(ctx.Provider.Entities.map(e => [NormalizeUUID(e.ID), e.Name]));
    const actual = rows.Entities.map(e => names.get(NormalizeUUID(e.EntityID)) ?? e.EntityID).sort();
    AssertEqual(actual.join(','), [...fixture.Entities].sort().join(','), `${fixture.Id}: Query Entities`);
}

function assertDependencies(fixture: ExtractionFixture, rows: StoredQueryRows, s: FixtureState): void {
    const expected = (fixture.Dependencies ?? []).map(d => {
        const target = s.Targets.get(d.Target);
        return `${NormalizeUUID(target?.ID ?? 'missing')}|${s.CategoryPath}/${PREFIX} ${d.Target}|${d.Alias}|${d.Mapping ?? ''}`;
    });
    const actual = rows.Dependencies.map(d => `${NormalizeUUID(d.DependsOnQueryID)}|${d.ReferencePath}|${d.Alias ?? ''}|${d.ParameterMapping ?? ''}`);
    AssertEqual(actual.sort().join(' ; '), expected.sort().join(' ; '), `${fixture.Id}: Query Dependencies`);
}

async function runFixture(ctx: IntegrationCheckContext, fixture: ExtractionFixture): Promise<void> {
    const s = requireState();
    if (fixture.Platforms && !fixture.Platforms.includes(s.Platform)) SkipCheck(fixture.SkipReason ?? `${fixture.Id} is not valid SQL on ${s.Platform}`);
    const query = await CreateFixtureQuery(ctx, s.Category.ID, { Name: `${PREFIX} ${fixture.Id}`, SQL: sqlFor(fixture, s) });
    AssertEqual(`${query.ExtractionStatus}:${query.ExtractionMessage ?? ''}`, `${fixture.Status ?? 'OK'}:${fixture.Message ?? ''}`, `${fixture.Id}: extraction status and message`);
    const rows = await ReadQueryRows(ctx, BUNDLE, query.ID);
    assertParameters(fixture, rows);
    assertFields(ctx, fixture, rows, s.Platform);
    assertEntities(ctx, fixture, rows);
    assertDependencies(fixture, rows, s);
    if (!rows.Fields.every(r => r.DetectionMethod === 'Database')) throw new Error(`${fixture.Id}: every field row comes from the database describe`);
    if (!UUIDsEqual(query.CategoryID, s.Category.ID)) throw new Error(`${fixture.Id}: saved in the wrong category`);
}

export const SqlPipeExtractionFixtureChecks: NamedCheck[] = FIXTURES.map(fixture => ({
    Id: `${BUNDLE}.${fixture.Id}`,
    Name: `${fixture.Id}: ${fixture.Title}`,
    Fn: (ctx: IntegrationCheckContext) => runFixture(ctx, fixture),
}));

for (const check of SqlPipeExtractionFixtureChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
