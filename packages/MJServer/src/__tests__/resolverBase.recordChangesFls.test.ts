/**
 * Field-Level Security at the GraphQL read boundary, for `MJ: Record Changes`.
 *
 * `MapFieldNamesToCodeNames` is where denied fields are stripped and encrypted ones masked on
 * every single-record return path. It is also where the audit trail would otherwise walk straight
 * out: Record Changes has field security switched OFF, so the denied-set logic sitting beside this
 * is a no-op for it, and its `ChangesJSON` carries another entity's old and new values verbatim.
 *
 * These tests cover the resolver half specifically — the provider half (RunView, both cache paths)
 * and the projection semantics themselves live in MJCore's
 * `fieldSecurity.recordChanges.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mocks (same preamble as resolverBase.fls.test.ts) ─────────────
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerDataProvider: class {},
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { get Users() { return []; } },
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

// Unlike the sibling FLS suite, these tests actually RUN the mapper, so the mock has to answer
// MapFieldName. Identity is correct here: none of the fixture's field names need bridging.
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    FieldMapper: class {
        public MapFieldName(name: string): string { return name; }
        static Instance = { MapFieldsFromCodeNamesToDBNames: vi.fn() };
    },
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
import { EntityInfo, IMetadataProvider, RecordChangesEntityName, UserInfo, UserRoleInfo } from '@memberjunction/core';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const EMPLOYEES_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000E1';
const RECORD_CHANGES_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000E3';

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

/** The entity the audit rows are ABOUT — `Salary` readable only by HR. */
function employeesEntity(): EntityInfo {
    return new EntityInfo({
        ID: EMPLOYEES_ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: true,
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

/** The audit entity — field security OFF, which is the default and the point of the exercise. */
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

/** Answers only what the mapper and the projector ask of a provider. */
function testProvider(entities: EntityInfo[]): IMetadataProvider {
    return {
        get Entities() { return entities; },
        EntityByName: (name: string) => entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase()),
        EntityByID: (id: string) => entities.find(e => e.ID?.trim().toLowerCase() === id?.trim().toLowerCase()),
    } as unknown as IMetadataProvider;
}

const SALARY_CHANGES_JSON = JSON.stringify({
    Name: { field: 'Name', oldValue: 'Ada', newValue: 'Ada L' },
    Salary: { field: 'Salary', oldValue: 100000, newValue: 120000 },
});

function changeRow(): Record<string, unknown> {
    return {
        ID: 'rc-1',
        EntityID: EMPLOYEES_ENTITY_ID,
        ChangesJSON: SALARY_CHANGES_JSON,
        ChangesDescription: 'Salary changed from 100000 to 120000',
        FullRecordJSON: JSON.stringify({ ID: 'emp-1', Name: 'Ada L', Salary: 120000 }),
    };
}

/** Exposes the protected mapping and write-guard boundaries. */
class TestResolver extends ResolverBase {
    public MapOne(dataObject: Record<string, unknown>, user: UserInfo, provider: IMetadataProvider): Promise<Record<string, unknown>> {
        return this.MapFieldNamesToCodeNames(RecordChangesEntityName, dataObject, user, provider);
    }
    public MapMany(rows: Record<string, unknown>[], user: UserInfo, provider: IMetadataProvider): Promise<Record<string, unknown>[]> {
        return this.ArrayMapFieldNamesToCodeNames(RecordChangesEntityName, rows, user, provider);
    }
    public StripPayload(
        entityInfo: EntityInfo, user: UserInfo,
        input: { OldValues___?: Array<{ Key: string; Value: unknown }> } & Record<string, unknown>,
        clientNewValues: Record<string, unknown>, provider: IMetadataProvider
    ): boolean {
        return this.StripRecordChangePayloadFromClientInput(entityInfo, user, input, clientNewValues, provider);
    }
}

/** The shape UpdateRecord builds before applying the guards. */
function clientPayload(fields: Record<string, unknown>, oldValues?: Array<{ Key: string; Value: unknown }>) {
    const input: { OldValues___?: Array<{ Key: string; Value: unknown }> } & Record<string, unknown> = { ...fields };
    if (oldValues) {
        input.OldValues___ = oldValues;
    }
    return { input, clientNewValues: { ...fields } };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('MapFieldNamesToCodeNames — Record Changes payload security', () => {
    let resolver: TestResolver;
    let provider: IMetadataProvider;

    beforeEach(() => {
        resolver = new TestResolver();
        provider = testProvider([employeesEntity(), recordChangesEntity()]);
    });

    it('narrows ChangesJSON and withholds ChangesDescription for a restricted caller', async () => {
        const mapped = await resolver.MapOne(changeRow(), buildUser([INTERN_ROLE_ID]), provider);

        expect(JSON.parse(mapped['ChangesJSON'] as string)).not.toHaveProperty('Salary');
        expect(JSON.parse(mapped['ChangesJSON'] as string)).toHaveProperty('Name');
        expect('ChangesDescription' in mapped).toBe(false);
        expect(JSON.parse(mapped['FullRecordJSON'] as string)).not.toHaveProperty('Salary');
    });

    it('returns the full payload for a caller with no denials on the target entity', async () => {
        const mapped = await resolver.MapOne(changeRow(), buildUser([HR_ROLE_ID]), provider);

        expect(JSON.parse(mapped['ChangesJSON'] as string)).toHaveProperty('Salary');
        expect(mapped['ChangesDescription']).toBe('Salary changed from 100000 to 120000');
    });

    it('does not modify the caller-supplied row — resolvers pass the cache its own objects', async () => {
        const row = changeRow();
        const snapshot = { ...row };
        await resolver.MapOne(row, buildUser([INTERN_ROLE_ID]), provider);
        expect(row).toEqual(snapshot);
    });

    it('applies the same treatment through the array form', async () => {
        const mapped = await resolver.MapMany([changeRow(), changeRow()], buildUser([INTERN_ROLE_ID]), provider);

        for (const row of mapped) {
            expect(JSON.parse(row['ChangesJSON'] as string)).not.toHaveProperty('Salary');
            expect('ChangesDescription' in row).toBe(false);
        }
    });

    it('is a no-op with no context user', async () => {
        const mapped = await resolver.MapOne(changeRow(), undefined as unknown as UserInfo, provider);
        expect(mapped['ChangesDescription']).toBe('Salary changed from 100000 to 120000');
    });
});

/**
 * The write half. Without it the read projection destroys the thing it protects: a restricted
 * caller is handed a NARROWED ChangesJSON, that value hydrates a client entity as an ordinary
 * loaded value, and GenerateSaveSQL writes every SP-parameter field — so saving the record for any
 * reason (editing Comments, say) would overwrite the stored audit payload with the narrowed one.
 */
describe('StripRecordChangePayloadFromClientInput (write guard)', () => {
    let resolver: TestResolver;
    let provider: IMetadataProvider;
    let rcEntity: EntityInfo;

    beforeEach(() => {
        resolver = new TestResolver();
        rcEntity = recordChangesEntity();
        provider = testProvider([employeesEntity(), rcEntity]);
    });

    it('refuses every payload column a restricted caller sends back', () => {
        const { input, clientNewValues } = clientPayload({
            ID: 'rc-1',
            Comments: 'looks fine',
            ChangesJSON: JSON.stringify({ Name: { field: 'Name', oldValue: 'Ada', newValue: 'Ada L' } }), // narrowed
            FullRecordJSON: JSON.stringify({ ID: 'emp-1', Name: 'Ada L' }),                               // narrowed
        });

        const forcedTruthLoad = resolver.StripPayload(rcEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues, provider);

        expect(forcedTruthLoad).toBe(true);
        expect(clientNewValues).toEqual({ ID: 'rc-1', Comments: 'looks fine' });
        expect(input).not.toHaveProperty('ChangesJSON');
        expect(input).not.toHaveProperty('FullRecordJSON');
    });

    it('leaves the edit the user actually made alone', () => {
        const { input, clientNewValues } = clientPayload({ ID: 'rc-1', Comments: 'reviewed' });
        resolver.StripPayload(rcEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues, provider);
        expect(clientNewValues['Comments']).toBe('reviewed');
    });

    it('drops payload entries from OldValues so a narrowed value cannot read as a conflict', () => {
        const { input, clientNewValues } = clientPayload(
            { ID: 'rc-1', Comments: 'reviewed' },
            [{ Key: 'ID', Value: 'rc-1' }, { Key: 'ChangesJSON', Value: '{"Name":{}}' }, { Key: 'Comments', Value: '' }]
        );
        resolver.StripPayload(rcEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues, provider);
        expect(input.OldValues___).toEqual([{ Key: 'ID', Value: 'rc-1' }, { Key: 'Comments', Value: '' }]);
    });

    it('forces the truth-load even when the client sent no payload key at all', () => {
        // 'MJ: Record Changes' has TrackRecordChanges off, so a client sending OldValues would
        // otherwise hydrate from those values and never read what the database holds.
        const { input, clientNewValues } = clientPayload({ ID: 'rc-1', Comments: 'x' }, [{ Key: 'ID', Value: 'rc-1' }]);
        expect(resolver.StripPayload(rcEntity, buildUser([INTERN_ROLE_ID]), input, clientNewValues, provider)).toBe(true);
    });

    it('does NOT interfere with a caller who carries no denials anywhere', () => {
        const payload = JSON.stringify({ Salary: { field: 'Salary', oldValue: 1, newValue: 2 } });
        const { input, clientNewValues } = clientPayload({ ID: 'rc-1', ChangesJSON: payload });

        const forcedTruthLoad = resolver.StripPayload(rcEntity, buildUser([HR_ROLE_ID]), input, clientNewValues, provider);

        expect(forcedTruthLoad).toBe(false);
        expect(clientNewValues['ChangesJSON']).toBe(payload);
    });

    it('does not apply to any other entity', () => {
        const employees = employeesEntity();
        const { input, clientNewValues } = clientPayload({ ID: 'e-1', ChangesJSON: '{}' });
        expect(resolver.StripPayload(employees, buildUser([INTERN_ROLE_ID]), input, clientNewValues, provider)).toBe(false);
        expect(clientNewValues['ChangesJSON']).toBe('{}');
    });
});
