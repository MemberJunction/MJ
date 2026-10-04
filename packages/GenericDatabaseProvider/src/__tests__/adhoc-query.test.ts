import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import { DatabasePlatform, DeleteSQLResult, ExecuteSQLOptions, QueryExecutionSpec, RunQueryParams, RunQueryResult, SaveSQLResult } from '@memberjunction/core';

/** A provider that records the SQL it is asked to run and answers from a queue. */
class AdhocTestProvider extends GenericDatabaseProviderTestBase {
    public readonly Executed: string[] = [];
    public readonly Options: Array<ExecuteSQLOptions | undefined> = [];
    public Answers: Array<Array<Record<string, unknown>>> = [];

    constructor(private readonly platform: DatabasePlatform) {
        super();
    }

    override get PlatformKey(): DatabasePlatform { return this.platform; }
    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
    public QuoteIdentifier(name: string): string { return this.Dialect.QuoteIdentifier(name); }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(obj)}`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    override async ExecuteSQL<T>(sql: string, _parameters?: unknown[], options?: ExecuteSQLOptions): Promise<Array<T>> {
        this.Executed.push(sql);
        this.Options.push(options);
        const rows = this.Answers.shift() ?? [];
        return rows as Array<T>;
    }

    public RunAdhoc(params: RunQueryParams): Promise<RunQueryResult> {
        return this.InternalRunQuery(params);
    }

    public RunSpec(spec: QueryExecutionSpec): Promise<RunQueryResult> {
        return this.InternalExecuteQueryFromSpec(spec);
    }
}

describe('ad-hoc SQL statement gate', () => {
    for (const platform of ['sqlserver', 'postgresql'] as const) {
        it(`refuses SELECT … INTO on ${platform} without running it`, async () => {
            const provider = new AdhocTestProvider(platform);
            const result = await provider.RunAdhoc({ SQL: 'SELECT * INTO copy_of_t FROM t' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toMatch(/SELECT … INTO/);
            expect(provider.Executed).toEqual([]);
        });

        it(`refuses SET on ${platform} without running it`, async () => {
            const provider = new AdhocTestProvider(platform);
            const result = await provider.RunAdhoc({ SQL: "SET statement_timeout = '3s'" });
            expect(result.Success).toBe(false);
            expect(provider.Executed).toEqual([]);
        });
    }
});

describe('caller-supplied SQL runs in a rolled-back read-only transaction', () => {
    it('ad-hoc SQL asks for a read-only transaction', async () => {
        const provider = new AdhocTestProvider('postgresql');
        provider.Answers = [[{ n: 1 }]];
        const result = await provider.RunAdhoc({ SQL: 'SELECT 1 AS n' });
        expect(result.Success).toBe(true);
        expect(provider.Options.every(o => o?.readOnlyTransaction === true)).toBe(true);
        expect(provider.Options.length).toBeGreaterThan(0);
    });

    it('spec-path SQL asks for a read-only transaction', async () => {
        const provider = new AdhocTestProvider('postgresql');
        provider.Answers = [[{ n: 1 }]];
        const result = await provider.RunSpec({ SQL: 'SELECT 1 AS n', MaxRows: 10 });
        expect(result.Success).toBe(true);
        expect(provider.Options.every(o => o?.readOnlyTransaction === true)).toBe(true);
        expect(provider.Options.length).toBeGreaterThan(0);
    });
});

describe('ad-hoc SQL with MaxRows is paged in the database', () => {
    it('asks the database for one page and a count, not every row', async () => {
        const provider = new AdhocTestProvider('sqlserver');
        provider.Answers = [[{ a: 21 }, { a: 22 }], [{ TotalRowCount: 300 }]];
        const result = await provider.RunAdhoc({ SQL: 'SELECT a FROM t ORDER BY a', StartRow: 20, MaxRows: 2 });
        expect(result.Success).toBe(true);
        expect(provider.Executed).toHaveLength(2);
        expect(provider.Executed[0]).toMatch(/OFFSET 20 ROWS FETCH NEXT 2 ROWS ONLY/);
        expect(provider.Executed[1]).toMatch(/COUNT\(\*\) AS TotalRowCount/);
        expect(result.Results).toEqual([{ a: 21 }, { a: 22 }]);
        expect(result.TotalRowCount).toBe(300);
        expect(result.RowCount).toBe(2);
    });

    it('PostgreSQL gets LIMIT … OFFSET', async () => {
        const provider = new AdhocTestProvider('postgresql');
        provider.Answers = [[{ a: 1 }], [{ TotalRowCount: 5 }]];
        await provider.RunAdhoc({ SQL: 'SELECT a FROM t ORDER BY a', MaxRows: 1 });
        expect(provider.Executed[0]).toMatch(/LIMIT 1 OFFSET 0/);
    });

    it('without MaxRows still returns every row', async () => {
        const provider = new AdhocTestProvider('sqlserver');
        provider.Answers = [[{ a: 1 }, { a: 2 }, { a: 3 }]];
        const result = await provider.RunAdhoc({ SQL: 'SELECT a FROM t' });
        expect(provider.Executed).toEqual(['SELECT a FROM t']);
        expect(result.TotalRowCount).toBe(3);
    });
});
