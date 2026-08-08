/**
 * Field-Level Security — Workstream C cache composition (fls: fingerprint segment,
 * allowed-set widening, entity_object cache exemption).
 *
 * The invariant under test: a field-restricted user's cache-eligible queries fetch only
 * their ALLOWED columns and live in their own cache slots (the `fls:` fingerprint segment),
 * so restricted data never enters server memory on the simple path and no slot is ever
 * shared across permission classes in either direction. Unrestricted users and non-FLS
 * entities keep byte-identical pre-FLS fingerprints and shared slots.
 */

import { describe, it, expect } from 'vitest';
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
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, UserRoleInfo, RecordDependency } from '../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';

// ─── Metadata builders (mirrors fieldSecurity.enforcement.test.ts) ────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const FINANCE_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees';

function employeeEntityInit(fieldPermissions: {
    salary?: Record<string, unknown>[];
    bonus?: Record<string, unknown>[];
}): Record<string, unknown> {
    return {
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: FINANCE_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar' },
            { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: fieldPermissions.salary ?? [] },
            { ID: 'f-bonus', EntityID: ENTITY_ID, Sequence: 4, Name: 'Bonus', Entity: 'Employees', Type: 'money', EntityFieldPermissions: fieldPermissions.bonus ?? [] },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 5, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar' },
        ],
    };
}

/** Salary readable only by HR; Bonus readable only by HR and Finance. */
const standardPermissions = {
    salary: [{ ID: 'p1', EntityFieldID: 'f-salary', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true }],
    bonus: [
        { ID: 'p2', EntityFieldID: 'f-bonus', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true },
        { ID: 'p3', EntityFieldID: 'f-bonus', RoleID: FINANCE_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: false },
    ],
};

function buildUser(roleIds: string[], id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Test User';
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

// ─── Test provider (exposes the protected FLS cache helpers) ──────────────

class TestProvider extends ProviderBase {
    private _localStorage: ILocalStorageProvider = {
        async GetItem() { return null; },
        async SetItem() { /* noop */ },
        async Remove() { /* noop */ },
        async ClearCategory() { /* noop */ },
        async GetCategoryKeys() { return []; },
    };
    private _entities: EntityInfo[] = [];

    public seedEntities(entities: EntityInfo[]): void {
        this._entities = entities;
    }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }

    public flsDeniedKey(params: RunViewParams, user?: UserInfo): string {
        return this['ComputeRunViewFLSDeniedKey'](params, user);
    }
    public fetchFields(entity: EntityInfo, user?: UserInfo): string[] {
        return this['ComputeRunViewFetchFields'](entity, user);
    }
    public flsCacheExempt(params: RunViewParams, user?: UserInfo): boolean {
        return this['flsCacheExemptEntityObjectRequest'](params, user);
    }
    /** Server providers share one cache across users; clients do not. Default here: server. */
    private _sharedCache = true;
    public setSharedCache(shared: boolean): void { this._sharedCache = shared; }
    protected override get TrustLocalCacheCompletely(): boolean { return this._sharedCache; }
    public clientAllowedKey(params: RunViewParams): string {
        return this['ComputeClientFLSAllowedKey'](params);
    }
    /** ProviderBase.CurrentUser is what the client-side key reads. */
    private _asUser: UserInfo | undefined;
    public setCurrentUser(u: UserInfo | undefined): void { this._asUser = u; }
    public override get CurrentUser(): UserInfo { return this._asUser as UserInfo; }

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_i: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', Filtered: false, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> { throw new Error('n/a'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
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
    public get InstanceConnectionString(): string { return 'fls-cache-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

function setupProvider(perms: Parameters<typeof employeeEntityInit>[0] = standardPermissions): TestProvider {
    const provider = new TestProvider();
    provider.seedEntities([new EntityInfo(employeeEntityInit(perms))]);
    return provider;
}

const viewParams = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', ...extra }) as RunViewParams;

const cache = LocalCacheManager.Instance;

// ═══════════════════════════════════════════════════════════════════════════
// 1. The fls: fingerprint segment
// ═══════════════════════════════════════════════════════════════════════════

describe('GenerateRunViewFingerprint — fls: segment', () => {
    const base = { EntityName: 'Employees', ExtraFilter: 'IsActive=1' } as unknown as RunViewParams;

    it('appends an fls: segment only when a denied-fields key is provided', () => {
        expect(cache.GenerateRunViewFingerprint(base, 'conn', '', 'salary')).toContain('fls:');
        expect(cache.GenerateRunViewFingerprint(base, 'conn', '', '')).not.toContain('fls:');
        expect(cache.GenerateRunViewFingerprint(base, 'conn', '')).not.toContain('fls:');
    });

    it('keeps the empty-key fingerprint byte-identical to the pre-FLS format (shared slots preserved)', () => {
        expect(cache.GenerateRunViewFingerprint(base, 'conn', ''))
            .toBe(cache.GenerateRunViewFingerprint(base, 'conn', '', ''));
    });

    it('distinct denied sets produce distinct fingerprints; identical sets share one', () => {
        const salaryOnly = cache.GenerateRunViewFingerprint(base, 'conn', '', 'salary');
        const salaryAndBonus = cache.GenerateRunViewFingerprint(base, 'conn', '', 'bonus,salary');
        const salaryOnlyAgain = cache.GenerateRunViewFingerprint(base, 'conn', '', 'salary');

        expect(salaryOnly).not.toBe(salaryAndBonus);
        expect(salaryOnly).toBe(salaryOnlyAgain);
    });

    it('composes with the rls: segment rather than replacing it', () => {
        const fp = cache.GenerateRunViewFingerprint(base, 'conn', "UserID='u1'", 'salary');
        expect(fp).toContain('rls:');
        expect(fp).toContain('fls:');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The denied-set key (fingerprint input) per permission class
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.ComputeRunViewFLSDeniedKey', () => {
    it('is the sorted, comma-joined, lowercased denied set for a restricted user', () => {
        const provider = setupProvider();
        expect(provider.flsDeniedKey(viewParams(), buildUser([INTERN_ROLE_ID]))).toBe('bonus,salary');
        expect(provider.flsDeniedKey(viewParams(), buildUser([FINANCE_ROLE_ID]))).toBe('salary');
    });

    it('is empty for an unrestricted user, so their fingerprints (and slots) are unchanged', () => {
        const provider = setupProvider();
        expect(provider.flsDeniedKey(viewParams(), buildUser([HR_ROLE_ID]))).toBe('');
    });

    it('is empty on entities with no field security and without a user', () => {
        const provider = setupProvider({});
        expect(provider.flsDeniedKey(viewParams(), buildUser([INTERN_ROLE_ID]))).toBe('');
        expect(setupProvider().flsDeniedKey(viewParams(), undefined)).toBe('');
    });

    it('three permission classes yield three distinct fingerprints on the same query', () => {
        const provider = setupProvider();
        const params = viewParams({ ExtraFilter: 'IsActive=1' });
        const fingerprintFor = (user: UserInfo) =>
            cache.GenerateRunViewFingerprint(params, 'conn', '', provider.flsDeniedKey(params, user));

        const hr = fingerprintFor(buildUser([HR_ROLE_ID]));
        const finance = fingerprintFor(buildUser([FINANCE_ROLE_ID]));
        const intern = fingerprintFor(buildUser([INTERN_ROLE_ID]));

        expect(new Set([hr, finance, intern]).size).toBe(3);
    });

    it('a permission change produces a NEW fingerprint — the old slot strands, never serves', () => {
        const params = viewParams({ ExtraFilter: 'IsActive=1' });
        const before = setupProvider(); // Salary denied to Finance
        const beforeFp = cache.GenerateRunViewFingerprint(params, 'conn', '', before.flsDeniedKey(params, buildUser([FINANCE_ROLE_ID])));

        // Finance is granted Salary read — the denied set shrinks, the key changes.
        const after = setupProvider({
            ...standardPermissions,
            salary: [
                ...standardPermissions.salary,
                { ID: 'p4', EntityFieldID: 'f-salary', RoleID: FINANCE_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: false },
            ],
        });
        const afterFp = cache.GenerateRunViewFingerprint(params, 'conn', '', after.flsDeniedKey(params, buildUser([FINANCE_ROLE_ID])));

        expect(beforeFp).not.toBe(afterFp);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Allowed-set widening
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.ComputeRunViewFetchFields', () => {
    it('widens a restricted user to their ALLOWED set — denied columns never fetched', () => {
        const provider = setupProvider();
        const entity = provider.EntityByName('Employees')!;

        expect(provider.fetchFields(entity, buildUser([INTERN_ROLE_ID]))).toEqual(['ID', 'Name', 'Notes']);
        expect(provider.fetchFields(entity, buildUser([FINANCE_ROLE_ID]))).toEqual(['ID', 'Name', 'Bonus', 'Notes']);
    });

    it('widens an unrestricted user to ALL fields (the pre-existing superset contract)', () => {
        const provider = setupProvider();
        const entity = provider.EntityByName('Employees')!;
        expect(provider.fetchFields(entity, buildUser([HR_ROLE_ID]))).toEqual(['ID', 'Name', 'Salary', 'Bonus', 'Notes']);
    });

    it('always includes the primary key for restricted users', () => {
        const provider = setupProvider();
        const entity = provider.EntityByName('Employees')!;
        expect(provider.fetchFields(entity, buildUser([INTERN_ROLE_ID]))).toContain('ID');
    });

    it('widens to ALL fields on entities without field security', () => {
        const provider = setupProvider({});
        const entity = provider.EntityByName('Employees')!;
        expect(provider.fetchFields(entity, buildUser([INTERN_ROLE_ID]))).toEqual(['ID', 'Name', 'Salary', 'Bonus', 'Notes']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3b. The CLIENT key — hashed on the ALLOWED list, not the denied list
//
// The client keys on what the user MAY read, because once metadata ships filtered
// (issue #3485) a denied field will not appear in the client's field list at all — a
// denied-set key would be empty and would silently stop segmenting anything.
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.ComputeClientFLSAllowedKey', () => {
    const keyFor = (roles: string[], perms = standardPermissions): string => {
        const provider = setupProvider(perms);
        provider.setCurrentUser(roles.length ? buildUser(roles) : undefined);
        return provider.clientAllowedKey(viewParams());
    };

    it('lists the fields the user MAY read, sorted and lowercased', () => {
        expect(keyFor([INTERN_ROLE_ID])).toBe('id,name,notes');
        expect(keyFor([FINANCE_ROLE_ID])).toBe('bonus,id,name,notes');
    });

    it('is empty for an unrestricted user, so their client fingerprints are unchanged', () => {
        expect(keyFor([HR_ROLE_ID])).toBe('');
    });

    it('is empty on entities with no field security, and with no user', () => {
        expect(keyFor([INTERN_ROLE_ID], {})).toBe('');
        expect(keyFor([])).toBe('');
    });

    it('separates permission classes that a denied-set key could not once metadata is filtered', () => {
        // The point of the allowed-set choice: after #3485 a client cannot see denied fields,
        // so both users below would compute an EMPTY denied set and collide. Their allowed
        // lists still differ, which is what keeps their slots apart.
        expect(keyFor([INTERN_ROLE_ID])).not.toBe(keyFor([FINANCE_ROLE_ID]));
    });

    it('changes when access is taken away — the tightening case that strands a persisted slot', () => {
        const before = keyFor([FINANCE_ROLE_ID]);                       // Bonus readable
        const after = keyFor([FINANCE_ROLE_ID], {                        // Bonus revoked
            ...standardPermissions,
            bonus: [{ ID: 'p2', EntityFieldID: 'f-bonus', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true }],
        });
        expect(before).not.toBe(after);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. entity_object cache exemption
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.flsCacheExemptEntityObjectRequest', () => {
    it('exempts a restricted user\'s entity_object request on a SHARED (server) cache', () => {
        const provider = setupProvider();
        expect(provider.flsCacheExempt(viewParams({ ResultType: 'entity_object' }), buildUser([INTERN_ROLE_ID]))).toBe(true);
    });

    it('does NOT exempt on a CLIENT cache — a browser hosts one principal, and engines depend on it', () => {
        // Engines default to entity_object and many enable CacheLocal. Exempting the client
        // would strip client-side engine caching from every restricted signed-in user, forcing
        // a network refetch on each page load — a permanent penalty on exactly the users an
        // administrator restricted. Nothing is gained: a client slot can only hold
        // allowed-width rows (the server strips denied columns on the wire), partial entities
        // are safe now that hydration marks not-loaded fields, and the client `fls:` segment
        // already keys permission classes apart.
        const provider = setupProvider();
        provider.setSharedCache(false);
        expect(provider.flsCacheExempt(viewParams({ ResultType: 'entity_object' }), buildUser([INTERN_ROLE_ID]))).toBe(false);
    });

    it('does NOT exempt a restricted user\'s simple request — it gets its own fls: slot instead', () => {
        const provider = setupProvider();
        expect(provider.flsCacheExempt(viewParams({ ResultType: 'simple' }), buildUser([INTERN_ROLE_ID]))).toBe(false);
    });

    it('does NOT exempt an unrestricted user\'s entity_object request (full-width slots are safe)', () => {
        const provider = setupProvider();
        expect(provider.flsCacheExempt(viewParams({ ResultType: 'entity_object' }), buildUser([HR_ROLE_ID]))).toBe(false);
    });

    it('does NOT exempt entity_object requests on non-FLS entities or without a user', () => {
        expect(setupProvider({}).flsCacheExempt(viewParams({ ResultType: 'entity_object' }), buildUser([INTERN_ROLE_ID]))).toBe(false);
        expect(setupProvider().flsCacheExempt(viewParams({ ResultType: 'entity_object' }), undefined)).toBe(false);
    });
});
