/**
 * Field-Level Security — Phase 2 enforcement
 *
 * Covers the three enforcement points and the per-request precompute they share:
 *
 *   1. Predicate validation  — ExtraFilter/OrderBy naming an unreadable field is rejected
 *   2. Output projection     — denied columns stripped from result rows, on BOTH cache paths
 *   3. Save guard            — an update to a field the user cannot write is rejected
 *
 * The round-trip test at the bottom is the regression guard for the rejected load-time-nulling
 * design: a restricted-read user must be able to edit an unrelated field and save WITHOUT the
 * restricted column being written back as NULL.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    ProviderConfigDataBase,
    EntitySaveOptions,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, UserRoleInfo, RecordDependency } from '../generic/securityInfo';
import { WellKnownUserSource } from '../generic/wellKnownUserSource';

import { EntityInfo, RecordMergeRequest, RecordMergeResult, FieldPermissionAccess } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { BaseEntity } from '../generic/baseEntity';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ClearAllDataHooks } from '../generic/dataHooks';
import { RegisterClassEx, UUIDsEqual } from '@memberjunction/global';

/**
 * The system-user GUID. Declared locally: the canonical constant moved to
 * `@memberjunction/generic-database-provider` (a server-side package MJCore must not depend on),
 * and shared code now asks `WellKnownUserSource.Instance.IsSystemUser()` instead.
 */
const SystemUserID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';

/**
 * Stands in for the server-side source. The field-security exemption resolves the system user
 * through the class factory, so MJCore tests must register one — which is itself the contract:
 * with no server-side source loaded (a browser), NO user is the system user and the exemption
 * correctly never fires.
 */
@RegisterClassEx(WellKnownUserSource, { priority: 10, skipNullKeyWarning: true })
class TestFieldSecurityWellKnownUserSource extends WellKnownUserSource {
    public override IsSystemUser(user: UserInfo | null | undefined): boolean {
        return !!user?.ID && UUIDsEqual(user.ID, SystemUserID);
    }
}
WellKnownUserSource.ResetInstance();

// ─── Constants ────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees';

// ─── Metadata builders ────────────────────────────────────────────────────

const ALLOW = FieldPermissionAccess.Allow;
const DENY = FieldPermissionAccess.Deny;
const NONE = FieldPermissionAccess.NoAccess;

/**
 * Full access to `fieldId` for every listed role. Snapshot initialization writes rows like
 * these for every (field, role) holding the matching entity-level permission — which is why the
 * UNRESTRICTED fields below need them explicitly. On an FLS-enabled entity a field with no rows
 * is denied, not open.
 */
function openTo(fieldId: string, roles: string[] = [HR_ROLE_ID, INTERN_ROLE_ID]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: ALLOW,
        UpdateAccess: ALLOW,
        CreateAccess: ALLOW,
    }));
}

/**
 * An `Employees` entity whose `Salary` field is readable/updatable only by HR.
 * `Name` and `Notes` are open to both roles; the `ID` primary key is unrestrictable.
 */
function employeeEntityInit(
    salaryPermissions: Record<string, unknown>[],
    enableFieldLevelSecurity: boolean = true
): Record<string, unknown> {
    return {
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EnableFieldLevelSecurity: enableFieldLevelSecurity,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('f-name') },
            {
                ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money',
                EntityFieldPermissions: salaryPermissions,
            },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 4, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('f-notes') },
        ],
    };
}

const hrOnlySalary = openTo('f-salary', [HR_ROLE_ID]);

/**
 * Metadata for the Get/Set gate tests: `Salary` is HR-only (so the intern cannot read it),
 * `Bonus` is readable by the intern but not updatable, and `Notes` is fully open.
 */
const GATE_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseView: 'vwEmployees', BaseTable: 'Employee',
            IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
            EnableFieldLevelSecurity: true,
            EntityFields: [
                { ID: 'f-id', EntityID: ENTITY_ID, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-name', EntityID: ENTITY_ID, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', Sequence: 2, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-name') },
                { ID: 'f-salary', EntityID: ENTITY_ID, Name: 'Salary', Entity: 'Employees', Type: 'money', Sequence: 3, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-salary', [HR_ROLE_ID]) },
                {
                    ID: 'f-bonus', EntityID: ENTITY_ID, Name: 'Bonus', Entity: 'Employees', Type: 'money', Sequence: 4, AllowUpdateAPI: true,
                    EntityFieldPermissions: [
                        ...openTo('f-bonus', [HR_ROLE_ID]),
                        { ID: 'f-bonus-intern', EntityFieldID: 'f-bonus', RoleID: INTERN_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE },
                    ],
                },
                { ID: 'f-notes', EntityID: ENTITY_ID, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', Sequence: 5, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-notes') },
            ],
            EntityPermissions: [
                { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
                { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
    ],
    get EntityFields() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []); },
    get EntityPermissions() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []); },
    EntityFieldValues: [], EntityRelationships: [], EntitySettings: [], ApplicationEntities: [], ApplicationSettings: [],
    Roles: [{ ID: HR_ROLE_ID, Name: 'HR' }, { ID: INTERN_ROLE_ID, Name: 'Intern' }],
    RowLevelSecurityFilters: [], AuditLogTypes: [], Authorizations: [],
    QueryCategories: [], Queries: [], QueryFields: [], QueryPermissions: [], QueryEntities: [], QueryParameters: [],
    EntityDocumentTypes: [], Libraries: [], ExplorerNavigationItems: [],
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

// ─── Test provider ────────────────────────────────────────────────────────

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

    /** Exposes the protected predicate gate for direct testing. */
    public assertPredicates(params: RunViewParams, user?: UserInfo): void {
        return this['AssertPredicatesRespectFieldSecurity'](params, user);
    }
    /** Exposes the protected output projection for direct testing. */
    public applyProjection<T>(rows: T[], params: RunViewParams, user?: UserInfo): T[] {
        return this['ApplyFieldSecurityProjection'](rows, params, user);
    }

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
    public get InstanceConnectionString(): string { return 'fls-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

function setupProvider(
    salaryPermissions: Record<string, unknown>[] = hrOnlySalary,
    enableFieldLevelSecurity: boolean = true
): TestProvider {
    const provider = new TestProvider();
    provider.seedEntities([new EntityInfo(employeeEntityInit(salaryPermissions, enableFieldLevelSecurity))]);
    return provider;
}

const viewParams = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', ...extra }) as RunViewParams;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Per-request precompute
// ═══════════════════════════════════════════════════════════════════════════

describe('EntityInfo denied-field sets (per-request precompute)', () => {
    it('returns the denied field for a user outside the granted role', () => {
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary));
        expect([...entity.GetDeniedReadFields(buildUser([INTERN_ROLE_ID]))]).toEqual(['salary']);
    });

    it('returns an empty set for a user inside the granted role', () => {
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary));
        expect(entity.GetDeniedReadFields(buildUser([HR_ROLE_ID])).size).toBe(0);
    });

    it('returns an empty set when field security is switched OFF on the entity', () => {
        // Same rows as the restricted case above — the flag is the only thing that changed.
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary, false));
        expect(entity.GetDeniedReadFields(buildUser([INTERN_ROLE_ID])).size).toBe(0);
    });

    it('lowercases names so callers can match case-insensitively', () => {
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary));
        expect(entity.GetDeniedReadFields(buildUser([INTERN_ROLE_ID])).has('salary')).toBe(true);
    });

    it('tracks read and update denials independently', () => {
        // Readable but NOT updatable for the intern role.
        const perms = [
            ...openTo('f-salary', [HR_ROLE_ID]),
            { ID: 'p2', EntityFieldID: 'f-salary', RoleID: INTERN_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE },
        ];
        const entity = new EntityInfo(employeeEntityInit(perms));
        const intern = buildUser([INTERN_ROLE_ID]);
        expect(entity.GetDeniedReadFields(intern).size).toBe(0);
        expect([...entity.GetDeniedUpdateFields(intern)]).toEqual(['salary']);
    });

    it('reports the create set too, independently of read and update', () => {
        const perms = [
            ...openTo('f-salary', [HR_ROLE_ID]),
            { ID: 'p2', EntityFieldID: 'f-salary', RoleID: INTERN_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: NONE },
        ];
        const entity = new EntityInfo(employeeEntityInit(perms));
        const intern = buildUser([INTERN_ROLE_ID]);
        expect(entity.GetDeniedCreateFields(intern).has('salary')).toBe(true);
        expect(entity.GetDeniedUpdateFields(intern).has('salary')).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1b. The system-user exemption — the ONE exemption, and why it exists
//
//   1. TASK MODE. Job and agent runners load engines on first touch, and engine caches are
//      process-wide — whoever touches one first would otherwise configure it for every
//      subsequent user in the process. BaseEngine.ResolveContextUser() forces the system user
//      on Database providers; this exemption is what makes that resolution safe.
//   2. IT PROTECTS NOTHING TO DENY IT. The server reads through one service login that can
//      already see every column, so denying the system user here only breaks the server's
//      ability to do its own work.
// ═══════════════════════════════════════════════════════════════════════════

describe('System-user exemption', () => {
    /** The system user, holding no roles at all — the shape that would otherwise be denied. */
    const systemUser = (): UserInfo => buildUser([], SystemUserID);

    it('is exempt from a Deny that would otherwise catch it', () => {
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary));
        expect(entity.GetDeniedReadFields(systemUser()).size).toBe(0);
        expect(entity.GetDeniedUpdateFields(systemUser()).size).toBe(0);
        expect(entity.GetDeniedCreateFields(systemUser()).size).toBe(0);
    });

    it('reads, updates and creates a secured field while holding NO matching role', () => {
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary));
        const perms = entity.Fields.find(f => f.Name === 'Salary')!.GetUserFieldPermissions(systemUser(), true);
        expect(perms).toEqual({ CanRead: true, CanUpdate: true, CanCreate: true });
    });

    it('is exempt even from an explicit Deny row aimed at a role it holds', () => {
        const denyIntern = [
            ...hrOnlySalary,
            { ID: 'p2', EntityFieldID: 'f-salary', RoleID: INTERN_ROLE_ID, ReadAccess: DENY, UpdateAccess: DENY, CreateAccess: DENY },
        ];
        const entity = new EntityInfo(employeeEntityInit(denyIntern));
        const sysWithRole = buildUser([INTERN_ROLE_ID], SystemUserID);
        expect(entity.GetDeniedReadFields(sysWithRole).size).toBe(0);
    });

    it('is exempt from the fail-closed default too — a field reconciliation never reached', () => {
        // The exemption has to cover more than Denies now: on an FLS-enabled entity a field
        // with NO rows is denied, and the server would otherwise lose a brand-new column
        // between a schema change and the next reconciliation run.
        const entity = new EntityInfo(employeeEntityInit([]));
        expect(entity.GetDeniedReadFields(systemUser()).size).toBe(0);
        expect(entity.GetDeniedReadFields(buildUser([HR_ROLE_ID])).has('salary')).toBe(true);
    });

    it('does NOT exempt anyone else — no human bypass, including a role-less user', () => {
        const entity = new EntityInfo(employeeEntityInit(hrOnlySalary));

        // The intern holds Allow rows on Name and Notes, so only Salary is denied.
        expect([...entity.GetDeniedReadFields(buildUser([INTERN_ROLE_ID]))]).toEqual(['salary']);

        // A user holding NO roles matches no Allow row anywhere, so every RESTRICTABLE field
        // is denied — not just the one an administrator singled out. That is the intended
        // shape: access is granted by rows, and this user has none. The primary key stays out
        // of the set because it is unrestrictable, which is what keeps records loadable at all.
        const roleless = [...entity.GetDeniedReadFields(buildUser([], 'some-other-user'))];
        expect(roleless.sort()).toEqual(['name', 'notes', 'salary']);
        expect(roleless).not.toContain('id');
    });

    it('recognizes the system user case-insensitively and is null-safe', () => {
        const source = WellKnownUserSource.Instance;
        expect(source.IsSystemUser(buildUser([], SystemUserID.toUpperCase()))).toBe(true);
        expect(source.IsSystemUser(buildUser([], 'not-the-system-user'))).toBe(false);
        expect(source.IsSystemUser(null)).toBe(false);
        expect(source.IsSystemUser(undefined)).toBe(false);
    });

    it('does not exempt anyone when no server-side source is registered (the browser case)', () => {
        // The base source says there are no well-known users, so the exemption cannot fire —
        // which is correct on a client, where there is no system account at all.
        expect(new WellKnownUserSource().IsSystemUser(buildUser([], SystemUserID))).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Predicate validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Predicate validation (ExtraFilter / OrderBy)', () => {
    it('rejects an ExtraFilter referencing a denied field — the value-reconstruction hole', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ ExtraFilter: 'Salary > 200000' }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/does not exist on entity 'Employees' or you do not have access to it/);
    });

    it('rejects an OrderBy referencing a denied field — paging order leaks values too', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ OrderBy: 'Salary DESC' }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/Salary/);
    });

    it('does NOT say whether the field is missing or forbidden', () => {
        const provider = setupProvider();
        let message = '';
        try {
            provider.assertPredicates(viewParams({ ExtraFilter: 'Salary > 1' }), buildUser([INTERN_ROLE_ID]));
        } catch (e: unknown) {
            message = e instanceof Error ? e.message : String(e);
        }
        expect(message).toContain('or you do not have access to it');
        // Nothing in the wording confirms the field exists and is restricted.
        expect(message).not.toMatch(/restricted|denied|permission|forbidden/i);
    });

    it('allows a filter on a permitted field', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ ExtraFilter: "Name = 'Ada'" }),
            buildUser([INTERN_ROLE_ID])
        )).not.toThrow();
    });

    it('allows a user who HOLDS the granting role to filter on the secured field', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ ExtraFilter: 'Salary > 200000' }),
            buildUser([HR_ROLE_ID])
        )).not.toThrow();
    });

    it('is a no-op when field security is switched OFF on the entity', () => {
        // The rows still say Salary is HR-only; the flag is what disarms the gate.
        const provider = setupProvider(hrOnlySalary, false);
        expect(() => provider.assertPredicates(
            viewParams({ ExtraFilter: 'Salary > 200000' }),
            buildUser([INTERN_ROLE_ID])
        )).not.toThrow();
    });

    it('is a no-op without a context user (internal/system paths)', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(viewParams({ ExtraFilter: 'Salary > 1' }), undefined)).not.toThrow();
    });

    it('does not reject a filter on a field whose name merely contains the denied name', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ ExtraFilter: 'SalaryBand = 3' }),
            buildUser([INTERN_ROLE_ID])
        )).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2b. Predicate validation — Aggregates
//
// Aggregate expressions are caller-authored SQL just like ExtraFilter/OrderBy;
// `MIN(Salary)` under a narrow filter returns a denied field's exact values
// directly, so the same gate covers them.
// ═══════════════════════════════════════════════════════════════════════════

describe('Predicate validation (Aggregates)', () => {
    it('rejects a bare denied-field reference in an aggregate expression', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'Salary' }] }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/does not exist on entity 'Employees' or you do not have access to it/);
    });

    it('rejects a bracketed denied-field reference', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'MIN([Salary])' }] }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/Salary/);
    });

    it('rejects a function-wrapped denied-field reference — the MIN/MAX reconstruction hole', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'MIN(Salary)' }] }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/Salary/);
    });

    it('rejects a denied field even when the expression is aliased to an innocuous name', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'AVG(Salary)', alias: 'TeamMetric' }] }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/Salary/);
    });

    it('rejects when ANY aggregate in the list references a denied field', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'COUNT(*)' }, { expression: 'MAX(Salary)' }] }),
            buildUser([INTERN_ROLE_ID])
        )).toThrow(/Salary/);
    });

    it('uses the same ambiguous wording as the filter gate', () => {
        const provider = setupProvider();
        let message = '';
        try {
            provider.assertPredicates(viewParams({ Aggregates: [{ expression: 'MIN(Salary)' }] }), buildUser([INTERN_ROLE_ID]));
        } catch (e: unknown) {
            message = e instanceof Error ? e.message : String(e);
        }
        expect(message).toContain('or you do not have access to it');
        expect(message).not.toMatch(/restricted|denied|permission|forbidden/i);
    });

    it('allows aggregates that reference no denied field', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'COUNT(*)' }, { expression: 'MAX(Name)' }] }),
            buildUser([INTERN_ROLE_ID])
        )).not.toThrow();
    });

    it('allows a user who HOLDS the granting role to aggregate the secured field', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'AVG(Salary)' }] }),
            buildUser([HR_ROLE_ID])
        )).not.toThrow();
    });

    it('is a no-op when field security is switched OFF on the entity', () => {
        // The rows still say Salary is HR-only; the flag is what disarms the gate.
        const provider = setupProvider(hrOnlySalary, false);
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'MIN(Salary)' }] }),
            buildUser([INTERN_ROLE_ID])
        )).not.toThrow();
    });

    it('does not reject an aggregate over a field whose name merely contains the denied name', () => {
        const provider = setupProvider();
        expect(() => provider.assertPredicates(
            viewParams({ Aggregates: [{ expression: 'MAX(SalaryBand)' }] }),
            buildUser([INTERN_ROLE_ID])
        )).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Output projection
// ═══════════════════════════════════════════════════════════════════════════

describe('Output projection', () => {
    const rows = () => [
        { ID: '1', Name: 'Ada', Salary: 250000, Notes: 'n1' },
        { ID: '2', Name: 'Grace', Salary: 275000, Notes: 'n2' },
    ];

    it('strips the denied column from every row', () => {
        const provider = setupProvider();
        const out = provider.applyProjection(rows(), viewParams(), buildUser([INTERN_ROLE_ID]));
        expect(out).toEqual([
            { ID: '1', Name: 'Ada', Notes: 'n1' },
            { ID: '2', Name: 'Grace', Notes: 'n2' },
        ]);
    });

    it('omits the key entirely rather than nulling it', () => {
        const provider = setupProvider();
        const out = provider.applyProjection(rows(), viewParams(), buildUser([INTERN_ROLE_ID]));
        expect('Salary' in (out[0] as object)).toBe(false);
    });

    it('leaves rows untouched for a permitted user', () => {
        const provider = setupProvider();
        const out = provider.applyProjection(rows(), viewParams(), buildUser([HR_ROLE_ID]));
        expect(out[0]).toHaveProperty('Salary', 250000);
    });

    it('does NOT mutate the input rows — the cached superset must stay whole', () => {
        // This is what lets a permission change take effect on the next metadata refresh
        // without invalidating the RunView result cache.
        const provider = setupProvider();
        const input = rows();
        provider.applyProjection(input, viewParams(), buildUser([INTERN_ROLE_ID]));
        expect(input[0]).toHaveProperty('Salary', 250000);
    });

    it('SKIPS entity_object results — stripping there round-trips as a real NULL write', () => {
        const provider = setupProvider();
        const out = provider.applyProjection(rows(), viewParams({ ResultType: 'entity_object' }), buildUser([INTERN_ROLE_ID]));
        expect(out[0]).toHaveProperty('Salary', 250000);
    });

    it('matches column keys case-insensitively', () => {
        const provider = setupProvider();
        const out = provider.applyProjection(
            [{ ID: '1', salary: 250000 }],
            viewParams(),
            buildUser([INTERN_ROLE_ID])
        );
        expect(out[0]).toEqual({ ID: '1' });
    });

    it('returns the original array when nothing is denied (no rebuild)', () => {
        const provider = setupProvider();
        const input = rows();
        expect(provider.applyProjection(input, viewParams(), buildUser([HR_ROLE_ID]))).toBe(input);
    });

    it('handles empty and absent result sets', () => {
        const provider = setupProvider();
        expect(provider.applyProjection([], viewParams(), buildUser([INTERN_ROLE_ID]))).toEqual([]);
    });

    it('is a no-op without a context user', () => {
        const provider = setupProvider();
        const input = rows();
        expect(provider.applyProjection(input, viewParams(), undefined)).toBe(input);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Save guard
// ═══════════════════════════════════════════════════════════════════════════

describe('BaseEntity save guard', () => {
    class TestEntity extends BaseEntity {}

    /** Salary: HR only. The intern cannot READ it, so Get/Set throw for them. */
    const SALARY_PERMS = openTo('f-salary', [HR_ROLE_ID]);

    /**
     * Bonus: readable by both, but the intern may neither update nor create it.
     *
     * This is the only shape that can exercise the update guard, and the create suppression,
     * at all. Read is required for Update and Create, so denied-read is a subset of
     * denied-update — a field the intern cannot READ throws at `Set` long before any save-time
     * guard could run on it.
     */
    const BONUS_PERMS = [
        ...openTo('f-bonus', [HR_ROLE_ID]),
        { ID: 'f-bonus-intern', EntityFieldID: 'f-bonus', RoleID: INTERN_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE },
    ];

    const MOCK_METADATA = {
        Applications: [],
        Entities: [
            {
                ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseView: 'vwEmployees', BaseTable: 'Employee',
                IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
                EnableFieldLevelSecurity: true,
                // AllowUpdateAPI must be true or EntityFieldInfo.ReadOnly is true, the field is
                // never Dirty, and every assertion below passes vacuously.
                EntityFields: [
                    { ID: 'f-id', EntityID: ENTITY_ID, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                    { ID: 'f-name', EntityID: ENTITY_ID, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', Sequence: 2, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-name') },
                    { ID: 'f-salary', EntityID: ENTITY_ID, Name: 'Salary', Entity: 'Employees', Type: 'money', Sequence: 3, AllowUpdateAPI: true, EntityFieldPermissions: SALARY_PERMS },
                    { ID: 'f-bonus', EntityID: ENTITY_ID, Name: 'Bonus', Entity: 'Employees', Type: 'money', Sequence: 4, AllowUpdateAPI: true, EntityFieldPermissions: BONUS_PERMS },
                    { ID: 'f-notes', EntityID: ENTITY_ID, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', Sequence: 5, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-notes') },
                ],
                EntityPermissions: [
                    { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
                    { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
                ],
            },
        ],
        get EntityFields() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []); },
        get EntityPermissions() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []); },
        EntityFieldValues: [], EntityRelationships: [], EntitySettings: [], ApplicationEntities: [], ApplicationSettings: [],
        Roles: [{ ID: HR_ROLE_ID, Name: 'HR' }, { ID: INTERN_ROLE_ID, Name: 'Intern' }],
        RowLevelSecurityFilters: [], AuditLogTypes: [], Authorizations: [],
        QueryCategories: [], Queries: [], QueryFields: [], QueryPermissions: [], QueryEntities: [], QueryParameters: [],
        EntityDocumentTypes: [], Libraries: [], ExplorerNavigationItems: [],
    };

    let provider: TestMetadataProvider;

    beforeEach(async () => {
        ClearAllDataHooks();
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(MOCK_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    });
    afterEach(() => ClearAllDataHooks());

    function makeEntity(user: UserInfo, isSaved = true): { entity: BaseEntity; saveSpy: ReturnType<typeof vi.fn> } {
        const entityInfo = provider.Entities.find(e => e.Name === 'Employees')!;
        const entity = new TestEntity(entityInfo);
        Object.defineProperty(entity, 'ActiveUser', { get: () => user, configurable: true });
        Object.defineProperty(entity, 'IsSaved', { get: () => isSaved, configurable: true });
        const saveSpy = vi.fn().mockResolvedValue({ ID: '1', Name: 'x', Salary: 250000, Notes: 'n' });
        Object.defineProperty(entity, 'ProviderToUse', { get: () => ({ Save: saveSpy }), configurable: true });
        vi.spyOn(entity, 'Validate').mockReturnValue({ Success: true, Errors: [] } as never);
        vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
        vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);
        entity.LoadFromData({ ID: '1', Name: 'Ada', Salary: 250000, Notes: 'original' });
        return { entity, saveSpy };
    }

    const opts = () => Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true });

    it('the Salary field is genuinely dirty after Set (guards against a vacuous suite)', () => {
        const { entity } = makeEntity(buildUser([HR_ROLE_ID]));
        entity.Set('Salary', 999999);
        expect(entity.Fields.find(f => f.Name === 'Salary')!.Dirty).toBe(true);
    });

    it('rejects a save that modifies a field the user cannot update', async () => {
        // Per MJ's Save contract, a logical failure returns false and records the reason on
        // LatestResult — it does not throw. The guard throws internally; Save converts it.
        const { entity, saveSpy } = makeEntity(buildUser([INTERN_ROLE_ID]));
        entity.Set('Bonus', 999999); // readable, so Set is allowed; not updatable, so Save is not

        const saved = await entity.Save(opts());

        expect(saved).toBe(false);
        expect(saveSpy).not.toHaveBeenCalled(); // rejected BEFORE any SQL was generated
        expect(entity.LatestResult?.CompleteMessage).toMatch(
            /Field 'Bonus' does not exist on entity 'Employees' or you do not have access to it/
        );
    });

    it('the rejection message does not disclose whether the field is missing or forbidden', async () => {
        const { entity } = makeEntity(buildUser([INTERN_ROLE_ID]));
        entity.Set('Bonus', 999999);
        await entity.Save(opts());

        const message = entity.LatestResult?.CompleteMessage ?? '';
        expect(message).toContain('or you do not have access to it');
        expect(message).not.toMatch(/restricted|denied|permission|forbidden/i);
    });

    it('allows the same save for a user who holds the granting role', async () => {
        const { entity, saveSpy } = makeEntity(buildUser([HR_ROLE_ID]));
        entity.Set('Salary', 999999);
        await expect(entity.Save(opts())).resolves.toBe(true);
        expect(saveSpy).toHaveBeenCalled();
    });

    it('ROUND-TRIP SAFETY: a restricted user edits an unrelated field and saves cleanly', async () => {
        // The regression guard for the rejected load-time-nulling design. Salary is never
        // nulled in memory, so it is not dirty, so this save is permitted AND the stored
        // salary is carried through untouched rather than written back as NULL.
        const { entity, saveSpy } = makeEntity(buildUser([INTERN_ROLE_ID]));
        entity.Set('Notes', 'updated note');

        await expect(entity.Save(opts())).resolves.toBe(true);
        expect(saveSpy).toHaveBeenCalled();

        // Read the stored value off the EntityField rather than through Get(), which throws for
        // this user by design. Framework-internal value machinery is exempt from the gate, and
        // that exemption is exactly what keeps the value intact through the round trip.
        expect(entity.Fields.find(f => f.Name === 'Salary')!.Value).toBe(250000);
    });

    it('does not REJECT an INSERT — a create-denied value is dropped, never an error', async () => {
        // The update guard is a rejection; the create path deliberately is not. A user who may
        // not create a field gets the column default rather than a failed save, matching the
        // read path (a denied field is absent, not an error) and the ambiguous-error rule
        // (naming the field would confirm it exists and is restricted).
        const { entity, saveSpy } = makeEntity(buildUser([INTERN_ROLE_ID]), false);
        entity.Set('Bonus', 100);

        await expect(entity.Save(opts())).resolves.toBe(true);
        expect(saveSpy).toHaveBeenCalled();
    });

    it('marks a create-denied field suppressed so the save omits it', async () => {
        const { entity } = makeEntity(buildUser([INTERN_ROLE_ID]), false);
        entity.Set('Bonus', 100);
        await entity.Save(opts());

        // The value is still in memory — it is simply not one this user may supply, so the
        // SQL builder leaves the parameter out and the column takes its default.
        const bonus = entity.Fields.find(f => f.Name === 'Bonus')!;
        expect(bonus.CreateSuppressed).toBe(true);
        expect(bonus.Value).toBe(100);
        expect(entity.Fields.find(f => f.Name === 'Notes')!.CreateSuppressed).toBe(false);
    });

    it('does not suppress anything on an UPDATE', async () => {
        const { entity } = makeEntity(buildUser([INTERN_ROLE_ID]));
        entity.Set('Notes', 'edit');
        await entity.Save(opts());

        for (const field of entity.Fields) {
            expect(field.CreateSuppressed).toBe(false);
        }
    });

    it('suppresses nothing for a user who may create the field', async () => {
        const { entity } = makeEntity(buildUser([HR_ROLE_ID]), false);
        entity.Set('Bonus', 100);
        await entity.Save(opts());

        expect(entity.Fields.find(f => f.Name === 'Bonus')!.CreateSuppressed).toBe(false);
    });

    it('is a no-op for an entity with field security switched OFF', async () => {
        const entityInfo = provider.Entities.find(e => e.Name === 'Employees')!;
        // The flag alone disarms enforcement — the permission rows are left in place, which is
        // exactly the "retained but inactive" state a disabled entity is meant to hold.
        entityInfo.EnableFieldLevelSecurity = false;

        const { entity, saveSpy } = makeEntity(buildUser([INTERN_ROLE_ID]));
        entity.Set('Salary', 1); // read-denied while enabled; freely settable once off
        await expect(entity.Save(opts())).resolves.toBe(true);
        expect(saveSpy).toHaveBeenCalled();
        expect(entityInfo.Fields.find(f => f.Name === 'Salary')!.HasFieldPermissions).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. The strongly-typed accessor path throws on a field the user cannot read
// ═══════════════════════════════════════════════════════════════════════════

describe('BaseEntity Get/Set field-security gate', () => {
    class TypedTestEntity extends BaseEntity {}

    let provider: TestMetadataProvider;

    beforeEach(async () => {
        ClearAllDataHooks();
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(GATE_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    });
    afterEach(() => ClearAllDataHooks());

    function makeEntity(user: UserInfo | null): BaseEntity {
        const entityInfo = provider.Entities.find(e => e.Name === 'Employees')!;
        const entity = new TypedTestEntity(entityInfo);
        Object.defineProperty(entity, 'ActiveUser', { get: () => user, configurable: true });
        entity.LoadFromData({ ID: '1', Name: 'Ada', Salary: 250000, Bonus: 10, Notes: 'n' });
        return entity;
    }

    it('Get throws for a field the user cannot read', () => {
        const entity = makeEntity(buildUser([INTERN_ROLE_ID]));
        expect(() => entity.Get('Salary')).toThrow(
            /Field 'Salary' does not exist on entity 'Employees' or you do not have access to it/
        );
    });

    it('Set throws for a field the user cannot read', () => {
        const entity = makeEntity(buildUser([INTERN_ROLE_ID]));
        expect(() => entity.Set('Salary', 1)).toThrow(/does not have access to it|do not have access to it/);
    });

    it('allows a readable-but-not-updatable field through Get and Set', () => {
        // The write is refused at save time, not at the accessor — a rejection here would fire
        // on every keystroke of a bound form field rather than once, at the save.
        const entity = makeEntity(buildUser([INTERN_ROLE_ID]));
        expect(entity.Get('Bonus')).toBe(10);
        expect(() => entity.Set('Bonus', 99)).not.toThrow();
    });

    it('does not throw for a user who may read the field', () => {
        const entity = makeEntity(buildUser([HR_ROLE_ID]));
        expect(entity.Get('Salary')).toBe(250000);
        expect(() => entity.Set('Salary', 1)).not.toThrow();
    });

    it('FAILS OPEN when no user resolves', () => {
        // ActiveUser is legitimately null in plenty of server paths. A gate that threw there
        // would break unrelated code in ways that look nothing like field security.
        const entity = makeEntity(null);
        expect(entity.Get('Salary')).toBe(250000);
        expect(() => entity.Set('Salary', 1)).not.toThrow();
    });

    it('SetMany does NOT throw — it is the hydration and resolver-apply path', () => {
        const entity = makeEntity(buildUser([INTERN_ROLE_ID]));
        expect(() => entity.SetMany({ Notes: 'x', Salary: 1 })).not.toThrow();
    });

    it('framework-internal reads stay exempt, so the value survives for the save path', () => {
        const entity = makeEntity(buildUser([INTERN_ROLE_ID]));

        expect(() => entity.Get('Salary')).toThrow();
        expect(entity.Fields.find(f => f.Name === 'Salary')!.Value).toBe(250000);
        expect(entity.GetAll()['Salary']).toBe(250000);
    });

});
