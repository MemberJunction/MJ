import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import { SqlLoggingSessionImpl } from '../SqlLogger';

// Mock sql-formatter (used by SqlLoggingSessionImpl)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql, // passthrough for tests
}));
import {
    DatabaseProviderBase,
    SaveSQLResult,
    DeleteSQLResult,
    ExecuteSQLOptions,
    EntityInfo,
    EntityFieldInfo,
    EntityFieldTSType,
    UserInfo,
    BaseEntity,
    CompositeKey,
    EntitySaveOptions,
    EntityDeleteOptions,
    QueryInfo,
    QueryCategoryInfo,
} from '@memberjunction/core';
import type { ExecuteSQLBatchOptions } from '../GenericDatabaseProvider';

/**
 * Concrete test subclass that provides minimal implementations of all abstract methods.
 * This allows us to test GenericDatabaseProvider's concrete methods in isolation.
 */
class TestGenericProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestGenericProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestGenericProvider._defaultPattern; }

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

    // Expose protected virtual methods for testing
    public testBuildTopClause(maxRows: number): string { return this.BuildTopClause(maxRows); }
    public testBuildPaginationSQL(maxRows: number, startRow: number): string { return this.BuildPaginationSQL(maxRows, startRow); }
    public testBuildNonPaginatedLimitSQL(maxRows: number): string { return this.BuildNonPaginatedLimitSQL(maxRows); }
    public testTransformExternalSQLClause(clause: string, entityInfo: EntityInfo): string { return this.TransformExternalSQLClause(clause, entityInfo); }

    // Expose protected methods for testing
    public testEnqueueAfterSaveAIAction(params: { entityAIActionId: string; entityRecord: BaseEntity; actionId: string; modelId: string }, user: UserInfo): void {
        this.EnqueueAfterSaveAIAction(params, user);
    }

    public async testPostProcessRows(rows: Record<string, unknown>[], entityInfo: EntityInfo, user: UserInfo): Promise<Record<string, unknown>[]> {
        return this.PostProcessRows(rows, entityInfo, user);
    }

    public async testAdjustDatetimeFields(rows: Record<string, unknown>[], datetimeFields: EntityFieldInfo[], entityInfo: EntityInfo): Promise<Record<string, unknown>[]> {
        return this.AdjustDatetimeFields(rows, datetimeFields, entityInfo);
    }

    public async testRenderViewWhereClause(viewEntity: { WhereClause: string | null }, user: UserInfo, stack?: string[]): Promise<string> {
        // Cast to match expected type for testing
        return (this as GenericDatabaseProvider & { RenderViewWhereClause: (v: { WhereClause: string | null }, u: UserInfo, s?: string[]) => Promise<string> }).RenderViewWhereClause(viewEntity as Parameters<typeof this.testRenderViewWhereClause>[0], user, stack);
    }

    // Expose new protected methods for testing
    public testIsCacheCurrent(
        clientStatus: { maxUpdatedAt: string; rowCount: number },
        serverStatus: { maxUpdatedAt?: string; rowCount?: number },
    ): boolean {
        return this.isCacheCurrent(clientStatus, serverStatus);
    }

    public testBuildParameterPlaceholder(index: number): string {
        return this.BuildParameterPlaceholder(index);
    }

    public testResolveCategoryPath(categoryPath: string): string | null {
        return this.resolveCategoryPath(categoryPath);
    }

    public testGetColumnsForDatasetItem(item: Record<string, unknown>, datasetName: string): string | null {
        return this.getColumnsForDatasetItem(item, datasetName);
    }

    // Allow tests to override QueryCategories getter
    private _testQueryCategories: QueryCategoryInfo[] | null = null;
    public setQueryCategories(cats: QueryCategoryInfo[]): void {
        this._testQueryCategories = cats;
        // Override the getter using Object.defineProperty on the instance
        Object.defineProperty(this, 'QueryCategories', {
            get: () => this._testQueryCategories ?? [],
            configurable: true,
        });
    }

    // Track ExecuteSQL calls for Load testing
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
}

// Minimal mock user
const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
} as UserInfo;

describe('GenericDatabaseProvider', () => {
    let provider: TestGenericProvider;

    beforeEach(() => {
        provider = new TestGenericProvider();
    });

    describe('Inheritance', () => {
        it('extends DatabaseProviderBase', () => {
            expect(provider).toBeInstanceOf(DatabaseProviderBase);
        });

        it('extends GenericDatabaseProvider', () => {
            expect(provider).toBeInstanceOf(GenericDatabaseProvider);
        });
    });

    describe('EnqueueAfterSaveAIAction', () => {
        it('method exists on the provider', () => {
            // Verify the protected method is accessible via our test wrapper
            expect(typeof provider.testEnqueueAfterSaveAIAction).toBe('function');
        });
    });

    describe('PostProcessRows', () => {
        it('returns empty array for empty input', async () => {
            const entityInfo = { Fields: [] } as unknown as EntityInfo;
            const result = await provider.testPostProcessRows([], entityInfo, mockUser);
            expect(result).toEqual([]);
        });

        it('returns rows unchanged when no encrypted fields', async () => {
            const entityInfo = {
                Fields: [
                    { Name: 'ID', Encrypt: false, EncryptionKeyID: null },
                    { Name: 'Name', Encrypt: false, EncryptionKeyID: null },
                ],
            } as unknown as EntityInfo;
            const rows = [{ ID: '1', Name: 'Test' }];
            const result = await provider.testPostProcessRows(rows, entityInfo, mockUser);
            expect(result).toEqual([{ ID: '1', Name: 'Test' }]);
        });

        it('returns null input unchanged', async () => {
            const entityInfo = { Fields: [] } as unknown as EntityInfo;
            const result = await provider.testPostProcessRows(null as unknown as Record<string, unknown>[], entityInfo, mockUser);
            expect(result).toBeNull();
        });
    });

    describe('QuoteIdentifier / QuoteSchemaAndView (inherited)', () => {
        it('uses double quotes', () => {
            expect(provider.QuoteIdentifier('MyColumn')).toBe('"MyColumn"');
            expect(provider.QuoteSchemaAndView('__mj', 'vwUsers')).toBe('"__mj"."vwUsers"');
        });
    });

    describe('InternalRunView virtual hooks', () => {
        it('BuildTopClause returns empty by default', () => {
            expect(provider.testBuildTopClause(100)).toBe('');
        });

        it('BuildPaginationSQL returns LIMIT/OFFSET (test subclass)', () => {
            expect(provider.testBuildPaginationSQL(50, 10)).toBe('LIMIT 50 OFFSET 10');
        });

        it('BuildNonPaginatedLimitSQL returns empty by default', () => {
            expect(provider.testBuildNonPaginatedLimitSQL(100)).toBe('');
        });

        it('TransformExternalSQLClause returns clause unchanged by default', () => {
            const entityInfo = { Fields: [] } as unknown as EntityInfo;
            expect(provider.testTransformExternalSQLClause('Status = 1', entityInfo)).toBe('Status = 1');
        });

        it('TransformExternalSQLClause passes empty string through', () => {
            const entityInfo = { Fields: [] } as unknown as EntityInfo;
            expect(provider.testTransformExternalSQLClause('', entityInfo)).toBe('');
        });
    });

    describe('UUID / Default function patterns (inherited)', () => {
        it('matches gen_random_uuid()', () => {
            expect(provider.IsUUIDGenerationFunction('gen_random_uuid()')).toBe(true);
        });

        it('matches uuid_generate_v4()', () => {
            expect(provider.IsUUIDGenerationFunction('uuid_generate_v4()')).toBe(true);
        });

        it('does NOT match NEWID()', () => {
            expect(provider.IsUUIDGenerationFunction('NEWID()')).toBe(false);
        });

        it('matches now()', () => {
            expect(provider.IsNonUUIDDatabaseFunction('now()')).toBe(true);
        });

        it('matches CURRENT_TIMESTAMP()', () => {
            expect(provider.IsNonUUIDDatabaseFunction('CURRENT_TIMESTAMP()')).toBe(true);
        });
    });

    describe('isCacheCurrent', () => {
        it('returns true when maxUpdatedAt and rowCount match', () => {
            const timestamp = '2024-01-15T10:00:00.000Z';
            expect(provider.testIsCacheCurrent(
                { maxUpdatedAt: timestamp, rowCount: 42 },
                { maxUpdatedAt: timestamp, rowCount: 42 },
            )).toBe(true);
        });

        it('returns false when rowCount differs', () => {
            const timestamp = '2024-01-15T10:00:00.000Z';
            expect(provider.testIsCacheCurrent(
                { maxUpdatedAt: timestamp, rowCount: 42 },
                { maxUpdatedAt: timestamp, rowCount: 43 },
            )).toBe(false);
        });

        it('returns false when maxUpdatedAt differs', () => {
            expect(provider.testIsCacheCurrent(
                { maxUpdatedAt: '2024-01-15T10:00:00.000Z', rowCount: 42 },
                { maxUpdatedAt: '2024-01-15T11:00:00.000Z', rowCount: 42 },
            )).toBe(false);
        });

        it('returns true when server maxUpdatedAt is undefined but rowCount is 0 (empty table)', () => {
            expect(provider.testIsCacheCurrent(
                { maxUpdatedAt: '2024-01-15T10:00:00.000Z', rowCount: 0 },
                { maxUpdatedAt: undefined, rowCount: 0 },
            )).toBe(true);
        });

        it('returns false when server maxUpdatedAt is undefined but client has rows', () => {
            expect(provider.testIsCacheCurrent(
                { maxUpdatedAt: '2024-01-15T10:00:00.000Z', rowCount: 5 },
                { maxUpdatedAt: undefined, rowCount: 5 },
            )).toBe(false);
        });
    });

    describe('BuildParameterPlaceholder', () => {
        it('returns PG-style $N by default', () => {
            expect(provider.testBuildParameterPlaceholder(0)).toBe('$1');
            expect(provider.testBuildParameterPlaceholder(1)).toBe('$2');
            expect(provider.testBuildParameterPlaceholder(9)).toBe('$10');
        });
    });

    describe('resolveCategoryPath', () => {
        beforeEach(() => {
            provider.setQueryCategories([
                { ID: 'cat-1', Name: 'MJ', ParentID: null } as QueryCategoryInfo,
                { ID: 'cat-2', Name: 'AI', ParentID: 'cat-1' } as QueryCategoryInfo,
                { ID: 'cat-3', Name: 'Agents', ParentID: 'cat-2' } as QueryCategoryInfo,
            ]);
        });

        it('resolves a valid hierarchical path', () => {
            expect(provider.testResolveCategoryPath('/MJ/AI/Agents/')).toBe('cat-3');
        });

        it('resolves a path without leading/trailing slashes', () => {
            expect(provider.testResolveCategoryPath('MJ/AI')).toBe('cat-2');
        });

        it('returns null for non-existent path', () => {
            expect(provider.testResolveCategoryPath('/MJ/Unknown/')).toBeNull();
        });

        it('returns null for empty path', () => {
            expect(provider.testResolveCategoryPath('')).toBeNull();
        });

        it('returns null for path with only slashes', () => {
            expect(provider.testResolveCategoryPath('///')).toBeNull();
        });

        it('resolves case-insensitively', () => {
            expect(provider.testResolveCategoryPath('/mj/ai/agents/')).toBe('cat-3');
        });
    });

    describe('getColumnsForDatasetItem', () => {
        it('returns * when no Columns specified', () => {
            const result = provider.testGetColumnsForDatasetItem({ Columns: null }, 'TestDataset');
            expect(result).toBe('*');
        });

        it('returns * for empty string Columns', () => {
            const result = provider.testGetColumnsForDatasetItem({ Columns: '' }, 'TestDataset');
            expect(result).toBe('*');
        });

        it('quotes specified column names', () => {
            const result = provider.testGetColumnsForDatasetItem(
                { Columns: 'ID,Name,Email' },
                'TestDataset',
            );
            // TestGenericProvider uses double-quote style
            expect(result).toBe('"ID","Name","Email"');
        });

        it('trims whitespace from column names', () => {
            const result = provider.testGetColumnsForDatasetItem(
                { Columns: ' ID , Name , Email ' },
                'TestDataset',
            );
            expect(result).toBe('"ID","Name","Email"');
        });
    });

    describe('Load', () => {
        it('builds correct SELECT SQL with QuoteIdentifier', async () => {
            const entityInfo = {
                Name: 'TestEntity',
                SchemaName: 'dbo',
                BaseView: 'vwTestEntities',
                PrimaryKeys: [
                    { Name: 'ID', CodeName: 'ID', NeedsQuotes: true },
                ],
                Fields: [],
                RelatedEntities: [],
            } as unknown as EntityInfo;

            const entity = {
                EntityInfo: entityInfo,
                FirstPrimaryKey: entityInfo.PrimaryKeys[0],
            } as unknown as BaseEntity;

            const compositeKey = {
                KeyValuePairs: [{ FieldName: 'ID', Value: 'abc-123' }],
            } as CompositeKey;

            provider.executeSQLResults = [
                [{ ID: 'abc-123', Name: 'Test Record' }],
            ];

            const result = await provider.Load(entity, compositeKey, null, mockUser);

            expect(result).toEqual({ ID: 'abc-123', Name: 'Test Record' });
            expect(provider.executeSQLCalls.length).toBeGreaterThanOrEqual(1);
            const sql = provider.executeSQLCalls[0].sql;
            expect(sql).toContain('"dbo"."vwTestEntities"');
            expect(sql).toContain('"ID"');
        });

        it('returns null when no record found', async () => {
            const entityInfo = {
                Name: 'TestEntity',
                SchemaName: 'dbo',
                BaseView: 'vwTestEntities',
                PrimaryKeys: [
                    { Name: 'ID', CodeName: 'ID', NeedsQuotes: true },
                ],
                Fields: [],
                RelatedEntities: [],
            } as unknown as EntityInfo;

            const entity = {
                EntityInfo: entityInfo,
                FirstPrimaryKey: entityInfo.PrimaryKeys[0],
            } as unknown as BaseEntity;

            const compositeKey = {
                KeyValuePairs: [{ FieldName: 'ID', Value: 'not-found' }],
            } as CompositeKey;

            provider.executeSQLResults = [[]]; // Empty result

            const result = await provider.Load(entity, compositeKey, null, mockUser);
            expect(result).toBeNull();
        });

        it('trims char fields', async () => {
            const entityInfo = {
                Name: 'TestEntity',
                SchemaName: 'dbo',
                BaseView: 'vwTestEntities',
                PrimaryKeys: [
                    { Name: 'ID', CodeName: 'ID', NeedsQuotes: false },
                ],
                Fields: [
                    { Name: 'Code', TSType: EntityFieldTSType.String, Type: 'char' },
                    { Name: 'Name', TSType: EntityFieldTSType.String, Type: 'varchar' },
                ],
                RelatedEntities: [],
            } as unknown as EntityInfo;

            const entity = {
                EntityInfo: entityInfo,
                FirstPrimaryKey: entityInfo.PrimaryKeys[0],
            } as unknown as BaseEntity;

            const compositeKey = {
                KeyValuePairs: [{ FieldName: 'ID', Value: '1' }],
            } as CompositeKey;

            provider.executeSQLResults = [
                [{ ID: 1, Code: 'ABC   ', Name: 'Test   ' }],
            ];

            const result = await provider.Load(entity, compositeKey, null, mockUser) as Record<string, unknown>;
            expect(result.Code).toBe('ABC'); // trimmed
            expect(result.Name).toBe('Test   '); // varchar not trimmed
        });
    });

    describe('AdjustDatetimeFields (default no-op)', () => {
        it('returns rows unchanged by default', async () => {
            const now = new Date();
            const rows = [{ ID: '1', CreatedAt: now, Name: 'Test' }];
            const datetimeFields = [
                { Name: 'CreatedAt', TSType: EntityFieldTSType.Date, Type: 'timestamp' },
            ] as EntityFieldInfo[];
            const entityInfo = { Fields: datetimeFields } as unknown as EntityInfo;

            const result = await provider.testAdjustDatetimeFields(rows, datetimeFields, entityInfo);
            expect(result).toBe(rows); // Same reference — no-op returns unchanged
            expect(result[0].CreatedAt).toBe(now); // Exact same Date object
        });

        it('returns empty array unchanged', async () => {
            const result = await provider.testAdjustDatetimeFields([], [], {} as EntityInfo);
            expect(result).toEqual([]);
        });
    });

    describe('ExecuteSQLBatch', () => {
        it('executes multiple queries in parallel via ExecuteSQL', async () => {
            provider.executeSQLResults = [
                [{ ID: '1', Name: 'Alice' }],
                [{ ID: '2', Name: 'Bob' }],
                [{ ID: '3', Name: 'Charlie' }],
            ];

            const results = await provider.ExecuteSQLBatch(
                ['SELECT * FROM Users', 'SELECT * FROM Orders', 'SELECT * FROM Items'],
                undefined,
                undefined,
                mockUser,
            );

            expect(results).toHaveLength(3);
            expect(results[0]).toEqual([{ ID: '1', Name: 'Alice' }]);
            expect(results[1]).toEqual([{ ID: '2', Name: 'Bob' }]);
            expect(results[2]).toEqual([{ ID: '3', Name: 'Charlie' }]);
            expect(provider.executeSQLCalls).toHaveLength(3);
            expect(provider.executeSQLCalls[0].sql).toBe('SELECT * FROM Users');
            expect(provider.executeSQLCalls[1].sql).toBe('SELECT * FROM Orders');
            expect(provider.executeSQLCalls[2].sql).toBe('SELECT * FROM Items');
        });

        it('returns empty array for empty queries', async () => {
            const results = await provider.ExecuteSQLBatch([], undefined, undefined, mockUser);
            expect(results).toEqual([]);
            expect(provider.executeSQLCalls).toHaveLength(0);
        });

        it('passes parameters per query', async () => {
            provider.executeSQLResults = [
                [{ Count: 5 }],
                [{ Count: 10 }],
            ];

            const results = await provider.ExecuteSQLBatch(
                ['SELECT COUNT(*) AS Count FROM Users WHERE Status = $1', 'SELECT COUNT(*) AS Count FROM Orders WHERE Total > $1'],
                [['active'], [100]],
                undefined,
                mockUser,
            );

            expect(results).toHaveLength(2);
            expect(provider.executeSQLCalls[0].params).toEqual(['active']);
            expect(provider.executeSQLCalls[1].params).toEqual([100]);
        });

        it('passes options to individual ExecuteSQL calls', async () => {
            // Spy on ExecuteSQL to verify options are forwarded
            const execSpy = vi.spyOn(provider, 'ExecuteSQL');
            provider.executeSQLResults = [
                [{ ID: '1' }],
            ];

            await provider.ExecuteSQLBatch(
                ['SELECT 1'],
                undefined,
                { description: 'test batch', ignoreLogging: true, isMutation: false },
                mockUser,
            );

            expect(execSpy).toHaveBeenCalledWith(
                'SELECT 1',
                undefined,
                { description: 'test batch', ignoreLogging: true, isMutation: false },
                mockUser,
            );
        });

        it('handles single query batch', async () => {
            provider.executeSQLResults = [
                [{ ID: '1', Name: 'Only' }],
            ];

            const results = await provider.ExecuteSQLBatch(
                ['SELECT * FROM Users WHERE ID = 1'],
                undefined,
                undefined,
                mockUser,
            );

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual([{ ID: '1', Name: 'Only' }]);
        });
    });
});

// =====================================================================
// Tests for SqlLoggingSessionImpl (pure logic methods)
// =====================================================================
describe('SqlLoggingSessionImpl', () => {
    describe('constructor and properties', () => {
        it('should initialize with correct properties', () => {
            const session = new SqlLoggingSessionImpl('test-id', '/tmp/test.sql', {
                description: 'Test session',
            });
            expect(session.id).toBe('test-id');
            expect(session.filePath).toBe('/tmp/test.sql');
            expect(session.statementCount).toBe(0);
            expect(session.options.description).toBe('Test session');
            expect(session.startTime).toBeInstanceOf(Date);
        });
    });

    describe('_escapeFlywaySyntaxInStrings', () => {
        // Access private method for testing via prototype
        const escapeFlyway = (sql: string) => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
            return (session as Record<string, CallableFunction>)._escapeFlywaySyntaxInStrings(sql);
        };

        it('should escape ${...} patterns in SQL strings', () => {
            const input = "INSERT INTO T VALUES (N'${someVar}')";
            const result = escapeFlyway(input);
            expect(result).not.toContain('${someVar}');
            expect(result).toContain("$'+'{someVar}");
        });

        it('should handle multiple ${...} occurrences', () => {
            const input = "N'${a} and ${b}'";
            const result = escapeFlyway(input);
            expect(result).toContain("$'+'{a}");
            expect(result).toContain("$'+'{b}");
        });

        it('should return unchanged SQL when no ${...} patterns exist', () => {
            const input = "SELECT * FROM Users WHERE Name = 'John'";
            const result = escapeFlyway(input);
            expect(result).toBe(input);
        });
    });

    describe('_postProcessBeginEnd', () => {
        const postProcess = (sql: string) => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
            return (session as Record<string, CallableFunction>)._postProcessBeginEnd(sql);
        };

        it('should put BEGIN on its own line', () => {
            const input = 'IF 1=1 BEGIN SELECT 1 END';
            const result = postProcess(input);
            expect(result).toContain('1=1\nBEGIN');
        });

        it('should put END on its own line', () => {
            const input = 'SELECT 1 END';
            const result = postProcess(input);
            expect(result).toContain('1\nEND');
        });

        it('should put EXEC on its own line', () => {
            const input = 'DECLARE @x INT EXEC spFoo';
            const result = postProcess(input);
            expect(result).toContain('INT\nEXEC');
        });

        it('should handle empty or null input', () => {
            expect(postProcess('')).toBe('');
        });
    });
});
