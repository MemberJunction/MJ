import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import {
    DatabasePlatform,
    DeleteSQLResult,
    EntityInfo,
    Metadata,
    QueryExecutionSpec,
    RunQueryParams,
    RunQueryResult,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { SystemUserID } from '../systemUser';

/**
 * Caller-supplied SQL is checked on the statement that runs:
 *
 * - The spec path (`ExecuteQueryFromSpec`, behind TestQuerySQL) checks the rendering it executes,
 *   so a check made on a separate rendering elsewhere cannot be the only one.
 * - A run with no user is refused rather than run as the provider's own user, which on a server
 *   is the system user. An explicit system user still runs its own SQL.
 */
class SpecProvider extends GenericDatabaseProviderTestBase {
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

    private readonly entities: EntityInfo[] = [projectsEntity()];
    public override get Entities(): EntityInfo[] { return this.entities; }
    /** As on MJAPI: the provider's own user is the system user. */
    public override get CurrentUser(): UserInfo { return system; }

    public readonly Executed: string[] = [];
    override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.Executed.push(sql);
        return [{ ID: 'p-1' }] as unknown as Array<T>;
    }

    public RunSpec(spec: QueryExecutionSpec, user?: UserInfo): Promise<RunQueryResult> {
        return this.InternalExecuteQueryFromSpec(spec, user);
    }
    public RunAdhoc(params: RunQueryParams, user?: UserInfo): Promise<RunQueryResult> {
        return this.InternalRunQuery(params, user);
    }
}

const PROJECTS_ID = 'E0000000-0000-0000-0000-0000000000B3';
const STAFF_ROLE = 'R0000000-0000-0000-0000-0000000000B2';

function projectsEntity(): EntityInfo {
    return new EntityInfo({
        ID: PROJECTS_ID, Name: 'Projects', SchemaName: '__mj', BaseTable: 'Project', BaseView: 'vwProjects',
        Permissions: [{ EntityID: PROJECTS_ID, RoleID: STAFF_ROLE, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }],
        Fields: [{ ID: 'jf-id', EntityID: PROJECTS_ID, Sequence: 1, Name: 'ID', Type: 'nvarchar', IsPrimaryKey: true }],
    });
}

function user(id: string, roleIds: string[]): UserInfo {
    return new UserInfo(undefined, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: roleIds.map(roleId => ({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })),
    });
}

const staff = user('A0000000-0000-0000-0000-0000000000B2', [STAFF_ROLE]);
const system = user(SystemUserID, [STAFF_ROLE]);

describe('ExecuteQueryFromSpec checks the SQL it executes', () => {
    let provider: SpecProvider;

    beforeEach(() => {
        provider = new SpecProvider();
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
    });
    afterEach(() => vi.restoreAllMocks());

    it('refuses a caller whose SQL reads a base table, without running it', async () => {
        const result = await provider.RunSpec({ SQL: 'SELECT ID FROM __mj.Project', MaxRows: 10 }, staff);
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });

    it('refuses a table a template renders, checked after rendering', async () => {
        const spec: QueryExecutionSpec = { SQL: 'SELECT ID FROM __mj.{{ t | sqlIdentifier }}', UsesTemplate: true, Parameters: { t: 'Project' }, MaxRows: 10 };
        const result = await provider.RunSpec(spec, staff);
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });

    it('refuses a template that would render differently each time', async () => {
        const spec: QueryExecutionSpec = { SQL: 'SELECT ID FROM {{ ["__mj.vwProjects", "__mj.Project"] | random }}', UsesTemplate: true, MaxRows: 10 };
        for (let i = 0; i < 20; i++) {
            expect((await provider.RunSpec(spec, staff)).Success).toBe(false);
        }
        expect(provider.Executed).toEqual([]);
    });

    it('runs SQL that reads only entity views the caller may read', async () => {
        const result = await provider.RunSpec({ SQL: 'SELECT ID FROM __mj.vwProjects', MaxRows: 10 }, staff);
        expect(result.Success).toBe(true);
        expect(provider.Executed).toHaveLength(1);
    });

    it('lets the system user run its own SQL', async () => {
        const result = await provider.RunSpec({ SQL: 'SELECT ID FROM __mj.Project', MaxRows: 10 }, system);
        expect(result.Success).toBe(true);
    });

    it('refuses a run with no user instead of running it as the provider\'s own user', async () => {
        const result = await provider.RunSpec({ SQL: 'SELECT ID FROM __mj.Project', MaxRows: 10 });
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });
});

describe('ad-hoc SQL with no user is refused', () => {
    afterEach(() => vi.restoreAllMocks());

    it('refuses a run with no user instead of running it as the provider\'s own user', async () => {
        const provider = new SpecProvider();
        const result = await provider.RunAdhoc({ SQL: 'SELECT ID FROM __mj.Project' });
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });

    it('runs the same SQL for an explicit system user', async () => {
        const provider = new SpecProvider();
        const result = await provider.RunAdhoc({ SQL: 'SELECT ID FROM __mj.Project' }, system);
        expect(result.Success).toBe(true);
    });
});
