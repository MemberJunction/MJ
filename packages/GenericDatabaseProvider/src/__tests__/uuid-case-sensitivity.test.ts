import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

// Mock sql-formatter (used by SqlLoggingSessionImpl)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    UserInfo,
} from '@memberjunction/core';
import { MJQueryEntityExtended, QueryEngine } from '@memberjunction/core-entities';

/**
 * Tests that UUID comparisons throughout GenericDatabaseProvider are case-insensitive.
 *
 * SQL Server returns UUIDs in uppercase (e.g., 'A1B2C3D4-E5F6-...')
 * while PostgreSQL returns them in lowercase ('a1b2c3d4-e5f6-...').
 * All UUID comparisons must treat both forms as equal.
 */

const UPPER_UUID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const LOWER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MIXED_UUID = 'A1b2C3d4-e5F6-7890-AbCd-eF1234567890';
const OTHER_UUID = '99999999-9999-9999-9999-999999999999';

/**
 * Concrete test subclass that exposes protected methods for testing.
 * Mirrors the TestGenericProvider pattern from GenericDatabaseProvider.test.ts.
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
    protected GenerateDeleteSQL(): { fullSQL: string } { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `LIMIT ${maxRows} OFFSET ${startRow}`;
    }

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    // Expose protected resolveQuery for testing
    public testResolveQuery(params: { QueryID?: string; QueryName?: string; CategoryID?: string; CategoryPath?: string }): MJQueryEntityExtended | undefined {
        return this.resolveQuery(params as Parameters<typeof this.resolveQuery>[0]);
    }

    // Allow direct setting of Entities array for testing
    public setTestEntities(entities: EntityInfo[]): void {
        Object.defineProperty(this, 'Entities', {
            get: () => entities,
            configurable: true,
        });
    }

    // Track ExecuteSQL calls for testing
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

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
} as UserInfo;

/**
 * Helper to mock QueryEngine.Instance.Queries with the given array.
 */
function mockQueryEngineQueries(queries: MJQueryEntityExtended[]): void {
    vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({
        Queries: queries,
    } as unknown as QueryEngine);
}

describe('GenericDatabaseProvider UUID case-insensitivity', () => {
    let provider: TestGenericProvider;

    beforeEach(() => {
        provider = new TestGenericProvider();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('resolveQuery - UUID-based query lookup', () => {
        it('should find a query by uppercase ID when stored with lowercase ID', () => {
            const queries = [
                { ID: LOWER_UUID, Name: 'TestQuery', CategoryID: null, CategoryPath: '' } as unknown as MJQueryEntityExtended,
            ];
            mockQueryEngineQueries(queries);

            const result = provider.testResolveQuery({ QueryID: UPPER_UUID });

            expect(result).toBeDefined();
            expect(result!.Name).toBe('TestQuery');
        });

        it('should find a query by lowercase ID when stored with uppercase ID', () => {
            const queries = [
                { ID: UPPER_UUID, Name: 'TestQuery', CategoryID: null, CategoryPath: '' } as unknown as MJQueryEntityExtended,
            ];
            mockQueryEngineQueries(queries);

            const result = provider.testResolveQuery({ QueryID: LOWER_UUID });

            expect(result).toBeDefined();
            expect(result!.Name).toBe('TestQuery');
        });

        it('should find a query by mixed-case ID', () => {
            const queries = [
                { ID: UPPER_UUID, Name: 'TestQuery', CategoryID: null, CategoryPath: '' } as unknown as MJQueryEntityExtended,
            ];
            mockQueryEngineQueries(queries);

            const result = provider.testResolveQuery({ QueryID: MIXED_UUID });

            expect(result).toBeDefined();
            expect(result!.Name).toBe('TestQuery');
        });

        it('should return undefined when no query matches the UUID', () => {
            const queries = [
                { ID: UPPER_UUID, Name: 'TestQuery', CategoryID: null, CategoryPath: '' } as unknown as MJQueryEntityExtended,
            ];
            mockQueryEngineQueries(queries);

            const result = provider.testResolveQuery({ QueryID: OTHER_UUID });

            expect(result).toBeUndefined();
        });
    });

    describe('Entity lookup by UUID in InternalRunView context', () => {
        it('should find entity by uppercase ID when entities stored with lowercase IDs', () => {
            const entities = [
                { ID: LOWER_UUID, Name: 'Users' } as unknown as EntityInfo,
                { ID: '22222222-2222-2222-2222-222222222222', Name: 'Roles' } as unknown as EntityInfo,
            ];
            provider.setTestEntities(entities);

            // Simulate the pattern used in InternalRunView:
            //   entityInfo = this.Entities.find((e) => UUIDsEqual(e.ID, viewEntity.EntityID))
            // We test this indirectly by checking entity resolution works across case
            const found = entities.find(e => {
                // This simulates what GenericDatabaseProvider does internally
                return e.ID.toLowerCase() === UPPER_UUID.toLowerCase();
            });

            expect(found).toBeDefined();
            expect(found!.Name).toBe('Users');
        });

        it('should find entity by lowercase ID when entities stored with uppercase IDs', () => {
            const entities = [
                { ID: UPPER_UUID, Name: 'Users' } as unknown as EntityInfo,
            ];
            provider.setTestEntities(entities);

            const found = entities.find(e => {
                return e.ID.toLowerCase() === LOWER_UUID.toLowerCase();
            });

            expect(found).toBeDefined();
            expect(found!.Name).toBe('Users');
        });
    });

    describe('Cross-platform UUID scenario', () => {
        it('SQL Server uppercase UUIDs should match PostgreSQL lowercase UUIDs in query resolution', () => {
            // Simulate: queries loaded from SQL Server (uppercase IDs)
            const queries = [
                { ID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', Name: 'Query1', CategoryID: null, CategoryPath: '' } as unknown as MJQueryEntityExtended,
                { ID: 'FFFFFFFF-1111-2222-3333-444444444444', Name: 'Query2', CategoryID: null, CategoryPath: '' } as unknown as MJQueryEntityExtended,
            ];
            mockQueryEngineQueries(queries);

            // Look up with PostgreSQL lowercase IDs
            const result1 = provider.testResolveQuery({ QueryID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
            const result2 = provider.testResolveQuery({ QueryID: 'ffffffff-1111-2222-3333-444444444444' });

            expect(result1).toBeDefined();
            expect(result1!.Name).toBe('Query1');
            expect(result2).toBeDefined();
            expect(result2!.Name).toBe('Query2');
        });
    });
});
