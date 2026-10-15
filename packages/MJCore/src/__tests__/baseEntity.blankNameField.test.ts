/**
 * Tests for the blank NAME field rule in `BaseEntity.Validate()` — MJ issue #4683.
 *
 * An entity's name field is how every other surface REFERS to the record: FK display, CodeGen's
 * JOIN aliases, search, pickers, related-record grids. A blank one does not corrupt the row — it
 * makes the row unidentifiable everywhere it is referenced from. SQL Server accepts `''` in a NOT
 * NULL column and the nullability rule only refuses `null`, so nothing caught it.
 *
 * #4359 established that `''` is a VALUE, not absence, and removed the form's blanket red underline
 * for it. This is the one place that reasoning does not hold, and the rule is deliberately narrow:
 *
 *   1. Only the field `EntityInfo.NameField` RESOLVES to — not every field flagged `IsNameField`.
 *      45 entities flag several (e.g. `Name` + `DisplayName`), and blanking a DisplayName stays legal.
 *   2. Only when that column is NOT NULL. A nullable name field permits `null`, so it permits `''`
 *      too — the column's own declaration is the authority (ruled by @rkihm-BC on #4644).
 *   3. Whitespace-only counts as blank: `'   '` is as unidentifiable as `''`.
 *   4. One mistake, one message — a blank name is not also reported by the field's other rules.
 *   5. Only on a new record, or when the name itself is being changed. A saved record whose name is
 *      ALREADY blank keeps saving when something else changes, so automated saves of old data do not
 *      start failing.
 *
 * Rule 5 needs to know whether the RECORD is new, which only the entity knows, so the rule lives in
 * BaseEntity and every case here goes through an entity. Which field is the name is shared metadata
 * (`EntityFieldInfo.IsEntityNameField`), tested at the bottom. Written against the EXPECTED behaviour,
 * not read off the implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityFieldInfo, EntityInfo } from '../generic/entityInfo';
import { EntitySaveOptions, ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

const TEST_ROLE_ID = 'role-test-1';
const ENTITY_ID = 'entity-widgets';

type RawField = Record<string, unknown>;
type RecordData = Record<string, unknown>;

/** The ID primary key every mock entity carries. */
const ID_FIELD: RawField = { ID: 'f-w-1', EntityID: ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, Sequence: 1 };

/** A NOT NULL nvarchar field; `overrides` adjust it per test. */
function stringField(id: string, name: string, sequence: number, overrides: RawField = {}): RawField {
    return { ID: id, EntityID: ENTITY_ID, Name: name, Type: 'nvarchar', MaxLength: 400, AllowsNull: false, AllowUpdateAPI: true, NeedsQuotes: true, Sequence: sequence, ...overrides };
}

/**
 * The default shape: `Name` and `DisplayName` BOTH flagged — exactly the ambiguity 45 entities
 * actually have — plus an ordinary NOT NULL string (`SerialNumber`) and a nullable `Description`.
 */
function defaultFields(nameOverrides: RawField = {}): RawField[] {
    return [
        ID_FIELD,
        stringField('f-w-2', 'Name', 2, { IsNameField: true, ...nameOverrides }),
        stringField('f-w-3', 'DisplayName', 3, { IsNameField: true }),
        stringField('f-w-4', 'SerialNumber', 4),
        stringField('f-w-5', 'Description', 5, { MaxLength: -1, AllowsNull: true }),
    ];
}

const DEFAULT_DATA: RecordData = { ID: 'w-1', Name: 'Widget A', DisplayName: 'Widget A', SerialNumber: 'SN-1', Description: null };

function buildMetadata(fields: RawField[]) {
    return {
        Applications: [],
        Entities: [
            {
                ID: ENTITY_ID, Name: 'Widgets', SchemaName: 'dbo',
                BaseView: 'vwWidgets', BaseTable: 'Widget',
                IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
                EntityFields: fields,
                EntityPermissions: [
                    { EntityID: ENTITY_ID, RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
                ],
            },
        ],
        get EntityFields() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []); },
        get EntityPermissions() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []); },
        EntityFieldValues: [],
        EntityRelationships: [], EntitySettings: [], ApplicationEntities: [], ApplicationSettings: [],
        Roles: [{ ID: TEST_ROLE_ID, Name: 'TestRole' }], RowLevelSecurityFilters: [], AuditLogTypes: [], Authorizations: [],
        QueryCategories: [], Queries: [], QueryFields: [], QueryPermissions: [], QueryEntities: [], QueryParameters: [],
        EntityDocumentTypes: [], Libraries: [], ExplorerNavigationItems: [],
    };
}

class TestEntity extends BaseEntity {}

function makeUser(id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id; u.Name = 'Test User'; u.Email = `${id}@test.com`; u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'TestRole' })];
    return u;
}

describe('BaseEntity.Validate — refuses a blank value in the resolved name field (#4683)', () => {
    let provider: TestMetadataProvider;

    async function configure(fields: RawField[]): Promise<EntityInfo> {
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(buildMetadata(fields));
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        return provider.Entities.find(e => e.Name === 'Widgets')!;
    }

    /** A saved record loaded with `data`, wired so Save() reports whether the provider was reached. */
    function makeRecord(entityInfo: EntityInfo, data: RecordData = DEFAULT_DATA): { entity: BaseEntity; saveSpy: ReturnType<typeof vi.fn> } {
        const entity = new TestEntity(entityInfo);
        Object.defineProperty(entity, 'ActiveUser', { get: () => makeUser(), configurable: true });
        Object.defineProperty(entity, 'IsSaved', { get: () => true, configurable: true });
        const saveSpy = vi.fn().mockResolvedValue({ ...data });
        Object.defineProperty(entity, 'ProviderToUse', { get: () => ({ Save: saveSpy }), configurable: true });
        vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
        vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);
        entity.SetMany(data, true);
        return { entity, saveSpy };
    }

    function save(entity: BaseEntity): Promise<boolean> {
        return entity.Save(Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }));
    }

    let entityInfo: EntityInfo;

    beforeEach(async () => {
        entityInfo = await configure(defaultFields());
    });

    it('sanity: NameField resolves to `Name` even though DisplayName is flagged too', () => {
        expect(entityInfo.Fields.filter(f => f.IsNameField).map(f => f.Name)).toEqual(['Name', 'DisplayName']);
        expect(entityInfo.NameField?.Name).toBe('Name');
    });

    it('REPRO: refuses the Save when the name is blanked, and the provider is never reached', async () => {
        const { entity, saveSpy } = makeRecord(entityInfo);
        entity.Set('Name', '');

        const saved = await save(entity);

        expect(saved).toBe(false);
        expect(saveSpy).not.toHaveBeenCalled();
        const errors = entity.LatestResult?.Errors ?? [];
        expect(errors.map(e => (e as { Source?: string }).Source)).toContain('Name');
    });

    it('refuses an empty name with exactly one error, attributed to the name field', () => {
        const { entity } = makeRecord(entityInfo);
        entity.Set('Name', '');

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
        expect(result.Errors[0].Message).toContain('cannot be blank');
    });

    it('refuses a whitespace-only name — equally unidentifiable', () => {
        const { entity } = makeRecord(entityInfo);
        entity.Set('Name', '   ');

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
    });

    it('still saves when a SECONDARY IsNameField field is blanked', async () => {
        // DisplayName is flagged and NOT NULL, but it is not what the record is identified by.
        const { entity, saveSpy } = makeRecord(entityInfo);
        entity.Set('DisplayName', '');

        expect(await save(entity)).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('still accepts a blank in an ordinary NOT NULL string column (#4359 unchanged)', () => {
        const { entity } = makeRecord(entityInfo);
        entity.Set('SerialNumber', '');

        expect(entity.Validate().Success).toBe(true);
    });

    it('still saves a record with a real name', async () => {
        const { entity, saveSpy } = makeRecord(entityInfo);
        entity.Set('Name', 'Widget B');

        expect(await save(entity)).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('leaves null to the nullability rule — one mistake, one message', () => {
        const { entity } = makeRecord(entityInfo);
        entity.Set('Name', null);

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('cannot be null');
    });

    it('does not change EntityField.Validate() on its own — the rule needs the entity (is the record new?)', () => {
        const { entity } = makeRecord(entityInfo);
        entity.Set('Name', '');

        expect(entity.GetFieldByName('Name')!.Validate().Success).toBe(true);
    });

    it('allows a blank value when the name column is NULLABLE', async () => {
        // Where the developer (or an LLM picking the name field) made it nullable, absence is legal
        // — and '' is absence's twin. The column's declaration is the authority.
        const info = await configure(defaultFields({ AllowsNull: true }));
        const { entity } = makeRecord(info);
        entity.Set('Name', '');

        expect(entity.Validate().Success).toBe(true);
    });

    it('reports exactly ONE error for a blank name that also carries a value list', async () => {
        const info = await configure(defaultFields({
            ValueListType: 'List',
            EntityFieldValues: [
                { ID: 'v-1', EntityFieldID: 'f-w-2', Sequence: 1, Value: 'Alpha', Code: 'Alpha' },
                { ID: 'v-2', EntityFieldID: 'f-w-2', Sequence: 2, Value: 'Beta', Code: 'Beta' },
            ],
        }));
        expect(info.NameField?.EntityFieldValues.map(v => v.Value)).toEqual(['Alpha', 'Beta']); // the list really reached the field
        const { entity } = makeRecord(info, { ...DEFAULT_DATA, Name: 'Alpha' });
        entity.Set('Name', '');

        const result = entity.Validate();

        // '' would also fail the value list; the blank-name rule runs first and is the one message.
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
        expect(result.Errors[0].Message).toContain('cannot be blank');
        expect(result.Errors[0].Message).not.toContain('must be one of');
    });

    it('does not validate a read-only name field', async () => {
        const info = await configure(defaultFields({ AllowUpdateAPI: false }));
        const { entity } = makeRecord(info);
        entity.Set('Name', '');

        expect(entity.Validate().Success).toBe(true);
    });

    it('does not validate a name field the record was loaded without', () => {
        // The save does not write a not-loaded field, so the stored name is untouched. The record is
        // treated as new so that the not-loaded exemption is the only thing standing between it and a refusal.
        const { entity } = makeRecord(entityInfo, { ...DEFAULT_DATA, Name: '' });
        Object.defineProperty(entity, 'IsSaved', { get: () => false, configurable: true });
        entity.GetFieldByName('Name')!.MarkNotLoaded();

        expect(entity.Validate().Success).toBe(true);
    });

    it('does not apply to a non-string name column', async () => {
        const info = await configure([
            ID_FIELD,
            { ID: 'f-w-2', EntityID: ENTITY_ID, Name: 'Code', Type: 'int', AllowsNull: false, AllowUpdateAPI: true, IsNameField: true, NeedsQuotes: false, Sequence: 2 },
        ]);
        expect(info.NameField?.Name).toBe('Code');
        const { entity } = makeRecord(info, { ID: 'w-1', Code: 7 });
        entity.Set('Code', 0);

        expect(entity.Validate().Success).toBe(true);
    });

    // ---- Rule 5: a new record, or a name being changed ----

    it('still saves a record whose name was ALREADY blank when something else changes', async () => {
        // An automated save (a status, a sync) must not start failing because of data it did not touch.
        const { entity, saveSpy } = makeRecord(entityInfo, { ...DEFAULT_DATA, Name: '' });
        entity.Set('SerialNumber', 'SN-2');

        expect(await save(entity)).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('refuses changing an already-blank name to another blank value', () => {
        const { entity } = makeRecord(entityInfo, { ...DEFAULT_DATA, Name: '' });
        entity.Set('Name', '   ');

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('cannot be blank');
    });

    it('refuses a blank name on a NEW record, although the field itself does not report a change', () => {
        const entity = new TestEntity(entityInfo);
        entity.NewRecord();
        entity.SetMany({ Name: '', DisplayName: 'Widget N', SerialNumber: 'SN-N' });

        // The first value set on a new record becomes the field's old value, so the field cannot tell
        // this from a saved record that already had a blank name. Only the entity knows it is new.
        expect(entity.IsSaved).toBe(false);
        expect(entity.GetFieldByName('Name')!.Dirty).toBe(false);

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
        expect(result.Errors[0].Message).toContain('cannot be blank');
    });

    // ---- The shared definition: EntityFieldInfo.IsEntityNameField ----

    it('IsEntityNameField marks only the field NameField resolves to', () => {
        const marked = entityInfo.Fields.filter(f => f.IsEntityNameField).map(f => f.Name);

        expect(marked).toEqual(['Name']); // not DisplayName, although it is flagged IsNameField too
    });

    it('IsEntityNameField reads the provider that built the field, not the global one', async () => {
        // Two providers hold the same entity with different name fields: in B only DisplayName is flagged.
        const infoA = await configure(defaultFields());
        const infoB = await configure([
            ID_FIELD,
            stringField('f-w-2', 'Name', 2),
            stringField('f-w-3', 'DisplayName', 3, { IsNameField: true }),
        ]);
        const byName = (info: EntityInfo, name: string) => info.Fields.find(f => f.Name === name)!;

        expect(byName(infoA, 'Name').IsEntityNameField).toBe(true);
        expect(byName(infoA, 'DisplayName').IsEntityNameField).toBe(false);
        expect(byName(infoB, 'Name').IsEntityNameField).toBe(false);
        expect(byName(infoB, 'DisplayName').IsEntityNameField).toBe(true);
    });

    it('IsEntityNameField is false for a field whose entity cannot be found', () => {
        const orphan = new EntityFieldInfo({ ID: 'f-x', EntityID: 'entity-nowhere', Name: 'Name', IsNameField: true });

        expect(orphan.IsEntityNameField).toBe(false);
    });
});
