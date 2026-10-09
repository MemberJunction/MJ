/**
 * `RunView` aggregates are spliced into `SELECT <expression> AS [Agg_N] FROM <view> WHERE …`.
 * These tests run the real `RunViewCore` over an entity fixture with `ExecuteSQL` recorded, and
 * pin that an expression which is not a single aggregate call over the entity's columns never
 * reaches the database. Refused expressions come back as per-aggregate errors; the rows and the
 * other aggregates are unaffected.
 *
 * The payloads are harmless (`SELECT 1`). Each hides a statement separator from a quote-only
 * literal stripper: on SQL Server behind a quote inside a `[bracket]` identifier, on PostgreSQL
 * behind a backslash-escaped quote in an `E'…'` string.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '../saveTypes.js';
import {
    CompositeKey,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type EntityInfo,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type QueryExecutionSpec,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
    type TransactionGroupBase,
} from '@memberjunction/core';
import { LexSQL } from '@memberjunction/sql-parser';
import { PostgreSQLDialect, SQLServerDialect, type DatabasePlatform, type SQLParserDialect } from '@memberjunction/sql-dialect';

const ENTITY_NAME = 'Widgets';

/** SQL Server: the `'` inside `[a']` opens a fake literal for a quote-only stripper. */
const SQL_SERVER_STACKED = "COUNT(*) AS [a'] ; SELECT 1 AS [b'], COUNT(*)";

/** PostgreSQL: `E'\''` is one escaped quote, which a quote-only stripper reads as an open literal. */
const POSTGRES_STACKED = "COUNT(*) + LENGTH(E'\\'') ; SELECT 1 AS x, COUNT(E'\\'')";

/**
 * Runs the real `InternalRunView` / `RunViewCore` / `RunViewsWithCacheCheck` over entity fixtures.
 * `ExecuteSQL` records every statement and answers an aggregate query with `Agg_N = 100 + N` for
 * each `Agg_N` the statement selects, and every other query with no rows.
 */
class AggregateTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    /** Every SQL statement `ExecuteSQL` received, in order. */
    public readonly ExecutedSQL: string[] = [];

    constructor(private readonly platform: DatabasePlatform, private readonly testEntities: EntityInfo[]) {
        super();
    }

    public override get PlatformKey(): DatabasePlatform { return this.platform; }
    public override get Entities(): EntityInfo[] { return this.testEntities; }

    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        const aliases = [...sql.matchAll(/Agg_(\d+)/g)].map((m) => Number(m[1]));
        if (aliases.length === 0) return [];
        const row: Record<string, number> = {};
        for (const n of aliases) row[`Agg_${n}`] = 100 + n;
        return [row] as unknown as T[];
    }

    public RunViewAs(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.InternalRunView(params, user);
    }

    public QuoteIdentifier(name: string): string {
        return this.platform === 'postgresql' ? `"${name}"` : `[${name}]`;
    }
    public QuoteSchemaAndView(schema: string, obj: string): string {
        return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(obj)}`;
    }

    protected get UUIDFunctionPattern(): RegExp { return AggregateTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return AggregateTestProvider._defaultPattern; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    protected CoerceSaveFieldValue(): SaveCoercedValue { throw new Error('Not supported in this test double'); }
    protected RenderSaveCallBinding(): SaveCallBinding { throw new Error('Not supported in this test double'); }
    protected WrapSaveCallForResult(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    protected WrapSaveCallWithRecordChange(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] } as unknown as RunQueryResult; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { return {} as PotentialDuplicateResponse; }
    public async MergeRecords(): Promise<RecordMergeResult> { return {} as RecordMergeResult; }
    public async GetDatasetByName(): Promise<DatasetResultType> { return {} as DatasetResultType; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return {} as DatasetStatusResultType; }
    public get InstanceConnectionString(): string { return 'aggregate-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** A readable entity with no row-level security, field-level security or external data source. */
function widgetsEntity(): EntityInfo {
    const fields = ['ID', 'Name', 'Sequence'].map((name) => ({ Name: name, CodeName: name }));
    const id = fields[0];
    return {
        ID: 'ENT-Widgets',
        Name: ENTITY_NAME,
        CodeName: ENTITY_NAME,
        SchemaName: '__mj',
        BaseView: 'vwWidgets',
        Fields: fields,
        PrimaryKeys: [id],
        FirstPrimaryKey: id,
        FieldByName: (n: string) => fields.find((f) => f.Name.toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
        HasBinaryFields: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

const user = new UserInfo(null as unknown as IMetadataProvider, { ID: 'U1', Email: 'u1@example.com' });

/** How many statement separators the dialect's lexer finds outside literals, identifiers and comments. */
function statementSeparators(sql: string, dialect: SQLParserDialect): number {
    return LexSQL(sql, dialect).filter((t) => t.Kind === 'semicolon').length;
}

describe('GenericDatabaseProvider.RunViewCore — aggregate expressions', () => {
    it('SQL Server: an aggregate that hides a second statement behind a bracket-identifier quote never reaches the database', async () => {
        const provider = new AggregateTestProvider('sqlserver', [widgetsEntity()]);

        const result = await provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: SQL_SERVER_STACKED }] }, user);

        expect(provider.ExecutedSQL.filter((sql) => statementSeparators(sql, new SQLServerDialect()) > 0)).toEqual([]);
        expect(result.Success).toBe(true);
        expect(result.AggregateResults?.[0].error).toMatch(/statement separator/);
    });

    it('PostgreSQL: an aggregate that hides a second statement behind an E-string escape never reaches the database', async () => {
        const provider = new AggregateTestProvider('postgresql', [widgetsEntity()]);

        const result = await provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: POSTGRES_STACKED }] }, user);

        expect(provider.ExecutedSQL.filter((sql) => statementSeparators(sql, new PostgreSQLDialect()) > 0)).toEqual([]);
        expect(result.Success).toBe(true);
        expect(result.AggregateResults?.[0].error).toMatch(/statement separator/);
    });

    it('RunViewsWithCacheCheck: a stacked aggregate never reaches the database', async () => {
        const provider = new AggregateTestProvider('sqlserver', [widgetsEntity()]);

        // BypassCache sends the item straight to the database leg, which runs InternalRunView.
        const response = await provider.RunViewsWithCacheCheck(
            [{ params: { EntityName: ENTITY_NAME, BypassCache: true, Aggregates: [{ expression: SQL_SERVER_STACKED }] } }],
            user,
        );

        expect(provider.ExecutedSQL.filter((sql) => statementSeparators(sql, new SQLServerDialect()) > 0)).toEqual([]);
        expect(response.results[0].aggregateResults?.[0].error).toMatch(/statement separator/);
    });

    it('a refused aggregate does not shift the values of the aggregates beside it', async () => {
        const provider = new AggregateTestProvider('sqlserver', [widgetsEntity()]);

        const result = await provider.RunViewAs(
            {
                EntityName: ENTITY_NAME,
                Aggregates: [
                    { expression: 'COUNT(*)', alias: 'Total' },
                    { expression: 'SUM(Sequence) + 1', alias: 'NotOneCall' },
                    { expression: 'SUM(Sequence)', alias: 'SequenceSum' },
                ],
            },
            user,
        );

        expect(provider.ExecutedSQL).toContain('SELECT COUNT(*) AS [Agg_0], SUM(Sequence) AS [Agg_1] FROM [__mj].[vwWidgets]');
        expect(result.AggregateResults?.map((a) => [a.alias, a.value])).toEqual([
            ['Total', 100],
            ['NotOneCall', null],
            ['SequenceSum', 101],
        ]);
        expect(result.AggregateResults?.[1].error).toMatch(/single aggregate function call/);
    });

    it('reports refused aggregates in request order when none of them can run', async () => {
        const provider = new AggregateTestProvider('sqlserver', [widgetsEntity()]);

        const result = await provider.RunViewAs(
            {
                EntityName: ENTITY_NAME,
                Aggregates: [
                    // One call over a column, but the keyword validator refuses REPLACE.
                    { expression: "MAX(REPLACE(Name, 'a', 'b'))", alias: 'KeywordRefused' },
                    { expression: 'SUM(Sequence) + 1', alias: 'ShapeRefused' },
                ],
            },
            user,
        );

        expect(provider.ExecutedSQL.some((sql) => sql.includes('Agg_'))).toBe(false);
        expect(result.AggregateResults?.map((a) => a.alias)).toEqual(['KeywordRefused', 'ShapeRefused']);
    });

    it('ordinary aggregate expressions reach the database unchanged', async () => {
        const provider = new AggregateTestProvider('sqlserver', [widgetsEntity()]);

        const result = await provider.RunViewAs(
            {
                EntityName: ENTITY_NAME,
                Aggregates: [{ expression: 'AVG(Sequence * 2)' }, { expression: "COUNT(CASE WHEN Name = 'x' THEN 1 END)" }],
            },
            user,
        );

        expect(provider.ExecutedSQL).toContain(
            "SELECT AVG(Sequence * 2) AS [Agg_0], COUNT(CASE WHEN Name = 'x' THEN 1 END) AS [Agg_1] FROM [__mj].[vwWidgets]",
        );
        expect(result.AggregateResults?.map((a) => [a.value, a.error])).toEqual([
            [100, undefined],
            [101, undefined],
        ]);
    });
});
