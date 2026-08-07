/**
 * Tests for ResolverBase.StripDeniedReadFieldsFromClientInput — the field-level-security
 * guard on the update path (Workstream A2 of plans/field-level-security-implementation.md).
 *
 * The hazard this guard closes: a read-denied field is stripped from every payload the
 * client receives, so the client's Save fabricates a value for it (default / 0 / '' / null)
 * and sends it back. Without the guard, UpdateRecord's SetMany applies the fabrication —
 * silent data loss when the user holds CanUpdate, and a spurious save failure on UNRELATED
 * edits when they don't. The guard strips denied-read keys from the client's new values and
 * OldValues before anything applies them, and its `true` return forces the caller onto the
 * load-truth-from-DB branch so denied fields hold real values a stripped SetMany never
 * touches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────
const { mockUserCacheUsers } = vi.hoisted(() => ({
    mockUserCacheUsers: [] as Array<{ Email: string; ID: string }>,
}));

// Stub external deps before imports
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerDataProvider: class {},
    UserCache: {
        get Users() { return mockUserCacheUsers; },
    },
}));

vi.mock('cloudevents', () => ({
    CloudEvent: class {},
    httpTransport: () => () => undefined,
    emitterFor: () => () => undefined,
}));

vi.mock('type-graphql', () => ({
    Resolver:           () => () => undefined,
    Mutation:           () => () => undefined,
    Query:              () => () => undefined,
    Subscription:       () => () => undefined,
    Ctx:                () => () => undefined,
    Arg:                () => () => undefined,
    PubSub:             () => () => undefined,
    Root:               () => () => undefined,
    ObjectType:         () => () => undefined,
    InputType:          () => () => undefined,
    Field:              () => () => undefined,
    FieldResolver:      () => () => undefined,
    Int:                () => undefined,
    Float:              () => undefined,
    registerEnumType:   () => undefined,
}));

vi.mock('graphql', () => ({
    GraphQLError: class extends Error {
        constructor(msg: string) { super(msg); }
    },
}));

vi.mock('mssql', () => ({}));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: vi.fn(),
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: {} },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    FieldMapper: class { static Instance = { MapFieldsFromCodeNamesToDBNames: vi.fn() }; },
}));

vi.mock('../generic/PubSubManager.js', () => ({
    PubSubManager: class { static Instance = { publish: vi.fn() }; },
}));

vi.mock('../generic/PushStatusResolver.js', () => ({
    PUSH_STATUS_UPDATES_TOPIC: 'test-push-topic',
    PushStatusNotification: class {},
    PushStatusResolver: class {},
}));

vi.mock('../generic/CacheInvalidationResolver.js', () => ({
    CACHE_INVALIDATION_TOPIC: 'test-cache-topic',
}));

vi.mock('../generic/RunViewResolver.js', () => ({
    RunViewByIDInput: class {},
    RunViewByNameInput: class {},
    RunDynamicViewInput: class {},
}));

vi.mock('../generic/DeleteOptionsInput.js', () => ({
    DeleteOptionsInput: class {},
}));

vi.mock('../types.js', () => ({
    RunViewGenericParams: class {},
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({}));

// ─── Import after mocks ──────────────────────────────────────────────────
import { ResolverBase } from '../generic/ResolverBase';
import { EntityInfo, UserInfo, UserRoleInfo } from '@memberjunction/core';

// ─── Metadata builders (mirrors MJCore's fieldSecurity.enforcement tests) ──

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees';

/**
 * An `Employees` entity: `Salary` and `Base Salary` are readable/updatable only by HR.
 * `Base Salary` has a space, so its CodeName (`Base_Salary`) differs from its Name —
 * exercising the Name→CodeName bridge (input keys are CodeNames).
 */
function employeeEntityInit(withFls: boolean): Record<string, unknown> {
    const salaryPerms = withFls
        ? [{ ID: 'p1', EntityFieldID: 'f-salary', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true, CanCreate: false }]
        : [];
    const baseSalaryPerms = withFls
        ? [{ ID: 'p2', EntityFieldID: 'f-base-salary', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true, CanCreate: false }]
        : [];
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
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar' },
            { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: salaryPerms },
            { ID: 'f-base-salary', EntityID: ENTITY_ID, Sequence: 4, Name: 'Base Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: baseSalaryPerms },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 5, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar' },
        ],
    };
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

type ClientInput = { OldValues___?: Array<{ Key: string; Value: unknown }> } & Record<string, unknown>;

/** Subclass that exposes the protected guard for testing. */
class TestResolver extends ResolverBase {
    public TestStrip(entityInfo: EntityInfo, userInfo: UserInfo, input: ClientInput, clientNewValues: Record<string, unknown>): boolean {
        return this.StripDeniedReadFieldsFromClientInput(entityInfo, userInfo, input, clientNewValues);
    }
}

/** Builds the (input, clientNewValues) pair the way UpdateRecord does. */
function makeClientPayload(fields: Record<string, unknown>, oldValues?: Array<{ Key: string; Value: unknown }>): { input: ClientInput; clientNewValues: Record<string, unknown> } {
    const input: ClientInput = { ...fields };
    if (oldValues) {
        input.OldValues___ = oldValues;
    }
    const clientNewValues: Record<string, unknown> = { ...fields };
    return { input, clientNewValues };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ResolverBase.StripDeniedReadFieldsFromClientInput', () => {
    let resolver: TestResolver;
    let flsEntity: EntityInfo;
    let noFlsEntity: EntityInfo;

    beforeEach(() => {
        resolver = new TestResolver();
        flsEntity = new EntityInfo(employeeEntityInit(true));
        noFlsEntity = new EntityInfo(employeeEntityInit(false));
    });

    it('strips a denied-read field from clientNewValues AND input, and returns true', () => {
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Notes: 'edited', Salary: 0 });
        const result = resolver.TestStrip(flsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(true);
        expect(clientNewValues).not.toHaveProperty('Salary');
        expect(input).not.toHaveProperty('Salary');
        expect(clientNewValues).toEqual({ ID: '1', Notes: 'edited' });
    });

    it('removes denied-field entries from OldValues___ (fabricated old values must not drive conflict detection)', () => {
        const { input, clientNewValues } = makeClientPayload(
            { ID: '1', Notes: 'edited', Salary: 0 },
            [{ Key: 'ID', Value: '1' }, { Key: 'Notes', Value: 'orig' }, { Key: 'Salary', Value: '0' }]
        );
        resolver.TestStrip(flsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(input.OldValues___).toEqual([{ Key: 'ID', Value: '1' }, { Key: 'Notes', Value: 'orig' }]);
    });

    it('bridges Name → CodeName: a denied field with a space is stripped by its CodeName key', () => {
        // 'Base Salary' arrives from the wire as its CodeName 'Base_Salary'
        const { input, clientNewValues } = makeClientPayload(
            { ID: '1', Notes: 'edited', Base_Salary: 100 },
            [{ Key: 'Base_Salary', Value: '100' }]
        );
        const result = resolver.TestStrip(flsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(true);
        expect(clientNewValues).not.toHaveProperty('Base_Salary');
        expect(input.OldValues___).toEqual([]);
    });

    it('leaves permitted fields and metadata blobs untouched', () => {
        const restore = { marker: true };
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Name: 'Ada', Notes: 'n', Salary: 5 });
        (input as Record<string, unknown>)['RestoreContext___'] = restore;
        resolver.TestStrip(flsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(clientNewValues).toEqual({ ID: '1', Name: 'Ada', Notes: 'n' });
        expect(input['RestoreContext___']).toBe(restore);
        expect(input['Name']).toBe('Ada');
    });

    it('returns true even when the client sent nothing for the denied field — the truth-load must still be forced', () => {
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Notes: 'edited' });
        const result = resolver.TestStrip(flsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(true);
        expect(clientNewValues).toEqual({ ID: '1', Notes: 'edited' });
    });

    it('is a no-op returning false when the entity has no field security', () => {
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Salary: 12345 });
        const result = resolver.TestStrip(noFlsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(false);
        expect(clientNewValues['Salary']).toBe(12345);
        expect(input['Salary']).toBe(12345);
    });

    it('is a no-op returning false for a user who HOLDS the granting role', () => {
        const { input, clientNewValues } = makeClientPayload(
            { ID: '1', Salary: 99000 },
            [{ Key: 'Salary', Value: '85000' }]
        );
        const result = resolver.TestStrip(flsEntity, buildUser([HR_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(false);
        expect(clientNewValues['Salary']).toBe(99000);
        expect(input.OldValues___).toHaveLength(1);
    });

    it('is a no-op returning false without a user', () => {
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Salary: 1 });
        const result = resolver.TestStrip(flsEntity, undefined as unknown as UserInfo, input, clientNewValues);

        expect(result).toBe(false);
        expect(clientNewValues['Salary']).toBe(1);
    });

    it('matches input keys case-insensitively (wire casing must not defeat the strip)', () => {
        const { input, clientNewValues } = makeClientPayload({ ID: '1', SALARY: 0 });
        const result = resolver.TestStrip(flsEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(true);
        expect(clientNewValues).not.toHaveProperty('SALARY');
    });
});

// ─── Write-only fields (denied-read + update-ALLOWED) — D-2 refinement ────
//
// Under the not-loaded contract the client OMITS fields it was never shown, so a value
// that IS present for a denied-read field is a deliberate write. Only fields that are
// ALSO denied-update get stripped; write-only values flow to the normal save guard.

describe('write-only fields pass through the strip', () => {
    const resolver = new TestResolver();

    /** Salary: HR full access; intern denied READ but ALLOWED update (the SSN-capture shape). */
    function writeOnlyEntity(): EntityInfo {
        const init = employeeEntityInit(true);
        const fields = init['Fields'] as Array<Record<string, unknown>>;
        const salary = fields.find(f => f['Name'] === 'Salary')!;
        salary['EntityFieldPermissions'] = [
            { ID: 'p1', EntityFieldID: 'f-salary', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true },
            { ID: 'p2', EntityFieldID: 'f-salary', RoleID: INTERN_ROLE_ID, Type: 'Allow', CanRead: false, CanUpdate: true },
        ];
        return new EntityInfo(init);
    }

    it('a deliberate write to a denied-read + update-allowed field is NOT stripped', () => {
        const entity = writeOnlyEntity();
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Salary: 123456 });
        const result = resolver.TestStrip(entity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(true); // truth-load still forced — the denied-read set is non-empty
        expect(clientNewValues['Salary']).toBe(123456);
        expect(input['Salary']).toBe(123456);
    });

    it('the write-only field\'s OldValues entry is still removed (the client cannot know a true old value)', () => {
        const entity = writeOnlyEntity();
        const { input, clientNewValues } = makeClientPayload(
            { ID: '1', Salary: 123456 },
            [{ Key: 'ID', Value: '1' }, { Key: 'Salary', Value: '99' }]
        );
        resolver.TestStrip(entity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(input.OldValues___).toEqual([{ Key: 'ID', Value: '1' }]);
        expect(clientNewValues['Salary']).toBe(123456);
    });

    it('a read+update-denied field on the SAME entity is still stripped while the write-only one passes', () => {
        // Base Salary stays HR-only (denied read AND update for the intern); Salary is write-only.
        const entity = writeOnlyEntity();
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Salary: 123456, Base_Salary: 7 });
        resolver.TestStrip(entity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(clientNewValues['Salary']).toBe(123456);
        expect(clientNewValues).not.toHaveProperty('Base_Salary');
    });
});
