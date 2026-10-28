/**
 * `ComputeQueryExtraction`: a query's facts from MJ's parser and the database server's describe.
 *
 * The describe is a stub that answers per rendered statement, standing in for
 * `GenericDatabaseProvider.DescribeStatement` (SQL Server `dm_exec_describe_first_result_set`,
 * PostgreSQL RowDescription). Rendering is real (`RenderPipeline`), so each test also proves which
 * SQL the server would be asked to describe.
 *
 * Rows: D1 (fields from describe: name, order, exact type, nullability, PG NULL), D2 (sources mapped
 * to entity fields, non-entity sources, computed columns), D3 (branch union), D4 (external sources
 * skipped), D5 (describe failure keeps rows and records the error), D6 (the SQL hash), E1/E3/E12
 * (lineage and `*` come from the server, not from reading the SQL), E5 (Query Entities are the
 * entity-backed table references anywhere in the query, CTE names excluded), R10 (duplicate output
 * names), the save-time rules, orphaned authored parameters and doc-comment descriptions.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { DescribedColumn, DescribeStatementResult } from '@memberjunction/generic-database-provider';
import { DescribeStatementFailure, DescribeStatementSuccess } from '@memberjunction/generic-database-provider';
import { ComputeQueryExtraction, ExtractionSQLHash } from '../custom/query-extraction/extractQuery';
import type { KnownQueryParameter, QueryExtractionInput } from '../custom/query-extraction/extractionTypes';
import type { MJQueryEntityExtended, MJQueryParameterEntity } from '@memberjunction/core-entities';

type ComposedShape = Pick<MJQueryEntityExtended, 'ID' | 'Name' | 'CategoryPath' | 'Reusable' | 'QueryParameters' | 'QueryDependencies'>;

/** A reusable query at `Shared/<name>` with one required parameter. */
function composed(name: string, serverSet: boolean): MJQueryEntityExtended {
    const parameter = { Name: 'ChapterID', IsRequired: true, IsServerSet: serverSet } as Pick<MJQueryParameterEntity, 'Name' | 'IsRequired' | 'IsServerSet'> as MJQueryParameterEntity;
    const shape: ComposedShape = { ID: `dep-${name}`, Name: name, CategoryPath: 'Shared', Reusable: true, QueryParameters: [parameter], QueryDependencies: [] };
    return shape as MJQueryEntityExtended;
}

const USERS_ID = '11111111-1111-4111-8111-111111111111';
const ROLES_ID = '22222222-2222-4222-8222-222222222222';
const ABV_ACTIVE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ENTITIES = [
    new EntityInfo({
        ID: USERS_ID, Name: 'MJ: Users', SchemaName: '__mj', BaseTable: 'User', BaseView: 'vwUsers',
        Fields: [
            { ID: 'fu-id', EntityID: USERS_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'fu-name', EntityID: USERS_ID, Name: 'Name', Type: 'nvarchar', Description: 'The user\'s name.' },
            { ID: 'fu-email', EntityID: USERS_ID, Name: 'Email', Type: 'nvarchar' },
        ],
        EntityAlternateBaseViews: [{
            ID: ABV_ACTIVE_ID, EntityID: USERS_ID, Name: 'Active Users', ViewName: 'vwActiveUsers', SchemaName: null,
            Status: 'Active', CachePolicy: 'Default', Sequence: 1, ParentID: null,
        }],
    }),
    new EntityInfo({
        ID: ROLES_ID, Name: 'MJ: Roles', SchemaName: '__mj', BaseTable: 'Role', BaseView: 'vwRoles',
        Fields: [{ ID: 'fr-id', EntityID: ROLES_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }],
    }),
];

const USER = { ID: 'user-1', Email: 'u@example.com', UserRoles: [] } as Pick<UserInfo, 'ID' | 'Email' | 'UserRoles'> as UserInfo;

/** A described column; `source` is `schema.object.column`. */
function column(ordinal: number, name: string, fullType: string, source: string | null, isNullable: boolean | null = false): DescribedColumn {
    const [schema, object, col] = source?.split('.') ?? [];
    return {
        Name: name, Ordinal: ordinal, SQLFullType: fullType, SQLBaseType: fullType.split('(')[0], IsNullable: isNullable,
        IsComputed: source === null, Source: source ? { Schema: schema, Object: object, Column: col } : null,
    };
}

/** A describe stub answering with `answer(sql)`, recording every statement it is asked about. */
function describer(answer: (sql: string) => DescribeStatementResult) {
    const asked: string[] = [];
    const describe = vi.fn(async (sql: string) => {
        asked.push(sql);
        return answer(sql);
    });
    return { describe, asked };
}

function input(sql: string, overrides: Partial<QueryExtractionInput> = {}): QueryExtractionInput {
    return {
        QueryID: 'q-1', QueryName: 'Test Query', QueryPath: 'Tests/Test Query', SQL: sql, Platform: 'sqlserver', Mode: 'Save',
        IsExternal: false, KnownParameters: [], ContextUser: USER, Entities: ENTITIES, Queries: [], Describe: null, ...overrides,
    };
}

const USERS_COLUMNS = [column(1, 'ID', 'uniqueidentifier', '__mj.vwUsers.ID'), column(2, 'Name', 'nvarchar(100)', '__mj.vwUsers.Name')];

describe('ComputeQueryExtraction — fields from the database server (D1, D2)', () => {
    it('takes name, order, exact type and nullability from the describe, and maps sources to entity fields', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([...USERS_COLUMNS, column(3, 'NameLength', 'int', null, true)]));
        const result = await ComputeQueryExtraction(input('SELECT u.ID, u.Name, LEN(u.Name) AS NameLength FROM __mj.vwUsers u', { Describe: describe }));

        expect(result.Status).toBe('OK');
        expect(result.Fields?.map(f => [f.Sequence, f.Name, f.SQLFullType, f.SQLBaseType, f.IsNullable])).toEqual([
            [1, 'ID', 'uniqueidentifier', 'uniqueidentifier', false],
            [2, 'Name', 'nvarchar(100)', 'nvarchar', false],
            [3, 'NameLength', 'int', 'int', true],
        ]);
        expect(result.Fields?.[1]).toMatchObject({ SourceEntityID: USERS_ID, SourceEntityFieldID: 'fu-name', SourceFieldName: 'Name', SourceObjectName: null, IsComputed: false, SourceDescription: 'The user\'s name.' });
        expect(result.Fields?.[2]).toMatchObject({ SourceEntityID: null, SourceEntityFieldID: null, SourceFieldName: null, SourceObjectName: null, IsComputed: true });
    });

    it('records a source that backs no entity as schema.object, with the column as reported', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([column(1, 'version', 'nvarchar(50)', '__mj.flyway_schema_history.version', true)]));
        const result = await ComputeQueryExtraction(input('SELECT version FROM __mj.flyway_schema_history', { Describe: describe }));

        expect(result.Fields?.[0]).toMatchObject({ SourceEntityID: null, SourceFieldName: 'version', SourceObjectName: '__mj.flyway_schema_history' });
    });

    it('maps a source in an alternate base view to its entity', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([column(1, 'Email', 'nvarchar(100)', '__mj.vwActiveUsers.Email')]));
        const result = await ComputeQueryExtraction(input('SELECT Email FROM __mj.vwActiveUsers', { Describe: describe }));

        expect(result.Fields?.[0]).toMatchObject({ SourceEntityID: USERS_ID, SourceEntityFieldID: 'fu-email' });
        expect(result.Entities).toEqual([{ EntityID: USERS_ID, AlternateBaseViewID: ABV_ACTIVE_ID }]);
    });

    it('keeps PostgreSQL\'s unknown nullability as null', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([column(1, 'ID', 'uuid', '__mj.vwUsers.ID', null)]));
        const result = await ComputeQueryExtraction(input('SELECT u."ID" FROM __mj."vwUsers" u', { Platform: 'postgresql', Describe: describe }));

        expect(result.Fields?.[0].IsNullable).toBeNull();
    });

    it('E3 / E12: takes the columns a star covers from the server, never from reading the SQL', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([...USERS_COLUMNS, column(3, 'RoleID', 'uniqueidentifier', '__mj.vwRoles.ID')]));
        const result = await ComputeQueryExtraction(input('SELECT u.*, r.ID AS RoleID FROM __mj.vwUsers u JOIN __mj.vwRoles r ON 1 = 1 WHERE EXISTS (SELECT * FROM __mj.vwRoles)', { Describe: describe }));

        expect(result.Fields?.map(f => f.Name)).toEqual(['ID', 'Name', 'RoleID']);
        expect(result.Fields?.[2]).toMatchObject({ SourceEntityID: ROLES_ID, SourceFieldName: 'ID' });
    });

    it('skips an unnamed output column and says so', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([column(1, '', 'int', null)]));
        const result = await ComputeQueryExtraction(input('SELECT COUNT(*) FROM __mj.vwUsers', { Describe: describe }));

        expect(result.Fields).toEqual([]);
        expect(result.Status).toBe('Warning');
        expect(result.Messages.join('\n')).toContain('has no name');
    });
});

describe('ComputeQueryExtraction — branch renders (D3)', () => {
    const SQL = 'SELECT u.ID, {% if Detailed %}u.Email{% else %}u.Name AS ShortName{% endif %} FROM __mj.vwUsers u';

    it('describes the base render and each {% if %} toggled, and unions the columns by name, base order first', async () => {
        const { describe, asked } = describer(sql => DescribeStatementSuccess(sql.includes('ShortName')
            ? [column(1, 'ID', 'uniqueidentifier', '__mj.vwUsers.ID'), column(2, 'ShortName', 'nvarchar(100)', '__mj.vwUsers.Name')]
            : [column(1, 'ID', 'uniqueidentifier', '__mj.vwUsers.ID'), column(2, 'Email', 'nvarchar(100)', '__mj.vwUsers.Email')]));
        const result = await ComputeQueryExtraction(input(SQL, { Describe: describe }));

        expect(asked).toHaveLength(2);
        expect(asked.some(s => s.includes('u.Email')) && asked.some(s => s.includes('ShortName'))).toBe(true);
        expect(result.Fields?.map(f => [f.Sequence, f.Name])).toEqual([[1, 'ID'], [2, 'Email'], [3, 'ShortName']]);
        expect(result.Messages.join('\n')).toContain('ShortName');
        expect(result.Messages.join('\n')).toContain('Email (not in render 1)');
        expect(result.Status).toBe('OK');
        expect(result.UsesTemplate).toBe(true);
    });

    it('describes plain SQL once, as written', async () => {
        const { describe, asked } = describer(() => DescribeStatementSuccess(USERS_COLUMNS));
        await ComputeQueryExtraction(input('SELECT u.ID, u.Name FROM __mj.vwUsers u', { Describe: describe }));

        expect(asked).toEqual(['SELECT u.ID, u.Name FROM __mj.vwUsers u']);
    });

    it('renders with the known sample values, and a fixed sample of the type otherwise', async () => {
        const known: KnownQueryParameter[] = [{ Name: 'Region', Type: 'string', IsRequired: true, IsServerSet: false, SampleValue: 'WEST', DefaultValue: null, ValidationFilters: null, IsAuthored: true }];
        const { describe, asked } = describer(() => DescribeStatementSuccess(USERS_COLUMNS));
        await ComputeQueryExtraction(input('SELECT u.ID, u.Name FROM __mj.vwUsers u WHERE u.Name = {{ Region | sqlString }} AND u.ID > {{ MinID | sqlNumber }}', { Describe: describe, KnownParameters: known }));

        expect(asked[0]).toContain("'WEST'");
        expect(asked[0]).toContain('> 1');
    });
});

describe('ComputeQueryExtraction — what is not described (D4, D5)', () => {
    it('D4: skips the describe for an external-data-source query and leaves fields and entities as they are', async () => {
        const { describe } = describer(() => DescribeStatementSuccess(USERS_COLUMNS));
        const result = await ComputeQueryExtraction(input('SELECT ID FROM remote_table', { Describe: describe, IsExternal: true }));

        expect(describe).not.toHaveBeenCalled();
        expect(result.Status).toBe('Skipped');
        expect(result.Fields).toBeNull();
        expect(result.Entities).toBeNull();
    });

    it('D5: a describe failure keeps the stored fields and records the server\'s message as an error', async () => {
        const { describe } = describer(() => DescribeStatementFailure("Invalid column name 'EngagementScore'."));
        const result = await ComputeQueryExtraction(input('SELECT u.EngagementScore FROM __mj.vwUsers u', { Describe: describe }));

        expect(result.Refusal).toBeNull();
        expect(result.Status).toBe('Error');
        expect(result.Fields).toBeNull();
        expect(result.Messages.join('\n')).toContain("Invalid column name 'EngagementScore'");
        expect(result.Entities).toEqual([{ EntityID: USERS_ID, AlternateBaseViewID: null }]);
    });

    it('does not describe a query that reads a table named by a parameter, and keeps its declared fields', async () => {
        const { describe } = describer(() => DescribeStatementSuccess(USERS_COLUMNS));
        const sql = 'SELECT ot.*, ot.{{ UpdatedAtField | sqlIdentifier }} AS __ecd_UpdatedAt FROM {{ SchemaName | sqlIdentifier }}.{{ BaseView | sqlIdentifier }} ot ' +
            'INNER JOIN __mj.vwUsers u ON u.ID = ot.UserID';
        const result = await ComputeQueryExtraction(input(sql, { Describe: describe, Mode: 'Refresh' }));

        expect(describe).not.toHaveBeenCalled();
        expect(result.Fields).toBeNull();
        expect(result.Status).toBe('OK');
        expect(result.Messages.join('\n')).toContain('named by a template parameter');
        expect(result.Entities).toEqual([{ EntityID: USERS_ID, AlternateBaseViewID: null }]);
        expect(result.Parameters.map(p => p.Name)).toEqual(['UpdatedAtField', 'SchemaName', 'BaseView']);
    });

    it('still describes a query whose parameter names only a column', async () => {
        const { describe } = describer(() => DescribeStatementSuccess(USERS_COLUMNS));
        const result = await ComputeQueryExtraction(input('SELECT u.ID, u.{{ Col | sqlIdentifier }} AS Name FROM __mj.vwUsers u', { Describe: describe, Mode: 'Refresh' }));

        expect(describe).toHaveBeenCalled();
        expect(result.Fields?.map(f => f.Name)).toEqual(['ID', 'Name']);
    });

    it('D6: hashes the platform SQL with the dialect key', async () => {
        const result = await ComputeQueryExtraction(input('SELECT 1 AS One'));

        expect(result.Hash).toMatch(/^[0-9a-f]{64}$/);
        expect(result.Hash).toBe(ExtractionSQLHash('SELECT 1 AS One', 'sqlserver'));
        expect(ExtractionSQLHash('SELECT 1 AS One', 'postgresql')).not.toBe(result.Hash);
    });
});

describe('ComputeQueryExtraction — entities, parameters, dependencies (E5, parser facts)', () => {
    it('E5: reads entities from every table reference, subqueries and joins included, CTE names excluded', async () => {
        const result = await ComputeQueryExtraction(input(
            'WITH vwRoles AS (SELECT ID FROM __mj.vwUsers) SELECT r.ID FROM vwRoles r WHERE r.ID IN (SELECT ID FROM __mj.vwActiveUsers)'));

        expect(result.Entities).toEqual([
            { EntityID: USERS_ID, AlternateBaseViewID: null },
            { EntityID: USERS_ID, AlternateBaseViewID: ABV_ACTIVE_ID },
        ]);
    });

    it('reads parameters with their inferred type, required flag and default, and doc-comment descriptions', async () => {
        const sql = '{#\n @param Region The sales region.\n @field Name The user.\n#}\nSELECT u.Name FROM __mj.vwUsers u WHERE u.Name = {{ Region | sqlString }} {% if Top %}AND u.ID > {{ Top | sqlNumber | default(5) }}{% endif %}';
        const result = await ComputeQueryExtraction(input(sql));

        expect(result.Parameters.map(p => [p.Name, p.Type, p.IsRequired, p.DefaultValue, p.DocDescription])).toEqual([
            ['Region', 'string', true, null, 'The sales region.'],
            ['Top', 'number', false, '5', null],
        ]);
    });

    it('flags an authored parameter the SQL no longer uses, as a warning', async () => {
        const known: KnownQueryParameter[] = [{ Name: 'Gone', Type: 'string', IsRequired: false, IsServerSet: false, SampleValue: null, DefaultValue: null, ValidationFilters: null, IsAuthored: true }];
        const result = await ComputeQueryExtraction(input('SELECT 1 AS One', { KnownParameters: known, Describe: describer(() => DescribeStatementSuccess([column(1, 'One', 'int', null)])).describe }));

        expect(result.Status).toBe('Warning');
        expect(result.Messages.join('\n')).toContain('"Gone" is not used by the SQL');
    });

    it('does not flag an auto-detected parameter the SQL no longer uses (it is deleted)', async () => {
        const known: KnownQueryParameter[] = [{ Name: 'Gone', Type: 'string', IsRequired: false, IsServerSet: false, SampleValue: null, DefaultValue: null, ValidationFilters: null, IsAuthored: false }];
        const result = await ComputeQueryExtraction(input('SELECT 1 AS One', { KnownParameters: known, Describe: describer(() => DescribeStatementSuccess([column(1, 'One', 'int', null)])).describe }));

        expect(result.Status).toBe('OK');
    });
});

describe('ComputeQueryExtraction — refusals (R10, save-time rules)', () => {
    it('refuses a new query whose select list repeats an output name, without describing it', async () => {
        const { describe } = describer(() => DescribeStatementSuccess(USERS_COLUMNS));
        const result = await ComputeQueryExtraction(input('SELECT u.ID, r.id FROM __mj.vwUsers u JOIN __mj.vwRoles r ON 1 = 1', { Describe: describe }));

        expect(result.Refusal).toContain('more than one column named "ID"');
        expect(describe).not.toHaveBeenCalled();
    });

    it('refuses a new query whose described output repeats a name (a star over a join)', async () => {
        const { describe } = describer(() => DescribeStatementSuccess([column(1, 'ID', 'uniqueidentifier', '__mj.vwUsers.ID'), column(2, 'ID', 'uniqueidentifier', '__mj.vwRoles.ID')]));
        const result = await ComputeQueryExtraction(input('SELECT * FROM __mj.vwUsers u JOIN __mj.vwRoles r ON 1 = 1', { Describe: describe }));

        expect(result.Refusal).toContain('"ID"');
    });

    it('records a repeated output name as an error on a refresh, without refusing', async () => {
        const result = await ComputeQueryExtraction(input('SELECT u.ID, r.ID FROM __mj.vwUsers u JOIN __mj.vwRoles r ON 1 = 1', { Mode: 'Refresh' }));

        expect(result.Refusal).toBeNull();
        expect(result.Status).toBe('Error');
    });

    it('refuses a save-time rule error with the rule code, and only records it on a refresh', async () => {
        const sql = "SELECT u.ID FROM __mj.vwUsers u WHERE u.Name = '{{ Who }}'";
        const save = await ComputeQueryExtraction(input(sql));
        const refresh = await ComputeQueryExtraction(input(sql, { Mode: 'Refresh' }));

        expect(save.Refusal).toContain('MJQ_TAG_IN_STRING_LITERAL');
        expect(refresh.Refusal).toBeNull();
        expect(refresh.Status).toBe('Error');
        expect(refresh.Messages.join('\n')).toContain('MJQ_TAG_IN_STRING_LITERAL');
    });

    it('requires an argument for a required parameter of a composed query, unless the server sets it', async () => {
        const sql = 'SELECT c.N FROM {{query:"Shared/Chapters"}} c';
        const plain = await ComputeQueryExtraction(input(sql, { Queries: [composed('Chapters', false)] }));
        const serverSet = await ComputeQueryExtraction(input(sql, { Queries: [composed('Chapters', true)] }));

        expect(plain.Refusal).toContain('MJQ_COMPOSITION_MISSING_ARGUMENT');
        expect(serverSet.Refusal).toBeNull();
        expect(serverSet.Dependencies).toEqual([{ DependsOnQueryID: 'dep-Chapters', ReferencePath: 'Shared/Chapters', Alias: 'c', ParameterMapping: null }]);
    });

    it('refuses a composition that names no query', async () => {
        const result = await ComputeQueryExtraction(input('SELECT a.ID FROM {{query:"Nowhere/Missing"}} a'));

        expect(result.Refusal).toContain('MJQ_COMPOSITION_NOT_FOUND');
    });

    it('UsesTemplate is the lexer\'s answer: a tag in a SQL comment does not count', async () => {
        const result = await ComputeQueryExtraction(input('SELECT 1 AS One -- {{ not a tag }}'));

        expect(result.UsesTemplate).toBe(false);
    });
});
