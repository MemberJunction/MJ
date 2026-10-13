/**
 * Tests for the blank NAME field rung in `EntityField.Validate()` — MJ issue #4683.
 *
 * An entity's name field is how every other surface REFERS to the record: FK display, CodeGen's
 * JOIN aliases, search, pickers, related-record grids. A blank one does not corrupt the row — it
 * makes the row unidentifiable everywhere it is referenced from. SQL Server accepts `''` in a NOT
 * NULL column and the nullability rung only refuses `null`, so nothing caught it.
 *
 * #4359 established that `''` is a VALUE, not absence, and removed the form's blanket red underline
 * for it. This is the one place that reasoning does not hold, and the rule is deliberately narrow:
 *
 *   1. Only the field `EntityInfo.NameField` RESOLVES to — not every field flagged `IsNameField`.
 *      45 entities flag several (e.g. `Name` + `DisplayName`), and blanking a DisplayName stays legal.
 *   2. Only when that column is NOT NULL. A nullable name field permits `null`, so it permits `''`
 *      too — the column's own declaration is the authority (ruled by @rkihm-BC on #4644).
 *   3. Whitespace-only counts as blank: `'   '` is as unidentifiable as `''`.
 *   4. One mistake, one message — a blanked name that also carries a value list must not report twice.
 *
 * Written against the EXPECTED behaviour, not read off the implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntity, EntityField } from '../generic/baseEntity';
import { EntityFieldInfo } from '../generic/entityInfo';
import { EntitySaveOptions, ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/** A real `EntityFieldInfo` for a NOT NULL nvarchar name column with no default. */
function makeNameFieldInfo(overrides: Record<string, unknown> = {}): EntityFieldInfo {
    return new EntityFieldInfo({
        ID: 'field-name',
        EntityID: 'entity-1',
        Name: 'Name',
        DisplayName: '',
        Entity: 'Widgets',
        Type: 'nvarchar',
        SQLFullType: 'nvarchar(200)',
        MaxLength: 400,
        AllowsNull: false,
        AllowUpdateAPI: true,
        IsPrimaryKey: false,
        IsVirtual: false,
        IsNameField: true,
        AutoIncrement: false,
        DefaultValue: null,
        ValueListType: 'None',
        NeedsQuotes: true,
        Status: 'Active',
        ...overrides,
    });
}

/** A field as it looks on a record loaded from the database: first assignment is the baseline. */
function loadedField(fi: EntityFieldInfo, storedValue: unknown): EntityField {
    return new EntityField(fi, storedValue);
}

describe('EntityField.Validate — blank name fields (#4683)', () => {
    it('REPRO: refuses an empty string in the resolved name field', () => {
        const field = loadedField(makeNameFieldInfo(), 'Widget A');
        field.Value = '';

        const result = field.Validate(true);

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
        expect(result.Errors[0].Message).toContain('cannot be blank');
    });

    it('refuses a whitespace-only name — equally unidentifiable', () => {
        const field = loadedField(makeNameFieldInfo(), 'Widget A');
        field.Value = '   ';

        const result = field.Validate(true);

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
    });

    it('allows a blank value when the name column is NULLABLE', () => {
        // Where the developer (or an LLM picking the name field) made it nullable, absence is legal
        // — and '' is absence's twin. The column's declaration is the authority.
        const field = loadedField(makeNameFieldInfo({ AllowsNull: true }), 'Widget A');
        field.Value = '';

        const result = field.Validate(true);

        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('allows a blank value in a field that is NOT the resolved name field', () => {
        // The #4359 contract for every other column: '' is a value a NOT NULL column accepts.
        const field = loadedField(makeNameFieldInfo({ Name: 'Description', IsNameField: false }), 'some text');
        field.Value = '';

        expect(field.Validate(false).Success).toBe(true);
    });

    it('does not fire when the caller validates a field in isolation (default parameter)', () => {
        // A field has no back-pointer to its entity; only BaseEntity knows which field is THE name.
        const field = loadedField(makeNameFieldInfo(), 'Widget A');
        field.Value = '';

        expect(field.Validate().Success).toBe(true);
    });

    it('still accepts a real name', () => {
        const field = loadedField(makeNameFieldInfo(), 'Widget A');
        field.Value = 'Widget B';

        expect(field.Validate(true).Success).toBe(true);
    });

    it('leaves null to the nullability rung — one mistake, one message', () => {
        const field = loadedField(makeNameFieldInfo(), 'Widget A');
        field.Value = null;

        const result = field.Validate(true);

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('cannot be null');
    });

    it('produces exactly ONE error for a blank name that also carries a value list', () => {
        const fi = makeNameFieldInfo({
            ValueListType: 'List',
            EntityFieldValues: [
                { ID: 'v-1', EntityFieldID: 'field-name', Sequence: 1, Value: 'Alpha', Code: 'Alpha' },
                { ID: 'v-2', EntityFieldID: 'field-name', Sequence: 2, Value: 'Beta', Code: 'Beta' },
            ],
        });
        const field = loadedField(fi, 'Alpha');
        field.Value = '';

        const result = field.Validate(true);

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('cannot be blank');
        expect(result.Errors[0].Message).not.toContain('must be one of');
    });

    it('does not validate a read-only name field', () => {
        const field = loadedField(makeNameFieldInfo({ AllowUpdateAPI: false }), 'Widget A');
        field.Value = '';

        expect(field.Validate(true).Success).toBe(true);
    });

    it('does not apply to a non-string name column', () => {
        const fi = makeNameFieldInfo({ Name: 'Code', Type: 'int', SQLFullType: 'int', MaxLength: 4, NeedsQuotes: false });
        const field = loadedField(fi, 7);
        field.Value = 0;

        expect(field.Validate(true).Success).toBe(true);
    });
});

describe('BaseEntity.Validate — resolves which field is the name, and refuses a blank one (#4683)', () => {
    const TEST_ROLE_ID = 'role-test-1';

    /** `Name` and `DisplayName` both flagged — exactly the ambiguity 45 entities actually have. */
    const MOCK_METADATA = {
        Applications: [],
        Entities: [
            {
                ID: 'entity-widgets', Name: 'Widgets', SchemaName: 'dbo',
                BaseView: 'vwWidgets', BaseTable: 'Widget',
                IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
                EntityFields: [
                    { ID: 'f-w-1', EntityID: 'entity-widgets', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, Sequence: 1 },
                    { ID: 'f-w-2', EntityID: 'entity-widgets', Name: 'Name', Type: 'nvarchar', MaxLength: 400, AllowsNull: false, AllowUpdateAPI: true, IsNameField: true, NeedsQuotes: true, Sequence: 2 },
                    // Also flagged, and NOT NULL — must stay blankable: it is not what NameField resolves to.
                    { ID: 'f-w-3', EntityID: 'entity-widgets', Name: 'DisplayName', Type: 'nvarchar', MaxLength: 400, AllowsNull: false, AllowUpdateAPI: true, IsNameField: true, NeedsQuotes: true, Sequence: 3 },
                    { ID: 'f-w-4', EntityID: 'entity-widgets', Name: 'Description', Type: 'nvarchar', MaxLength: -1, AllowsNull: true, AllowUpdateAPI: true, NeedsQuotes: true, Sequence: 4 },
                ],
                EntityPermissions: [
                    { EntityID: 'entity-widgets', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
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

    class TestEntity extends BaseEntity {}

    let provider: TestMetadataProvider;

    beforeEach(async () => {
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(MOCK_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    });

    function makeUser(id = 'user-1'): UserInfo {
        const u = new UserInfo();
        u.ID = id; u.Name = 'Test User'; u.Email = `${id}@test.com`; u.IsActive = true;
        (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'TestRole' })];
        return u;
    }

    function makeRecord(): { entity: BaseEntity; saveSpy: ReturnType<typeof vi.fn> } {
        const entityInfo = provider.Entities.find(e => e.Name === 'Widgets')!;
        const entity = new TestEntity(entityInfo);
        Object.defineProperty(entity, 'ActiveUser', { get: () => makeUser(), configurable: true });
        Object.defineProperty(entity, 'IsSaved', { get: () => true, configurable: true });
        const saveSpy = vi.fn().mockResolvedValue({ ID: 'w-1', Name: 'Widget A', DisplayName: 'Widget A', Description: null });
        Object.defineProperty(entity, 'ProviderToUse', { get: () => ({ Save: saveSpy }), configurable: true });
        vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
        vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);
        entity.SetMany({ ID: 'w-1', Name: 'Widget A', DisplayName: 'Widget A', Description: null }, true);
        return { entity, saveSpy };
    }

    it('sanity: NameField resolves to `Name` even though DisplayName is flagged too', () => {
        const entityInfo = provider.Entities.find(e => e.Name === 'Widgets')!;
        expect(entityInfo.Fields.filter(f => f.IsNameField).map(f => f.Name)).toEqual(['Name', 'DisplayName']);
        expect(entityInfo.NameField?.Name).toBe('Name');
    });

    it('REPRO: refuses the Save when the name is blanked, and the provider is never reached', async () => {
        const { entity, saveSpy } = makeRecord();
        entity.Set('Name', '');

        const saved = await entity.Save(Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }));

        expect(saved).toBe(false);
        expect(saveSpy).not.toHaveBeenCalled();
        const errors = entity.LatestResult?.Errors ?? [];
        expect(errors.map(e => (e as { Source?: string }).Source)).toContain('Name');
    });

    it('still saves when a SECONDARY IsNameField field is blanked', async () => {
        // DisplayName is flagged and NOT NULL, but it is not what the record is identified by.
        const { entity, saveSpy } = makeRecord();
        entity.Set('DisplayName', '');

        const saved = await entity.Save(Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }));

        expect(saved).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('reports exactly one error, attributed to the name field', () => {
        const { entity } = makeRecord();
        entity.Set('Name', '   ');

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('Name');
    });

    it('still saves a record with a real name', async () => {
        const { entity, saveSpy } = makeRecord();
        entity.Set('Name', 'Widget B');

        const saved = await entity.Save(Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }));

        expect(saved).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });
});
