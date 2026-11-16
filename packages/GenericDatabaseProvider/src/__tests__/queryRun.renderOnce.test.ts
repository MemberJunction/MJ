import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import {
    DatabasePlatform,
    DeleteSQLResult,
    EntityInfo,
    FieldPermissionAccess,
    Metadata,
    QueryCacheAuthorization,
    RunQueryParams,
    RunQueryResult,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { MJQueryEntityExtended, MJQueryPermissionEntity, QueryEngine } from '@memberjunction/core-entities';

/**
 * A saved query is rendered only when a check needs its rendering, and never twice for one run:
 *
 * - A query whose role list grants the user is authorized by that list alone, so authorizing a
 *   cache hit does not render it.
 * - A cache-checked item that will run anyway is checked on the rendering that runs, not on a
 *   separate one first. An item that may be answered "current" without running is still checked
 *   on its rendering before that answer.
 */
class RenderCountProvider extends GenericDatabaseProviderTestBase {
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

    private readonly entities: EntityInfo[] = [peopleEntity()];
    public override get Entities(): EntityInfo[] { return this.entities; }

    private queries: MJQueryEntityExtended[] = [];
    public SeedQueries(queries: MJQueryEntityExtended[]): void { this.queries = queries; }
    protected override resolveQuery(params: RunQueryParams): MJQueryEntityExtended | undefined {
        return this.queries.find(q => q.ID === params.QueryID);
    }

    public Renders = 0;
    protected override processQueryParameters(query: MJQueryEntityExtended, parameters?: Record<string, string>, contextUser?: UserInfo) {
        this.Renders++;
        return super.processQueryParameters(query, parameters, contextUser);
    }

    public readonly Executed: string[] = [];
    override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.Executed.push(sql);
        return [{ ID: 'p-1', MaxUpdatedAt: '2026-01-01T00:00:00.000Z', TotalRows: 1 }] as unknown as Array<T>;
    }

    public CacheAuthorization(params: RunQueryParams, user: UserInfo): QueryCacheAuthorization {
        return this.ResolveQueryCacheAuthorization(params, user);
    }
}

const PEOPLE_ID = 'E0000000-0000-0000-0000-0000000000C1';
const HR_ROLE = 'R0000000-0000-0000-0000-0000000000C1';
const STAFF_ROLE = 'R0000000-0000-0000-0000-0000000000C2';

function field(id: string, name: string, sequence: number, roles: string[]): Record<string, unknown> {
    const rules = roles.map((roleId, i) => ({
        ID: `${id}-${i}`, EntityFieldID: id, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
    return { ID: id, EntityID: PEOPLE_ID, Sequence: sequence, Name: name, Type: 'nvarchar', IsPrimaryKey: name === 'ID', EntityFieldPermissions: rules };
}

/** People, with Salary readable only by HR. */
function peopleEntity(): EntityInfo {
    return new EntityInfo({
        ID: PEOPLE_ID, Name: 'People', SchemaName: '__mj', BaseTable: 'Person', BaseView: 'vwPeople', EnableFieldLevelSecurity: true,
        Permissions: [HR_ROLE, STAFF_ROLE].map(r => ({ EntityID: PEOPLE_ID, RoleID: r, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false })),
        Fields: [field('pf-id', 'ID', 1, [HR_ROLE, STAFF_ROLE]), field('pf-name', 'Name', 2, [HR_ROLE, STAFF_ROLE]), field('pf-salary', 'Salary', 3, [HR_ROLE])],
    });
}

function user(id: string, roleIds: string[]): UserInfo {
    return new UserInfo(undefined, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: roleIds.map(roleId => ({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })),
    });
}

const staff = user('A0000000-0000-0000-0000-0000000000C2', [STAFF_ROLE]);

function makeQuery(id: string, sql: string, options: { PermissionRoles?: string[]; CacheValidationSQL?: string } = {}): MJQueryEntityExtended {
    const q = Object.create(MJQueryEntityExtended.prototype) as MJQueryEntityExtended;
    const permissions = (options.PermissionRoles ?? []).map(r => ({ QueryID: id, Role: `Role-${r}` }) as unknown as MJQueryPermissionEntity);
    const own: Record<string, unknown> = {
        ID: id, Name: id, SQL: sql, Status: 'Approved', Reusable: false, UsesTemplate: false, CacheEnabled: false, AuditQueryRuns: false,
        ExternalDataSourceID: null, CategoryID: null, CategoryPath: '', IsApproved: true, CacheValidationSQL: options.CacheValidationSQL ?? null,
        QueryPermissions: permissions, QueryEntities: [], QueryDependencies: [], QueryParameters: [], QueryFields: [],
    };
    for (const [key, value] of Object.entries(own)) {
        Object.defineProperty(q, key, { value, configurable: true });
    }
    Object.defineProperty(q, 'GetPlatformSQL', { value: () => sql, configurable: true });
    return q;
}

describe('saved queries are rendered once per check that needs it', () => {
    let provider: RenderCountProvider;

    beforeEach(() => {
        provider = new RenderCountProvider();
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [], QuerySQLs: [], Dependencies: [], GetDefinitionSignature: () => undefined } as unknown as QueryEngine);
    });
    afterEach(() => vi.restoreAllMocks());

    it('authorizes a cache hit for a role-list holder without rendering the query', () => {
        provider.SeedQueries([makeQuery('q-1', 'SELECT ID, Salary FROM vwPeople', { PermissionRoles: [STAFF_ROLE] })]);
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, staff).authorized).toBe(true);
        expect(provider.Renders).toBe(0);
    });

    it('still renders and checks a cache hit when no role list grants the query', () => {
        provider.SeedQueries([makeQuery('q-1', 'SELECT ID, Salary FROM vwPeople')]);
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, staff).authorized).toBe(false);
        expect(provider.Renders).toBe(1);
    });

    it('renders a cache-checked item that will run once, on the rendering that runs', async () => {
        provider.SeedQueries([makeQuery('q-1', 'SELECT ID, Name FROM vwPeople')]);
        const response = await provider.RunQueriesWithCacheCheck([{ params: { QueryID: 'q-1' } }], staff);
        expect(response.results[0].status).toBe('stale');
        expect(provider.Renders).toBe(1);
    });

    it('still refuses such an item on its rendering, without running it', async () => {
        provider.SeedQueries([makeQuery('q-1', 'SELECT ID, Salary FROM vwPeople')]);
        const response = await provider.RunQueriesWithCacheCheck([{ params: { QueryID: 'q-1' } }], staff);
        expect(response.results[0].status).toBe('error');
        expect(response.results[0].errorMessage).not.toMatch(/Salary/i);
        expect(provider.Executed).toEqual([]);
    });

    it('checks the rendering of an item that may be answered "current" before answering', async () => {
        provider.SeedQueries([makeQuery('q-1', 'SELECT ID, Salary FROM vwPeople', { CacheValidationSQL: 'SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt FROM vwPeople' })]);
        const item = { params: { QueryID: 'q-1' }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1 } };
        const response = await provider.RunQueriesWithCacheCheck([item], staff);
        expect(response.results[0].status).toBe('error');
        expect(provider.Executed).toEqual([]);
    });
});
