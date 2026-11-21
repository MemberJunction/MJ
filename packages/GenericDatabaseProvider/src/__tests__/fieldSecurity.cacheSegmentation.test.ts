/**
 * Field-level security on the database provider's cache paths: slots are segmented by the
 * request user's permission class, the slot key and the SELECT list share one denied set, and a
 * browser's cache status is answered "stale" when its field-security key no longer matches.
 *
 * The provider double runs `getRunTimeViewFieldArray` for every database read, so the columns a
 * fill holds are exactly the ones the real SELECT list would name for that user.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    EntityInfo,
    InMemoryLocalStorageProvider,
    LocalCacheManager,
    RunViewParams,
    RunViewResult,
    RunViewWithCacheCheckParams,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

const HR_ROLE = 'a0000000-0000-0000-0000-000000000001';
const INTERN_ROLE = 'a0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'e0000000-0000-0000-0000-000000000001';
const STAMP = '2026-01-01T00:00:00.000Z';

type Row = Record<string, unknown>;

function openTo(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId, ReadAccess: 'Allow', UpdateAccess: 'Allow', CreateAccess: 'Allow',
    }));
}

function employees(salaryRoles: string[] = [HR_ROLE]): EntityInfo {
    const both = [HR_ROLE, INTERN_ROLE];
    const f = (seq: number, name: string, roles: string[], search = false) => ({
        ID: `f-${name}`, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: 'nvarchar', Length: 100,
        IsPrimaryKey: name === 'ID', IncludeInUserSearchAPI: search, UserSearchPredicateAPI: 'Contains',
        EntityFieldPermissions: openTo(`f-${name}`, roles),
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees', IncludeInAPI: true,
        AllowCaching: true, EnableFieldLevelSecurity: true,
        Permissions: both.map(r => ({ EntityID: ENTITY_ID, RoleID: r, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: [f(1, 'ID', both), f(2, 'Name', both, true), f(3, 'Salary', salaryRoles, true), f(4, 'Notes', both)],
    });
}

function buildUser(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

const SYSTEM = buildUser([HR_ROLE], 'system');
const HR = buildUser([HR_ROLE], 'hr');
const INTERN = buildUser([INTERN_ROLE], 'intern');

const TABLE: Row[] = [
    { ID: 'e1', Name: 'Ada', Salary: '250000', Notes: 'lead', __mj_UpdatedAt: STAMP },
    { ID: 'e2', Name: 'Bo', Salary: '90000', Notes: 'new', __mj_UpdatedAt: STAMP },
];

class SegmentProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    private _entities: EntityInfo[] = [employees()];
    public DatabaseReads: string[] = [];

    protected get UUIDFunctionPattern(): RegExp { return SegmentProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return SegmentProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    public async ExecuteSQL<T>(): Promise<Array<T>> { return []; }

    public seed(entities: EntityInfo[]): void { this._entities = entities; }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.toLowerCase() === name?.toLowerCase());
    }
    public override get CurrentUser(): UserInfo { return SYSTEM; }
    public override get InstanceConnectionString(): string { return 'seg://test/'; }

    /** A database read: selects the columns getRunTimeViewFieldArray names for this user. */
    protected override async InternalRunView<T = unknown>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        const user = contextUser ?? this.CurrentUser;
        this.DatabaseReads.push(user.ID);
        const columns = this.getRunTimeViewFieldArray(params, null, user).map(f => f.Name);
        const rows = TABLE.map(r => (columns.length ? Object.fromEntries(columns.map(c => [c, r[c]]).concat([['__mj_UpdatedAt', r.__mj_UpdatedAt]])) : { ...r })) as T[];
        return { Success: true, Results: rows, UserViewRunID: '', RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }

    public fieldNames(params: RunViewParams, user: UserInfo): string[] {
        return this.getRunTimeViewFieldArray(params, null, user).map(f => f.Name);
    }
    public searchSQL(entity: EntityInfo, term: string, user: UserInfo, denied?: Set<string>): string {
        return this.createViewUserSearchSQL(entity, term, user, denied);
    }
    public statusKey(params: RunViewParams, user: UserInfo): string {
        return this.ComputeFieldSecurityCacheStatusKey(params, user);
    }
}

const view = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', CacheLocal: true, ...extra }) as RunViewParams;

const rowsOf = (item: unknown): Row[] => ((item as { results?: Row[] }).results ?? []);

async function seedSlot(provider: SegmentProvider, user: UserInfo, rows: Row[]): Promise<void> {
    await LocalCacheManager.Instance.SetRunViewResult(provider.ComputeRunViewCacheFingerprint(view(), user), view(), rows, STAMP, undefined, rows.length, provider);
}

describe('RunViewsWithCacheCheck — slots belong to the request user\'s permission class', () => {
    let provider: SegmentProvider;

    beforeEach(async () => {
        provider = new SegmentProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
        await LocalCacheManager.Instance.ClearAll();
    });

    it('a restricted user with nothing cached is not served the unrestricted slot', async () => {
        await seedSlot(provider, HR, TABLE);

        const result = await provider.RunViewsWithCacheCheck([{ params: view() }], INTERN);

        expect(provider.DatabaseReads).toEqual(['intern']);
        expect(rowsOf(result.results[0]).every(r => !('Salary' in r))).toBe(true);
    });

    it('a restricted user\'s fill is not served to an unrestricted user', async () => {
        await provider.RunViewsWithCacheCheck([{ params: view() }], INTERN);
        const result = await provider.RunViewsWithCacheCheck([{ params: view() }], HR);

        expect(provider.DatabaseReads).toEqual(['intern', 'hr']);
        expect(rowsOf(result.results[0])[0].Salary).toBe('250000');
    });

    it('a restricted user\'s cache status is not answered "current" from the unrestricted slot', async () => {
        await seedSlot(provider, HR, TABLE);

        const result = await provider.RunViewsWithCacheCheck([{ params: view(), cacheStatus: { maxUpdatedAt: STAMP, rowCount: 2 } }], INTERN);

        expect(result.results[0].status).not.toBe('current');
    });
});

describe('the slot key and the SELECT list share one denied set per request', () => {
    it('getRunTimeViewFieldArray uses the denied set the request\'s key was built from', () => {
        const provider = new SegmentProvider();
        const params = view();
        provider.ComputeRunViewCacheFingerprint(params, INTERN); // the key is built first
        provider.seed([employees([HR_ROLE, INTERN_ROLE])]);   // a refresh opens Salary to interns

        expect(provider.fieldNames(params, INTERN)).toEqual(['ID', 'Name', 'Notes']);
        expect(provider.fieldNames(view(), INTERN)).toEqual([]); // a new request sees the refresh: SELECT *
    });

    it('createViewUserSearchSQL searches only what the given denied set allows', () => {
        const provider = new SegmentProvider();
        const sql = provider.searchSQL(provider.EntityByName('Employees')!, 'x', HR, new Set(['salary']));

        expect(sql).toContain('"Name"');
        expect(sql).not.toContain('"Salary"');
    });
});

describe('browser freshness — the cache status carries a field-security key', () => {
    let provider: SegmentProvider;

    beforeEach(async () => {
        provider = new SegmentProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
        await LocalCacheManager.Instance.ClearAll();
        const narrow = TABLE.map(({ Salary: _s, ...rest }) => rest);
        await seedSlot(provider, INTERN, narrow);
        // The same rows under the unsegmented key too, so the check below is decided by the key the
        // browser sent and not by which slot happens to exist.
        await LocalCacheManager.Instance.SetRunViewResult(
            LocalCacheManager.Instance.GenerateRunViewFingerprint(view(), provider.InstanceConnectionString), view(), narrow, STAMP, undefined, 2, provider);
    });

    const check = (fieldSecurityKey?: string): RunViewWithCacheCheckParams => ({
        params: view(),
        cacheStatus: { maxUpdatedAt: STAMP, rowCount: 2, ...(fieldSecurityKey !== undefined ? { fieldSecurityKey } : {}) },
    });

    it('answers "stale" with fresh rows when the browser computed its key for a column it has lost', async () => {
        // The browser's metadata still lets the intern read Salary; the server's no longer does.
        const browserKey = LocalCacheManager.Instance.HashSecuritySegment('id,name,notes,salary');

        const result = await provider.RunViewsWithCacheCheck([check(browserKey)], INTERN);

        expect(result.results[0].status).toBe('stale');
        expect(rowsOf(result.results[0])).toHaveLength(2);
        expect(rowsOf(result.results[0]).every(r => !('Salary' in r))).toBe(true);
    });

    it('answers "current" when the keys match', async () => {
        const result = await provider.RunViewsWithCacheCheck([check(provider.statusKey(view(), INTERN))], INTERN);
        expect(result.results[0].status).toBe('current');
    });

    it('keeps the old behaviour for a client that sends no key', async () => {
        const result = await provider.RunViewsWithCacheCheck([check()], INTERN);
        expect(result.results[0].status).toBe('current');
    });
});
