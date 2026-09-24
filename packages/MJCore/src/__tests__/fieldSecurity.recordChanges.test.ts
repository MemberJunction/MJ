/**
 * Field-Level Security — the Record Changes payload projection.
 *
 * The audit trail is the one enforcement point whose denied set is computed against a DIFFERENT
 * entity than the one being read: `MJ: Record Changes` has field security switched off, and each
 * row names its subject in its own `EntityID` column. These tests cover the five things that
 * makes different from every other projection:
 *
 *   1. Payload projection    — denied keys dropped from ChangesJSON / FullRecordJSON
 *   2. Description withhold  — ChangesDescription is removed outright, never redacted
 *   3. Per-entity memoization — GetDeniedReadFields is resolved once per DISTINCT EntityID
 *   4. Fail closed           — an EntityID that does not resolve, or is absent from the row
 *   5. No collateral         — a caller with no denials on the subject entity sees the payload
 *                              byte-for-byte unchanged, and gets the SAME array back
 */

import { describe, it, expect } from 'vitest';
import {
    RecordChangeFieldSecurityProjector,
    ProjectRecordChangePayloadJSON,
    RecordChangesEntityName,
} from '../generic/recordChangeFieldSecurity';
import { ProviderBase } from '../generic/providerBase';
import { EntityInfo, FieldPermissionAccess, RecordDependency, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import {
    DatasetResultType,
    DatasetStatusResultType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    ILocalStorageProvider,
    IMetadataProvider,
    PotentialDuplicateResponse,
    ProviderType,
    RunViewResult,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { BaseEntity } from '../generic/baseEntity';

// ─── Constants ────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'B0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'B0000000-0000-0000-0000-000000000003';
const EMPLOYEES_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000E1';
const PROJECTS_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000E2';
const RECORD_CHANGES_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000E3';
const GHOST_ENTITY_ID = 'E0000000-0000-0000-0000-00000000DEAD';

const ALLOW = FieldPermissionAccess.Allow;
const NONE = FieldPermissionAccess.NoAccess;

// ─── Metadata builders ────────────────────────────────────────────────────

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

/** `Employees`, with `Salary` readable only by HR. This is the entity the audit rows are ABOUT. */
function employeesEntity(enableFieldLevelSecurity: boolean = true): EntityInfo {
    return new EntityInfo({
        ID: EMPLOYEES_ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: enableFieldLevelSecurity,
        Permissions: [
            { EntityID: EMPLOYEES_ENTITY_ID, RoleID: HR_ROLE_ID, CanRead: true },
            { EntityID: EMPLOYEES_ENTITY_ID, RoleID: INTERN_ROLE_ID, CanRead: true },
        ],
        Fields: [
            { ID: 'e-f-id', EntityID: EMPLOYEES_ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'e-f-name', EntityID: EMPLOYEES_ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('e-f-name') },
            { ID: 'e-f-salary', EntityID: EMPLOYEES_ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: openTo('e-f-salary', [HR_ROLE_ID]) },
        ],
    });
}

/** `Projects` — field security OFF, the ordinary case. Nothing on it is ever denied. */
function projectsEntity(): EntityInfo {
    return new EntityInfo({
        ID: PROJECTS_ENTITY_ID,
        Name: 'Projects',
        SchemaName: 'dbo',
        BaseTable: 'Project',
        BaseView: 'vwProjects',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: false,
        Permissions: [],
        Fields: [
            { ID: 'p-f-id', EntityID: PROJECTS_ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Projects', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'p-f-budget', EntityID: PROJECTS_ENTITY_ID, Sequence: 2, Name: 'Budget', Entity: 'Projects', Type: 'money' },
        ],
    });
}

/**
 * The audit entity itself — field security OFF, which is the default and the whole reason this
 * projection exists separately from `ApplyFieldSecurityProjection`.
 */
function recordChangesEntity(): EntityInfo {
    return new EntityInfo({
        ID: RECORD_CHANGES_ENTITY_ID,
        Name: RecordChangesEntityName,
        SchemaName: '__mj',
        BaseTable: 'RecordChange',
        BaseView: 'vwRecordChanges',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: false,
        Permissions: [],
        Fields: [
            { ID: 'rc-f-id', EntityID: RECORD_CHANGES_ENTITY_ID, Sequence: 1, Name: 'ID', Entity: RecordChangesEntityName, Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'rc-f-entityid', EntityID: RECORD_CHANGES_ENTITY_ID, Sequence: 2, Name: 'EntityID', Entity: RecordChangesEntityName, Type: 'uniqueidentifier' },
            { ID: 'rc-f-changesjson', EntityID: RECORD_CHANGES_ENTITY_ID, Sequence: 3, Name: 'ChangesJSON', Entity: RecordChangesEntityName, Type: 'nvarchar' },
            { ID: 'rc-f-desc', EntityID: RECORD_CHANGES_ENTITY_ID, Sequence: 4, Name: 'ChangesDescription', Entity: RecordChangesEntityName, Type: 'nvarchar' },
            { ID: 'rc-f-full', EntityID: RECORD_CHANGES_ENTITY_ID, Sequence: 5, Name: 'FullRecordJSON', Entity: RecordChangesEntityName, Type: 'nvarchar' },
        ],
    });
}

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

/**
 * The projector only ever asks its provider two things — `Entities` and `EntityByID` — so the
 * double models exactly those, and counts the ID lookups so the memoization test can assert on
 * them without reaching into private state.
 */
class TestProvider {
    public EntityByIDCallCount = 0;
    constructor(private readonly entities: EntityInfo[]) {}

    public get Entities(): EntityInfo[] {
        return this.entities;
    }
    public EntityByID(entityID: string): EntityInfo | undefined {
        this.EntityByIDCallCount++;
        return this.entities.find(e => e.ID?.trim().toLowerCase() === entityID?.trim().toLowerCase());
    }
}

function makeProvider(employeesFLS: boolean = true): TestProvider {
    return new TestProvider([employeesEntity(employeesFLS), projectsEntity(), recordChangesEntity()]);
}

function makeProjector(provider: TestProvider, user: UserInfo): RecordChangeFieldSecurityProjector {
    return new RecordChangeFieldSecurityProjector(provider as unknown as IMetadataProvider, user);
}

// ─── Row fixtures ─────────────────────────────────────────────────────────

const SALARY_CHANGES_JSON = JSON.stringify({
    Name: { field: 'Name', oldValue: 'Ada', newValue: 'Ada L' },
    Salary: { field: 'Salary', oldValue: 100000, newValue: 120000 },
});

const SALARY_FULL_RECORD_JSON = JSON.stringify({
    ID: 'emp-1',
    Name: 'Ada L',
    Salary: 120000,
});

function employeeChangeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'rc-1',
        EntityID: EMPLOYEES_ENTITY_ID,
        RecordID: 'emp-1',
        Type: 'Update',
        ChangesJSON: SALARY_CHANGES_JSON,
        ChangesDescription: 'Salary changed from 100000 to 120000',
        FullRecordJSON: SALARY_FULL_RECORD_JSON,
        ...overrides,
    };
}

function projectChangeRow(): Record<string, unknown> {
    return {
        ID: 'rc-2',
        EntityID: PROJECTS_ENTITY_ID,
        RecordID: 'proj-1',
        Type: 'Update',
        ChangesJSON: JSON.stringify({ Budget: { field: 'Budget', oldValue: 1, newValue: 2 } }),
        ChangesDescription: 'Budget changed from 1 to 2',
        FullRecordJSON: JSON.stringify({ ID: 'proj-1', Budget: 2 }),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Payload projection
// ═══════════════════════════════════════════════════════════════════════════

describe('Record Changes payload projection', () => {
    it('drops the denied field from ChangesJSON and keeps everything else', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow()]);

        const changes = JSON.parse(rows[0]['ChangesJSON'] as string);
        expect(Object.keys(changes)).toEqual(['Name']);
        expect(changes.Name).toEqual({ field: 'Name', oldValue: 'Ada', newValue: 'Ada L' });
    });

    it('drops the denied field from FullRecordJSON, which is a whole-row snapshot', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow()]);

        const full = JSON.parse(rows[0]['FullRecordJSON'] as string);
        expect(full).toEqual({ ID: 'emp-1', Name: 'Ada L' });
    });

    it('leaves the non-payload columns of the row alone', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow()]);

        expect(rows[0]['ID']).toBe('rc-1');
        expect(rows[0]['EntityID']).toBe(EMPLOYEES_ENTITY_ID);
        expect(rows[0]['RecordID']).toBe('emp-1');
        expect(rows[0]['Type']).toBe('Update');
    });

    it('does not mutate the row it was given — cache rows are shared and frozen', () => {
        const original = employeeChangeRow();
        const snapshot = { ...original };
        makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID])).ProjectRows([original]);
        expect(original).toEqual(snapshot);
    });

    it('drops an entry whose inner `field` names a denied column even when its key does not', () => {
        const row = employeeChangeRow({
            ChangesJSON: JSON.stringify({ Mystery: { field: 'Salary', oldValue: 1, newValue: 2 } }),
        });
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID])).ProjectRows([row]);
        expect(JSON.parse(rows[0]['ChangesJSON'] as string)).toEqual({});
    });

    it('matches denied field names case-insensitively', () => {
        const row = employeeChangeRow({
            ChangesJSON: JSON.stringify({ salary: { field: 'salary', oldValue: 1, newValue: 2 } }),
        });
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID])).ProjectRows([row]);
        expect(JSON.parse(rows[0]['ChangesJSON'] as string)).toEqual({});
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ChangesDescription is withheld, never redacted
// ═══════════════════════════════════════════════════════════════════════════

describe('ChangesDescription withhold', () => {
    it('removes the column entirely — the value is prose and cannot be safely narrowed', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow()]);
        expect('ChangesDescription' in rows[0]).toBe(false);
    });

    it('withholds even when the denied field is not among the fields that changed', () => {
        // The description is withheld on the strength of the caller carrying ANY denial on the
        // target entity, not on whether this particular row mentions the denied field. Deciding
        // per row would leak on the first value that appears in an unexpected form.
        const row = employeeChangeRow({
            ChangesJSON: JSON.stringify({ Name: { field: 'Name', oldValue: 'Ada', newValue: 'Ada L' } }),
            ChangesDescription: 'Name changed from Ada to Ada L',
        });
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID])).ProjectRows([row]);
        expect('ChangesDescription' in rows[0]).toBe(false);
    });

    it('omits rather than nulls, so a caller cannot read it back as an empty change', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow()]);
        expect(rows[0]['ChangesDescription']).toBeUndefined();
        expect(Object.keys(rows[0])).not.toContain('ChangesDescription');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Per-entity memoization
// ═══════════════════════════════════════════════════════════════════════════

describe('Per-entity resolution across a mixed result', () => {
    it('resolves each DISTINCT EntityID exactly once, not once per row', () => {
        const provider = makeProvider();
        const projector = makeProjector(provider, buildUser([INTERN_ROLE_ID]));
        const rows = [
            employeeChangeRow({ ID: 'rc-a' }),
            employeeChangeRow({ ID: 'rc-b' }),
            projectChangeRow(),
            employeeChangeRow({ ID: 'rc-c' }),
        ];

        projector.ProjectRows(rows);

        // Two distinct EntityIDs across four rows.
        expect(provider.EntityByIDCallCount).toBe(2);
    });

    it('projects rows for the restricted entity and leaves the others intact in the same result', () => {
        const projector = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]));
        const employeeRow = employeeChangeRow();
        const projectRow = projectChangeRow();

        const rows = projector.ProjectRows([employeeRow, projectRow]);

        expect('ChangesDescription' in rows[0]).toBe(false);
        expect(JSON.parse(rows[0]['ChangesJSON'] as string)).not.toHaveProperty('Salary');
        // Projects has field security off, so its audit row is returned by reference, untouched.
        expect(rows[1]).toBe(projectRow);
        expect(rows[1]['ChangesDescription']).toBe('Budget changed from 1 to 2');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Fail closed
// ═══════════════════════════════════════════════════════════════════════════

describe('Unresolvable target entity fails closed', () => {
    it('withholds all three payload columns when EntityID names no known entity', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow({ EntityID: GHOST_ENTITY_ID })]);

        expect('ChangesJSON' in rows[0]).toBe(false);
        expect('FullRecordJSON' in rows[0]).toBe(false);
        expect('ChangesDescription' in rows[0]).toBe(false);
        // Everything else survives — the row itself is still a legible audit entry.
        expect(rows[0]['ID']).toBe('rc-1');
        expect(rows[0]['EntityID']).toBe(GHOST_ENTITY_ID);
    });

    it('withholds when the caller narrowed Fields so the row carries no EntityID at all', () => {
        // This is the case that decides the policy: field narrowing runs BEFORE this projection,
        // so failing open here would make `Fields: ['ChangesJSON']` a one-parameter bypass.
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([{ ChangesJSON: SALARY_CHANGES_JSON }]);

        expect('ChangesJSON' in rows[0]).toBe(false);
    });

    it('withholds a payload that is not valid JSON rather than passing it through', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow({ ChangesJSON: 'Salary: 120000' })]);

        expect('ChangesJSON' in rows[0]).toBe(false);
        // The sibling column parsed fine and is projected normally.
        expect(JSON.parse(rows[0]['FullRecordJSON'] as string)).toEqual({ ID: 'emp-1', Name: 'Ada L' });
    });

    it('keeps an empty ChangesJSON as-is — Create and Delete rows legitimately store one', () => {
        const rows = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRows([employeeChangeRow({ ChangesJSON: '' })]);

        expect(rows[0]['ChangesJSON']).toBe('');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. No collateral damage for callers who are denied nothing
// ═══════════════════════════════════════════════════════════════════════════

describe('Unrestricted callers see the payload unchanged', () => {
    it('returns the full payload, including ChangesDescription, for a user in the granted role', () => {
        const original = employeeChangeRow();
        const rows = makeProjector(makeProvider(), buildUser([HR_ROLE_ID])).ProjectRows([original]);

        expect(rows[0]).toBe(original);
        expect(JSON.parse(rows[0]['ChangesJSON'] as string)).toHaveProperty('Salary');
        expect(rows[0]['ChangesDescription']).toBe('Salary changed from 100000 to 120000');
        expect(JSON.parse(rows[0]['FullRecordJSON'] as string)).toHaveProperty('Salary');
    });

    it('returns the SAME array instance when nothing needed changing', () => {
        // The cache-hit paths hand this method the cache's own frozen objects; rebuilding them
        // for an unrestricted caller would be pure waste on the hottest path.
        const rows = [employeeChangeRow()];
        const result = makeProjector(makeProvider(), buildUser([HR_ROLE_ID])).ProjectRows(rows);
        expect(result).toBe(rows);
    });

    it('is a no-op on a deployment where no entity has field security enabled', () => {
        // Including the fail-closed branch: without this gate, an audit row for a deleted entity
        // would be blanked on deployments that never opted into field security at all.
        const provider = makeProvider(false);
        const rows = [employeeChangeRow(), employeeChangeRow({ EntityID: GHOST_ENTITY_ID })];
        const result = makeProjector(provider, buildUser([INTERN_ROLE_ID])).ProjectRows(rows);

        expect(result).toBe(rows);
        expect(result[1]['ChangesJSON']).toBe(SALARY_CHANGES_JSON);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Entity identification and the single-row form
// ═══════════════════════════════════════════════════════════════════════════

describe('IsRecordChangesEntity', () => {
    it('recognizes the audit entity by name, case- and whitespace-insensitively', () => {
        expect(RecordChangeFieldSecurityProjector.IsRecordChangesEntity(recordChangesEntity())).toBe(true);
    });

    it('does not match any other entity', () => {
        expect(RecordChangeFieldSecurityProjector.IsRecordChangesEntity(employeesEntity())).toBe(false);
        expect(RecordChangeFieldSecurityProjector.IsRecordChangesEntity(null)).toBe(false);
        expect(RecordChangeFieldSecurityProjector.IsRecordChangesEntity(undefined)).toBe(false);
    });
});

describe('ProjectRow (the single-record GraphQL boundary)', () => {
    it('applies the same treatment as the list form', () => {
        const projected = makeProjector(makeProvider(), buildUser([INTERN_ROLE_ID]))
            .ProjectRow(employeeChangeRow());

        expect(JSON.parse(projected['ChangesJSON'] as string)).not.toHaveProperty('Salary');
        expect('ChangesDescription' in projected).toBe(false);
    });

    it('returns the record untouched for an unrestricted caller', () => {
        const row = employeeChangeRow();
        expect(makeProjector(makeProvider(), buildUser([HR_ROLE_ID])).ProjectRow(row)).toBe(row);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. The payload projector in isolation
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// 8. The RunView wiring — which reads the projection runs on at all
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal `ProviderBase` so the gate in `ApplyRecordChangeFieldSecurityProjection` can be tested
 * for real. Same shape as the stub in `fieldSecurity.enforcement.test.ts`; the three metadata
 * lookups are the only members this gate actually touches.
 */
class TestRunViewProvider extends ProviderBase {
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
    public override EntityByID(id: string): EntityInfo | undefined {
        return this._entities.find(e => e.ID?.trim().toLowerCase() === id?.trim().toLowerCase());
    }

    /** Exposes the protected RunView-path projection for direct testing. */
    public applyRecordChangeProjection<T>(rows: T[], params: RunViewParams, user?: UserInfo): T[] {
        return this['ApplyRecordChangeFieldSecurityProjection'](rows, params, user);
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
    public get InstanceConnectionString(): string { return 'fls-rc-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

function runViewProvider(): TestRunViewProvider {
    const provider = new TestRunViewProvider();
    provider.seedEntities([employeesEntity(), projectsEntity(), recordChangesEntity()]);
    return provider;
}

describe('ApplyRecordChangeFieldSecurityProjection (RunView wiring)', () => {
    const intern = buildUser([INTERN_ROLE_ID]);
    const rcParams = (extra: Partial<RunViewParams> = {}): RunViewParams =>
        ({ EntityName: RecordChangesEntityName, ...extra }) as RunViewParams;

    it('projects a Record Changes result', () => {
        const rows = runViewProvider().applyRecordChangeProjection([employeeChangeRow()], rcParams(), intern);
        expect(JSON.parse(rows[0]['ChangesJSON'] as string)).not.toHaveProperty('Salary');
        expect('ChangesDescription' in rows[0]).toBe(false);
    });

    it('leaves results for any other entity alone', () => {
        const rows = [employeeChangeRow()];
        const result = runViewProvider().applyRecordChangeProjection(rows, { EntityName: 'Employees' } as RunViewParams, intern);
        expect(result).toBe(rows);
    });

    it('is exempt for entity_object results, which round-trip through GenerateSaveSQL', () => {
        const rows = [employeeChangeRow()];
        const result = runViewProvider().applyRecordChangeProjection(rows, rcParams({ ResultType: 'entity_object' }), intern);
        expect(result).toBe(rows);
    });

    it('is a no-op with no context user — there is no denied set to compute', () => {
        const rows = [employeeChangeRow()];
        expect(runViewProvider().applyRecordChangeProjection(rows, rcParams(), undefined)).toBe(rows);
    });

    it('resolves the target entity from a loaded ViewEntity when EntityName is absent', () => {
        // A saved view over the audit trail is a real path: the in-repo ViewID callers all pass
        // ViewEntity alongside, and that is the only sync handle on the entity a view targets.
        const viewEntity = { Get: (field: string) => (field === 'EntityID' ? RECORD_CHANGES_ENTITY_ID : null) } as unknown as BaseEntity;
        const rows = runViewProvider().applyRecordChangeProjection(
            [employeeChangeRow()],
            { ViewID: 'view-1', ViewEntity: viewEntity } as RunViewParams,
            intern
        );
        expect('ChangesDescription' in rows[0]).toBe(false);
    });
});

describe('ProjectRecordChangePayloadJSON', () => {
    const denied = new Set(['salary']);

    it('keeps null and undefined — there is nothing stored to leak', () => {
        expect(ProjectRecordChangePayloadJSON(null, denied)).toEqual({ Withhold: false, Value: null });
        expect(ProjectRecordChangePayloadJSON(undefined, denied)).toEqual({ Withhold: false, Value: undefined });
    });

    it('keeps an empty string', () => {
        expect(ProjectRecordChangePayloadJSON('', denied)).toEqual({ Withhold: false, Value: '' });
    });

    it('withholds a non-string value — not the shape this column is documented to hold', () => {
        expect(ProjectRecordChangePayloadJSON({ Salary: 1 }, denied).Withhold).toBe(true);
    });

    it('withholds JSON that parses to an array rather than an object', () => {
        expect(ProjectRecordChangePayloadJSON('[{"field":"Salary"}]', denied).Withhold).toBe(true);
    });

    it('withholds JSON that parses to a scalar', () => {
        expect(ProjectRecordChangePayloadJSON('"Salary is 120000"', denied).Withhold).toBe(true);
    });

    it('returns the payload unchanged in content when nothing is denied', () => {
        const raw = JSON.stringify({ Name: 'Ada', Salary: 120000 });
        const result = ProjectRecordChangePayloadJSON(raw, new Set<string>());
        expect(JSON.parse(result.Value as string)).toEqual({ Name: 'Ada', Salary: 120000 });
    });
});
