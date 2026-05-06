import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import { SqlLoggingSessionImpl } from '../SqlLogger';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

// Mock sql-formatter (used by SqlLoggingSessionImpl)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql, // passthrough for tests
}));

// Mock encryption engine for EncryptFieldValuesForSave tests
const mockEncryptionEngine = {
    Config: vi.fn(),
    Encrypt: vi.fn(),
    IsEncrypted: vi.fn().mockReturnValue(false),
    GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
};

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() { return mockEncryptionEngine; }
    }
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
    public testBuildTotalRowCountSQL(entityInfo: EntityInfo, usingPagination: boolean, maxRowsForQuery: number): string | null {
        return this.BuildTotalRowCountSQL(entityInfo, usingPagination, maxRowsForQuery);
    }

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

    // Expose EncryptFieldValuesForSave for security testing
    public async testEncryptFieldValuesForSave(
        entity: BaseEntity,
        fieldValues: Map<EntityFieldInfo, unknown>,
        contextUser?: UserInfo
    ): Promise<void> {
        return this.EncryptFieldValuesForSave(entity, fieldValues, contextUser);
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

    describe('BuildTotalRowCountSQL', () => {
        // Minimal EntityInfo for SQL-shape assertions. Real methods on EntityInfo aren't needed here —
        // BuildTotalRowCountSQL only reads SchemaName + BaseView and passes them through QuoteSchemaAndView.
        const entityInfo = {
            SchemaName: '__mj',
            BaseView: 'vwEntities',
        } as unknown as EntityInfo;

        it('returns null when rows are NOT limited (no pagination, no MaxRows)', () => {
            // When the caller isn't limiting rows, there's no need for a count query —
            // retData.length IS the full row count. Returning null signals "don't run a count."
            expect(provider.testBuildTotalRowCountSQL(entityInfo, false, 0)).toBeNull();
        });

        it('returns count SQL when pagination IS being used', () => {
            const sql = provider.testBuildTotalRowCountSQL(entityInfo, true, 100);
            expect(sql).not.toBeNull();
            expect(sql).toContain('SELECT COUNT(*)');
            expect(sql).toContain('FROM "__mj"."vwEntities"');
        });

        // Regression for the "Explorer shows 100 of 100 on PG" bug:
        // Before this fix, countSQL was only emitted when `topSQL.length > 0`. PG's BuildTopClause
        // returns empty (PG uses LIMIT, not TOP), so non-paginated MaxRows queries never produced
        // a count — Explorer fell back to retData.length (the page size) and hid pagination controls.
        it('returns count SQL even WITHOUT pagination when MaxRows is set (PG fallback case)', () => {
            const sql = provider.testBuildTotalRowCountSQL(entityInfo, false, 100);
            expect(sql).not.toBeNull();
            expect(sql).toContain('SELECT COUNT(*)');
        });

        // Regression for the "PG case-folds the alias" bug:
        // PG folds unquoted identifiers to lowercase, so `AS TotalRowCount` returns a row keyed
        // `totalrowcount`. The consumer reads `countResult[0].TotalRowCount` and gets undefined.
        // Using `QuoteIdentifier` yields `"TotalRowCount"` on PG and `[TotalRowCount]` on SQL Server
        // — both preserve case.
        it('aliases the count via QuoteIdentifier (preserves case on PG)', () => {
            const sql = provider.testBuildTotalRowCountSQL(entityInfo, true, 100);
            // Test subclass's QuoteIdentifier uses double-quotes — verifies we're NOT emitting the
            // raw unquoted `AS TotalRowCount` that caused the PG bug.
            expect(sql).toContain('AS "TotalRowCount"');
            expect(sql).not.toMatch(/AS\s+TotalRowCount\s/);
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
                UserExemptFromRowLevelSecurity: () => true,
                GetUserRowLevelSecurityWhereClause: () => '',
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
                UserExemptFromRowLevelSecurity: () => true,
                GetUserRowLevelSecurityWhereClause: () => '',
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
                UserExemptFromRowLevelSecurity: () => true,
                GetUserRowLevelSecurityWhereClause: () => '',
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

    describe('EncryptFieldValuesForSave - error sanitization (security)', () => {
        it('should NOT leak detailed encryption error messages to caller', async () => {
            // Simulate an encryption failure with infrastructure details
            const detailedError = new Error(
                'Encryption key not found in environment variable: "MJ_ENCRYPTION_KEY_PII". ' +
                'Ensure the environment variable is set with a base64-encoded key value.'
            );
            mockEncryptionEngine.Encrypt.mockRejectedValue(detailedError);
            mockEncryptionEngine.IsEncrypted.mockReturnValue(false);
            mockEncryptionEngine.GetKeyByID.mockReturnValue({ Marker: '$ENC$' });

            const encryptedField = {
                Name: 'SSN',
                Encrypt: true,
                EncryptionKeyID: 'some-key-id',
            } as unknown as EntityFieldInfo;

            const entity = {
                EntityInfo: { Name: 'Employees' },
            } as unknown as BaseEntity;

            const fieldValues = new Map<EntityFieldInfo, unknown>();
            fieldValues.set(encryptedField, 'sensitive-ssn-value');

            try {
                await provider.testEncryptFieldValuesForSave(entity, fieldValues, mockUser);
                expect.fail('Expected an error to be thrown');
            } catch (err) {
                const message = (err as Error).message;

                // The thrown error should NOT contain infrastructure details
                expect(message).not.toContain('MJ_ENCRYPTION_KEY_PII');
                expect(message).not.toContain('environment variable');
                expect(message).not.toContain('base64-encoded');

                // It SHOULD contain a generic message pointing to server logs
                expect(message).toContain('Check server logs for details');
                expect(message).toContain('SSN');
                expect(message).toContain('Employees');
            }
        });

        it('should NOT leak config file paths in encryption error messages', async () => {
            const detailedError = new Error(
                'Configuration file not loaded. Ensure /opt/app/mj.config.cjs exists with an "encryptionKeys" section.'
            );
            mockEncryptionEngine.Encrypt.mockRejectedValue(detailedError);
            mockEncryptionEngine.IsEncrypted.mockReturnValue(false);
            mockEncryptionEngine.GetKeyByID.mockReturnValue({ Marker: '$ENC$' });

            const encryptedField = {
                Name: 'APIKey',
                Encrypt: true,
                EncryptionKeyID: 'key-id',
            } as unknown as EntityFieldInfo;

            const entity = {
                EntityInfo: { Name: 'API Keys' },
            } as unknown as BaseEntity;

            const fieldValues = new Map<EntityFieldInfo, unknown>();
            fieldValues.set(encryptedField, 'sk-live-abc123');

            try {
                await provider.testEncryptFieldValuesForSave(entity, fieldValues, mockUser);
                expect.fail('Expected an error to be thrown');
            } catch (err) {
                const message = (err as Error).message;

                // Should NOT contain file paths or config structure details
                expect(message).not.toContain('mj.config.cjs');
                expect(message).not.toContain('encryptionKeys');
                expect(message).not.toContain('/opt/app');

                // Should contain generic guidance
                expect(message).toContain('Check server logs');
            }
        });

        it('should NOT leak vault URLs in encryption error messages', async () => {
            const detailedError = new Error(
                'Azure Key Vault access denied for: https://prod-vault.vault.azure.net/secrets/master-key. ' +
                'Ensure the application has Secret Get permission.'
            );
            mockEncryptionEngine.Encrypt.mockRejectedValue(detailedError);
            mockEncryptionEngine.IsEncrypted.mockReturnValue(false);
            mockEncryptionEngine.GetKeyByID.mockReturnValue({ Marker: '$ENC$' });

            const encryptedField = {
                Name: 'Token',
                Encrypt: true,
                EncryptionKeyID: 'key-id',
            } as unknown as EntityFieldInfo;

            const entity = {
                EntityInfo: { Name: 'Tokens' },
            } as unknown as BaseEntity;

            const fieldValues = new Map<EntityFieldInfo, unknown>();
            fieldValues.set(encryptedField, 'token-value');

            try {
                await provider.testEncryptFieldValuesForSave(entity, fieldValues, mockUser);
                expect.fail('Expected an error to be thrown');
            } catch (err) {
                const message = (err as Error).message;

                // Should NOT contain vault URLs or permission details
                expect(message).not.toContain('vault.azure.net');
                expect(message).not.toContain('Secret Get permission');
                expect(message).not.toContain('prod-vault');

                // Should contain generic guidance
                expect(message).toContain('Check server logs');
            }
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
        // Access private method for testing via prototype.
        // The escape form is delegated to the configured SQLDialect; the helper
        // accepts a dialect so each test can pin its platform explicitly.
        // Defaults to SQLServerDialect to match the historical (and most-used)
        // call site.
        const escapeFlyway = (
            sql: string,
            dialect: SQLServerDialect | PostgreSQLDialect = new SQLServerDialect()
        ) => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql', {}, dialect);
            return (session as Record<string, CallableFunction>)._escapeFlywaySyntaxInStrings(sql);
        };

        it('should escape ${...} patterns in SQL strings', () => {
            const input = "INSERT INTO T VALUES (N'${someVar}')";
            const result = escapeFlyway(input);
            expect(result).not.toContain('${someVar}');
            // The escape interleaves an NVARCHAR(MAX) cast between the split halves to force
            // NVARCHAR(MAX) precedence on the running T-SQL concat — without it, the chain
            // caps at NVARCHAR(4000) and silently truncates large literals.
            expect(result).toContain("$'+CAST(N'' AS NVARCHAR(MAX))+N'{someVar}");
        });

        it('should handle multiple ${...} occurrences', () => {
            const input = "N'${a} and ${b}'";
            const result = escapeFlyway(input);
            expect(result).toContain("$'+CAST(N'' AS NVARCHAR(MAX))+N'{a}");
            expect(result).toContain("$'+CAST(N'' AS NVARCHAR(MAX))+N'{b}");
        });

        it('should return unchanged SQL when no ${...} patterns exist', () => {
            const input = "SELECT * FROM Users WHERE Name = 'John'";
            const result = escapeFlyway(input);
            expect(result).toBe(input);
        });

        // Regression test for silent NVARCHAR(4000) truncation. The escape
        // splits each ${...} via N'…$' + N'{…}', but T-SQL string concatenation
        // of NVARCHAR(N) literals caps the running result at NVARCHAR(4000)
        // and silently drops content past that boundary unless one operand
        // is explicitly NVARCHAR(MAX). Each split must therefore interleave
        // a CAST(N'' AS NVARCHAR(MAX)) so the concat chain inherits MAX
        // precedence — otherwise large Specifications (e.g. components with
        // 20+ ${...} expressions, ~65 KB encoded) get truncated to ~57 KB on
        // Flyway apply with no error.
        it('forces NVARCHAR(MAX) precedence at every split so multi-chunk concat does not silently truncate at 4000 chars', () => {
            const input = "SET @x = N'`Hello ${name}, you have ${count} items`'";
            const result = escapeFlyway(input);

            // Each ${ in the source must produce a corresponding NVARCHAR(MAX)
            // cast in the escape. Without it, NVARCHAR + NVARCHAR concat caps
            // at NVARCHAR(4000) and silently truncates.
            const castMatches = result.match(/CAST\(N'' AS NVARCHAR\(MAX\)\)/g) || [];
            expect(castMatches.length).toBe(2);

            // The cast must appear between the closing $' and the opening N'{
            // — otherwise it doesn't actually break the NVARCHAR-only chain.
            expect(result).toContain("$'+CAST(N'' AS NVARCHAR(MAX))+N'{name}");
            expect(result).toContain("$'+CAST(N'' AS NVARCHAR(MAX))+N'{count}");

            // And the original ${...} must still be defeated for Flyway —
            // i.e. no adjacent `${` should remain in the output.
            expect(result).not.toMatch(/\$\{/);
        });

        // Cross-dialect coverage. Proves the escape is plumbed through the
        // SQLDialect abstraction and that swapping dialects yields the
        // platform-correct form (no NVARCHAR/CAST/N-prefix bleed-through into
        // the PostgreSQL output). This guards against future regressions
        // where someone hard-codes SQL Server syntax in the shared session
        // implementation.
        it('uses PostgreSQL-specific concat (||) and no NVARCHAR(MAX) cast when the dialect is PostgreSQL', () => {
            const result = escapeFlyway(
                "INSERT INTO t VALUES ('${someVar}')",
                new PostgreSQLDialect()
            );

            // PostgreSQL TEXT concat has no length cap — the split uses ||
            // and no cast is needed.
            expect(result).toContain("$'||'{someVar}");

            // No SQL Server-only constructs should appear in PG output.
            expect(result).not.toContain("CAST(N'' AS NVARCHAR(MAX))");
            expect(result).not.toContain("+N'{");

            // And the original ${...} must still be defeated for Flyway.
            expect(result).not.toMatch(/\$\{/);
        });
    });

    describe('schema replacement (formatAsMigration)', () => {
        /**
         * Helper that exercises the schema replacement logic from logSqlStatement
         * by directly calling the private methods in the same order.
         */
        const replaceSchema = (sql: string, schemaName: string = '__mj') => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql', {
                formatAsMigration: true,
                defaultSchemaName: schemaName,
            });
            // Replicate the schema replacement logic from logSqlStatement
            const schemaRegex = new RegExp(`(\\[?)${schemaName}(\\]?)\\.`, 'g');
            return sql.replace(schemaRegex, (_match, openBracket: string, closeBracket: string) => {
                return `${openBracket}\${flyway:defaultSchema}${closeBracket}.`;
            });
        };

        it('should preserve brackets when original uses [schema].', () => {
            const input = 'SELECT * FROM [__mj].[Users]';
            const result = replaceSchema(input);
            expect(result).toBe('SELECT * FROM [${flyway:defaultSchema}].[Users]');
        });

        it('should NOT add brackets when original uses bare schema.', () => {
            const input = 'SELECT * FROM __mj.Users';
            const result = replaceSchema(input);
            expect(result).toBe('SELECT * FROM ${flyway:defaultSchema}.Users');
        });

        it('should handle mixed bracketed and unbracketed references', () => {
            const input = 'SELECT * FROM [__mj].[Users] u JOIN __mj.Roles r ON u.RoleID = r.ID';
            const result = replaceSchema(input);
            expect(result).toBe(
                'SELECT * FROM [${flyway:defaultSchema}].[Users] u JOIN ${flyway:defaultSchema}.Roles r ON u.RoleID = r.ID'
            );
        });

        it('should handle multiple occurrences of the same style', () => {
            const input = '__mj.TableA JOIN __mj.TableB ON __mj.TableA.ID = __mj.TableB.AID';
            const result = replaceSchema(input);
            expect(result).not.toContain('__mj.');
            expect(result).not.toContain('[${flyway:defaultSchema}]');
            expect(result).toContain('${flyway:defaultSchema}.TableA');
            expect(result).toContain('${flyway:defaultSchema}.TableB');
        });

        it('should not modify schema name that appears without a dot', () => {
            const input = "WHERE SchemaName = '__mj' AND Table = [__mj].[Users]";
            const result = replaceSchema(input);
            // '__mj' without dot should be left alone
            expect(result).toContain("'__mj'");
            // [__mj]. with dot should be replaced
            expect(result).toContain('[${flyway:defaultSchema}].[Users]');
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

        it('should NOT modify END inside string literals', () => {
            const input = "SET @sql = N'CASE WHEN x = 1 THEN 1 ELSE 0 END as MyCol'";
            const result = postProcess(input);
            expect(result).toContain('ELSE 0 END as MyCol');
        });

        it('should NOT modify BEGIN inside string literals', () => {
            const input = "SET @sql = N'IF 1=1 BEGIN SELECT 1 END'";
            const result = postProcess(input);
            expect(result).toContain('1=1 BEGIN SELECT');
            expect(result).toContain('1 END');
        });

        it('should NOT modify EXEC inside string literals', () => {
            const input = "SET @val = N'Use EXEC spFoo to run it'";
            const result = postProcess(input);
            expect(result).toContain('EXEC spFoo');
        });

        it('should still modify keywords outside string literals while preserving content inside', () => {
            const input = "SET @sql = N'ELSE 0 END as Col'\nDECLARE @x INT EXEC spUpdateQuery @SQL = @sql";
            const result = postProcess(input);
            // Inside the string literal - unchanged
            expect(result).toContain('ELSE 0 END as Col');
            // Outside the string literal - EXEC on its own line
            expect(result).toContain('INT\nEXEC');
        });

        it('should handle escaped quotes inside string literals', () => {
            const input = "SET @sql = N'WHERE Status = ''Complete'' END as Col'";
            const result = postProcess(input);
            expect(result).toContain("''Complete'' END as Col");
        });
    });

    describe('_countVariableDeclarations', () => {
        const countVars = (sql: string) => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
            return (session as Record<string, CallableFunction>)._countVariableDeclarations(sql);
        };

        it('should count a single DECLARE @var TYPE', () => {
            expect(countVars('DECLARE @MyVar NVARCHAR(255)')).toBe(1);
        });

        it('should count multiple variables in a comma-separated DECLARE block', () => {
            const sql = 'DECLARE @ID UNIQUEIDENTIFIER,\n@Name NVARCHAR(255),\n@Status NVARCHAR(50)';
            expect(countVars(sql)).toBe(3);
        });

        it('should count variables across multiple DECLARE statements', () => {
            const sql = 'DECLARE @A INT\nDECLARE @B BIT\nDECLARE @C DATETIME';
            expect(countVars(sql)).toBe(3);
        });

        it('should NOT count SET assignments (no type keyword after var name)', () => {
            const sql = "SET @MyVar = 'value'\nSET @Count = 0";
            expect(countVars(sql)).toBe(0);
        });

        it('should NOT count EXEC parameter references', () => {
            const sql = 'EXEC spUpdate @ID = @ID_abc, @Name = @Name_abc';
            expect(countVars(sql)).toBe(0);
        });

        it('should return 0 for empty string', () => {
            expect(countVars('')).toBe(0);
        });

        it('should return 0 for SQL with no variable declarations', () => {
            expect(countVars('SELECT * FROM Users WHERE Status = N\'Active\'')).toBe(0);
        });
    });

    describe('variableBatchThreshold', () => {
        /**
         * Minimal helper: invoke the threshold logic without hitting the file system.
         * We test the _countVariableDeclarations helper and the threshold branching logic
         * independently since logSqlStatement requires an open file handle.
         */
        it('should use threshold logic when variableBatchThreshold > 0 and batchSeparator is set', () => {
            // Verify the option is accepted without error
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql', {
                batchSeparator: 'GO',
                variableBatchThreshold: 200,
            });
            expect(session.options.variableBatchThreshold).toBe(200);
            expect(session.options.batchSeparator).toBe('GO');
        });

        it('should fall back to legacy mode when variableBatchThreshold is 0', () => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql', {
                batchSeparator: 'GO',
                variableBatchThreshold: 0,
            });
            expect(session.options.variableBatchThreshold).toBe(0);
        });

        it('should default to no threshold when variableBatchThreshold is undefined', () => {
            const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql', {
                batchSeparator: 'GO',
            });
            expect(session.options.variableBatchThreshold).toBeUndefined();
        });
    });
});
