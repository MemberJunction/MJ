/**
 * Field-level security — server cache slots segmented by permission class.
 *
 * A database provider selects only the columns the reading user may see, and a user search only
 * searches those columns. So two users with different field access get different rows for the
 * same request, and a cache slot can only ever be shared by users of one permission class. These
 * tests pin that, on the server tier (the client tier was already segmented):
 *
 *   - the slot key belongs to the REQUEST user, never the process user;
 *   - a restricted reader's fill is never served to an unrestricted reader, and the reverse;
 *   - a user search's row set stays with its permission class;
 *   - a saved view's slot is keyed on the user's denials everywhere;
 *   - the key and the SELECT list share one denied set per request;
 *   - read-time projection still checks every row, as a backstop;
 *   - the rls:/fls: segments use a 128-bit hash;
 *   - a BaseEngine running as a restricted user keys its slot the same way;
 *   - a save event whose row is missing columns clears a full-width slot instead of updating it;
 *   - a browser sends its field-security key with a slot's cache status.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
import { EntityInfo, RecordMergeRequest, RecordMergeResult, FieldPermissionAccess } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import type { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

// ─── Metadata ─────────────────────────────────────────────────────────────

const HR_ROLE = 'a0000000-0000-0000-0000-000000000001';
const INTERN_ROLE = 'a0000000-0000-0000-0000-000000000003';
const AUDITOR_ROLE = 'a0000000-0000-0000-0000-000000000004';
const ALL_ROLES = [HR_ROLE, INTERN_ROLE, AUDITOR_ROLE];
const EMPLOYEES_ID = 'e0000000-0000-0000-0000-000000000001';
const CONTRACTS_ID = 'e0000000-0000-0000-0000-000000000002';

function openTo(fieldId: string, roles: string[] = ALL_ROLES): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

function field(entityId: string, entity: string, seq: number, name: string, type: string, perms?: Record<string, unknown>[]): Record<string, unknown> {
    const id = `${entityId}-${name}`;
    return { ID: id, EntityID: entityId, Sequence: seq, Name: name, Entity: entity, Type: type, IsPrimaryKey: name === 'ID', EntityFieldPermissions: perms ?? openTo(id) };
}

function entityInit(id: string, name: string, fields: Record<string, unknown>[]): Record<string, unknown> {
    return {
        ID: id, Name: name, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`, IncludeInAPI: true,
        AllowCaching: true, EnableFieldLevelSecurity: true,
        Permissions: ALL_ROLES.map(r => ({ EntityID: id, RoleID: r, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: fields,
    };
}

/** Salary: HR and Auditor. Bonus: HR and Auditor. Everyone reads ID, Name, Notes. */
function employeesInit(salaryRoles: string[] = [HR_ROLE, AUDITOR_ROLE]): Record<string, unknown> {
    return entityInit(EMPLOYEES_ID, 'Employees', [
        field(EMPLOYEES_ID, 'Employees', 1, 'ID', 'uniqueidentifier'),
        field(EMPLOYEES_ID, 'Employees', 2, 'Name', 'nvarchar'),
        field(EMPLOYEES_ID, 'Employees', 3, 'Salary', 'nvarchar', openTo(`${EMPLOYEES_ID}-Salary`, salaryRoles)),
        field(EMPLOYEES_ID, 'Employees', 4, 'Bonus', 'nvarchar', openTo(`${EMPLOYEES_ID}-Bonus`, [HR_ROLE, AUDITOR_ROLE])),
        field(EMPLOYEES_ID, 'Employees', 5, 'Notes', 'nvarchar'),
    ]);
}

/** Rate: HR only — so the Auditor reads all of Employees but is denied something elsewhere. */
function contractsInit(): Record<string, unknown> {
    return entityInit(CONTRACTS_ID, 'Contracts', [
        field(CONTRACTS_ID, 'Contracts', 1, 'ID', 'uniqueidentifier'),
        field(CONTRACTS_ID, 'Contracts', 2, 'Rate', 'nvarchar', openTo(`${CONTRACTS_ID}-Rate`, [HR_ROLE])),
    ]);
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
const INTERN_2 = buildUser([INTERN_ROLE], 'intern-2');
const AUDITOR = buildUser([AUDITOR_ROLE], 'auditor');

type Row = Record<string, unknown>;

const TABLE: Row[] = [
    { ID: 'e1', Name: 'Ada', Salary: '250000', Bonus: '9000', Notes: 'lead' },
    { ID: 'e2', Name: 'Bo', Salary: '90000', Bonus: '1000', Notes: 'new' },
];

// ─── Provider double ──────────────────────────────────────────────────────

/**
 * A server-tier provider whose InternalRunView behaves the way a database provider does for
 * field security: a `simple` read selects and searches only the caller's readable columns, and
 * an `entity_object` read selects every column.
 */
class SegmentProvider extends ProviderBase {
    private _localStorage: ILocalStorageProvider = {
        async GetItem() { return null; },
        async SetItem() { /* noop */ },
        async Remove() { /* noop */ },
        async ClearCategory() { /* noop */ },
        async GetCategoryKeys() { return []; },
    };
    private _entities: EntityInfo[] = [];
    public DatabaseReads: Array<{ user: string; params: RunViewParams }> = [];
    public CacheChecks: RunViewWithCacheCheckParams[] = [];
    private _shared = true;
    private _asUser: UserInfo | undefined = SYSTEM;

    public seed(entities: EntityInfo[]): void { this._entities = entities; }
    public setShared(shared: boolean): void { this._shared = shared; }
    public setCurrentUser(u: UserInfo | undefined): void { this._asUser = u; }

    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }
    public override EntityByID(id: string): EntityInfo | undefined {
        return this._entities.find(e => e.ID.toLowerCase() === id?.toLowerCase());
    }
    public override get CurrentUser(): UserInfo { return this._asUser as UserInfo; }
    protected override get TrustLocalCacheCompletely(): boolean { return this._shared; }

    public flsKey(params: RunViewParams, user?: UserInfo): string | undefined {
        return this['ComputeRunViewFLSFingerprintKey'](params, user);
    }
    public allowedKey(params: RunViewParams, user?: UserInfo): string {
        return this['ComputeClientFLSAllowedKey'](params, user);
    }
    public project<T>(rows: T[], params: RunViewParams, user?: UserInfo): T[] {
        return this.ApplyFieldSecurityProjection(rows, params, user);
    }
    public deniedForRequest(params: RunViewParams, entity: EntityInfo, user: UserInfo): Set<string> {
        return this['ResolveRequestDeniedReadFields'](params, entity, user);
    }
    public clientFingerprint(params: RunViewParams): string {
        return this['clientCacheFingerprint'](params);
    }

    protected async InternalRunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        const user = contextUser ?? this.CurrentUser;
        this.DatabaseReads.push({ user: user.ID, params });
        const entity = this.EntityByName(params.EntityName!)!;
        const denied = params.ResultType === 'entity_object' ? new Set<string>() : entity.GetDeniedReadFields(user);
        const readable = (k: string) => !denied.has(k.toLowerCase());
        const term = (params.UserSearchString ?? '').trim();
        const matched = term
            ? TABLE.filter(r => Object.keys(r).some(k => readable(k) && String(r[k]).includes(term)))
            : TABLE;
        const rows = matched.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => readable(k)))) as T[];
        return { Success: true, Results: rows, TotalRowCount: rows.length, ExecutionTime: 0, RowCount: rows.length, UserViewRunID: '', ErrorMessage: '' };
    }

    /** The browser's smart cache check transport: records what it was sent and answers "current". */
    public async RunViewsWithCacheCheck<T>(params: RunViewWithCacheCheckParams[]): Promise<RunViewsWithCacheCheckResponse<T>> {
        this.CacheChecks.push(...params);
        return { success: true, results: params.map((_, i) => ({ viewIndex: i, status: 'current' as const })) };
    }

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_i: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunViews<T>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        return Promise.all(params.map(p => this.InternalRunView<T>(p, contextUser)));
    }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] } as unknown as RunQueryResult; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> { throw new Error('n/a'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return SYSTEM; }
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
    public get InstanceConnectionString(): string { return 'fls-seg://test/'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

function newProvider(salaryRoles?: string[]): SegmentProvider {
    const provider = new SegmentProvider();
    provider.seed([new EntityInfo(employeesInit(salaryRoles)), new EntityInfo(contractsInit())]);
    return provider;
}

const employees = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', ResultType: 'simple', ...extra }) as RunViewParams;

const cache = (): LocalCacheManager => LocalCacheManager.Instance;

async function freshCache(): Promise<void> {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider(), { verboseLogging: false });
}

/** A ViewEntity stand-in: enough for the fingerprint (`vw:` segment) and the entity lookup. */
function savedView(id: string, entityId: string): BaseEntity {
    return { Get: (k: string) => (k === 'EntityID' ? entityId : null), PrimaryKey: { ToConcatenatedString: () => id } } as unknown as BaseEntity;
}

// ═══════════════════════════════════════════════════════════════════════════

describe('server slot key belongs to the request user', () => {
    it('keys a restricted request user even when the process user is unrestricted', () => {
        const provider = newProvider();
        provider.setCurrentUser(SYSTEM);

        expect(provider.flsKey(employees(), INTERN)).toBe('id,name,notes');
        expect(provider.flsKey(employees(), HR)).toBe('');
    });

    it('builds the slot fingerprint with the request user\'s fls: segment', () => {
        const provider = newProvider();
        const restricted = provider.ComputeRunViewCacheFingerprint(employees(), INTERN);
        const unrestricted = provider.ComputeRunViewCacheFingerprint(employees(), HR);

        expect(restricted).toContain('|fls:');
        expect(unrestricted).not.toContain('|fls:');
        expect(unrestricted).toBe(cache().GenerateRunViewFingerprint(employees(), provider.InstanceConnectionString));
    });
});

describe('server RunView never serves one permission class another class\'s slot', () => {
    beforeEach(freshCache);

    it('an unrestricted user is not served the narrow slot a restricted user filled', async () => {
        const provider = newProvider();
        await provider.RunView(employees(), INTERN);
        const hr = await provider.RunView<Row>(employees(), HR);

        expect(hr.Results[0].Salary).toBe('250000');
        expect(provider.DatabaseReads.map(r => r.user)).toEqual(['intern', 'hr']);
    });

    it('a restricted user is not served the wide slot an unrestricted user filled', async () => {
        const provider = newProvider();
        await provider.RunView(employees(), HR);
        const intern = await provider.RunView<Row>(employees(), INTERN);

        expect(provider.DatabaseReads.map(r => r.user)).toEqual(['hr', 'intern']);
        expect(intern.Results.every(r => !('Salary' in r) && !('Bonus' in r))).toBe(true);
    });

    it('users of one permission class share one slot', async () => {
        const provider = newProvider();
        await provider.RunView(employees(), INTERN);
        const second = await provider.RunView<Row>(employees(), INTERN_2);

        expect(provider.DatabaseReads).toHaveLength(1);
        expect(second.Results).toHaveLength(2);
    });

    it('the batch path keeps the classes apart too', async () => {
        const provider = newProvider();
        await provider.RunViews([employees()], HR);
        const [intern] = await provider.RunViews<Row>([employees()], INTERN);

        expect(provider.DatabaseReads.map(r => r.user)).toEqual(['hr', 'intern']);
        expect(intern.Results.every(r => !('Salary' in r))).toBe(true);
    });

    it('a user search\'s row set stays with its permission class (no match-on-denied-column oracle)', async () => {
        const provider = newProvider();
        const hr = await provider.RunView<Row>(employees({ UserSearchString: '250000' }), HR);
        const intern = await provider.RunView<Row>(employees({ UserSearchString: '250000' }), INTERN);

        expect(hr.Results.map(r => r.ID)).toEqual(['e1']);
        // The intern cannot search Salary, so nothing matches — a shared slot would have
        // returned Ada's row and told the intern her salary contains 250000.
        expect(intern.Results).toHaveLength(0);
    });

    it('a slot filled wider than its class (entity_object fill) is still projected on a simple read', async () => {
        const provider = newProvider();
        // An entity_object read selects every column and its rows are cached as they came back.
        await cache().SetRunViewResult(provider.ComputeRunViewCacheFingerprint(employees(), INTERN), employees(), TABLE, '', undefined, TABLE.length, provider);

        const intern = await provider.RunView<Row>(employees(), INTERN);

        expect(provider.DatabaseReads).toHaveLength(0); // served from the class's own slot
        expect(intern.Results).toHaveLength(2);
        expect(intern.Results.every(r => !('Salary' in r) && !('Bonus' in r))).toBe(true);
    });
});

describe('saved views are keyed on the user\'s denials everywhere', () => {
    it('separates users whose access to the view\'s entity is the same but differs elsewhere', () => {
        const provider = newProvider();
        // HR and the Auditor both read every Employees column; only HR reads Contracts.Rate. A
        // view's stored clause can reach Contracts, and is screened only when the database runs it.
        const view = { ViewEntity: savedView('view-1', EMPLOYEES_ID) } as unknown as Partial<RunViewParams>;

        const hrView = provider.ComputeRunViewCacheFingerprint(employees(view), HR);
        const auditorView = provider.ComputeRunViewCacheFingerprint(employees(view), AUDITOR);

        expect(hrView).not.toBe(auditorView);
    });

    it('does not fragment ordinary reads for the same two users', () => {
        const provider = newProvider();
        expect(provider.ComputeRunViewCacheFingerprint(employees(), HR))
            .toBe(provider.ComputeRunViewCacheFingerprint(employees(), AUDITOR));
    });

    it('covers a view-only request (no EntityName)', () => {
        const provider = newProvider();
        const viewOnly = { ViewEntity: savedView('view-1', EMPLOYEES_ID) } as unknown as RunViewParams;

        expect(provider.ComputeRunViewCacheFingerprint(viewOnly, INTERN)).toContain('|fls:');
        expect(provider.ComputeRunViewCacheFingerprint({ ViewID: 'v-2' } as RunViewParams, AUDITOR)).toContain('|fls:');
        expect(provider.ComputeRunViewCacheFingerprint({ ViewID: 'v-2' } as RunViewParams, HR)).not.toContain('|fls:');
    });
});

describe('one denied set per request', () => {
    it('the key reuses the denied set the request already resolved, across a metadata refresh', () => {
        const provider = newProvider();
        const params = employees();
        // The SQL step resolves the intern's denied set first...
        const before = provider.deniedForRequest(params, provider.EntityByName('Employees')!, INTERN);
        expect(before.has('salary')).toBe(true);

        // ...then a refresh lands that opens Salary to interns...
        provider.seed([new EntityInfo(employeesInit([HR_ROLE, AUDITOR_ROLE, INTERN_ROLE])), new EntityInfo(contractsInit())]);

        // ...and the key for the SAME request still describes the columns that request selected.
        expect(provider.allowedKey(params, INTERN)).toBe('id,name,notes');
        // A new request sees the refreshed rules.
        expect(provider.allowedKey(employees(), INTERN)).toBe('id,name,notes,salary');
    });
});

describe('read-time projection backstop', () => {
    it('checks every row, not only the first', () => {
        const provider = newProvider();
        const rows: Row[] = [{ ID: 'e2', Name: 'Bo' }, { ID: 'e1', Name: 'Ada', Salary: '250000' }];

        const projected = provider.project(rows, employees(), INTERN);

        expect(projected[1]).toEqual({ ID: 'e1', Name: 'Ada' });
    });

    it('returns the same array when no row carries a denied key', () => {
        const provider = newProvider();
        const rows: Row[] = [{ ID: 'e2', Name: 'Bo' }];
        expect(provider.project(rows, employees(), INTERN)).toBe(rows);
    });
});

describe('security segment hash', () => {
    it('is 128 bits, deterministic, and distinguishes near-identical keys', () => {
        const h = cache().HashSecuritySegment("UserID='u1'");
        expect(h).toMatch(/^[0-9a-f]{32}$/);
        expect(cache().HashSecuritySegment("UserID='u1'")).toBe(h);
        expect(cache().HashSecuritySegment("UserID='u2'")).not.toBe(h);
    });

    it('is what the rls: and fls: segments carry', () => {
        const fp = cache().GenerateRunViewFingerprint(employees(), 'c', "UserID='u1'", undefined, 'id,name');
        expect(fp).toContain(`|rls:${cache().HashSecuritySegment("UserID='u1'")}`);
        expect(fp).toContain(`|fls:${cache().HashSecuritySegment('id,name')}`);
    });
});

// ─── BaseEngine ───────────────────────────────────────────────────────────

class SegmentEngine extends BaseEngine<SegmentEngine> {
    public async Config(): Promise<void> { /* configs are injected directly */ }
    public Bind(provider: IMetadataProvider, user: UserInfo): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
        (this as unknown as { _contextUser: UserInfo })._contextUser = user;
    }
    public Fingerprint(config: BaseEnginePropertyConfig): string { return this.configFingerprint(config); }
    public Sync(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> { return this.syncLocalCacheForConfig(config, event); }
}

const EMPLOYEES_CONFIG = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Employees', PropertyName: '_rows', ResultType: 'simple', CacheLocal: true });

function saveEvent(entity: EntityInfo, row: Row): BaseEntityEvent {
    return {
        type: 'save',
        payload: null,
        baseEntity: {
            EntityInfo: entity,
            ProviderToUse: undefined,
            PrimaryKey: CompositeKey.FromID(String(row.ID)),
            Get: () => '2026-01-01T00:00:00.000Z',
            GetAll: () => ({ ...row }),
        },
    } as unknown as BaseEntityEvent;
}

describe('BaseEngine slots carry the engine user\'s segments', () => {
    beforeEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__SegmentEngine'];
        return freshCache();
    });

    it('an engine running as a restricted user does not key the unsegmented slot', () => {
        const provider = newProvider();
        const engine = new SegmentEngine();
        engine.Bind(provider, INTERN);

        const unsegmented = cache().GenerateRunViewFingerprint(engine['BuildRunViewParamsForConfig'](EMPLOYEES_CONFIG), provider.InstanceConnectionString);
        expect(engine.Fingerprint(EMPLOYEES_CONFIG)).not.toBe(unsegmented);
        expect(engine.Fingerprint(EMPLOYEES_CONFIG)).toContain('|fls:');
    });

    it('an engine running as an unrestricted user keeps the unsegmented slot', () => {
        const provider = newProvider();
        const engine = new SegmentEngine();
        engine.Bind(provider, SYSTEM);

        const unsegmented = cache().GenerateRunViewFingerprint(engine['BuildRunViewParamsForConfig'](EMPLOYEES_CONFIG), provider.InstanceConnectionString);
        expect(engine.Fingerprint(EMPLOYEES_CONFIG)).toBe(unsegmented);
    });

    it('a narrowed save clears the engine\'s full-width slot instead of updating it in place', async () => {
        const provider = newProvider();
        const engine = new SegmentEngine();
        engine.Bind(provider, SYSTEM);
        const fp = engine.Fingerprint(EMPLOYEES_CONFIG);
        await cache().SetRunViewResult(fp, engine['BuildRunViewParamsForConfig'](EMPLOYEES_CONFIG), TABLE, '', undefined, TABLE.length, provider);

        // An intern's object holds no Salary or Bonus.
        await engine.Sync(EMPLOYEES_CONFIG, saveEvent(provider.EntityByName('Employees')!, { ID: 'e1', Name: 'Ada R.', Notes: 'lead' }));

        expect(await cache().GetRunViewResult(fp)).toBeNull();
    });

    it('CONTROL: a full-width save still updates the slot in place', async () => {
        const provider = newProvider();
        const engine = new SegmentEngine();
        engine.Bind(provider, SYSTEM);
        const fp = engine.Fingerprint(EMPLOYEES_CONFIG);
        await cache().SetRunViewResult(fp, engine['BuildRunViewParamsForConfig'](EMPLOYEES_CONFIG), TABLE, '', undefined, TABLE.length, provider);

        await engine.Sync(EMPLOYEES_CONFIG, saveEvent(provider.EntityByName('Employees')!, { ...TABLE[0], Name: 'Ada R.' }));

        const slot = await cache().GetRunViewResult(fp);
        expect((slot?.results as Row[]).find(r => r.ID === 'e1')?.Salary).toBe('250000');
    });
});

// ─── LocalCacheManager save events ────────────────────────────────────────

describe('save events with a row missing columns', () => {
    beforeEach(freshCache);

    async function seedUnfiltered(provider: SegmentProvider): Promise<string> {
        const fp = cache().GenerateRunViewFingerprint(employees(), provider.InstanceConnectionString);
        await cache().SetRunViewResult(fp, employees(), TABLE, '', undefined, TABLE.length, provider);
        return fp;
    }

    const processEvent = (fp: string, entity: EntityInfo, row: Row): Promise<void> =>
        (cache() as unknown as {
            processEntityEventForFingerprint(t: string, f: string, e: unknown, k: CompositeKey, n: string): Promise<void>;
        }).processEntityEventForFingerprint('save', fp, { EntityInfo: entity, GetAll: () => ({ ...row }) }, CompositeKey.FromID(String(row.ID)), new Date().toISOString());

    it('a local save event clears the full-width slot', async () => {
        const provider = newProvider();
        const fp = await seedUnfiltered(provider);

        await processEvent(fp, provider.EntityByName('Employees')!, { ID: 'e1', Name: 'Ada R.', Notes: 'lead' });

        expect(await cache().GetRunViewResult(fp)).toBeNull();
    });

    it('CONTROL: a full-width local save updates the slot in place', async () => {
        const provider = newProvider();
        const fp = await seedUnfiltered(provider);

        await processEvent(fp, provider.EntityByName('Employees')!, { ...TABLE[0], Name: 'Ada R.' });

        const slot = await cache().GetRunViewResult(fp);
        expect((slot?.results as Row[]).find(r => r.ID === 'e1')).toMatchObject({ Name: 'Ada R.', Salary: '250000' });
    });

    it('a batched save clears the full-width slot', async () => {
        const provider = newProvider();
        const fp = await seedUnfiltered(provider);
        const entity = provider.EntityByName('Employees')!;

        await (cache() as unknown as {
            applyEntityChangesToSlot(f: string, c: unknown[], n: string): Promise<void>;
        }).applyEntityChangesToSlot(fp, [{ EntityInfo: entity, Type: 'save', Key: CompositeKey.FromID('e1'), Record: { ID: 'e1', Name: 'Ada R.' } }], new Date().toISOString());

        expect(await cache().GetRunViewResult(fp)).toBeNull();
    });

    it('a remote save event clears the full-width slot', async () => {
        const provider = newProvider();
        const fp = await seedUnfiltered(provider);

        await (cache() as unknown as { HandleRemoteInvalidateEvent(e: unknown): Promise<void> }).HandleRemoteInvalidateEvent({
            entityName: 'Employees',
            provider,
            payload: { action: 'save', recordData: JSON.stringify({ ID: 'e1', Name: 'Ada R.' }) },
        });

        expect(await cache().GetRunViewResult(fp)).toBeNull();
    });
});

// ─── Browser freshness ────────────────────────────────────────────────────

describe('a browser sends its field-security key with a slot\'s cache status', () => {
    beforeEach(freshCache);

    it('includes the key the server will compare, for a restricted user', async () => {
        const provider = newProvider();
        provider.setShared(false);
        provider.setCurrentUser(INTERN);
        const params = employees({ CacheLocal: true });
        await cache().SetRunViewResult(provider.clientFingerprint({ ...params }), params, [], '2026-01-01T00:00:00.000Z', undefined, 0, provider);

        await provider.RunViews([params]);

        expect(provider.CacheChecks).toHaveLength(1);
        expect(provider.CacheChecks[0].cacheStatus?.fieldSecurityKey).toBe(cache().HashSecuritySegment('id,name,notes'));
    });

    it('sends an empty key for an unrestricted user', async () => {
        const provider = newProvider();
        provider.setShared(false);
        provider.setCurrentUser(HR);
        const params = employees({ CacheLocal: true });
        await cache().SetRunViewResult(provider.clientFingerprint({ ...params }), params, [], '2026-01-01T00:00:00.000Z', undefined, 0, provider);

        await provider.RunViews([params]);

        expect(provider.CacheChecks[0].cacheStatus?.fieldSecurityKey).toBe('');
    });
});
