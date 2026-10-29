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
import { DescribeStatementFailure, DescribeStatementSuccess, type DescribeStatementResult } from '../describeStatement';

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
    /** The rows every statement returns. */
    public Rows: Record<string, unknown>[] = [{ ID: 'p-1' }];
    override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.Executed.push(sql);
        return this.Rows as unknown as Array<T>;
    }

    /** What DescribeStatement reports: output name → source view column (null: no source); null: the describe fails. */
    public Description: Array<[string, string | null]> | null = null;
    public readonly Described: string[] = [];
    public override async DescribeStatement(sql: string): Promise<DescribeStatementResult> {
        this.Described.push(sql);
        if (!this.Description) return DescribeStatementFailure('Invalid object name');
        return DescribeStatementSuccess(this.Description.map(([Name, column], i) => ({
            Name, Ordinal: i + 1, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)', IsNullable: true, IsComputed: column === null,
            Source: column === null ? null : { Schema: '__mj', Object: column.split('.')[0], Column: column.split('.')[1] },
        })));
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
        CategoryID: null, CategoryPath: spec.CategoryPath ?? '', IsApproved: true, CacheValidationSQL: null,
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
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [], QuerySQLs: [], Dependencies: [] } as unknown as QueryEngine);
    });
    afterEach(() => vi.restoreAllMocks());

    async function runAs(
        sql: string, who: UserInfo, extra: Partial<QuerySpec> = {}, parameters?: Record<string, string>, paging: Partial<RunQueryParams> = {},
    ): Promise<RunQueryResult> {
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: sql, ...extra })]);
        return provider.Run({ QueryID: 'q-1', ...(parameters ? { Parameters: parameters } : {}), ...paging }, who);
    }

    /** The refusal for the query `runAs` seeds: worded as if it did not exist (DISCUSSION Topic 3e item 1). */
    const UNAVAILABLE = "Query 'q-1' does not exist or you do not have permission to run it.";

    const deniedShapes: Array<[string, string]> = [
        ['the select list', 'SELECT ID, Salary FROM vwPeople'],
        ['WHERE', 'SELECT ID, Name FROM vwPeople WHERE Salary > 100000'],
        ['ORDER BY', 'SELECT ID, Name FROM vwPeople ORDER BY Salary DESC'],
        ['a JOIN condition', 'SELECT p.ID FROM vwPeople p JOIN vwProjects j ON j.OwnerID = p.ID AND p.Salary > 5'],
        ['an aggregate', 'SELECT DepartmentID, SUM(Salary) AS Total FROM vwPeople GROUP BY DepartmentID'],
        ['HAVING', 'SELECT DepartmentID FROM vwPeople GROUP BY DepartmentID HAVING MAX(Salary) > 1'],
        ['a CTE that renames it', 'WITH x AS (SELECT ID, Salary AS S FROM vwPeople) SELECT ID, S FROM x'],
        ['a WHERE beside a star', 'SELECT * FROM vwPeople WHERE Salary > 100000'],
        ['the outer query of a star CTE', 'WITH x AS (SELECT * FROM vwPeople) SELECT ID FROM x WHERE x.Salary > 1'],
    ];

    for (const [where, sql] of deniedShapes) {
        it(`refuses a restricted user whose query names a denied column in ${where}, without running it`, async () => {
            const result = await runAs(sql, staff);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe(UNAVAILABLE);
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
        expect(provider.Executed).toEqual([]);
    });

    // The refusal does not list "Denied entities" (DISCUSSION §6, 2026-10-27; Topic 3e item 5). TEST-INVENTORY F2.
    // Inverted from the assertion `toMatch(/Denied entities: Payroll/)` that used to sit in the test above.
    it('refuses a query reading an entity the user cannot read without naming that entity', async () => {
        const result = await runAs('SELECT ID, Amount FROM vwPayroll', staff);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).not.toMatch(/Denied entities/);
        expect(result.ErrorMessage).not.toMatch(/Payroll/);
    });

    // F1: a refusal and a not-found are byte-identical for each request form, because the message echoes only
    // the identifier the caller supplied — never the resolved query's name, which a request by ID did not
    // name and may not be allowed to see (DISCUSSION Topic 3e item 1; non-disclosure posture). TEST-INVENTORY F1.
    const BY_NAME = "Query 'Payroll Report' does not exist or you do not have permission to run it.";
    const BY_PATH = "Query 'HR/Reports/Payroll Report' does not exist or you do not have permission to run it.";
    const BY_ID = "Query 'q-1' does not exist or you do not have permission to run it.";

    function seedPayrollReport(sql: string): void {
        provider.SeedQueries([makeQuery({ ID: 'q-1', Name: 'Payroll Report', SQL: sql })]);
    }

    it('refuses a denied query asked for by name with the not-found message for that name', async () => {
        seedPayrollReport('SELECT ID, Amount FROM vwPayroll');
        const result = await provider.Run({ QueryName: 'Payroll Report' }, staff);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(BY_NAME);
    });

    it('refuses a query that does not exist, asked for by name, with the same message as a denied one', async () => {
        provider.SeedQueries([]);
        const result = await provider.Run({ QueryName: 'Payroll Report' }, staff);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(BY_NAME);
    });

    it('refuses a denied query asked for by ID with the not-found message for that ID, never naming the query', async () => {
        seedPayrollReport('SELECT ID, Salary FROM vwPeople');
        const result = await provider.Run({ QueryID: 'q-1' }, staff);
        expect(result.ErrorMessage).toBe(BY_ID);
        expect(result.ErrorMessage).not.toMatch(/Payroll Report/);
        provider.SeedQueries([]);
        expect((await provider.Run({ QueryID: 'q-1' }, staff)).ErrorMessage).toBe(BY_ID);
    });

    it('echoes the category path and name a request supplied, for a denied query and a missing one alike', async () => {
        seedPayrollReport('SELECT ID, Salary FROM vwPeople');
        expect((await provider.Run({ QueryName: 'Payroll Report', CategoryPath: '/HR/Reports/' }, staff)).ErrorMessage).toBe(BY_PATH);
        provider.SeedQueries([]);
        expect((await provider.Run({ QueryName: 'Payroll Report', CategoryPath: '/HR/Reports/' }, staff)).ErrorMessage).toBe(BY_PATH);
    });

    it('refuses a cache-checked batch item with the identifier that item supplied', async () => {
        seedPayrollReport('SELECT ID, Salary FROM vwPeople');
        const denied: RunQueryWithCacheCheckParams = { params: { QueryID: 'q-1' }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1 } };
        const missing: RunQueryWithCacheCheckParams = { params: { QueryID: 'q-missing' } };
        const response = await provider.RunQueriesWithCacheCheck([denied, missing], staff);
        expect(response.results.map(r => r.errorMessage)).toEqual([BY_ID, "Query 'q-missing' does not exist or you do not have permission to run it."]);
    });

    // ── A denied field reaching the output only through a plain `*` / `alias.*` (DISCUSSION Topic 3e item 2) ──

    const PERSON_ROW = { ID: 'p-1', Name: 'Ada', Salary: 250000, DepartmentID: 'd-1' };
    const PERSON_COLUMNS: Array<[string, string | null]> = [['ID', 'vwPeople.ID'], ['Name', 'vwPeople.Name'], ['Salary', 'vwPeople.Salary'], ['DepartmentID', 'vwPeople.DepartmentID']];

    const starShapes: Array<[string, string]> = [
        ['SELECT *', 'SELECT * FROM vwPeople'],
        ['alias.*', 'SELECT p.* FROM vwPeople p'],
        ['a star beside named columns', 'SELECT p.*, j.ID AS ProjectID FROM vwPeople p JOIN vwProjects j ON j.OwnerID = p.ID'],
        ['a star through a CTE', 'WITH x AS (SELECT * FROM vwPeople) SELECT * FROM x'],
        ['a star through a derived table', 'SELECT d.* FROM (SELECT * FROM vwPeople) d WHERE d.Name IS NOT NULL'],
    ];

    for (const [shape, sql] of starShapes) {
        it(`runs ${shape} for a restricted user and drops the denied column, silently`, async () => {
            provider.Rows = [{ ...PERSON_ROW }];
            provider.Description = PERSON_COLUMNS;
            const result = await runAs(sql, staff);
            expect(result.Success).toBe(true);
            expect(result.Results).toEqual([{ ID: 'p-1', Name: 'Ada', DepartmentID: 'd-1' }]);
            expect(JSON.stringify(result)).not.toMatch(/Salary|250000/);
            expect(provider.Executed.length).toBe(1);
        });
    }

    it('returns every column of a star to an unrestricted user, without describing the statement', async () => {
        provider.Rows = [{ ...PERSON_ROW }];
        provider.Description = PERSON_COLUMNS;
        const result = await runAs('SELECT * FROM vwPeople', hr);
        expect(result.Results).toEqual([PERSON_ROW]);
        expect(provider.Described).toEqual([]);
    });

    it('describes a rendered statement once and reuses the description', async () => {
        provider.Rows = [{ ...PERSON_ROW }];
        provider.Description = PERSON_COLUMNS;
        const sql = 'SELECT * FROM vwPeople WHERE 1 = 1';
        await runAs(sql, staff);
        await runAs(sql, staff);
        expect(provider.Described).toEqual([sql]);
    });

    it('drops a column the description did not list, and describes the statement again next time', async () => {
        provider.Rows = [{ ...PERSON_ROW, Bonus: 5 }];
        provider.Description = PERSON_COLUMNS;
        const sql = 'SELECT * FROM vwPeople WHERE 2 = 2';
        const first = await runAs(sql, staff);
        expect(first.Results).toEqual([{ ID: 'p-1', Name: 'Ada', DepartmentID: 'd-1' }]);
        await runAs(sql, staff);
        expect(provider.Described).toEqual([sql, sql]);
    });

    it('drops a column with no traced source whose name is a denied field', async () => {
        provider.Rows = [{ ...PERSON_ROW }];
        provider.Description = [['ID', 'vwPeople.ID'], ['Name', 'vwPeople.Name'], ['Salary', null], ['DepartmentID', 'vwPeople.DepartmentID']];
        const result = await runAs('SELECT * FROM vwPeople WHERE 3 = 3', staff);
        expect(result.Results).toEqual([{ ID: 'p-1', Name: 'Ada', DepartmentID: 'd-1' }]);
    });

    it('refuses a star it cannot describe, with the not-found message', async () => {
        provider.Description = null;
        const result = await runAs('SELECT * FROM vwPeople WHERE 4 = 4', staff);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(UNAVAILABLE);
        expect(provider.Executed).toEqual([]);
    });

    it('refuses a paged star run whose first output column is withheld: the page could be ordered by it', async () => {
        provider.Rows = [{ ...PERSON_ROW }];
        provider.Description = [['Salary', 'vwPeople.Salary'], ['ID', 'vwPeople.ID']];
        const result = await runAs('SELECT * FROM vwPeople WHERE 5 = 5', staff, {}, undefined, { StartRow: 0, MaxRows: 10 });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(UNAVAILABLE);
        provider.Description = PERSON_COLUMNS;
        const allowed = await runAs('SELECT * FROM vwPeople WHERE 6 = 6', staff, {}, undefined, { StartRow: 0, MaxRows: 10 });
        expect(allowed.Success).toBe(true);
        expect(allowed.Results).toEqual([{ ID: 'p-1', Name: 'Ada', DepartmentID: 'd-1' }]);
    });

    // ── `*` inside a whole-row construct (DISCUSSION Topic 3e item 3): refused like a named denied field ──

    const wholeRowShapes: Array<[string, string]> = [
        ['DISTINCT *', 'SELECT DISTINCT * FROM vwPeople'],
        ['a set operation', 'SELECT * FROM vwPeople UNION SELECT * FROM vwPeople'],
        ['FOR JSON', 'SELECT * FROM vwPeople FOR JSON PATH'],
        ['NATURAL JOIN', 'SELECT * FROM vwPeople NATURAL JOIN vwProjects'],
        ['an ordinal ORDER BY with paging', 'SELECT * FROM vwPeople ORDER BY 3 DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY'],
        ['GROUP BY', 'SELECT * FROM vwPeople GROUP BY ID, Name, Salary, DepartmentID'],
        ['a star in a value subquery', 'SELECT ID FROM vwProjects WHERE OwnerID IN (SELECT * FROM vwPeople)'],
        ['a checksum of the row', 'SELECT CHECKSUM(*) AS C FROM vwPeople'],
        ['a star CTE read as a row', 'WITH x AS (SELECT * FROM vwPeople) SELECT DISTINCT * FROM x'],
    ];

    for (const [shape, sql] of wholeRowShapes) {
        it(`refuses ${shape} over a restricted entity, without running it`, async () => {
            provider.Description = PERSON_COLUMNS;
            const result = await runAs(sql, staff);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe(UNAVAILABLE);
            expect(provider.Executed).toEqual([]);
        });
    }

    // ── Definer's rights (DISCUSSION Topic 3e): a role-listed query skips field-level security entirely ──

    it('returns every column of a role-listed star query to a role holder, without describing it', async () => {
        provider.Rows = [{ ...PERSON_ROW }];
        provider.Description = PERSON_COLUMNS;
        const result = await runAs('SELECT * FROM vwPeople', staff, { PermissionRoles: [STAFF_ROLE] });
        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([PERSON_ROW]);
        expect(provider.Described).toEqual([]);
    });

    it('gives a run that drops denied columns its own cache segment, keyed by the user\'s denials', () => {
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT * FROM vwPeople' })]);
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, staff)).toMatchObject({ authorized: true, fieldSecurityKey: expect.stringContaining(':salary') });
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, hr).fieldSecurityKey).toBeUndefined();
        provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT ID, Name FROM vwPeople' })]);
        expect(provider.CacheAuthorization({ QueryID: 'q-1' }, staff).fieldSecurityKey).toBeUndefined();
    });

    // The refusal returned to the CALLER names no field or clause, on purpose. That makes a
    // refusal unattributable from the outside: three different paths produce the same
    // caller-visible shape. These pin the operator-side log that tells them apart — without it a
    // recurring integration-tier failure could not be diagnosed at all, because the only line
    // that came close was verboseOnly and CI does not enable verbose.
    describe('the server-side log says WHY a run was refused', () => {
        let logged: string[];

        beforeEach(() => {
            logged = [];
            vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')); });
        });

        const refusalLine = () => logged.find(l => l.includes('refused for user')) ?? '';

        it('names field-level security, with the kind and the reference', async () => {
            const result = await runAs('SELECT ID, Salary FROM vwPeople', staff);
            expect(result.Success).toBe(false);
            expect(refusalLine()).toMatch(/refused for user .* by field-level security \(/);
        });

        it('names the unreadable entities when that is the reason', async () => {
            const result = await runAs('SELECT ID, Amount FROM vwPayroll', staff);
            expect(result.Success).toBe(false);
            expect(refusalLine()).toMatch(/by unreadable entities \(Payroll\)/);
        });

        it("names the query's role list when a permission-bearing query denies the user", async () => {
            // A role list the user does not hold: authorized by that list alone, so neither a
            // denied entity nor a field violation is produced — the case that previously logged
            // nothing whatsoever.
            const result = await runAs('SELECT ID, Name FROM vwPeople', staff, { PermissionRoles: ['Some Other Role'] });
            expect(result.Success).toBe(false);
            expect(refusalLine()).toMatch(/by the query's own role list \(MJ: Query Permissions: \[Role-Some Other Role\]\)/);
        });

        it('records how many roles were loaded and their names, so an empty or mismatched role set is distinguishable', async () => {
            // The signature worth catching: UserRoles empty or undefined denies EVERY
            // permission-bearing query at once, which reads identically to a genuine denial.
            await runAs('SELECT ID, Name FROM vwPeople', staff, { PermissionRoles: ['Some Other Role'] });
            expect(refusalLine()).toMatch(/Roles loaded for this user: 1 \(\[Role-R0000000-0000-0000-0000-0000000000A2\]\)/);
        });

        it('logs when a cache-checked batch refuses on the render-free UserCanRun path (no CacheValidationSQL / first fetch)', async () => {
            provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT ID, Name FROM vwPeople', PermissionRoles: ['Some Other Role'] })]);
            const item: RunQueryWithCacheCheckParams = { params: { QueryID: 'q-1' } };
            const response = await provider.RunQueriesWithCacheCheck([item], staff);
            expect(response.results[0].status).toBe('error');
            expect(refusalLine()).toMatch(/by the query's own role list \(MJ: Query Permissions: \[Role-Some Other Role\]\)/);
        });

        it('does not double-log on the pre-cache authorization probe before execution', async () => {
            provider.SeedQueries([makeQuery({ ID: 'q-1', SQL: 'SELECT ID, Salary FROM vwPeople' })]);
            expect(provider.CacheAuthorization({ QueryID: 'q-1' }, staff).authorized).toBe(false);
            expect(refusalLine()).toBe('');
            const result = await provider.Run({ QueryID: 'q-1' }, staff);
            expect(result.Success).toBe(false);
            const refusalLogs = logged.filter(l => l.includes('refused for user'));
            expect(refusalLogs).toHaveLength(1);
        });

        it('says nothing when the run is allowed', async () => {
            const result = await runAs('SELECT p.ID, p.Name FROM vwPeople p', staff);
            expect(result.Success).toBe(true);
            expect(refusalLine()).toBe('');
        });
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
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [dependency], QuerySQLs: [], Dependencies: [] } as unknown as QueryEngine);
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
