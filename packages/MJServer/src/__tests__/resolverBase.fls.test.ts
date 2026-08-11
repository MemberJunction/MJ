/**
 * Tests for ResolverBase.StripDeniedReadFieldsFromClientInput — the field-level-security
 * guard on the update path.
 *
 * The hazard it closes: a read-denied field is stripped from every payload the client
 * receives, so the client's Save fabricates a value for it (default / 0 / '' / null) and sends
 * it back. Without the guard, UpdateRecord's SetMany applies the fabrication — silent data
 * loss when the user holds update access, and a spurious save failure on UNRELATED edits when
 * they don't. The guard strips denied-read keys from the client's new values and OldValues
 * before anything applies them, and its `true` return forces the caller onto the
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
}));

// UserCache moved to the shared provider package, so the mock has to follow it — mocking it on
// sqlserver-dataprovider silently no-ops and the real (empty) cache answers instead.
vi.mock('@memberjunction/generic-database-provider', () => ({
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
/**
 * Full access to `fieldId` for every listed role. Snapshot initialization writes rows like these
 * for every (field, role) that should have one — which is why the UNRESTRICTED fields below need
 * them explicitly. On an FLS-enabled entity a field with no rows is denied, not open.
 */
function openTo(fieldId: string, roles: string[] = [HR_ROLE_ID, INTERN_ROLE_ID]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: 'Allow',
        UpdateAccess: 'Allow',
        CreateAccess: 'Allow',
    }));
}

function employeeEntityInit(withFls: boolean): Record<string, unknown> {
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
        // The flag is the enforcement gate — `withFls: false` switches field security off
        // entirely rather than merely removing rows.
        EnableFieldLevelSecurity: withFls,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('f-name') },
            { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: openTo('f-salary', [HR_ROLE_ID]) },
            { ID: 'f-base-salary', EntityID: ENTITY_ID, Sequence: 4, Name: 'Base Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: openTo('f-base-salary', [HR_ROLE_ID]) },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 5, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', EntityFieldPermissions: openTo('f-notes') },
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

// ─── A write-only field is a FORBIDDEN configuration ──────────────────────
//
// Read is required for Update, enforced by a row-level CHECK constraint AND by the clamp in
// EntityFieldInfo.GetUserFieldPermissions that catches the across-roles case the constraint
// cannot see. These tests write the forbidden rows DIRECTLY into metadata, bypassing the
// constraint, and assert the runtime still refuses to produce a write-only outcome.

describe('write-only fields are unreachable, so every denied-read field is stripped', () => {
    const resolver = new TestResolver();

    /**
     * Salary with the forbidden shape written straight into metadata: the intern is denied READ
     * but granted UPDATE. A CHECK constraint would refuse this row; reaching it here means it
     * was written outside the entity path.
     */
    function forbiddenWriteOnlyEntity(): EntityInfo {
        const init = employeeEntityInit(true);
        const fields = init['Fields'] as Array<Record<string, unknown>>;
        const salary = fields.find(f => f['Name'] === 'Salary')!;
        salary['EntityFieldPermissions'] = [
            ...openTo('f-salary', [HR_ROLE_ID]),
            { ID: 'p2', EntityFieldID: 'f-salary', RoleID: INTERN_ROLE_ID, ReadAccess: 'No Access', UpdateAccess: 'Allow', CreateAccess: 'No Access' },
        ];
        return new EntityInfo(init);
    }

    it('the aggregation clamps the forbidden row — update does not survive a denied read', () => {
        const entity = forbiddenWriteOnlyEntity();
        const intern = buildUser([INTERN_ROLE_ID]);

        expect(entity.GetDeniedReadFields(intern).has('salary')).toBe(true);
        expect(entity.GetDeniedUpdateFields(intern).has('salary')).toBe(true);
    });

    it('strips the value anyway — a client cannot have a legitimate value for a field it never saw', () => {
        const entity = forbiddenWriteOnlyEntity();
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Salary: 123456 });
        const result = resolver.TestStrip(entity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(result).toBe(true); // truth-load still forced — the denied-read set is non-empty
        expect(clientNewValues).not.toHaveProperty('Salary');
        expect(input).not.toHaveProperty('Salary');
    });

    it('removes the OldValues entry too (the client cannot know a true old value)', () => {
        const entity = forbiddenWriteOnlyEntity();
        const { input, clientNewValues } = makeClientPayload(
            { ID: '1', Salary: 123456 },
            [{ Key: 'ID', Value: '1' }, { Key: 'Salary', Value: '99' }]
        );
        resolver.TestStrip(entity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(input.OldValues___).toEqual([{ Key: 'ID', Value: '1' }]);
        expect(clientNewValues).not.toHaveProperty('Salary');
    });

    it('strips EVERY denied-read field, with no update-permission split', () => {
        // Base Salary is denied read AND update; Salary carries the forbidden write-only row.
        // Both are stripped, because denied-read ∩ denied-update is now just denied-read.
        const entity = forbiddenWriteOnlyEntity();
        const { input, clientNewValues } = makeClientPayload({ ID: '1', Salary: 123456, Base_Salary: 7 });
        resolver.TestStrip(entity, buildUser([INTERN_ROLE_ID]), input, clientNewValues);

        expect(clientNewValues).not.toHaveProperty('Salary');
        expect(clientNewValues).not.toHaveProperty('Base_Salary');
    });
});
