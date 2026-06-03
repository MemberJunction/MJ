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
    EntityInfo,
    EntityUserPermissionInfo,
    RunQueryParams,
    RunQueryResult,
} from '@memberjunction/core';
import { MJQueryEntityExtended, MJQueryEntityEntity, QueryEngine } from '@memberjunction/core-entities';

// ---- Test subclass exposing protected methods ----

class TestPermissionProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestPermissionProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestPermissionProvider._defaultPattern; }

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
    private _mockQueries: MJQueryEntityExtended[] = [];
    public setMockQueries(queries: MJQueryEntityExtended[]): void {
        this._mockQueries = queries;
    }

    protected override resolveQuery(params: RunQueryParams): MJQueryEntityExtended | undefined {
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

    // ---- Mock Entities array ----
    private _mockEntities: EntityInfo[] = [];
    public setMockEntities(entities: EntityInfo[]): void {
        this._mockEntities = entities;
    }

    public override get Entities(): EntityInfo[] {
        return this._mockEntities;
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

    // ---- Expose protected methods for direct testing ----
    public testValidateQueryEntityPermissions(query: MJQueryEntityExtended, user: UserInfo): void {
        this.ValidateQueryEntityPermissions(query, user);
    }

    public testValidateQueryForExecution(query: MJQueryEntityExtended, contextUser?: UserInfo): void {
        this.ValidateQueryForExecution(query, contextUser);
    }

    public testInternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        return this.InternalRunQuery(params, contextUser);
    }
}

// ---- Helpers ----

function makeQueryInfo(overrides: Partial<{
    ID: string;
    Name: string;
    SQL: string;
    Status: string;
    QueryEntities: MJQueryEntityEntity[];
}>): MJQueryEntityExtended {
    const status = overrides.Status ?? 'Approved';
    const queryEntities = overrides.QueryEntities ?? [];

    const q: Record<string, unknown> = {
        ID: overrides.ID ?? 'q-1',
        Name: overrides.Name ?? 'Test Query',
        SQL: overrides.SQL ?? 'SELECT 1',
        Status: status,
        Reusable: false,
        UsesTemplate: false,
        CacheEnabled: false,
        AuditQueryRuns: false,
        UserCanRun: vi.fn().mockReturnValue(true),
        UserHasRunPermissions: vi.fn().mockReturnValue(true),
        GetPlatformSQL: vi.fn().mockReturnValue(overrides.SQL ?? 'SELECT 1'),
        QueryParameters: [],
        QueryEntities: queryEntities,
    };

    Object.defineProperty(q, 'CategoryPath', {
        get: () => '',
        configurable: true,
    });

    Object.defineProperty(q, 'IsApproved', {
        get: () => status === 'Approved',
        configurable: true,
    });

    return q as unknown as MJQueryEntityExtended;
}

function makeQueryEntityRecord(entityID: string): MJQueryEntityEntity {
    return {
        EntityID: entityID,
        QueryID: 'q-1',
    } as unknown as MJQueryEntityEntity;
}

function makeEntityInfo(id: string, name: string, canRead: boolean): EntityInfo {
    const permissions = new EntityUserPermissionInfo();
    permissions.CanRead = canRead;
    permissions.CanCreate = false;
    permissions.CanUpdate = false;
    permissions.CanDelete = false;

    return {
        ID: id,
        Name: name,
        GetUserPermisions: vi.fn().mockReturnValue(permissions),
        Permissions: [],
    } as unknown as EntityInfo;
}

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
    UserRoles: [{ Role: 'Admin', RoleID: 'role-1' }],
} as unknown as UserInfo;

// ---- Tests ----

describe('Query Entity Permission Validation', () => {
    let provider: TestPermissionProvider;

    beforeEach(() => {
        provider = new TestPermissionProvider();
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({
            Queries: [],
        } as unknown as QueryEngine);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        provider.resetExecuteSQLState();
    });

    // ================================================================
    // ValidateQueryEntityPermissions — direct unit tests
    // ================================================================
    describe('ValidateQueryEntityPermissions', () => {
        it('should pass when user has read permission on all referenced entities', () => {
            const entity1 = makeEntityInfo('e-1', 'Users', true);
            const entity2 = makeEntityInfo('e-2', 'Orders', true);
            provider.setMockEntities([entity1, entity2]);

            const query = makeQueryInfo({
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-2'),
                ],
            });

            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser)).not.toThrow();
            expect(entity1.GetUserPermisions).toHaveBeenCalledWith(mockUser);
            expect(entity2.GetUserPermisions).toHaveBeenCalledWith(mockUser);
        });

        it('should throw when user lacks read permission on a referenced entity', () => {
            const entity1 = makeEntityInfo('e-1', 'Users', true);
            const entity2 = makeEntityInfo('e-2', 'Salary Records', false);
            provider.setMockEntities([entity1, entity2]);

            const query = makeQueryInfo({
                Name: 'Salary Report',
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-2'),
                ],
            });

            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser))
                .toThrow(/Salary Records/);
        });

        it('should list all denied entities in the error message', () => {
            const entity1 = makeEntityInfo('e-1', 'Secret Plans', false);
            const entity2 = makeEntityInfo('e-2', 'Classified Data', false);
            const entity3 = makeEntityInfo('e-3', 'Public Info', true);
            provider.setMockEntities([entity1, entity2, entity3]);

            const query = makeQueryInfo({
                Name: 'Multi-Source Report',
                ID: 'q-multi',
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-2'),
                    makeQueryEntityRecord('e-3'),
                ],
            });

            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser))
                .toThrow(/Secret Plans, Classified Data/);
        });

        it('should include query name and ID in the error message', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                Name: 'My Report',
                ID: 'q-abc-123',
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser))
                .toThrow(/query 'My Report'.*\(ID: q-abc-123\)/);
        });

        it('should warn and allow execution when no QueryEntity records exist', () => {
            provider.setMockEntities([]);

            const query = makeQueryInfo({
                Name: 'Legacy Query',
                ID: 'q-legacy',
                QueryEntities: [],
            });

            // Should not throw — fails open for backwards compatibility
            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser)).not.toThrow();
        });

        it('should skip stale entity references that no longer exist in metadata', () => {
            // Only entity e-1 exists in metadata; e-stale does not
            const entity1 = makeEntityInfo('e-1', 'Users', true);
            provider.setMockEntities([entity1]);

            const query = makeQueryInfo({
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-stale'),
                ],
            });

            // Should not throw — stale reference is skipped
            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser)).not.toThrow();
        });

        it('should throw when GetUserPermisions returns null', () => {
            const entity = {
                ID: 'e-1',
                Name: 'Broken Permissions Entity',
                GetUserPermisions: vi.fn().mockReturnValue(null),
                Permissions: [],
            } as unknown as EntityInfo;
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser))
                .toThrow(/Broken Permissions Entity/);
        });

        it('should pass when QueryEntities is undefined', () => {
            provider.setMockEntities([]);

            const q: Record<string, unknown> = {
                ID: 'q-undef',
                Name: 'Undefined QE Query',
                SQL: 'SELECT 1',
                Status: 'Approved',
                UserHasRunPermissions: vi.fn().mockReturnValue(true),
                QueryParameters: [],
                QueryEntities: undefined,
            };
            Object.defineProperty(q, 'CategoryPath', { get: () => '', configurable: true });
            const query = q as unknown as MJQueryEntityExtended;

            expect(() => provider.testValidateQueryEntityPermissions(query, mockUser)).not.toThrow();
        });
    });

    // ================================================================
    // ValidateQueryForExecution — integration with entity permission check
    // ================================================================
    describe('ValidateQueryForExecution integration', () => {
        it('should call entity permission validation after run permission check', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            // User has run permission (UserHasRunPermissions returns true) but not entity read
            expect(() => provider.testValidateQueryForExecution(query, mockUser))
                .toThrow(/does not have read permission/);
        });

        it('should skip entity permission check when no contextUser is provided and no CurrentUser', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            // No user — both permission checks should be skipped
            expect(() => provider.testValidateQueryForExecution(query)).not.toThrow();
        });

        it('should throw run permission error before reaching entity permission check', () => {
            const entity = makeEntityInfo('e-1', 'Some Entity', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });
            // User lacks run permission
            query.UserHasRunPermissions = vi.fn().mockReturnValue(false);

            expect(() => provider.testValidateQueryForExecution(query, mockUser))
                .toThrow(/does not have permission to run query/);

            // Entity permission check should never be reached
            expect(entity.GetUserPermisions).not.toHaveBeenCalled();
        });
    });

    // ================================================================
    // InternalRunQuery — end-to-end with entity permissions
    // ================================================================
    describe('InternalRunQuery with entity permissions', () => {
        it('should return error when user lacks entity read permission', async () => {
            const entity = makeEntityInfo('e-1', 'Confidential', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                ID: 'q-1',
                Name: 'Confidential Report',
                SQL: 'SELECT * FROM Confidential',
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });
            provider.setMockQueries([query]);

            const result = await provider.testInternalRunQuery({ QueryID: 'q-1' }, mockUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Confidential');
            expect(result.ErrorMessage).toContain('read permission');
            expect(result.Results).toHaveLength(0);
        });

        it('should execute successfully when user has read permission on all entities', async () => {
            const entity = makeEntityInfo('e-1', 'Users', true);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                ID: 'q-1',
                Name: 'User Report',
                SQL: 'SELECT * FROM Users',
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });
            provider.setMockQueries([query]);
            provider.executeSQLResults = [[{ ID: '1', Name: 'Alice' }]];

            const result = await provider.testInternalRunQuery({ QueryID: 'q-1' }, mockUser);

            expect(result.Success).toBe(true);
            expect(result.Results).toHaveLength(1);
        });

        it('should execute successfully when query has no entity associations (legacy)', async () => {
            provider.setMockEntities([]);

            const query = makeQueryInfo({
                ID: 'q-legacy',
                Name: 'Legacy Query',
                SQL: 'SELECT 1',
                QueryEntities: [],
            });
            provider.setMockQueries([query]);
            provider.executeSQLResults = [[{ val: 1 }]];

            const result = await provider.testInternalRunQuery({ QueryID: 'q-legacy' }, mockUser);

            expect(result.Success).toBe(true);
            expect(result.Results).toHaveLength(1);
        });
    });
});
