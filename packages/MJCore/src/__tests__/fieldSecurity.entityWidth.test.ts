/**
 * Field-Level Security — an entity object never holds a value its user is denied.
 *
 * The width of an entity object is decided by the object's own user, at every point where it is
 * filled from a row: `LoadFromData` (raw fast path and slow path), `Hydrate`, `InnerLoad`, and the
 * rehydration after a save. Once a denied value never enters the object, every way of reading the
 * object — `GetAll`, `GetDataObject`, `GetDataObjectJSON`, `To`, `Fields[i].Value`,
 * `JSON.stringify(entity)`, `CopyFrom` — is correct without any accessor of its own having to
 * remember field security.
 *
 * Also covered here:
 *  - the write gate: a write onto a not-loaded field is always dirty, so it reaches the update
 *    permission check, and `Revert()` never writes into a not-loaded field;
 *  - omitted-key detection on hydration matches keys case-insensitively, like `SetMany`;
 *  - the shared transport helpers in `entityValueFieldSecurity.ts`;
 *  - `SaveEntityGraph` results, root and companions alike, carry no denied values.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo, FieldPermissionAccess, FieldSecurityError, ReadableFieldsTransportKey } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { EntitySaveOptions, IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import { COMPANION_PAYLOAD_KEY } from '../generic/entityCompanion';
import {
    AssertClientInputWritableForUser,
    ClientInputTransportKeys,
    OmitDeniedFieldKeys,
    ProjectEntityValueRowsForUser,
    ProjectEntityValuesForUser,
} from '../generic/entityValueFieldSecurity';
import { SaveEntityGraphInput, SaveEntityGraphOperation } from '../generic/saveEntityGraphOperation';
import type { RemoteOpServerContext } from '../generic/baseRemotableOperation';
import type { RelatedRecordCollectionWire } from '../generic/relatedRecordCollection';

// ─── Fixture ──────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees-width';

const ALLOW = FieldPermissionAccess.Allow;
const NONE = FieldPermissionAccess.NoAccess;

function openTo(fieldId: string, roles: string[] = [HR_ROLE_ID, INTERN_ROLE_ID]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW,
    }));
}

/**
 * `Employees`: `Salary` is HR-only (the intern can neither read nor write it), `Bonus` is readable
 * by the intern but not updatable, `Name` and `Notes` are open. Every field is updatable through
 * the API, or `EntityFieldInfo.ReadOnly` would make every field permanently clean and the write
 * gate tests would pass vacuously.
 */
function employeeEntity(): EntityInfo {
    const field = (id: string, seq: number, name: string, type: string, perms?: Record<string, unknown>[]) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type,
        AllowUpdateAPI: true, AllowsNull: true, EntityFieldPermissions: perms,
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees',
        IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        EnableFieldLevelSecurity: true,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ...field('f-id', 1, 'ID', 'uniqueidentifier'), IsPrimaryKey: true, AllowsNull: false },
            field('f-name', 2, 'Name', 'nvarchar', openTo('f-name')),
            field('f-salary', 3, 'Salary', 'money', openTo('f-salary', [HR_ROLE_ID])),
            field('f-bonus', 4, 'Bonus', 'money', [
                ...openTo('f-bonus', [HR_ROLE_ID]),
                { ID: 'f-bonus-intern', EntityFieldID: 'f-bonus', RoleID: INTERN_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE },
            ]),
            field('f-notes', 5, 'Notes', 'nvarchar', openTo('f-notes')),
        ],
    });
}

function buildUser(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = `User ${id}`;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

const ROW_ID = '11111111-0000-0000-0000-000000000001';
const fullRow = (): Record<string, unknown> => ({ ID: ROW_ID, Name: 'Ada', Salary: 250000, Bonus: 10, Notes: 'n' });

let entityInfo: EntityInfo;
let intern: UserInfo;
let hr: UserInfo;

/** Rows the mock "database" holds, full width, keyed by ID. */
let dbRows: Map<string, Record<string, unknown>>;
/** What the provider's Save saw on the entity at call time — the input an audit record is built from. */
let auditCaptures: { newData: Record<string, unknown>; oldData: Record<string, unknown> }[];

class EmployeeEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

class EmployeeGraphEntity extends EmployeeEntity {
    public readonly Reports = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Reports',
        RelatedEntity: 'Employees',
        RelatedEntityJoinField: 'Notes',
        OnRemove: 'delete',
    });
}

/**
 * A mock data provider that behaves like a database: Load serves the FULL stored row (as a
 * provider that does not narrow in SQL would), and Save persists the entity's loaded fields onto
 * the stored row and returns the FULL row, the way a save procedure's `SELECT *` does.
 */
function makeProvider(graph = false) {
    let depth = 0;
    const provider = {
        CurrentUser: null as UserInfo | null,
        // A graph save runs locally only on a provider that can open a transaction around it.
        get SupportsEntityTransactions() { return true; },
        get IsInTransaction() { return depth > 0; },
        async BeginEntityTransaction() {
            depth++;
            let settled = false;
            const settle = async () => { if (!settled) { settled = true; depth--; } };
            return { IsNested: depth > 1, Commit: settle, Rollback: settle };
        },
        async GetEntityObject<T extends BaseEntity>(_name: string, user?: UserInfo): Promise<T> {
            const e = graph
                ? new EmployeeGraphEntity(entityInfo, provider as unknown as IEntityDataProvider)
                : new EmployeeEntity(entityInfo, provider as unknown as IEntityDataProvider);
            if (user) e.ContextCurrentUser = user;
            return e as unknown as T;
        },
        async Load(_entity: BaseEntity, key: CompositeKey): Promise<Record<string, unknown> | null> {
            const row = dbRows.get(String(key.KeyValuePairs?.[0]?.Value ?? ''));
            return row ? { ...row } : null;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            auditCaptures.push({ newData: entity.GetAll(false), oldData: entity.GetAll(true) });
            const own = entity.GetAll() as Record<string, unknown>;
            const id = String(own.ID ?? `gen-${dbRows.size + 1}`);
            const stored = { ...(dbRows.get(id) ?? {}), ...own, ID: id };
            dbRows.set(id, stored);
            return { ...stored };
        },
        async Delete(): Promise<boolean> { return true; },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

function makeEntity(user: UserInfo | null, provider = makeProvider()): EmployeeEntity {
    const e = new EmployeeEntity(entityInfo, provider as unknown as IEntityDataProvider);
    if (user) e.ContextCurrentUser = user;
    return e;
}

const saveOpts = (): EntitySaveOptions => Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true });

/** Asserts that no way of reading `entity` yields the intern-denied Salary value. */
async function expectNoSalaryAnywhere(entity: BaseEntity): Promise<void> {
    expect('Salary' in (entity.GetAll() as Record<string, unknown>)).toBe(false);
    expect('Salary' in (entity.GetAll(true) as Record<string, unknown>)).toBe(false);
    expect('Salary' in (entity.To() as Record<string, unknown>)).toBe(false);
    expect('Salary' in ((await entity.GetDataObject()) as Record<string, unknown>)).toBe(false);
    expect(await entity.GetDataObjectJSON()).not.toContain('250000');
    expect('Salary' in (entity.GetChangesSinceLastSave() as Record<string, unknown>)).toBe(false);
    const salary = entity.Fields.find(f => f.Name === 'Salary')!;
    expect(salary.NotLoaded).toBe(true);
    expect(salary.Value ?? null).toBeNull();
    expect(salary.OldValue ?? null).toBeNull();
    expect(JSON.stringify(entity)).not.toContain('250000');
}

beforeAll(() => {
    entityInfo = employeeEntity();
    intern = buildUser([INTERN_ROLE_ID], 'intern-1');
    hr = buildUser([HR_ROLE_ID], 'hr-1');
    Metadata.Provider = {
        Entities: [entityInfo],
        EntityByID: (id: string) => (id === ENTITY_ID ? entityInfo : undefined),
        EntityByName: (n: string) => (n === 'Employees' ? entityInfo : undefined),
        CurrentUser: null,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    dbRows = new Map();
    auditCaptures = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Hydration narrowing
// ═══════════════════════════════════════════════════════════════════════════

describe('hydration narrows the object to its user', () => {
    it('LoadFromData of a full-width row (RunView entity_object): no accessor yields a denied value', async () => {
        const entity = makeEntity(intern);
        await entity.LoadFromData(fullRow());

        await expectNoSalaryAnywhere(entity);
        expect(entity.Get('Name')).toBe('Ada');
        expect(entity.Get('Bonus')).toBe(10);
    });

    it('the raw fast path holds no denied value before fields are built', async () => {
        const entity = makeEntity(intern);
        await entity.LoadFromData(fullRow());
        // Serialize BEFORE anything builds the EntityField array, i.e. straight from the raw row.
        expect(JSON.stringify(entity)).not.toContain('250000');
        expect('Salary' in (entity.GetAll() as Record<string, unknown>)).toBe(false);
    });

    it('matches denied keys case-insensitively, and under the CodeName spelling', async () => {
        const entity = makeEntity(intern);
        await entity.LoadFromData({ ID: ROW_ID, Name: 'Ada', salary: 250000, Notes: 'n' });
        expect(JSON.stringify(entity)).not.toContain('250000');
    });

    it('does not mutate a frozen shared row, and an unrestricted user from the same row stays full width', async () => {
        const shared = Object.freeze(fullRow());

        const restricted = makeEntity(intern);
        await expect(restricted.LoadFromData(shared)).resolves.toBe(true);
        expect(shared.Salary).toBe(250000);
        expect(Object.keys(shared)).toContain('Salary');
        expect('Salary' in (restricted.GetAll() as Record<string, unknown>)).toBe(false);

        const unrestricted = makeEntity(hr);
        await unrestricted.LoadFromData(shared);
        expect(unrestricted.Get('Salary')).toBe(250000);
        expect((unrestricted.GetAll() as Record<string, unknown>).Salary).toBe(250000);
        // The unrestricted fast path keeps the caller's row by reference: no copy is made.
        expect(unrestricted['_raw']).toBe(shared);
    });

    it('slow path (a second load on the same instance) narrows too', async () => {
        const entity = makeEntity(intern);
        await entity.LoadFromData({ ID: ROW_ID, Name: 'first', Notes: 'n' });
        void entity.Fields; // build the fields so the next load takes the slow path
        await entity.LoadFromData(fullRow());
        await expectNoSalaryAnywhere(entity);
        expect(entity.Get('Name')).toBe('Ada');
    });

    it('Hydrate narrows', async () => {
        const entity = makeEntity(intern);
        entity.Hydrate(fullRow());
        await expectNoSalaryAnywhere(entity);
    });

    it('InnerLoad narrows a full-width provider row', async () => {
        dbRows.set(ROW_ID, fullRow());
        const entity = makeEntity(intern);
        await expect(entity.InnerLoad(CompositeKey.FromID(ROW_ID))).resolves.toBe(true);
        await expectNoSalaryAnywhere(entity);
    });

    it('CopyFrom a narrowed object copies no denied value', async () => {
        const source = makeEntity(intern);
        await source.LoadFromData(fullRow());
        const target = makeEntity(hr);
        target.NewRecord();
        target.CopyFrom(source);
        expect(target.Get('Salary') ?? null).toBeNull();
    });

    it('unrestricted user and no user keep full width', async () => {
        const forHr = makeEntity(hr);
        await forHr.LoadFromData(fullRow());
        expect((forHr.GetAll() as Record<string, unknown>).Salary).toBe(250000);

        const noUser = makeEntity(null);
        await noUser.LoadFromData(fullRow());
        expect((noUser.GetAll() as Record<string, unknown>).Salary).toBe(250000);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Post-save rehydration
// ═══════════════════════════════════════════════════════════════════════════

describe('post-save rehydration', () => {
    it('a save returning the full row leaves the object narrowed', async () => {
        dbRows.set(ROW_ID, fullRow());
        const entity = makeEntity(intern);
        await entity.InnerLoad(CompositeKey.FromID(ROW_ID));
        entity.Set('Notes', 'edited');

        await expect(entity.Save(saveOpts())).resolves.toBe(true);

        await expectNoSalaryAnywhere(entity);
        expect(entity.Get('Notes')).toBe('edited');
        // The stored salary was untouched: Salary was not loaded, so it was not part of the write.
        expect(dbRows.get(ROW_ID)?.Salary).toBe(250000);
        // The result history carries no denied value either.
        expect(JSON.stringify(entity.ResultHistory)).not.toContain('250000');
    });

    it('the audit input is captured before narrowing: every loaded field, old and new, is in it', async () => {
        // The Record Changes payload is built from the entity inside the provider's Save, before
        // the save returns and the entity is rehydrated. Rehydration therefore cannot remove
        // anything from it — and a full-width user's audit input is full width.
        dbRows.set(ROW_ID, fullRow());
        const entity = makeEntity(hr);
        await entity.InnerLoad(CompositeKey.FromID(ROW_ID));
        entity.Set('Notes', 'edited');
        await entity.Save(saveOpts());

        expect(auditCaptures).toHaveLength(1);
        expect(auditCaptures[0].newData).toMatchObject({ Name: 'Ada', Salary: 250000, Bonus: 10, Notes: 'edited' });
        expect(auditCaptures[0].oldData).toMatchObject({ Name: 'Ada', Salary: 250000, Bonus: 10, Notes: 'n' });
    });

    it('narrows the restricted user and not the unrestricted one from the same full save response', async () => {
        dbRows.set(ROW_ID, fullRow());
        const restricted = makeEntity(intern);
        await restricted.InnerLoad(CompositeKey.FromID(ROW_ID));
        restricted.Set('Notes', 'by intern');
        await restricted.Save(saveOpts());
        // The audit input for the restricted save was the restricted object's own (narrow) state;
        // the response the provider returned was full width, and none of it was adopted.
        expect('Salary' in auditCaptures[0].newData).toBe(false);
        expect('Salary' in (restricted.GetAll() as Record<string, unknown>)).toBe(false);

        const unrestricted = makeEntity(hr);
        await unrestricted.InnerLoad(CompositeKey.FromID(ROW_ID));
        unrestricted.Set('Notes', 'by hr');
        await unrestricted.Save(saveOpts());
        expect(unrestricted.Get('Salary')).toBe(250000);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The write gate
// ═══════════════════════════════════════════════════════════════════════════

describe('write gate', () => {
    it('writing a not-loaded field its construction value is dirty, and the update gate refuses it', async () => {
        dbRows.set(ROW_ID, fullRow());
        const entity = makeEntity(intern);
        await entity.InnerLoad(CompositeKey.FromID(ROW_ID));
        const salary = entity.Fields.find(f => f.Name === 'Salary')!;
        expect(salary.NotLoaded).toBe(true);

        entity.SetMany({ Salary: null }); // the value a not-loaded nullable field already holds
        expect(salary.Dirty).toBe(true);

        await expect(entity.Save(saveOpts())).resolves.toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toContain("Field 'Salary' does not exist on entity 'Employees'");
        expect(dbRows.get(ROW_ID)?.Salary).toBe(250000);
    });

    it('the written-after-not-loaded flag survives GetState/RestoreState', async () => {
        const entity = makeEntity(intern);
        await entity.LoadFromData(fullRow());
        entity.SetMany({ Salary: null });
        const salary = entity.Fields.find(f => f.Name === 'Salary')!;
        const state = salary.GetState();
        expect(state.WrittenAfterNotLoaded).toBe(true);

        salary.MarkNotLoaded();
        salary.RestoreState(state);
        expect(salary.Dirty).toBe(true);
    });

    it('Revert() leaves a not-loaded field not-loaded and puts a written one back to not-loaded', async () => {
        const entity = makeEntity(intern);
        await entity.LoadFromData(fullRow());
        entity.Set('Notes', 'changed');
        entity.SetMany({ Salary: 1 });
        entity.Revert();

        const salary = entity.Fields.find(f => f.Name === 'Salary')!;
        expect(salary.NotLoaded).toBe(true);
        expect(salary.Value ?? null).toBeNull();
        expect(salary.Dirty).toBe(false);
        expect(entity.Get('Notes')).toBe('n');
    });

    it('omitted-key detection is case-insensitive on the slow path (LoadFromData({name}) on field Name)', async () => {
        const entity = makeEntity(hr);
        await entity.LoadFromData(fullRow());
        void entity.Fields; // force the slow path for the next load
        await entity.LoadFromData({ ID: ROW_ID, name: 'b', salary: 1, bonus: 2, notes: 'x' });

        const name = entity.Fields.find(f => f.Name === 'Name')!;
        expect(name.NotLoaded).toBe(false);
        expect(entity.Get('Name')).toBe('b');
        expect((entity.GetAll() as Record<string, unknown>).Name).toBe('b');
    });

    it('omitted-key detection is case-insensitive in Hydrate', () => {
        const entity = makeEntity(hr);
        entity.Hydrate({ ID: ROW_ID, name: 'b' });
        expect(entity.Fields.find(f => f.Name === 'Name')!.NotLoaded).toBe(false);
        expect(entity.Get('Name')).toBe('b');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Shared transport helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('OmitDeniedFieldKeys', () => {
    it('returns the original when nothing is denied, and a copy otherwise', () => {
        const row = Object.freeze(fullRow());
        expect(OmitDeniedFieldKeys(row, new Set())).toBe(row);
        expect(OmitDeniedFieldKeys(row, new Set(['missing']))).toBe(row);
        const out = OmitDeniedFieldKeys(row, new Set(['salary']));
        expect(out).not.toBe(row);
        expect('Salary' in out).toBe(false);
        expect(row.Salary).toBe(250000);
    });
});

describe('ProjectEntityValuesForUser', () => {
    const md = (): { Entities: EntityInfo[]; EntityByID(id: string): EntityInfo | undefined } => ({
        Entities: [entityInfo],
        EntityByID: (id: string) => (id === ENTITY_ID ? entityInfo : undefined),
    });

    it('omits denied keys under any spelling and leaves the input alone', () => {
        const row = { ...fullRow(), SALARY: 1 };
        const out = ProjectEntityValuesForUser(md(), entityInfo, row, intern)!;
        expect('Salary' in out).toBe(false);
        expect('SALARY' in out).toBe(false);
        expect(row.Salary).toBe(250000);
        expect(ReadableFieldsTransportKey in out).toBe(false);
    });

    it('appends the readable-fields marker for MJ clients, naming only readable fields', () => {
        const out = ProjectEntityValuesForUser(md(), entityInfo, fullRow(), intern, { includeReadableFields: true })!;
        expect((out as Record<string, unknown>)[ReadableFieldsTransportKey]).toEqual(['ID', 'Name', 'Bonus', 'Notes']);
    });

    it('returns the same object for an unrestricted caller and for no caller', () => {
        const row = fullRow();
        expect(ProjectEntityValuesForUser(md(), entityInfo, row, hr, { includeReadableFields: true })).toBe(row);
        expect(ProjectEntityValuesForUser(md(), entityInfo, row, null)).toBe(row);
    });

    it('array form returns the original array when no row changed', () => {
        const rows = [fullRow()];
        expect(ProjectEntityValueRowsForUser(md(), entityInfo, rows, hr)).toBe(rows);
        const narrowed = ProjectEntityValueRowsForUser(md(), entityInfo, rows, intern)!;
        expect(narrowed).not.toBe(rows);
        expect('Salary' in narrowed[0]).toBe(false);
    });
});

describe('AssertClientInputWritableForUser', () => {
    const capture = (fn: () => void): Error | null => {
        try { fn(); return null; } catch (e) { return e as Error; }
    };

    it('refuses a denied key and an unknown key with the identical error', () => {
        const denied = capture(() => AssertClientInputWritableForUser(entityInfo, { ID: ROW_ID, Salary: 1 }, intern));
        const unknown = capture(() => AssertClientInputWritableForUser(entityInfo, { ID: ROW_ID, Salarx: 1 }, intern));
        expect(denied).toBeInstanceOf(FieldSecurityError);
        expect(unknown).toBeInstanceOf(FieldSecurityError);
        expect(denied!.message).toBe("Field 'Salary' cannot be written on entity 'Employees'.");
        expect(unknown!.message).toBe("Field 'Salarx' cannot be written on entity 'Employees'.");
        expect(denied!.message.replace('Salary', 'K')).toBe(unknown!.message.replace('Salarx', 'K'));
    });

    it('matches denied keys case-insensitively', () => {
        expect(() => AssertClientInputWritableForUser(entityInfo, { salary: 1 }, intern)).toThrow(FieldSecurityError);
    });

    it('accepts readable fields, primary keys and transport keys', () => {
        const input: Record<string, unknown> = { ID: ROW_ID, Name: 'x', bonus: 1, Notes: 'n' };
        for (const k of ClientInputTransportKeys) input[k] = null;
        expect(() => AssertClientInputWritableForUser(entityInfo, input, intern)).not.toThrow();
        expect(ClientInputTransportKeys).toContain(COMPANION_PAYLOAD_KEY);
    });

    it('accepts caller-declared extra keys', () => {
        expect(() => AssertClientInputWritableForUser(entityInfo, { ID: ROW_ID, Extra: 1 }, intern, { additionalAllowedKeys: ['Extra'] })).not.toThrow();
    });

    it('leaves an unrestricted caller, and no caller, alone — unknown keys included', () => {
        expect(() => AssertClientInputWritableForUser(entityInfo, { Salary: 1, Bogus: 2 }, hr)).not.toThrow();
        expect(() => AssertClientInputWritableForUser(entityInfo, { Salary: 1, Bogus: 2 }, null)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. SaveEntityGraph results
// ═══════════════════════════════════════════════════════════════════════════

describe('SaveEntityGraph result carries no denied values', () => {
    const ROOT_ID = '22222222-0000-0000-0000-000000000001';
    const CHILD_ID = '22222222-0000-0000-0000-000000000002';

    function context(provider: ReturnType<typeof makeProvider>, user: UserInfo): RemoteOpServerContext {
        return { provider: provider as unknown as IMetadataProvider, user, emitProgress: () => undefined };
    }

    function graphInput(): SaveEntityGraphInput {
        return {
            EntityName: 'Employees',
            Fields: { ID: ROOT_ID, Name: 'Root', Notes: 'root-notes' },
            Companions: [{
                Name: 'Reports',
                Data: {
                    Items: [{ Fields: { ID: CHILD_ID, Name: 'Child edited', Notes: ROOT_ID }, IsNew: false }],
                    Removed: [],
                },
            }],
            IsExistingRecord: true,
        };
    }

    beforeEach(() => {
        dbRows.set(ROOT_ID, { ID: ROOT_ID, Name: 'Root', Salary: 250000, Bonus: 1, Notes: 'root-notes' });
        dbRows.set(CHILD_ID, { ID: CHILD_ID, Name: 'Child', Salary: 250000, Bonus: 2, Notes: ROOT_ID });
    });

    it('root and companion rows are narrowed for a restricted caller', async () => {
        const provider = makeProvider(true);
        const result = await new SaveEntityGraphOperation().ExecuteServer(graphInput(), context(provider, intern));

        expect(result.Output?.Success).toBe(true);
        expect('Salary' in result.Output!.Fields).toBe(false);
        const wire = result.Output!.Companions.find(c => c.Name === 'Reports')!.Data as RelatedRecordCollectionWire;
        expect(wire.Items).toHaveLength(1);
        expect('Salary' in wire.Items[0].Fields).toBe(false);
        expect(JSON.stringify(result.Output)).not.toContain('250000');
        // The edits reached the database, and the stored denied values were untouched.
        expect(dbRows.get(CHILD_ID)?.Name).toBe('Child edited');
        expect(dbRows.get(CHILD_ID)?.Salary).toBe(250000);
    });

    it('an unrestricted caller still gets full width', async () => {
        const provider = makeProvider(true);
        const result = await new SaveEntityGraphOperation().ExecuteServer(graphInput(), context(provider, hr));
        expect(result.Output?.Success).toBe(true);
        expect(result.Output!.Fields.Salary).toBe(250000);
        const wire = result.Output!.Companions.find(c => c.Name === 'Reports')!.Data as RelatedRecordCollectionWire;
        expect(wire.Items[0].Fields.Salary).toBe(250000);
    });

    it('refuses root input naming a denied field', async () => {
        const provider = makeProvider(true);
        const input = graphInput();
        input.Fields = { ...input.Fields, Salary: 1 };
        const result = await new SaveEntityGraphOperation().ExecuteServer(input, context(provider, intern));
        expect(result.Success && result.Output?.Success).toBeFalsy();
        expect(dbRows.get(ROOT_ID)?.Salary).toBe(250000);
    });

    it('refuses root input naming a key that is not a field, for a restricted caller', async () => {
        const provider = makeProvider(true);
        const input = graphInput();
        input.Fields = { ...input.Fields, Name: 'renamed', Salarx: 1 };
        const result = await new SaveEntityGraphOperation().ExecuteServer(input, context(provider, intern));
        expect(result.Success && result.Output?.Success).toBeFalsy();
        expect(dbRows.get(ROOT_ID)?.Name).toBe('Root');
    });

    it('refuses companion input naming a key that is not a field, for a restricted caller', async () => {
        const provider = makeProvider(true);
        const input = graphInput();
        const data = input.Companions[0].Data as RelatedRecordCollectionWire;
        data.Items[0].Fields = { ...data.Items[0].Fields, Salarx: 1 };
        const result = await new SaveEntityGraphOperation().ExecuteServer(input, context(provider, intern));
        expect(result.Success && result.Output?.Success).toBeFalsy();
        expect(dbRows.get(CHILD_ID)?.Name).toBe('Child');
    });

    it('refuses companion input naming a denied field', async () => {
        const provider = makeProvider(true);
        const input = graphInput();
        const data = input.Companions[0].Data as RelatedRecordCollectionWire;
        data.Items[0].Fields = { ...data.Items[0].Fields, Salary: 1 };
        const result = await new SaveEntityGraphOperation().ExecuteServer(input, context(provider, intern));
        expect(result.Success && result.Output?.Success).toBeFalsy();
        expect(dbRows.get(CHILD_ID)?.Salary).toBe(250000);
    });
});
