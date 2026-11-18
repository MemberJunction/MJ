/**
 * Field-level security — a RunViews batch refuses per item.
 *
 * The predicate gate refuses a view whose clauses read a field the caller cannot read. In a
 * batch, that refusal belongs to the one view: it comes back as that view's `Success: false`
 * result, carrying the same ambiguous message a single RunView throws, while every other view in
 * the batch runs normally. The refused view never consults or warms a cache slot and never
 * reaches the database. Any other error from the gate still fails the call.
 *
 * Covered on both tiers: the server's trusted-cache flow and the browser's smart cache check.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ProviderBase } from '../generic/providerBase';
import {
    RunViewResult,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, UserRoleInfo, RecordDependency } from '../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult, FieldPermissionAccess, FieldSecurityDenialMessage } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

// ─── Metadata ─────────────────────────────────────────────────────────────

const HR_ROLE = 'a0000000-0000-0000-0000-000000000001';
const INTERN_ROLE = 'a0000000-0000-0000-0000-000000000003';
const ALL_ROLES = [HR_ROLE, INTERN_ROLE];
const EMPLOYEES_ID = 'e0000000-0000-0000-0000-000000000011';

function openTo(fieldId: string, roles: string[] = ALL_ROLES): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

function field(seq: number, name: string, type: string, roles: string[] = ALL_ROLES): Record<string, unknown> {
    const id = `${EMPLOYEES_ID}-${name}`;
    return { ID: id, EntityID: EMPLOYEES_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type, IsPrimaryKey: name === 'ID', EntityFieldPermissions: openTo(id, roles) };
}

/** Salary is HR-only; everyone reads ID, Name and Notes. */
function employeesInit(): Record<string, unknown> {
    return {
        ID: EMPLOYEES_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employees', BaseView: 'vwEmployees', IncludeInAPI: true,
        AllowCaching: true, EnableFieldLevelSecurity: true,
        Permissions: ALL_ROLES.map(r => ({ EntityID: EMPLOYEES_ID, RoleID: r, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: [
            field(1, 'ID', 'uniqueidentifier'),
            field(2, 'Name', 'nvarchar'),
            field(3, 'Salary', 'nvarchar', [HR_ROLE]),
            field(4, 'Notes', 'nvarchar'),
        ],
    };
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

const INTERN = buildUser([INTERN_ROLE], 'intern');

type Row = Record<string, unknown>;
const TABLE: Row[] = [
    { ID: 'e1', Name: 'Ada', Notes: 'lead' },
    { ID: 'e2', Name: 'Bo', Notes: 'new' },
];

/** The filter a non-security failure of the gate is simulated on. */
const GATE_CRASH_FILTER = '__gate_crash__';

// ─── Provider double ──────────────────────────────────────────────────────

class BatchProvider extends ProviderBase {
    private _localStorage: ILocalStorageProvider = {
        async GetItem() { return null; },
        async SetItem() { /* noop */ },
        async Remove() { /* noop */ },
        async ClearCategory() { /* noop */ },
        async GetCategoryKeys() { return []; },
    };
    private _entities: EntityInfo[] = [new EntityInfo(employeesInit())];
    private _shared = true;
    public DatabaseReads: RunViewParams[] = [];
    public CacheChecks: RunViewWithCacheCheckParams[] = [];

    public setShared(shared: boolean): void { this._shared = shared; }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }
    public override get CurrentUser(): UserInfo { return INTERN; }
    protected override get TrustLocalCacheCompletely(): boolean { return this._shared; }

    /** Simulates a gate failure that is NOT a field-security refusal. */
    protected override AssertPredicatesRespectFieldSecurity(params: RunViewParams, contextUser?: UserInfo): void {
        if (params.ExtraFilter === GATE_CRASH_FILTER) {
            throw new Error('catalog unavailable');
        }
        super.AssertPredicatesRespectFieldSecurity(params, contextUser);
    }

    protected async InternalRunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.DatabaseReads.push(params);
        const rows = TABLE as T[];
        return { Success: true, Results: rows, TotalRowCount: rows.length, ExecutionTime: 0, RowCount: rows.length, UserViewRunID: '', ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        return Promise.all(params.map(p => this.InternalRunView<T>(p, contextUser)));
    }

    /** The browser's smart cache check transport: records what it was sent and answers "stale" with rows. */
    public async RunViewsWithCacheCheck<T>(params: RunViewWithCacheCheckParams[]): Promise<RunViewsWithCacheCheckResponse<T>> {
        this.CacheChecks.push(...params);
        return {
            success: true,
            results: params.map((_, i) => ({ viewIndex: i, status: 'stale' as const, results: TABLE as T[], rowCount: TABLE.length, maxUpdatedAt: '2026-01-01T00:00:00.000Z' })),
        };
    }

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_i: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] } as unknown as RunQueryResult; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> { throw new Error('n/a'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return INTERN; }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return 'fls-batch://test/'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

const employees = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', ResultType: 'simple', ...extra }) as RunViewParams;

/** Reads a column the intern cannot read. */
const refused = (): RunViewParams => employees({ ExtraFilter: 'Salary > 100000' });
const REFUSAL = FieldSecurityDenialMessage('Salary', 'Employees');

async function freshCache(): Promise<void> {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider(), { verboseLogging: false });
}

function expectRefused(result: RunViewResult): void {
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBe(REFUSAL);
    expect(result.Results).toEqual([]);
    expect(result.RowCount).toBe(0);
}

// ═══════════════════════════════════════════════════════════════════════════

describe('server RunViews: a field-security refusal fails only its own view', () => {
    beforeEach(freshCache);

    it('returns [ok, refused, ok] and runs only the two admitted views', async () => {
        const provider = new BatchProvider();
        const results = await provider.RunViews<Row>(
            [employees({ ExtraFilter: "Name = 'Ada'" }), refused(), employees({ ExtraFilter: "Notes = 'new'" })],
            INTERN,
        );

        expect(results).toHaveLength(3);
        expect(results[0].Success).toBe(true);
        expect(results[0].Results).toHaveLength(2);
        expectRefused(results[1]);
        expect(results[2].Success).toBe(true);
        expect(provider.DatabaseReads.map(p => p.ExtraFilter)).toEqual(["Name = 'Ada'", "Notes = 'new'"]);
    });

    it('never consults or warms a cache slot for the refused view', async () => {
        const provider = new BatchProvider();
        const refusedFingerprint = provider.ComputeRunViewCacheFingerprint(refused(), INTERN);
        const reads = vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult');
        const writes = vi.spyOn(LocalCacheManager.Instance, 'SetRunViewResult');

        await provider.RunViews([employees(), refused()], INTERN);

        expect(reads.mock.calls.map(c => c[0])).not.toContain(refusedFingerprint);
        expect(writes.mock.calls.map(c => c[0])).not.toContain(refusedFingerprint);
        expect(await LocalCacheManager.Instance.GetRunViewResult(refusedFingerprint)).toBeNull();
        reads.mockRestore();
        writes.mockRestore();
    });

    it('keeps results aligned when the batch mixes a cache hit, a refusal and a miss', async () => {
        const provider = new BatchProvider();
        await provider.RunViews([employees()], INTERN); // warms the slot for item 0
        provider.DatabaseReads = [];

        const results = await provider.RunViews<Row>(
            [employees(), refused(), employees({ ExtraFilter: "Notes = 'new'" })],
            INTERN,
        );

        expect(results[0].Success).toBe(true);
        expect(results[0].Results).toHaveLength(2);
        expectRefused(results[1]);
        expect(results[2].Success).toBe(true);
        expect(provider.DatabaseReads.map(p => p.ExtraFilter)).toEqual(["Notes = 'new'"]);
    });

    it('refuses every view of an all-refused batch without reaching the database', async () => {
        const provider = new BatchProvider();
        const results = await provider.RunViews([refused(), employees({ OrderBy: 'Salary DESC' })], INTERN);

        expect(results).toHaveLength(2);
        expectRefused(results[0]);
        expect(results[1].Success).toBe(false);
        expect(results[1].ErrorMessage).toBe(REFUSAL);
        expect(provider.DatabaseReads).toHaveLength(0);
    });

    it('still throws a gate error that is not a field-security refusal', async () => {
        const provider = new BatchProvider();
        await expect(provider.RunViews([employees(), employees({ ExtraFilter: GATE_CRASH_FILTER })], INTERN))
            .rejects.toThrow('catalog unavailable');
        expect(provider.DatabaseReads).toHaveLength(0);
    });
});

describe('browser smart cache check: a field-security refusal fails only its own view', () => {
    beforeEach(freshCache);

    it('sends only the admitted views to the server and returns [ok, refused, ok]', async () => {
        const provider = new BatchProvider();
        provider.setShared(false);

        const results = await provider.RunViews<Row>(
            [employees({ CacheLocal: true }), employees({ CacheLocal: true, ExtraFilter: 'Salary > 1' }), employees({ CacheLocal: true, ExtraFilter: "Name = 'Bo'" })],
            INTERN,
        );

        expect(results).toHaveLength(3);
        expect(results[0].Success).toBe(true);
        expect(results[0].Results).toHaveLength(2);
        expectRefused(results[1]);
        expect(results[2].Success).toBe(true);
        expect(provider.CacheChecks.map(c => c.params.ExtraFilter)).toEqual([undefined, "Name = 'Bo'"]);
    });
});
