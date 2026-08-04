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
import { MJQueryEntityExtended, MJQueryEntityEntity, MJQueryPermissionEntity, QueryEngine } from '@memberjunction/core-entities';

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
    QueryPermissions: MJQueryPermissionEntity[];
}>): MJQueryEntityExtended {
    const status = overrides.Status ?? 'Approved';
    const queryEntities = overrides.QueryEntities ?? [];
    const queryPermissions = overrides.QueryPermissions ?? [];

    const q: Record<string, unknown> = {
        ID: overrides.ID ?? 'q-1',
        Name: overrides.Name ?? 'Test Query',
        SQL: overrides.SQL ?? 'SELECT 1',
        Status: status,
        Reusable: false,
        UsesTemplate: false,
        CacheEnabled: false,
        AuditQueryRuns: false,
        UserHasRunPermissions: vi.fn().mockReturnValue(true),
        GetPlatformSQL: vi.fn().mockReturnValue(overrides.SQL ?? 'SELECT 1'),
        QueryParameters: [],
        QueryEntities: queryEntities,
        QueryPermissions: queryPermissions,
    };

    // UserCanRun mirrors the real implementation logic
    q.UserCanRun = vi.fn().mockImplementation((user: UserInfo) => {
        const hasRunPerms = (q.UserHasRunPermissions as ReturnType<typeof vi.fn>)(user);
        if (!hasRunPerms) {
            return { canRun: false, deniedEntities: [] };
        }

        const perms = q.QueryPermissions as MJQueryPermissionEntity[];
        if (perms && perms.length > 0) {
            return { canRun: true, deniedEntities: [] };
        }

        const entities = q.QueryEntities as MJQueryEntityEntity[];
        if (!entities || entities.length === 0) {
            return { canRun: true, deniedEntities: [] };
        }

        const deniedEntities: string[] = [];
        for (const qe of entities) {
            const entityInfo = provider.Entities.find(e => e.ID === qe.EntityID);
            if (!entityInfo) continue;
            const entityPerms = entityInfo.GetUserPermisions(user);
            if (!entityPerms || !entityPerms.CanRead) {
                deniedEntities.push(entityInfo.Name);
            }
        }
        return { canRun: deniedEntities.length === 0, deniedEntities };
    });

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

let provider: TestPermissionProvider;

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

function makePermissionRecord(role: string): MJQueryPermissionEntity {
    return { Role: role } as unknown as MJQueryPermissionEntity;
}

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
    UserRoles: [{ Role: 'Admin', RoleID: 'role-1' }],
} as unknown as UserInfo;

// ---- Tests ----

describe('Query Entity Permission Validation', () => {
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
    // UserCanRun — centralized permission check
    // ================================================================
    describe('UserCanRun', () => {
        it('should return canRun=true when user has read permission on all referenced entities', () => {
            const entity1 = makeEntityInfo('e-1', 'Users', true);
            const entity2 = makeEntityInfo('e-2', 'Orders', true);
            provider.setMockEntities([entity1, entity2]);

            const query = makeQueryInfo({
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-2'),
                ],
            });

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(true);
            expect(result.deniedEntities).toHaveLength(0);
        });

        it('should return denied entities when user lacks read permission', () => {
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

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(false);
            expect(result.deniedEntities).toContain('Salary Records');
        });

        it('should list all denied entities', () => {
            const entity1 = makeEntityInfo('e-1', 'Secret Plans', false);
            const entity2 = makeEntityInfo('e-2', 'Classified Data', false);
            const entity3 = makeEntityInfo('e-3', 'Public Info', true);
            provider.setMockEntities([entity1, entity2, entity3]);

            const query = makeQueryInfo({
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-2'),
                    makeQueryEntityRecord('e-3'),
                ],
            });

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(false);
            expect(result.deniedEntities).toContain('Secret Plans');
            expect(result.deniedEntities).toContain('Classified Data');
            expect(result.deniedEntities).not.toContain('Public Info');
        });

        it('should return canRun=true when no QueryEntity records exist (legacy)', () => {
            provider.setMockEntities([]);

            const query = makeQueryInfo({ QueryEntities: [] });

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(true);
        });

        it('should skip stale entity references that no longer exist in metadata', () => {
            const entity1 = makeEntityInfo('e-1', 'Users', true);
            provider.setMockEntities([entity1]);

            const query = makeQueryInfo({
                QueryEntities: [
                    makeQueryEntityRecord('e-1'),
                    makeQueryEntityRecord('e-stale'),
                ],
            });

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(true);
        });

        it('should treat null permissions as denied', () => {
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

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(false);
            expect(result.deniedEntities).toContain('Broken Permissions Entity');
        });

        it('should skip entity checks when explicit Query Permissions exist (stored-procedure semantics)', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
                QueryPermissions: [makePermissionRecord('Admin')],
            });

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(true);
            expect(result.deniedEntities).toHaveLength(0);
        });

        it('should return canRun=false when user lacks run permissions', () => {
            const query = makeQueryInfo({});
            query.UserHasRunPermissions = vi.fn().mockReturnValue(false);

            const result = query.UserCanRun(mockUser);
            expect(result.canRun).toBe(false);
        });
    });

    // ================================================================
    // ValidateQueryForExecution — delegates to UserCanRun
    // ================================================================
    describe('ValidateQueryForExecution', () => {
        it('should throw when user lacks entity read permission (no explicit query permissions)', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            expect(() => provider.testValidateQueryForExecution(query, mockUser))
                .toThrow(/does not have permission to run query/);
        });

        it('should include denied entities in error message', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            expect(() => provider.testValidateQueryForExecution(query, mockUser))
                .toThrow(/Restricted/);
        });

        it('should skip permission checks when no contextUser is provided and no CurrentUser', () => {
            const entity = makeEntityInfo('e-1', 'Restricted', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });

            expect(() => provider.testValidateQueryForExecution(query)).not.toThrow();
        });

        it('should throw run permission error when user lacks run permissions', () => {
            const entity = makeEntityInfo('e-1', 'Some Entity', false);
            provider.setMockEntities([entity]);

            const query = makeQueryInfo({
                QueryEntities: [makeQueryEntityRecord('e-1')],
            });
            query.UserHasRunPermissions = vi.fn().mockReturnValue(false);

            expect(() => provider.testValidateQueryForExecution(query, mockUser))
                .toThrow(/does not have permission to run query/);
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
