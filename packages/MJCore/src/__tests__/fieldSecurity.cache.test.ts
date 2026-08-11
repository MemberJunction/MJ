/**
 * Field-Level Security — RunView cache composition.
 *
 * The invariant under test:
 *
 *   - The SERVER cache holds FULL-WIDTH slots serving every user: no `fls:` segment, no
 *     allowed-set fetch narrowing, no entity_object exemption. Per-request narrowing happens
 *     at read time in `ApplyFieldSecurityProjection`, which runs on both cache hits and misses
 *     and reads live metadata — so a permission change takes effect on the next metadata
 *     refresh with no result-cache invalidation.
 *   - The CLIENT segments, keyed on the ALLOWED list. Its slots are stored exactly as the
 *     server returned them (already narrowed on the wire) and are never projected on read, so
 *     the field set has to be part of slot identity.
 *
 * That asymmetry is decided in exactly one place — `ComputeRunViewFLSFingerprintKey` — which
 * is what these tests pin down.
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
import { EntityInfo, RecordMergeRequest, RecordMergeResult, FieldPermissionAccess } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';

// ─── Metadata builders (mirrors fieldSecurity.enforcement.test.ts) ────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const FINANCE_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees';
const ALL_ROLES = [HR_ROLE_ID, FINANCE_ROLE_ID, INTERN_ROLE_ID];

const ALLOW = FieldPermissionAccess.Allow;

/**
 * Full access to `fieldId` for every listed role. Snapshot initialization writes rows like
 * these for every (field, role) that holds the matching entity-level permission — which is why
 * the unrestricted fields below need them explicitly: on an FLS-enabled entity, a field with
 * NO rows is denied, not open.
 */
function openTo(fieldId: string, roles: string[] = ALL_ROLES): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: ALLOW,
        UpdateAccess: ALLOW,
        CreateAccess: ALLOW,
    }));
}

function employeeEntityInit(
    fieldPermissions: { salary?: Record<string, unknown>[]; bonus?: Record<string, unknown>[] },
    enableFieldLevelSecurity: boolean = true
): Record<string, unknown> {
    return {
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        // Required for runViewCacheEligible to reach the field-security question at all —
        // without it the entity short-circuits on IsServerCacheAllowedForEntity and the
        // eligibility assertions below would pass for the wrong reason.
        AllowCaching: true,
        EnableFieldLevelSecurity: enableFieldLevelSecurity,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: FINANCE_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('f-name') },
            { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: fieldPermissions.salary ?? openTo('f-salary') },
            { ID: 'f-bonus', EntityID: ENTITY_ID, Sequence: 4, Name: 'Bonus', Entity: 'Employees', Type: 'money', EntityFieldPermissions: fieldPermissions.bonus ?? openTo('f-bonus') },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 5, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('f-notes') },
        ],
    };
}

/** Salary readable only by HR; Bonus readable only by HR and Finance. */
const standardPermissions = {
    salary: openTo('f-salary', [HR_ROLE_ID]),
    bonus: openTo('f-bonus', [HR_ROLE_ID, FINANCE_ROLE_ID]),
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

    public fingerprintKey(params: RunViewParams): string | undefined {
        return this['ComputeRunViewFLSFingerprintKey'](params);
    }
    public fetchFields(entity: EntityInfo): string[] {
        return this['ComputeRunViewFetchFields'](entity);
    }
    public cacheEligible(params: RunViewParams): boolean {
        return this['runViewCacheEligible'](params);
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

function setupProvider(
    perms: Parameters<typeof employeeEntityInit>[0] = standardPermissions,
    enableFieldLevelSecurity: boolean = true
): TestProvider {
    const provider = new TestProvider();
    provider.seedEntities([new EntityInfo(employeeEntityInit(perms, enableFieldLevelSecurity))]);
    return provider;
}

const viewParams = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', ...extra }) as RunViewParams;

const cache = LocalCacheManager.Instance;

// ═══════════════════════════════════════════════════════════════════════════
// 1. The fls: fingerprint segment — still emitted, but only the CLIENT feeds it
// ═══════════════════════════════════════════════════════════════════════════

describe('GenerateRunViewFingerprint — fls: segment', () => {
    const base = { EntityName: 'Employees', ExtraFilter: 'IsActive=1' } as unknown as RunViewParams;

    it('appends an fls: segment only when a key is provided', () => {
        expect(cache.GenerateRunViewFingerprint(base, 'conn', '', 'id,name')).toContain('fls:');
        expect(cache.GenerateRunViewFingerprint(base, 'conn', '', '')).not.toContain('fls:');
        expect(cache.GenerateRunViewFingerprint(base, 'conn', '')).not.toContain('fls:');
    });

    it('keeps the empty-key fingerprint byte-identical to the pre-FLS format (shared slots preserved)', () => {
        expect(cache.GenerateRunViewFingerprint(base, 'conn', ''))
            .toBe(cache.GenerateRunViewFingerprint(base, 'conn', '', ''));
    });

    it('distinct field sets produce distinct fingerprints; identical sets share one', () => {
        const narrow = cache.GenerateRunViewFingerprint(base, 'conn', '', 'id,name');
        const wider = cache.GenerateRunViewFingerprint(base, 'conn', '', 'bonus,id,name');
        const narrowAgain = cache.GenerateRunViewFingerprint(base, 'conn', '', 'id,name');

        expect(narrow).not.toBe(wider);
        expect(narrow).toBe(narrowAgain);
    });

    it('composes with the rls: segment rather than replacing it', () => {
        const fp = cache.GenerateRunViewFingerprint(base, 'conn', "UserID='u1'", 'id,name');
        expect(fp).toContain('rls:');
        expect(fp).toContain('fls:');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The tier split — the single decision point for server vs client
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.ComputeRunViewFLSFingerprintKey', () => {
    it('SERVER: contributes NO key, even for a restricted user', () => {
        // Server slots are full-width and shared; ApplyFieldSecurityProjection narrows per
        // request at read time, so segmenting here would fragment one shared slot into one
        // per permission class and protect nothing.
        const provider = setupProvider();
        provider.setSharedCache(true);
        provider.setCurrentUser(buildUser([INTERN_ROLE_ID]));

        expect(provider.fingerprintKey(viewParams())).toBeUndefined();
    });

    it('SERVER: restricted and unrestricted users therefore share one slot', () => {
        const provider = setupProvider();
        provider.setSharedCache(true);
        const params = viewParams({ ExtraFilter: 'IsActive=1' });

        provider.setCurrentUser(buildUser([INTERN_ROLE_ID]));
        const restricted = cache.GenerateRunViewFingerprint(params, 'conn', '', provider.fingerprintKey(params));
        provider.setCurrentUser(buildUser([HR_ROLE_ID]));
        const unrestricted = cache.GenerateRunViewFingerprint(params, 'conn', '', provider.fingerprintKey(params));

        expect(restricted).toBe(unrestricted);
    });

    it('CLIENT: contributes the allowed-list key for a restricted user', () => {
        const provider = setupProvider();
        provider.setSharedCache(false);
        provider.setCurrentUser(buildUser([INTERN_ROLE_ID]));

        expect(provider.fingerprintKey(viewParams())).toBe('id,name,notes');
    });

    it('CLIENT: three permission classes yield three distinct fingerprints on the same query', () => {
        const provider = setupProvider();
        provider.setSharedCache(false);
        const params = viewParams({ ExtraFilter: 'IsActive=1' });
        const fingerprintFor = (roles: string[]) => {
            provider.setCurrentUser(buildUser(roles));
            return cache.GenerateRunViewFingerprint(params, 'conn', '', provider.fingerprintKey(params));
        };

        const hr = fingerprintFor([HR_ROLE_ID]);
        const finance = fingerprintFor([FINANCE_ROLE_ID]);
        const intern = fingerprintFor([INTERN_ROLE_ID]);

        expect(new Set([hr, finance, intern]).size).toBe(3);
    });

    it('CLIENT: an unrestricted user contributes nothing, keeping their fingerprints unchanged', () => {
        const provider = setupProvider();
        provider.setSharedCache(false);
        provider.setCurrentUser(buildUser([HR_ROLE_ID]));

        expect(provider.fingerprintKey(viewParams())).toBe('');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Fetch widening — always the full superset now
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.ComputeRunViewFetchFields', () => {
    it('widens to ALL fields regardless of who is asking', () => {
        // The fetch does not depend on the user at all, which is what lets one server slot
        // serve everyone.
        const provider = setupProvider();
        const entity = provider.EntityByName('Employees')!;
        const all = ['ID', 'Name', 'Salary', 'Bonus', 'Notes'];

        provider.setCurrentUser(buildUser([INTERN_ROLE_ID]));
        expect(provider.fetchFields(entity)).toEqual(all);
        provider.setCurrentUser(buildUser([HR_ROLE_ID]));
        expect(provider.fetchFields(entity)).toEqual(all);
    });

    it('widens to ALL fields on entities without field security', () => {
        const provider = setupProvider(standardPermissions, false);
        const entity = provider.EntityByName('Employees')!;

        expect(provider.fetchFields(entity)).toEqual(['ID', 'Name', 'Salary', 'Bonus', 'Notes']);
    });

    it('always includes the primary key', () => {
        const provider = setupProvider();
        expect(provider.fetchFields(provider.EntityByName('Employees')!)).toContain('ID');
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
    const keyFor = (roles: string[], perms = standardPermissions, enabled = true): string => {
        const provider = setupProvider(perms, enabled);
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

    it('is empty on entities with field security disabled, and with no user', () => {
        expect(keyFor([INTERN_ROLE_ID], standardPermissions, false)).toBe('');
        expect(keyFor([])).toBe('');
    });

    it('separates permission classes that a denied-set key could not once metadata is filtered', () => {
        // The point of the allowed-set choice: after #3485 a client cannot see denied fields,
        // so both users below would compute an EMPTY denied set and collide. Their allowed
        // lists still differ, which is what keeps their slots apart.
        expect(keyFor([INTERN_ROLE_ID])).not.toBe(keyFor([FINANCE_ROLE_ID]));
    });

    it('changes when access is taken away — the tightening case that strands a persisted slot', () => {
        const before = keyFor([FINANCE_ROLE_ID]);                    // Bonus readable
        const after = keyFor([FINANCE_ROLE_ID], {                     // Bonus revoked
            ...standardPermissions,
            bonus: openTo('f-bonus', [HR_ROLE_ID]),
        });
        expect(before).not.toBe(after);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Cache eligibility does not depend on the user
// ═══════════════════════════════════════════════════════════════════════════

describe('ProviderBase.runViewCacheEligible', () => {
    it('does not exempt a restricted user\'s entity_object request', () => {
        // Server slots are full-width, so a restricted user's entity_object request is as
        // cacheable as anyone else's — field security only changes what is projected out.
        const provider = setupProvider();
        provider.setSharedCache(true);
        provider.setCurrentUser(buildUser([INTERN_ROLE_ID]));

        expect(provider.cacheEligible(viewParams({ ResultType: 'entity_object' }))).toBe(true);
    });

    it('gives restricted and unrestricted users the same answer', () => {
        const provider = setupProvider();
        provider.setSharedCache(true);
        const params = viewParams({ ResultType: 'entity_object' });

        provider.setCurrentUser(buildUser([INTERN_ROLE_ID]));
        const restricted = provider.cacheEligible(params);
        provider.setCurrentUser(buildUser([HR_ROLE_ID]));

        expect(restricted).toBe(provider.cacheEligible(params));
    });

    it('still honours the non-security exclusions', () => {
        const provider = setupProvider();
        provider.setSharedCache(true);

        expect(provider.cacheEligible(viewParams({ BypassCache: true }))).toBe(false);
        expect(provider.cacheEligible(viewParams({ ResultType: 'count_only' }))).toBe(false);
    });
});
