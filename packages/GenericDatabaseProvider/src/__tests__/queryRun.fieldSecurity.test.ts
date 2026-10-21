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
    RunQueryWithCacheCheckParams,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { MJQueryEntityExtended, MJQueryPermissionEntity, QueryEngine } from '@memberjunction/core-entities';
import { SystemUserID } from '../systemUser';

/**
 * Saved queries and ad-hoc SQL enforce entity and field-level security on the SQL that runs.
 *
 * - A saved query is checked against its rendered SQL (compositions and templates resolved): the
 *   entities it reads must be readable, and no column the user is denied may be referenced in any
 *   clause. A query with a role list (`MJ: Query Permissions`) is authorized by that list alone.
 * - A cache hit is authorized the same way, so a refused user is never served a warmed slot.
 * - Ad-hoc SQL run in-process reads only entity views the caller can read unscoped, unless the
 *   caller is the system user.
 */
class QueryFlsProvider extends GenericDatabaseProviderTestBase {
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

    private entities: EntityInfo[] = [];
    public SeedEntities(entities: EntityInfo[]): void { this.entities = entities; }
    public override get Entities(): EntityInfo[] { return this.entities; }

    private queries: MJQueryEntityExtended[] = [];
    public SeedQueries(queries: MJQueryEntityExtended[]): void { this.queries = queries; }
    protected override resolveQuery(params: RunQueryParams): MJQueryEntityExtended | undefined {
        return this.queries.find(q => q.ID === params.QueryID || q.Name === params.QueryName);
    }

    public readonly Executed: string[] = [];
    override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.Executed.push(sql);
        return [{ ID: 'p-1' }] as unknown as Array<T>;
    }

    public Run(params: RunQueryParams, user: UserInfo): Promise<RunQueryResult> {
        return this.InternalRunQuery(params, user);
    }
    public CacheAuthorization(params: RunQueryParams, user: UserInfo): QueryCacheAuthorization {
        return this.ResolveQueryCacheAuthorization(params, user);
    }
}

const PEOPLE_ID = 'E0000000-0000-0000-0000-0000000000A1';
const PAYROLL_ID = 'E0000000-0000-0000-0000-0000000000A2';
const PROJECTS_ID = 'E0000000-0000-0000-0000-0000000000A3';
const HR_ROLE = 'R0000000-0000-0000-0000-0000000000A1';
const STAFF_ROLE = 'R0000000-0000-0000-0000-0000000000A2';

function readPermission(entityId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map(r => ({ EntityID: entityId, RoleID: r, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }));
}

function fieldOpenTo(entityId: string, id: string, name: string, sequence: number, roles: string[] | null): Record<string, unknown> {
    const rules = (roles ?? []).map((roleId, i) => ({
        ID: `${id}-${i}`, EntityFieldID: id, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
    return { ID: id, EntityID: entityId, Sequence: sequence, Name: name, Type: 'nvarchar', IsPrimaryKey: name === 'ID', EntityFieldPermissions: rules };
}

/** People, with field security on: Salary is readable only by HR. Both roles read the entity. */
function peopleEntity(): EntityInfo {
    return new EntityInfo({
        ID: PEOPLE_ID, Name: 'People', SchemaName: '__mj', BaseTable: 'Person', BaseView: 'vwPeople',
        EnableFieldLevelSecurity: true,
        Permissions: readPermission(PEOPLE_ID, [HR_ROLE, STAFF_ROLE]),
        Fields: [
            fieldOpenTo(PEOPLE_ID, 'pf-id', 'ID', 1, null),
            fieldOpenTo(PEOPLE_ID, 'pf-name', 'Name', 2, [HR_ROLE, STAFF_ROLE]),
            fieldOpenTo(PEOPLE_ID, 'pf-salary', 'Salary', 3, [HR_ROLE]),
            fieldOpenTo(PEOPLE_ID, 'pf-dept', 'DepartmentID', 4, [HR_ROLE, STAFF_ROLE]),
        ],
    });
}

/** Payroll, readable only by HR; no field security. */
function payrollEntity(): EntityInfo {
    return new EntityInfo({
        ID: PAYROLL_ID, Name: 'Payroll', SchemaName: '__mj', BaseTable: 'Payroll', BaseView: 'vwPayroll',
        Permissions: readPermission(PAYROLL_ID, [HR_ROLE]),
        Fields: [fieldOpenTo(PAYROLL_ID, 'yf-id', 'ID', 1, null), fieldOpenTo(PAYROLL_ID, 'yf-amt', 'Amount', 2, null)],
    });
}

/** Projects, readable by everyone; no field security. */
function projectsEntity(): EntityInfo {
    return new EntityInfo({
        ID: PROJECTS_ID, Name: 'Projects', SchemaName: '__mj', BaseTable: 'Project', BaseView: 'vwProjects',
        Permissions: readPermission(PROJECTS_ID, [HR_ROLE, STAFF_ROLE]),
        Fields: [fieldOpenTo(PROJECTS_ID, 'jf-id', 'ID', 1, null), fieldOpenTo(PROJECTS_ID, 'jf-owner', 'OwnerID', 2, null)],
    });
}

function user(id: string, roleIds: string[]): UserInfo {
    return new UserInfo(undefined, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: roleIds.map(roleId => ({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })),
    });
}

const hr = user('A0000000-0000-0000-0000-0000000000A1', [HR_ROLE]);
const staff = user('A0000000-0000-0000-0000-0000000000A2', [STAFF_ROLE]);
const system = user(SystemUserID, [STAFF_ROLE]);

interface QuerySpec {
    ID: string;
    Name?: string;
    SQL: string;
    UsesTemplate?: boolean;
    PermissionRoles?: string[];
    Reusable?: boolean;
    CategoryPath?: string;
}

/** A real MJQueryEntityExtended whose metadata-backed members are fixed, so its own checks run. */
function makeQuery(spec: QuerySpec): MJQueryEntityExtended {
    const q = Object.create(MJQueryEntityExtended.prototype) as MJQueryEntityExtended;
    const permissions = (spec.PermissionRoles ?? []).map(r => ({ QueryID: spec.ID, Role: `Role-${r}` }) as unknown as MJQueryPermissionEntity);
    const own: Record<string, unknown> = {
        ID: spec.ID, Name: spec.Name ?? spec.ID, SQL: spec.SQL, Status: 'Approved', Reusable: spec.Reusable ?? false,
        UsesTemplate: spec.UsesTemplate ?? false, CacheEnabled: false, AuditQueryRuns: false, ExternalDataSourceID: null,
        CategoryID: null, CategoryPath: spec.CategoryPath ?? '', IsApproved: true,
        QueryPermissions: permissions, QueryEntities: [], QueryDependencies: [], QueryParameters: [], QueryFields: [],
    };
    for (const [key, value] of Object.entries(own)) {
        Object.defineProperty(q, key, { value, configurable: true });
    }
    Object.defineProperty(q, 'GetPlatformSQL', { value: () => spec.SQL, configurable: true });
    return q;
}

describe('saved queries enforce field-level security on the rendered SQL', () => {
    let provider: QueryFlsProvider;

    beforeEach(() => {
        provider = new QueryFlsProvider();
        provider.SeedEntities([peopleEntity(), payrollEntity(), projectsEntity()]);
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [] } as unknown as QueryEngine);
    });
    afterEach(() => vi.restoreAllMocks());

    async function runAs(sql: string, who: UserInfo, extra: Partial<QuerySpec> = {}, parameters?: Record<string, string>): Promise<RunQueryResult> {
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: sql, ...extra })]);
        return provider.Run({ QueryID: 'q-1', ...(parameters ? { Parameters: parameters } : {}) }, who);
    }

    const deniedShapes: Array<[string, string]> = [
        ['the select list', 'SELECT ID, Salary FROM vwPeople'],
        ['WHERE', 'SELECT ID, Name FROM vwPeople WHERE Salary > 100000'],
        ['ORDER BY', 'SELECT ID, Name FROM vwPeople ORDER BY Salary DESC'],
        ['a JOIN condition', 'SELECT p.ID FROM vwPeople p JOIN vwProjects j ON j.OwnerID = p.ID AND p.Salary > 5'],
        ['an aggregate', 'SELECT DepartmentID, SUM(Salary) AS Total FROM vwPeople GROUP BY DepartmentID'],
        ['HAVING', 'SELECT DepartmentID FROM vwPeople GROUP BY DepartmentID HAVING MAX(Salary) > 1'],
        ['a CTE that renames it', 'WITH x AS (SELECT ID, Salary AS S FROM vwPeople) SELECT ID, S FROM x'],
        ['SELECT *', 'SELECT * FROM vwPeople'],
        ['alias.*', 'SELECT p.* FROM vwPeople p'],
    ];

    for (const [where, sql] of deniedShapes) {
        it(`refuses a restricted user whose query reads a denied column in ${where}, without running it`, async () => {
            const result = await runAs(sql, staff);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toMatch(/does not have permission to run query/);
            expect(result.ErrorMessage).not.toMatch(/Salary/i);
            expect(provider.Executed).toEqual([]);
        });

        it(`lets an unrestricted user run the query that reads it in ${where}`, async () => {
            const result = await runAs(sql, hr);
            expect(result.Success).toBe(true);
            expect(provider.Executed.length).toBe(1);
        });
    }

    it('lets a restricted user run a query that reads only fields they may read', async () => {
        const result = await runAs('SELECT p.ID, p.Name FROM vwPeople p JOIN vwProjects j ON j.OwnerID = p.ID', staff);
        expect(result.Success).toBe(true);
    });

    it('lets a holder of the query role list run it whatever it reads', async () => {
        const result = await runAs('SELECT ID, Salary FROM vwPeople', staff, { PermissionRoles: [STAFF_ROLE] });
        expect(result.Success).toBe(true);
    });

    it('checks the entities the SQL reads even when the query declares none', async () => {
        const result = await runAs('SELECT ID, Amount FROM vwPayroll', staff);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Denied entities: Payroll/);
        expect(provider.Executed).toEqual([]);
    });

    it('checks an entity read only inside a subquery', async () => {
        const result = await runAs('SELECT ID FROM vwProjects WHERE OwnerID IN (SELECT ID FROM __mj.vwPayroll)', staff);
        expect(result.Success).toBe(false);
        expect((await runAs('SELECT ID FROM vwProjects WHERE OwnerID IN (SELECT ID FROM __mj.vwPayroll)', hr)).Success).toBe(true);
    });

    it('checks the column a template injects as an identifier, after rendering', async () => {
        const sql = 'SELECT ID, {{ col | sqlIdentifier }} FROM vwPeople';
        const denied = await runAs(sql, staff, { UsesTemplate: true }, { col: 'Salary' });
        expect(denied.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
        const allowed = await runAs(sql, staff, { UsesTemplate: true }, { col: 'Name' });
        expect(allowed.Success).toBe(true);
    });

    it('checks the fully composed SQL of a composition', async () => {
        const dependency = makeQuery({ ID: 'q-dep', Name: 'Pay', SQL: 'SELECT ID, Salary FROM vwPeople', Reusable: true, CategoryPath: '/HR/' });
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [dependency] } as unknown as QueryEngine);
        const result = await runAs('SELECT ID FROM {{query:"HR/Pay"}} p', staff);
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
        expect((await runAs('SELECT ID FROM {{query:"HR/Pay"}} p', hr)).Success).toBe(true);
    });

    it('does not authorize a cache hit for a user the run would refuse', () => {
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT ID, Salary FROM vwPeople' })]);
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, staff).authorized).toBe(false);
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, hr).authorized).toBe(true);
    });

    it('authorizes a cache hit against the rendering of that request\'s parameters', () => {
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT ID, {{ col | sqlIdentifier }} FROM vwPeople', UsesTemplate: true })]);
        expect(provider.CacheAuthorization({ QueryID: 'q-1', Parameters: { col: 'Salary' } }, staff).authorized).toBe(false);
        expect(provider.CacheAuthorization({ QueryID: 'q-1', Parameters: { col: 'Name' } }, staff).authorized).toBe(true);
    });

    it('refuses a refused user in a cache-checked batch, whatever their cache status', async () => {
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT ID, Salary FROM vwPeople' })]);
        const item: RunQueryWithCacheCheckParams = { params: { QueryID: 'q-1' }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1 } };
        const response = await provider.RunQueriesWithCacheCheck([item], staff);
        expect(response.results[0].status).toBe('error');
        expect(response.results[0].errorMessage).not.toMatch(/Salary/i);
    });
});

describe('ad-hoc SQL run in-process reads only what the caller may read unscoped', () => {
    let provider: QueryFlsProvider;

    beforeEach(() => {
        provider = new QueryFlsProvider();
        provider.SeedEntities([peopleEntity(), payrollEntity(), projectsEntity()]);
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
    });
    afterEach(() => vi.restoreAllMocks());

    it('refuses a caller denied a field on an entity the SQL reads, even for columns they may read', async () => {
        const result = await provider.Run({ SQL: 'SELECT ID, Name FROM vwPeople' }, staff);
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });

    it('refuses a caller who cannot read an entity the SQL reads', async () => {
        const result = await provider.Run({ SQL: 'SELECT ID FROM vwPayroll' }, staff);
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });

    it('refuses a base table', async () => {
        const result = await provider.Run({ SQL: 'SELECT ID FROM __mj.Project' }, hr);
        expect(result.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
    });

    it('lets a caller read entity views they may read unscoped', async () => {
        expect((await provider.Run({ SQL: 'SELECT ID FROM vwProjects' }, staff)).Success).toBe(true);
        expect((await provider.Run({ SQL: 'SELECT ID, Salary FROM vwPeople' }, hr)).Success).toBe(true);
    });

    it('lets the system user run its own SQL', async () => {
        const result = await provider.Run({ SQL: 'SELECT ID FROM __mj.Person' }, system);
        expect(result.Success).toBe(true);
    });
});
