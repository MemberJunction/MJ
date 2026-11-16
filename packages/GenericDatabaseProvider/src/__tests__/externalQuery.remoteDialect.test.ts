/**
 * A saved query on an external data source renders its template values with the source's own
 * dialect (`RenderContext.DialectKey`), not MJ's platform: a `sqlString` value reaches a MySQL
 * source as a literal MySQL reads as one string, whatever the value holds.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));

import { MJGlobal } from '@memberjunction/global';
import {
    DatabasePlatform, DeleteSQLResult, ExternalDataSourceReadRouter, Metadata, RunQueryParams, RunQueryResult,
    SaveSQLResult, UserInfo, type IMetadataProvider,
} from '@memberjunction/core';
import { MJQueryEntityExtended, QueryEngine } from '@memberjunction/core-entities';
import { SqlTokens } from '@memberjunction/sql-parser';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';

/** What the stub router was asked to run, and the dialect it reports for every source. */
const external = { DialectKey: 'mysql' as string | null, SQL: [] as string[] };

class StubRouter extends ExternalDataSourceReadRouter {
    async RunViewExternal(): Promise<never> { throw new Error('not used'); }
    async LoadExternalRecord(): Promise<never> { throw new Error('not used'); }
    async IntrospectExternalSchema(): Promise<never> { throw new Error('not used'); }
    async GetCacheTTLSeconds(): Promise<number> { return 0; }
    override async GetQueryDialectKey(_id: string, _user?: UserInfo, _provider?: IMetadataProvider): Promise<string | null> {
        return external.DialectKey;
    }
    async RunQueryExternal(_eds: string, queryID: string, queryName: string, sql: string): Promise<RunQueryResult> {
        external.SQL.push(sql);
        return { Success: true, QueryID: queryID, QueryName: queryName, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }
}

class ExternalQueryProvider extends GenericDatabaseProviderTestBase {
    override get PlatformKey(): DatabasePlatform { return 'sqlserver'; }
    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    public override get Entities() { return []; }

    public Query: MJQueryEntityExtended | null = null;
    protected override resolveQuery(): MJQueryEntityExtended | undefined { return this.Query ?? undefined; }
    public Run(params: RunQueryParams, user: UserInfo): Promise<RunQueryResult> { return this.InternalRunQuery(params, user); }
}

function externalQuery(sql: string): MJQueryEntityExtended {
    const q = Object.create(MJQueryEntityExtended.prototype) as MJQueryEntityExtended;
    const own: Record<string, unknown> = {
        ID: 'q-ext', Name: 'Remote Lookup', SQL: sql, Status: 'Approved', Reusable: false, UsesTemplate: true, CacheEnabled: false,
        AuditQueryRuns: false, ExternalDataSourceID: 'eds-1', CategoryID: null, CategoryPath: '', IsApproved: true, CacheValidationSQL: null,
        QueryPermissions: [], QueryEntities: [], QueryDependencies: [], QueryParameters: [], QueryFields: [],
    };
    for (const [key, value] of Object.entries(own)) Object.defineProperty(q, key, { value, configurable: true });
    Object.defineProperty(q, 'GetPlatformSQL', { value: () => sql, configurable: true });
    return q;
}

const user = new UserInfo(undefined, { ID: 'A0000000-0000-0000-0000-0000000000E1', Name: 'u', Email: 'u@example.com', IsActive: true, UserRoles: [] });
const INJECTION = "\\' OR 1=1 -- ";

describe('an external data source query renders with the source dialect', () => {
    beforeAll(() => {
        MJGlobal.Instance.ClassFactory.Register(ExternalDataSourceReadRouter, StubRouter, null, 2000, true);
    });
    beforeEach(() => {
        external.SQL.length = 0;
        external.DialectKey = 'mysql';
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [], QuerySQLs: [], Dependencies: [] } as unknown as QueryEngine);
    });
    afterEach(() => vi.restoreAllMocks());

    async function render(): Promise<string> {
        const provider = new ExternalQueryProvider();
        provider.Query = externalQuery('SELECT id FROM customers WHERE name = {{ x | sqlString }}');
        const result = await provider.Run({ QueryID: 'q-ext', Parameters: { x: INJECTION } }, user);
        expect(result.Success, result.ErrorMessage).toBe(true);
        return external.SQL[0];
    }

    it('writes a MySQL string literal for sqlString: backslash and quote both escaped', async () => {
        expect(await render()).toBe("SELECT id FROM customers WHERE name = '\\\\'' OR 1=1 -- '");
    });

    it('produces one string literal and no comment as MySQL reads it, with backslash escapes on or off', async () => {
        const sql = await render();
        for (const dialect of [GetQueryDialect('mysql'), GetQueryDialect('sqlserver')]) {
            // MySQL with backslash escapes (its default), and the same text read without them
            // (NO_BACKSLASH_ESCAPES reads quotes as SQL Server does).
            const tokens = SqlTokens.Lex(sql, dialect).Tokens;
            expect(tokens.filter(t => t.Kind === 'String').map(t => t.Text)).toEqual(["'\\\\'' OR 1=1 -- '"]);
            expect(tokens.some(t => t.Kind === 'Comment')).toBe(false);
        }
    });

    it("renders with the MJ platform's dialect when the source has no SQL dialect", async () => {
        external.DialectKey = null;
        expect(await render()).toBe("SELECT id FROM customers WHERE name = '\\'' OR 1=1 -- '");
    });
});
