import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

// Mock sql-formatter (used by SqlLoggingSessionImpl)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import {
    SaveSQLResult,
    DeleteSQLResult,
    UserInfo,
    BaseEntity,
    QueryInfo,
    RunQueryParams,
    RunQueryResult,
    Metadata,
} from '@memberjunction/core';

/**
 * Test subclass exposing protected pipeline methods for testing.
 * Overrides resolveQueryInfo to use injected mock queries instead of
 * requiring full provider Config().
 */
class TestPipelineProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestPipelineProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestPipelineProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `LIMIT ${maxRows} OFFSET ${startRow}`;
    }

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    // ---- Mock query resolution ----
    private _mockQueries: QueryInfo[] = [];
    public setMockQueries(queries: QueryInfo[]): void {
        this._mockQueries = queries;
    }

    /** Override to use injected mock queries instead of requiring Config() */
    protected override resolveQueryInfo(params: RunQueryParams): QueryInfo | undefined {
        if (params.QueryID) {
            return this._mockQueries.find(q => q.ID === params.QueryID);
        }
        if (params.QueryName) {
            return this._mockQueries.find(q =>
                q.Name.toLowerCase() === params.QueryName!.toLowerCase()
            );
        }
        return undefined;
    }

    // ---- Track ExecuteSQL calls ----
    public executeSQLCalls: Array<{ sql: string; params?: unknown[] }> = [];
    public executeSQLResults: Array<Record<string, unknown>[]> = [];
    private executeSQLCallIndex = 0;

    override async ExecuteSQL<T>(sql?: string, params?: unknown[]): Promise<Array<T>> {
        this.executeSQLCalls.push({ sql: sql ?? '', params });
        const result = this.executeSQLResults[this.executeSQLCallIndex] ?? [];
        this.executeSQLCallIndex++;
        return result as unknown as Array<T>;
    }

    public resetExecuteSQLState(): void {
        this.executeSQLCalls = [];
        this.executeSQLResults = [];
        this.executeSQLCallIndex = 0;
    }

    // ---- Expose protected methods ----
    public testInternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        return this.InternalRunQuery(params, contextUser);
    }

    public testInternalRunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
        return this.InternalRunQueries(params, contextUser);
    }

    public testFindAndValidateQuery(params: RunQueryParams, contextUser?: UserInfo): QueryInfo {
        return this.findAndValidateQuery(params, contextUser);
    }

    public testProcessQueryParameters(
        query: QueryInfo,
        parameters?: Record<string, string>,
        contextUser?: UserInfo,
    ): { finalSQL: string; appliedParameters: Record<string, string> } {
        return this.processQueryParameters(query, parameters, contextUser);
    }

    public testApplyQueryPagination(
        results: Record<string, unknown>[],
        params: RunQueryParams,
    ): { paginatedResult: Record<string, unknown>[]; totalRowCount: number } {
        return this.applyQueryPagination(results, params);
    }

    public testAuditQueryExecution(
        query: QueryInfo,
        params: RunQueryParams,
        finalSQL: string,
        rowCount: number,
        totalRowCount: number,
        executionTime: number,
        contextUser?: UserInfo,
    ): void {
        this.auditQueryExecution(query, params, finalSQL, rowCount, totalRowCount, executionTime, contextUser);
    }
}

// ---- Helpers ----

function makeQueryInfo(overrides: Partial<{
    ID: string;
    Name: string;
    SQL: string;
    Status: string;
    Reusable: boolean;
    CategoryPath: string;
    UsesTemplate: boolean;
    CacheEnabled: boolean;
    AuditQueryRuns: boolean;
}>): QueryInfo {
    const q = new QueryInfo();
    q.ID = overrides.ID ?? 'q-1';
    q.Name = overrides.Name ?? 'Test Query';
    q.SQL = overrides.SQL ?? 'SELECT 1';
    q.Status = (overrides.Status ?? 'Approved') as QueryInfo['Status'];
    q.Reusable = overrides.Reusable ?? false;
    q.UsesTemplate = overrides.UsesTemplate ?? false;
    q.CacheEnabled = overrides.CacheEnabled ?? false;
    q.AuditQueryRuns = overrides.AuditQueryRuns ?? false;

    Object.defineProperty(q, 'CategoryPath', {
        get: () => overrides.CategoryPath ?? '/Test/',
        configurable: true
    });

    q.UserCanRun = vi.fn().mockReturnValue(true);
    q.UserHasRunPermissions = vi.fn().mockReturnValue(true);
    q.GetPlatformSQL = vi.fn().mockReturnValue(q.SQL);

    return q;
}

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
    UserRoles: [{ Role: 'Admin' }],
} as unknown as UserInfo;

// ---- Tests ----

describe('GenericDatabaseProvider Query Pipeline', () => {
    let provider: TestPipelineProvider;

    beforeEach(() => {
        provider = new TestPipelineProvider();
        // Mock Metadata.Provider to prevent undefined access in pipeline methods
        // (e.g., CacheConfig accesses QueryCategories, composition accesses Queries)
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
            Queries: [],
            QueryDependencies: [],
            QueryCategories: [],
            QueryFields: [],
            QueryParameters: [],
            QueryPermissions: [],
            SQLDialects: [],
            QuerySQLs: [],
        } as ReturnType<typeof Metadata.Provider>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        provider.resetExecuteSQLState();
    });

    // ================================================================
    // findAndValidateQuery
    // ================================================================
    describe('findAndValidateQuery', () => {
        it('should find query by ID', () => {
            const query = makeQueryInfo({ ID: 'abc-123', Name: 'My Query' });
            provider.setMockQueries([query]);

            const result = provider.testFindAndValidateQuery({ QueryID: 'abc-123' });
            expect(result.ID).toBe('abc-123');
            expect(result.Name).toBe('My Query');
        });

        it('should find query by name', () => {
            const query = makeQueryInfo({ ID: 'abc-123', Name: 'My Query' });
            provider.setMockQueries([query]);

            const result = provider.testFindAndValidateQuery({ QueryName: 'My Query' });
            expect(result.Name).toBe('My Query');
        });

        it('should throw when query not found by ID', () => {
            provider.setMockQueries([]);

            expect(() => provider.testFindAndValidateQuery({ QueryID: 'nonexistent' }))
                .toThrow(/Query with ID 'nonexistent' not found/);
        });

        it('should throw when query not found by name', () => {
            provider.setMockQueries([]);

            expect(() => provider.testFindAndValidateQuery({ QueryName: 'Does Not Exist' }))
                .toThrow(/Query 'Does Not Exist' not found/);
        });

        it('should include category path in error message when provided', () => {
            provider.setMockQueries([]);

            expect(() => provider.testFindAndValidateQuery({
                QueryName: 'Missing',
                CategoryPath: '/Sales/'
            })).toThrow(/category path '\/Sales\/'/);
        });

        it('should throw when user lacks permission', () => {
            const query = makeQueryInfo({ ID: 'q-1' });
            query.UserHasRunPermissions = vi.fn().mockReturnValue(false);
            provider.setMockQueries([query]);

            expect(() => provider.testFindAndValidateQuery({ QueryID: 'q-1' }, mockUser))
                .toThrow(/does not have permission/);
        });
    });

    // ================================================================
    // applyQueryPagination
    // ================================================================
    describe('applyQueryPagination', () => {
        const testRows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

        it('should return all rows when no pagination params', () => {
            const { paginatedResult, totalRowCount } = provider.testApplyQueryPagination(
                testRows, {}
            );
            expect(paginatedResult).toHaveLength(10);
            expect(totalRowCount).toBe(10);
        });

        it('should apply MaxRows limit', () => {
            const { paginatedResult, totalRowCount } = provider.testApplyQueryPagination(
                testRows, { MaxRows: 3 }
            );
            expect(paginatedResult).toHaveLength(3);
            expect(paginatedResult[0]).toEqual({ id: 1 });
            expect(totalRowCount).toBe(10);
        });

        it('should apply StartRow offset', () => {
            const { paginatedResult, totalRowCount } = provider.testApplyQueryPagination(
                testRows, { StartRow: 5 }
            );
            expect(paginatedResult).toHaveLength(5);
            expect(paginatedResult[0]).toEqual({ id: 6 });
            expect(totalRowCount).toBe(10);
        });

        it('should apply both StartRow and MaxRows', () => {
            const { paginatedResult, totalRowCount } = provider.testApplyQueryPagination(
                testRows, { StartRow: 2, MaxRows: 3 }
            );
            expect(paginatedResult).toHaveLength(3);
            expect(paginatedResult[0]).toEqual({ id: 3 });
            expect(paginatedResult[2]).toEqual({ id: 5 });
            expect(totalRowCount).toBe(10);
        });

        it('should handle StartRow beyond data length', () => {
            const { paginatedResult, totalRowCount } = provider.testApplyQueryPagination(
                testRows, { StartRow: 100 }
            );
            expect(paginatedResult).toHaveLength(0);
            expect(totalRowCount).toBe(10);
        });

        it('should handle empty results', () => {
            const { paginatedResult, totalRowCount } = provider.testApplyQueryPagination(
                [], { MaxRows: 10 }
            );
            expect(paginatedResult).toHaveLength(0);
            expect(totalRowCount).toBe(0);
        });
    });

    // ================================================================
    // processQueryParameters
    // ================================================================
    describe('processQueryParameters', () => {
        it('should return plain SQL for non-template queries', () => {
            const query = makeQueryInfo({ SQL: 'SELECT * FROM Users', UsesTemplate: false });

            const { finalSQL, appliedParameters } = provider.testProcessQueryParameters(query);
            expect(finalSQL).toBe('SELECT * FROM Users');
            expect(appliedParameters).toEqual({});
        });

        it('should invoke composition resolution for queries with {{query:"..."}} tokens', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'Active Users',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID FROM Users WHERE Active = 1',
                Reusable: true,
            });

            const composingQuery = makeQueryInfo({
                ID: 'comp-1',
                Name: 'Report',
                SQL: 'SELECT * FROM {{query:"Test/Active Users"}} au',
                UsesTemplate: false
            });
            composingQuery.GetPlatformSQL = vi.fn().mockReturnValue(composingQuery.SQL);

            // Composition resolution uses Metadata.Provider.Queries
            vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
                Queries: [baseQuery],
                QueryDependencies: [],
                QueryCategories: [],
                QueryFields: [],
                QueryParameters: [],
                QueryPermissions: [],
                SQLDialects: [],
                QuerySQLs: [],
            } as ReturnType<typeof Metadata.Provider>);

            const { finalSQL } = provider.testProcessQueryParameters(composingQuery, undefined, mockUser);

            // The composition should resolve the token into a CTE
            expect(finalSQL).toContain('WITH');
            expect(finalSQL).toContain('SELECT ID FROM Users WHERE Active = 1');
            expect(finalSQL).not.toContain('{{query:');
        });
    });

    // ================================================================
    // InternalRunQuery
    // ================================================================
    describe('InternalRunQuery', () => {
        it('should execute a stored query end-to-end and return results', async () => {
            const query = makeQueryInfo({
                ID: 'q-1',
                Name: 'Simple Query',
                SQL: 'SELECT ID, Name FROM Users'
            });
            provider.setMockQueries([query]);
            provider.executeSQLResults = [[{ ID: '1', Name: 'Alice' }, { ID: '2', Name: 'Bob' }]];

            const result = await provider.testInternalRunQuery({ QueryID: 'q-1' }, mockUser);

            expect(result.Success).toBe(true);
            expect(result.QueryID).toBe('q-1');
            expect(result.QueryName).toBe('Simple Query');
            expect(result.Results).toHaveLength(2);
            expect(result.RowCount).toBe(2);
            expect(result.TotalRowCount).toBe(2);
            expect(result.ExecutionTime).toBeGreaterThanOrEqual(0);
        });

        it('should apply pagination to query results', async () => {
            const query = makeQueryInfo({ ID: 'q-1', Name: 'Paged Query', SQL: 'SELECT 1' });
            provider.setMockQueries([query]);

            // SQL-level paging: first call = data query (paged subset), second call = count query
            const pagedRows = [{ id: 6 }, { id: 7 }, { id: 8 }];
            const countResult = [{ TotalRowCount: 20 }];
            provider.executeSQLResults = [pagedRows, countResult];

            const result = await provider.testInternalRunQuery(
                { QueryID: 'q-1', StartRow: 5, MaxRows: 3 },
                mockUser
            );

            expect(result.Success).toBe(true);
            expect(result.RowCount).toBe(3);
            expect(result.TotalRowCount).toBe(20);
            expect(result.Results[0]).toEqual({ id: 6 });
        });

        it('should return error result when query not found', async () => {
            provider.setMockQueries([]);

            const result = await provider.testInternalRunQuery(
                { QueryID: 'nonexistent' },
                mockUser
            );

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not found');
            expect(result.Results).toHaveLength(0);
        });

        it('should return error result when ExecuteSQL throws', async () => {
            const query = makeQueryInfo({ ID: 'q-1', SQL: 'SELECT 1' });
            provider.setMockQueries([query]);

            // Override ExecuteSQL to throw
            vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('Connection failed'));

            const result = await provider.testInternalRunQuery({ QueryID: 'q-1' }, mockUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Connection failed');
        });

        it('should handle ad-hoc SQL queries', async () => {
            provider.executeSQLResults = [[{ val: 42 }]];

            const result = await provider.testInternalRunQuery(
                { SQL: 'SELECT 42 AS val' },
                mockUser
            );

            expect(result.Success).toBe(true);
            expect(result.QueryName).toBe('Ad-Hoc Query');
            expect(result.Results).toEqual([{ val: 42 }]);
        });

        it('should reject ad-hoc mutation SQL', async () => {
            const result = await provider.testInternalRunQuery(
                { SQL: 'DELETE FROM Users WHERE 1=1' },
                mockUser
            );

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBeTruthy();
        });
    });

    // ================================================================
    // InternalRunQueries (batch)
    // ================================================================
    describe('InternalRunQueries', () => {
        it('should execute multiple queries in parallel', async () => {
            const query1 = makeQueryInfo({ ID: 'q-1', Name: 'Query 1', SQL: 'SELECT 1' });
            const query2 = makeQueryInfo({ ID: 'q-2', Name: 'Query 2', SQL: 'SELECT 2' });
            provider.setMockQueries([query1, query2]);

            // Both execute in parallel — provide 2 result sets
            provider.executeSQLResults = [[{ val: 1 }], [{ val: 2 }]];

            const results = await provider.testInternalRunQueries(
                [{ QueryID: 'q-1' }, { QueryID: 'q-2' }],
                mockUser
            );

            expect(results).toHaveLength(2);
            expect(results[0].Success).toBe(true);
            expect(results[1].Success).toBe(true);
        });

        it('should handle mixed success and failure', async () => {
            const query1 = makeQueryInfo({ ID: 'q-1', SQL: 'SELECT 1' });
            provider.setMockQueries([query1]);

            provider.executeSQLResults = [[{ val: 1 }]];

            const results = await provider.testInternalRunQueries(
                [{ QueryID: 'q-1' }, { QueryID: 'nonexistent' }],
                mockUser
            );

            expect(results).toHaveLength(2);
            expect(results[0].Success).toBe(true);
            expect(results[1].Success).toBe(false);
            expect(results[1].ErrorMessage).toContain('not found');
        });
    });

    // ================================================================
    // auditQueryExecution
    // ================================================================
    describe('auditQueryExecution', () => {
        it('should not audit when AuditQueryRuns is false and ForceAuditLog is not set', () => {
            const query = makeQueryInfo({ AuditQueryRuns: false });
            const createAuditSpy = vi.spyOn(provider, 'CreateAuditLogRecord' as keyof TestPipelineProvider);

            provider.testAuditQueryExecution(query, {}, 'SELECT 1', 10, 10, 50, mockUser);

            expect(createAuditSpy).not.toHaveBeenCalled();
        });

        it('should audit when AuditQueryRuns is true', () => {
            const query = makeQueryInfo({ AuditQueryRuns: true });
            const createAuditSpy = vi.spyOn(provider, 'CreateAuditLogRecord' as keyof TestPipelineProvider)
                .mockResolvedValue(undefined);

            provider.testAuditQueryExecution(query, {}, 'SELECT 1', 10, 10, 50, mockUser);

            expect(createAuditSpy).toHaveBeenCalled();
        });

        it('should audit when ForceAuditLog is set', () => {
            const query = makeQueryInfo({ AuditQueryRuns: false });
            const createAuditSpy = vi.spyOn(provider, 'CreateAuditLogRecord' as keyof TestPipelineProvider)
                .mockResolvedValue(undefined);

            provider.testAuditQueryExecution(
                query,
                { ForceAuditLog: true },
                'SELECT 1', 10, 10, 50, mockUser
            );

            expect(createAuditSpy).toHaveBeenCalled();
        });
    });
});
