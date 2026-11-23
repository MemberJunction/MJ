import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    DatabasePlatform,
    DeleteSQLResult,
    EntityInfo,
    IMetadataProvider,
    Metadata,
    RegisterPostRunViewProtectedEntity,
    RunQueryParams,
    RunQueryResult,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { APPROVE_QUERIES_AUTHORIZATION, MJQueryEntityExtended, MJQueryPermissionEntity, QueryEngine } from '@memberjunction/core-entities';

/**
 * The draft screen (#6746): a saved query that isn't Approved, run by a user who doesn't hold
 * `Queries: Approve`, must pass the ad-hoc statement screen on its rendered SQL. Raw SQL applies no
 * row-level security, so without the screen any user who may create queries could save SQL that
 * reads past their own row filters, or reads tables that aren't entities at all, and run it.
 *
 * Each bypass form found in review gets a case: each is refused as a draft and runs once Approved.
 */
class DraftScreenProvider extends GenericDatabaseProviderTestBase {
    constructor(private readonly platform: DatabasePlatform = 'sqlserver') {
        super();
    }
    override get PlatformKey(): DatabasePlatform { return this.platform; }
    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
    public QuoteIdentifier(name: string): string { return this.platform === 'postgresql' ? `"${name}"` : `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(obj)}`; }
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

    private authorizations: AuthorizationInfo[] = [];
    public SeedAuthorizations(authorizations: AuthorizationInfo[]): void { this.authorizations = authorizations; }
    public override get Authorizations(): AuthorizationInfo[] { return this.authorizations; }

    private queries: MJQueryEntityExtended[] = [];
    public SeedQueries(queries: MJQueryEntityExtended[]): void { this.queries = queries; }
    protected override resolveQuery(params: RunQueryParams): MJQueryEntityExtended | undefined {
        return this.queries.find(q => q.ID === params.QueryID);
    }

    public readonly Executed: string[] = [];
    override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.Executed.push(sql);
        return [{ ID: 'r-1' }] as unknown as Array<T>;
    }

    public Run(params: RunQueryParams, user: UserInfo): Promise<RunQueryResult> {
        return this.InternalRunQuery(params, user);
    }
}

const RUNS_ID = 'E0000000-0000-0000-0000-0000000000D1';
const USERS_ID = 'E0000000-0000-0000-0000-0000000000D2';
const ROLES_ID = 'E0000000-0000-0000-0000-0000000000D3';
const CONVERSATIONS_ID = 'E0000000-0000-0000-0000-0000000000D4';
const UI_ROLE = 'R0000000-0000-0000-0000-0000000000D1';
const DEV_ROLE = 'R0000000-0000-0000-0000-0000000000D2';
const APPROVE_ID = 'A0000000-0000-0000-0000-0000000000D1';

function entity(id: string, name: string, table: string, view: string): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: '__mj', BaseTable: table, BaseView: view,
        Permissions: [UI_ROLE, DEV_ROLE].map(r => ({ EntityID: id, RoleID: r, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false })),
        Fields: [{ ID: `${id}-f`, EntityID: id, Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }],
    });
}

function user(id: string, roleId: string): UserInfo {
    return new UserInfo(undefined, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true, Type: 'User',
        UserRoles: [{ UserID: id, RoleID: roleId, Role: `Role-${roleId}` }],
    });
}

/** Holds only the UI role: reads MJ: AI Agent Runs under a row filter, may not approve. */
const uiUser = user('U0000000-0000-0000-0000-0000000000D1', UI_ROLE);
/** Holds Developer, which holds Queries: Approve. */
const developer = user('U0000000-0000-0000-0000-0000000000D2', DEV_ROLE);

function makeQuery(sql: string, status: MJQueryEntityExtended['Status'], permissionRoles: string[] = []): MJQueryEntityExtended {
    const q = Object.create(MJQueryEntityExtended.prototype) as MJQueryEntityExtended;
    const permissions = permissionRoles.map(r => ({ QueryID: 'q-1', Role: `Role-${r}` }) as unknown as MJQueryPermissionEntity);
    const own: Record<string, unknown> = {
        ID: 'q-1', Name: 'Draft', SQL: sql, Status: status, Reusable: false, UsesTemplate: false, CacheEnabled: false,
        AuditQueryRuns: false, ExternalDataSourceID: null, CategoryID: null, CategoryPath: '', IsApproved: status === 'Approved',
        CacheValidationSQL: null, QueryPermissions: permissions, QueryEntities: [], QueryDependencies: [], QueryParameters: [], QueryFields: [],
    };
    for (const [key, value] of Object.entries(own)) {
        Object.defineProperty(q, key, { value, configurable: true });
    }
    Object.defineProperty(q, 'GetPlatformSQL', { value: () => sql, configurable: true });
    // No role list lets everyone through to the entity checks; a role list admits only its holders.
    Object.defineProperty(q, 'UserHasRunPermissions', {
        value: (u: UserInfo) => permissionRoles.length === 0 || permissionRoles.some(r => u.UserRoles.some(ur => ur.RoleID === r)),
        configurable: true,
    });
    return q;
}

function setUp(platform: DatabasePlatform = 'sqlserver'): DraftScreenProvider {
    // A server registers the entities its RunView hooks confine at startup; conversations are one.
    RegisterPostRunViewProtectedEntity('MJ: Conversations');
    const provider = new DraftScreenProvider(platform);
    const runs = entity(RUNS_ID, 'MJ: AI Agent Runs', 'AIAgentRun', 'vwAIAgentRuns');
    // UI: Own AI Agent Runs — the UI role reads only its own runs; Developer reads them all.
    vi.spyOn(runs, 'GetEffectiveRowFilterWhereClause').mockImplementation((u: UserInfo) =>
        u.UserRoles.some(r => r.RoleID === UI_ROLE) ? `UserID = '${u.ID}'` : '');
    provider.SeedEntities([
        runs,
        entity(USERS_ID, 'MJ: Users', 'User', 'vwUsers'),
        entity(ROLES_ID, 'MJ: Roles', 'Role', 'vwRoles'),
        entity(CONVERSATIONS_ID, 'MJ: Conversations', 'Conversation', 'vwConversations'),
    ]);
    const roles = [new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: APPROVE_ID, RoleID: DEV_ROLE, Type: 'Allow' })];
    provider.SeedAuthorizations([new AuthorizationInfo(
        { ID: APPROVE_ID, Name: APPROVE_QUERIES_AUTHORIZATION, ParentID: null, IsActive: true },
        { AuthorizationRoles: roles } as unknown as IMetadataProvider,
    )]);
    return provider;
}

async function run(provider: DraftScreenProvider, sql: string, who: UserInfo, status: MJQueryEntityExtended['Status'], permissionRoles: string[] = []): Promise<RunQueryResult> {
    provider.SeedQueries([makeQuery(sql, status, permissionRoles)]);
    return provider.Run({ QueryID: 'q-1' }, who);
}

const UNAVAILABLE = "Query 'q-1' does not exist or you do not have permission to run it.";

describe('the draft screen on saved queries', () => {
    let provider: DraftScreenProvider;

    beforeEach(() => {
        provider = setUp();
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [], QuerySQLs: [], Dependencies: [] } as unknown as QueryEngine);
    });
    afterEach(() => vi.restoreAllMocks());

    const bypasses: Array<[string, string]> = [
        ['a plain read of a row-filtered entity', 'SELECT r.ID FROM __mj.vwAIAgentRuns r'],
        ['a comma join after JOIN … ON (form 1)', 'SELECT r.ID FROM __mj.vwUsers u JOIN __mj.vwRoles ro ON 1 = 1, __mj.vwAIAgentRuns r'],
        ["the entity's base table", 'SELECT a.ID FROM __mj.AIAgentRun a'],
        ['a system catalog (form 3)', 'SELECT name, definition FROM sys.sql_modules'],
        ['a relation that is not an entity', 'SELECT * FROM dbo.SomeTable'],
        ['an entity confined by RunView hooks', 'SELECT c.ID FROM __mj.vwConversations c'],
    ];

    for (const [what, sql] of bypasses) {
        it(`refuses a UI user's draft that reads ${what}, without running it`, async () => {
            const result = await run(provider, sql, uiUser, 'Pending');
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe(UNAVAILABLE);
            expect(provider.Executed).toEqual([]);
        });

        it(`runs the same SQL for the UI user once it is Approved: ${what}`, async () => {
            const result = await run(provider, sql, uiUser, 'Approved');
            expect(result.Success).toBe(true);
        });
    }

    it('treats every status but Approved as a draft', async () => {
        for (const status of ['Rejected', 'Expired'] as const) {
            const result = await run(provider, 'SELECT r.ID FROM __mj.vwAIAgentRuns r', uiUser, status);
            expect(result.Success, status).toBe(false);
        }
    });

    it("runs a UI user's draft that reads only entities they read unscoped", async () => {
        const result = await run(provider, 'SELECT u.ID FROM __mj.vwUsers u JOIN __mj.vwRoles ro ON 1 = 1', uiUser, 'Pending');
        expect(result.Success).toBe(true);
    });

    it('does not screen a holder of Queries: Approve, who could approve the draft anyway', async () => {
        const result = await run(provider, 'SELECT name FROM sys.sql_modules', developer, 'Pending');
        expect(result.Success).toBe(true);
    });

    it('does not screen a draft with a role list, which authorizes on its own', async () => {
        const result = await run(provider, 'SELECT r.ID FROM __mj.vwAIAgentRuns r', uiUser, 'Pending', [UI_ROLE]);
        expect(result.Success).toBe(true);
    });

    it('logs why a draft was refused, for the operator', async () => {
        const logged: string[] = [];
        vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
        await run(provider, 'SELECT r.ID FROM __mj.vwAIAgentRuns r', uiUser, 'Pending');
        expect(logged.some(l => l.includes('the draft screen') && l.includes('MJ: AI Agent Runs'))).toBe(true);
    });
});

describe('the draft screen on PostgreSQL', () => {
    beforeEach(() => {
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue({ Queries: [], QuerySQLs: [], Dependencies: [] } as unknown as QueryEngine);
    });
    afterEach(() => vi.restoreAllMocks());

    it("refuses a UI user's draft that reads through TABLE in a subquery (form 2), and runs it once Approved", async () => {
        const provider = setUp('postgresql');
        const sql = 'SELECT * FROM (TABLE __mj."vwAIAgentRuns") t';
        const draft = await run(provider, sql, uiUser, 'Pending');
        expect(draft.Success).toBe(false);
        expect(provider.Executed).toEqual([]);
        expect((await run(provider, sql, uiUser, 'Approved')).Success).toBe(true);
    });

    it('refuses the comma join after JOIN … ON (form 1) on PostgreSQL too', async () => {
        const provider = setUp('postgresql');
        const sql = 'SELECT r."ID" FROM __mj."vwUsers" u JOIN __mj."vwRoles" ro ON true, __mj."vwAIAgentRuns" r';
        expect((await run(provider, sql, uiUser, 'Pending')).Success).toBe(false);
    });
});
