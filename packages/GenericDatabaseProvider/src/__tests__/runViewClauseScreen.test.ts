/**
 * Client SQL fragments that reach `RunViewCore` / the cache-check path from callers that never pass
 * the GraphQL-boundary screen: a saved view's stored WhereClause and the ORDER BY built from its sort
 * state (any user who can save a view writes those), and the ExtraFilter / OrderBy /
 * OverrideExcludeFilter / custom-format search slots every RunView caller can fill.
 *
 * Each payload is harmless (stacked `SELECT`s). The keyword denylist accepts it, because a quote
 * inside the bracket identifier `[a']` hides the rest of the text from its literal stripper. The
 * tests pin that no such text reaches `ExecuteSQL`, and that ordinary clauses still run.
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
    BaseEntity,
    UserInfo,
    type DatabasePlatform,
    type DeleteSQLResult,
    type EntityInfo,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
} from '@memberjunction/core';

const BRACKET_STACKED =
    "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT * FROM [__mj].[vwAccounts] WHERE (1 = (SELECT 1 AS [b'])";
const ORDER_BY_STACKED = "[a'] ; SELECT 1 AS [x] ; SELECT 1 AS [b']";
const BASE_TABLE_PROBE = `EXISTS (SELECT 1 FROM __mj.[User] WHERE [Type] = 'Owner')`;

const ACCOUNTS_ID = '3f1f6b9e-0000-4000-8000-0000000000a1';
const CODES_ID = '3f1f6b9e-0000-4000-8000-0000000000a2';

/** An entity the user may read, with no row-level security and no external data source. */
function readableEntity(id: string, name: string, baseView: string, extraFields: Array<Record<string, unknown>> = []): EntityInfo {
    const pk = { Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true };
    const fields = [pk, ...extraFields];
    return {
        ID: id,
        Name: name,
        SchemaName: '__mj',
        BaseView: baseView,
        Fields: fields,
        PrimaryKeys: [pk],
        FirstPrimaryKey: pk,
        FieldByName: (n: string) => fields.find((f) => String(f.Name).toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
        FullTextSearchEnabled: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

const ACCOUNTS = readableEntity(ACCOUNTS_ID, 'Accounts', 'vwAccounts', [{ Name: 'Name', CodeName: 'Name', Type: 'nvarchar', Length: 200 }]);
/** An entity whose search field splices the term unquoted through an admin-authored format. */
const CODES = readableEntity(CODES_ID, 'Codes', 'vwCodes', [
    { Name: 'Code', CodeName: 'Code', Type: 'int', IncludeInUserSearchAPI: true, UserSearchParamFormatAPI: ' = {0}' },
]);

/** The fields a saved view contributes to a run. */
interface StoredView {
    WhereClause: string;
    OrderByClause?: string;
    CustomWhereClause?: boolean;
}

/** A saved view loaded through the entity system: a real BaseEntity instance. */
class LoadedView extends BaseEntity {
    constructor(private readonly stored: StoredView) {
        super({ Name: 'MJ: User Views', Fields: [] } as unknown as EntityInfo);
    }
    get ID(): string { return '3f1f6b9e-0000-4000-8000-0000000000f1'; }
    get Name(): string { return 'Saved view'; }
    get EntityID(): string { return ACCOUNTS_ID; }
    get ViewEntityInfo(): EntityInfo { return ACCOUNTS; }
    get WhereClause(): string { return this.stored.WhereClause; }
    get OrderByClause(): string { return this.stored.OrderByClause ?? ''; }
    get CustomWhereClause(): boolean { return this.stored.CustomWhereClause ?? false; }
}

/** Runs the real `RunViewCore` and `GetRunViewsDatabaseStatus` over the fixtures, recording `ExecuteSQL`. */
class ClauseScreenTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    /** Every SQL statement `ExecuteSQL` received, in order. */
    public readonly ExecutedSQL: string[] = [];

    public override get Entities(): EntityInfo[] { return [ACCOUNTS, CODES]; }

    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        return [] as T[];
    }

    public Run(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.InternalRunView(params, user);
    }

    protected get UUIDFunctionPattern(): RegExp { return ClauseScreenTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ClauseScreenTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
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
}

/** The same double on PostgreSQL: its platform key, dialect and identifier quoting. */
class PostgreSQLClauseScreenTestProvider extends ClauseScreenTestProvider {
    public override get PlatformKey(): DatabasePlatform { return 'postgresql'; }
    public override QuoteIdentifier(name: string): string { return `"${name}"`; }
    public override QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    /** Stands in for the PostgreSQL provider's metadata-driven quoting of a client clause. */
    protected override TransformExternalSQLClause(clause: string): string {
        return clause.replace(/\[(\w+)\]/g, '"$1"').replace(/\bOrder\b/g, '"Order"');
    }
}

const USER = new UserInfo(null as unknown as IMetadataProvider, { ID: 'U1', Email: 'u1@example.com' });

/** Runs one view and returns its result with every statement the database was sent. */
async function run(params: RunViewParams, provider: ClauseScreenTestProvider = new ClauseScreenTestProvider()): Promise<{ result: RunViewResult; sql: string[] }> {
    const result = await provider.Run(params, USER);
    return { result, sql: provider.ExecutedSQL };
}

function savedView(stored: StoredView): RunViewParams {
    return { ViewEntity: new LoadedView(stored), Fields: ['ID'] };
}

describe('RunViewCore — a saved view\'s stored clauses pass the clause screen at render', () => {
    it('refuses a stacked statement in a stored WhereClause, before any SQL runs', async () => {
        const { result, sql } = await run(savedView({ WhereClause: BRACKET_STACKED }));

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/statement separators|multiple statements/);
    });

    it('refuses a stored WhereClause that reads a base table', async () => {
        const { result, sql } = await run(savedView({ WhereClause: BASE_TABLE_PROBE }));

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/entity base view/);
    });

    it('refuses a stacked statement in the ORDER BY built from the view\'s sort state', async () => {
        const { result, sql } = await run(savedView({ WhereClause: `[Name] = 'x'`, OrderByClause: ORDER_BY_STACKED }));

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
    });

    it('refuses a stored sort that reads a base table', async () => {
        const { result, sql } = await run(savedView({ WhereClause: '', OrderByClause: '(SELECT TOP 1 [Type] FROM __mj.[User])' }));

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/entity base view/);
    });

    it('does not trust a CustomWhereClause flag on a view object that was not loaded as an entity', async () => {
        const forged = {
            ID: '3f1f6b9e-0000-4000-8000-0000000000f2',
            Name: 'Forged view',
            EntityID: ACCOUNTS_ID,
            ViewEntityInfo: ACCOUNTS,
            WhereClause: BRACKET_STACKED,
            CustomWhereClause: true,
        };

        const { result, sql } = await run({ ViewEntity: forged as unknown as BaseEntity, Fields: ['ID'] });

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
    });

    it('still runs an ordinary stored filter and sort', async () => {
        const where = `[Name] = 'O''Brien' AND ID IN (SELECT ID FROM [__mj].[vwAccounts] WHERE [Name] LIKE '%;%')`;

        const { result, sql } = await run(savedView({ WhereClause: where, OrderByClause: 'Name DESC' }));

        expect(result.Success).toBe(true);
        expect(sql[0]).toContain(`WHERE (${where})`);
        expect(sql[0]).toContain('ORDER BY Name DESC');
    });

    it('keeps the CustomWhereClause exemption for a loaded view', async () => {
        const adminClause = `ID IN (SELECT AccountID FROM __mj.AccountAudit)`;

        const { result, sql } = await run(savedView({ WhereClause: adminClause, CustomWhereClause: true }));

        expect(result.Success).toBe(true);
        expect(sql[0]).toContain(`WHERE (${adminClause})`);
    });
});

describe('RunViewCore — saved views on PostgreSQL', () => {
    const pg = () => new PostgreSQLClauseScreenTestProvider();

    it('runs a saved view whose FilterState clause uses bracket identifiers', async () => {
        const where = `([Name] = 'Acme') AND ([Name] LIKE '%acme%') AND ID IN (SELECT ID FROM [__mj].[vwAccounts])`;

        const { result, sql } = await run(savedView({ WhereClause: where, OrderByClause: 'Name DESC' }), pg());

        expect(result.Success).toBe(true);
        expect(sql[0]).toContain(`WHERE (${where})`);
    });

    it('still refuses a bracketed base-table read and a stacked E-string in a stored WhereClause', async () => {
        const baseTable = await run(savedView({ WhereClause: `([Name] = 'x') AND EXISTS (SELECT 1 FROM [__mj].[User])` }), pg());
        const eString = await run(savedView({ WhereClause: "Name = E'\\'' ; SELECT 1 ; SELECT 1 WHERE Name = E'\\''" }), pg());

        expect(baseTable.sql).toHaveLength(0);
        expect(baseTable.result.ErrorMessage).toMatch(/entity base view/);
        expect(eString.sql).toHaveLength(0);
        expect(eString.result.ErrorMessage).toMatch(/statement separators/);
    });

    it('screens a client clause in the form the provider runs it when given the entity', () => {
        const provider = pg();

        expect(() => provider.ScreenClientClause('Order DESC', 'OrderBy', USER, ACCOUNTS)).not.toThrow();
        expect(() => provider.ScreenClientClause('Order DESC', 'OrderBy', USER)).toThrow(/Invalid OrderBy/);
    });
});

describe('RunViewCore — a view object\'s ID is spliced only when it is a GUID', () => {
    it('refuses a view object whose ID is not a GUID before it reaches the exclusion filter', async () => {
        const forged = { ID: '0) ; SELECT 1 AS [x] ; SELECT 1 WHERE (1=1', Name: 'Forged', EntityID: ACCOUNTS_ID, ViewEntityInfo: ACCOUNTS, WhereClause: '' };

        const { result, sql } = await run({ ViewEntity: forged as unknown as BaseEntity, Fields: ['ID'], ExcludeDataFromAllPriorViewRuns: true });

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/GUID/);
    });

    it('still excludes prior runs of a loaded view', async () => {
        const { result, sql } = await run({ ...savedView({ WhereClause: '' }), ExcludeDataFromAllPriorViewRuns: true });

        expect(result.Success).toBe(true);
        expect(sql[0]).toContain('UserViewID=3f1f6b9e-0000-4000-8000-0000000000f1)');
    });
});

describe('RunViewCore — caller clause slots reject statement separators for every caller', () => {
    it('refuses a stacked ExtraFilter hidden behind a bracket identifier', async () => {
        const { result, sql } = await run({ EntityName: 'Accounts', ExtraFilter: BRACKET_STACKED });

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/ExtraFilter/);
    });

    it('refuses a stacked OrderBy and OverrideExcludeFilter', async () => {
        const orderBy = await run({ EntityName: 'Accounts', OrderBy: ORDER_BY_STACKED });
        const exclude = await run({
            EntityName: 'Accounts',
            ExcludeUserViewRunID: '3f1f6b9e-0000-4000-8000-0000000000e1',
            OverrideExcludeFilter: BRACKET_STACKED,
        });

        expect(orderBy.sql).toHaveLength(0);
        expect(orderBy.result.Success).toBe(false);
        expect(exclude.sql).toHaveLength(0);
        expect(exclude.result.Success).toBe(false);
    });

    it('refuses a stacked search term on an entity whose search format splices the term unquoted', async () => {
        const { result, sql } = await run({ EntityName: 'Codes', UserSearchString: ORDER_BY_STACKED });

        expect(sql).toHaveLength(0);
        expect(result.Success).toBe(false);
    });

    it('refuses a stacked ExtraFilter in the cache-status probe', async () => {
        const provider = new ClauseScreenTestProvider();

        const statuses = await provider.GetRunViewsDatabaseStatus([{ EntityName: 'Accounts', ExtraFilter: BRACKET_STACKED }], USER);

        expect(provider.ExecutedSQL).toHaveLength(0);
        expect(statuses[0].Success).toBe(false);
    });

    it('still runs ordinary clauses, including bracket identifiers and separators inside literals', async () => {
        const filter = `[Name] = 'a;b' AND [Name] <> 'c--d' AND ID IN (SELECT ID FROM [__mj].[vwAccounts])`;

        const { result, sql } = await run({ EntityName: 'Accounts', ExtraFilter: filter, OrderBy: '[Name] DESC' });

        expect(result.Success).toBe(true);
        expect(sql[0]).toContain(`WHERE (${filter})`);
    });
});
