/**
 * Tests for value-list validation in `EntityField.Validate()` — MJ issue #3969.
 *
 * A field with `ValueListType = 'List'` carries an exhaustive set of legal values in
 * `__mj.EntityFieldValue`. Before #3969 nothing in `BaseEntity` read that metadata, so an
 * out-of-list value passed every rung of the validation ladder and was refused only by the
 * database, as a raw `CHECK` constraint error with no field attribution. That matters because for
 * an `IN (…)` CHECK, CodeGen's `ParseCheckConstraints` produces the value list *instead of* a
 * generated `Validate()` method, so the value list is the only runtime representation of the
 * constraint — every non-form path (`mj sync push`, GraphQL mutations, entity subclasses, Actions,
 * migration-time data loads) was unguarded.
 *
 * These tests are written against the EXPECTED behaviour: a value outside an exhaustive list must
 * fail `Validate()` with a field-named error, the way nullability and MaxLength already do.
 *
 * The three boundaries that make the rule safe to land are pinned here as well:
 *   1. `ListOrUserEntry` is never validated — it exists precisely to permit values off the list.
 *   2. An empty value list never rejects anything — a `List` field whose `EntityFieldValue` rows
 *      have not been populated must not reject every value.
 *   3. Null/empty is the nullability check's job — one mistake must never produce two errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntity, EntityField } from '../generic/baseEntity';
import { EntityFieldInfo, EntityFieldValueListType } from '../generic/entityInfo';
import { EntitySaveOptions, ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/**
 * Builds a REAL `EntityFieldInfo` (not a cast literal) so the `ValueListTypeEnum` and
 * `EntityFieldValues` getters under test are the production ones, including the lazy
 * construction of `EntityFieldValueInfo` from raw rows.
 */
function makeFieldInfo(overrides: Record<string, unknown> = {}): EntityFieldInfo {
    return new EntityFieldInfo({
        ID: 'field-1',
        EntityID: 'entity-1',
        Name: 'Status',
        DisplayName: '',
        Entity: 'Contract Types',
        Type: 'nvarchar',
        SQLFullType: 'nvarchar(50)',
        MaxLength: 50,
        AllowsNull: true,
        AllowUpdateAPI: true,
        IsPrimaryKey: false,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: null,
        ValueListType: 'List',
        NeedsQuotes: true,
        Status: 'Active',
        EntityFieldValues: [
            { ID: 'v-1', EntityFieldID: 'field-1', Sequence: 1, Value: 'Active', Code: 'Active' },
            { ID: 'v-2', EntityFieldID: 'field-1', Sequence: 2, Value: 'Inactive', Code: 'Inactive' },
        ],
        ...overrides,
    });
}

describe('EntityField.Validate — value lists (#3969)', () => {
    it('sanity: the harness field really is an exhaustive List with two values', () => {
        const fi = makeFieldInfo();
        expect(fi.ValueListTypeEnum).toBe(EntityFieldValueListType.List);
        expect(fi.EntityFieldValues.map(v => v.Value)).toEqual(['Active', 'Inactive']);
    });

    it('REPRO: rejects a value that is not in an exhaustive list', () => {
        const field = new EntityField(makeFieldInfo(), 'Archived');

        const result = field.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        // Field-attributed, so a caller can put the message on the right control instead of
        // surfacing a raw CHECK-constraint violation as a toast.
        expect(result.Errors[0].Source).toBe('Status');
        expect(result.Errors[0].Value).toBe('Archived');
        expect(result.Errors[0].Message).toContain('Active');
        expect(result.Errors[0].Message).toContain('Inactive');
        expect(result.Errors[0].Message).toContain('Archived');
    });

    it('accepts a value that is in the list', () => {
        const result = new EntityField(makeFieldInfo(), 'Inactive').Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('never validates ListOrUserEntry — free text is the point of that mode', () => {
        const fi = makeFieldInfo({ ValueListType: 'ListOrUserEntry' });
        expect(fi.ValueListTypeEnum).toBe(EntityFieldValueListType.ListOrUserEntry);

        const result = new EntityField(fi, 'Something the user typed').Validate();

        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('never validates when ValueListType is None', () => {
        const result = new EntityField(makeFieldInfo({ ValueListType: 'None' }), 'Archived').Validate();
        expect(result.Success).toBe(true);
    });

    it('never validates when the value list has not been populated', () => {
        // A field marked List whose EntityFieldValue rows are missing must not reject everything.
        const result = new EntityField(makeFieldInfo({ EntityFieldValues: [] }), 'Archived').Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('reports the unpopulated value list loudly, but only ONCE per field', () => {
        // Permitting silently would hide broken metadata; logging per row would flood a bulk load,
        // so the report is latched on the shared EntityFieldInfo.
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const fieldInfo = makeFieldInfo({ EntityFieldValues: [] });

            for (let i = 0; i < 5; i++) {
                expect(new EntityField(fieldInfo, `Value${i}`).Validate().Success).toBe(true);
            }

            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(String(consoleError.mock.calls[0][0])).toContain("ValueListType='List' but no EntityFieldValue rows");
        } finally {
            consoleError.mockRestore();
        }
    });

    it('leaves null alone on a nullable field — null is genuine absence, unlike \'\'', () => {
        const field = new EntityField(makeFieldInfo());
        field.Value = null;

        const result = field.Validate();

        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('produces exactly ONE error for a null value on a NOT NULL list field', () => {
        // One mistake, one message: the "cannot be null" error, never a second "must be one of".
        const field = new EntityField(makeFieldInfo({ AllowsNull: false }));
        field.Value = null;

        const result = field.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('cannot be null');
    });

    it('rejects a whitespace-only value — the CHECK constraint refuses it too', () => {
        // A blanked-out field is exactly where a bad value lands, so it must not slip through as
        // "absence". SQL Server pads on comparison, so '   ' is the same value as '' to a CHECK.
        const result = new EntityField(makeFieldInfo(), '   ').Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('Status');
    });

    it('rejects an empty string for the same reason', () => {
        // NOTE: assigned after construction — the EntityField constructor ignores a falsy initial
        // value, so `new EntityField(fi, '')` would leave the field null, not empty.
        const field = new EntityField(makeFieldInfo());
        field.Value = '';

        const result = field.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors[0].Message).toContain('must be one of');
    });

    it('names null as the alternative when the column is nullable', () => {
        // Because '' is now refused, the message has to say what "no value" actually looks like.
        const nullable = new EntityField(makeFieldInfo());
        nullable.Value = '';
        expect(nullable.Validate().Errors[0].Message).toContain('(or null)');

        const notNull = new EntityField(makeFieldInfo({ AllowsNull: false }));
        notNull.Value = '';
        expect(notNull.Validate().Errors[0].Message).not.toContain('(or null)');
    });

    it('does not validate read-only fields (SkipValidation covers the whole ladder)', () => {
        const result = new EntityField(makeFieldInfo({ AllowUpdateAPI: false }), 'Archived').Validate();
        expect(result.Success).toBe(true);
    });

    it('does not validate virtual fields', () => {
        const result = new EntityField(makeFieldInfo({ IsVirtual: true }), 'Archived').Validate();
        expect(result.Success).toBe(true);
    });

    describe('comparison semantics', () => {
        it('accepts a case variant — MJ must not refuse what the database accepts', () => {
            // SQL Server's default collation is case-insensitive, so CHECK (Status IN ('Active'))
            // accepts 'active'. Rejecting it here would turn saves that succeed today into
            // failures, which is a regression, not a fix. Deliberately lenient — and knowingly
            // asymmetric: PostgreSQL is case-sensitive, so on PG 'active' is still refused by the
            // CHECK rather than by this rung. Pinned as a test so tightening it is a conscious act.
            const result = new EntityField(makeFieldInfo(), 'active').Validate();
            expect(result.Success).toBe(true);
        });

        it('accepts a space-padded value — nchar(n) columns read back padded', () => {
            // Not a nicety: MJ core stores value-list values in fixed-width nchar columns, so the
            // runtime value really is 'Input     ' while the metadata value is 'Input'. Measured on
            // a live 6.x database, an untrimmed comparison would reject 9,306 existing rows across
            // five MJ core entities — this test is what keeps that from regressing.
            const result = new EntityField(makeFieldInfo(), 'Active     ').Validate();
            expect(result.Success).toBe(true);
        });

        it('compares numeric value lists by value, not by JS type', () => {
            // A hand-authored numeric list stores its values as strings in EntityFieldValue;
            // the field's runtime value is a number. A strict === would reject every legal value.
            const numeric = {
                Name: 'Level',
                Type: 'int',
                SQLFullType: 'int',
                NeedsQuotes: false,
                ValueListType: 'List',
                EntityFieldValues: [
                    { ID: 'n-1', EntityFieldID: 'field-1', Sequence: 1, Value: '1', Code: '1' },
                    { ID: 'n-2', EntityFieldID: 'field-1', Sequence: 2, Value: '2', Code: '2' },
                ],
            };

            expect(new EntityField(makeFieldInfo(numeric), 2).Validate().Success).toBe(true);
            expect(new EntityField(makeFieldInfo(numeric), 7).Validate().Success).toBe(false);
        });

        it('builds the normalized value set once per FIELD, not once per record', () => {
            // The set derives from metadata that is immutable after load and shared by every
            // EntityField instance of the field, so validating 1,000 records must not rebuild it
            // 1,000 times. Reading EntityFieldValues is the observable proxy for rebuilding.
            const fieldInfo = makeFieldInfo();
            const valuesRead = vi.spyOn(fieldInfo, 'EntityFieldValues', 'get');

            for (let i = 0; i < 50; i++) {
                expect(new EntityField(fieldInfo, 'Active').Validate().Success).toBe(true);
            }

            expect(valuesRead).toHaveBeenCalledTimes(1);
            valuesRead.mockRestore();
        });

        it('reuses the formatted value list across repeated failures', () => {
            // A bad bulk load fails on the same field over and over; the message never changes.
            const fieldInfo = makeFieldInfo();
            expect(new EntityField(fieldInfo, 'Archived').Validate().Success).toBe(false);
            const valuesRead = vi.spyOn(fieldInfo, 'EntityFieldValues', 'get');

            const second = new EntityField(fieldInfo, 'Archived').Validate();

            expect(second.Errors[0].Message).toContain('Active, Inactive');
            expect(valuesRead).not.toHaveBeenCalled();
            valuesRead.mockRestore();
        });

        it('truncates a long value list in the message', () => {
            const many = Array.from({ length: 30 }, (_, i) => ({
                ID: `v-${i}`, EntityFieldID: 'field-1', Sequence: i + 1, Value: `Value${i}`, Code: `Value${i}`,
            }));

            const result = new EntityField(makeFieldInfo({ EntityFieldValues: many, MaxLength: 200 }), 'Nope').Validate();

            expect(result.Success).toBe(false);
            expect(result.Errors[0].Message).toContain('... (30 total)');
            expect(result.Errors[0].Message).not.toContain('Value25');
        });

        it('permits a non-scalar value rather than stringifying it, but reports it once', () => {
            // Dates/objects/booleans with a value list are nonsense metadata; comparing them would
            // reject legal values rather than guard them. Permitted — but not in silence, since a
            // caller would otherwise believe the guard is on when it is not.
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const fieldInfo = makeFieldInfo();

                for (const bad of [new Date('2026-01-01'), true, { a: 1 }]) {
                    const result = new EntityField(fieldInfo, bad as never).Validate();
                    expect(result.Errors.filter(e => e.Message.includes('must be one of'))).toHaveLength(0);
                }

                expect(consoleError).toHaveBeenCalledTimes(1);
                expect(String(consoleError.mock.calls[0][0])).toContain('Value-list validation compares');
            } finally {
                consoleError.mockRestore();
            }
        });

        it('says nothing for null or undefined — an unset field is not an anomaly', () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const fieldInfo = makeFieldInfo();
                const nullField = new EntityField(fieldInfo);
                nullField.Value = null;
                expect(nullField.Validate().Success).toBe(true);

                const undefinedField = new EntityField(fieldInfo);
                undefinedField.Value = undefined;
                expect(undefinedField.Validate().Success).toBe(true);

                expect(consoleError).not.toHaveBeenCalled();
            } finally {
                consoleError.mockRestore();
            }
        });
    });
});

/**
 * End-to-end version of the issue's repro, one layer up: real metadata loaded through
 * `ProviderBase.PostProcessEntityMetadata` (so the EntityFieldValue rows are wired onto the field
 * the way they are at runtime), real `BaseEntity.Validate()`, and a real `Save()` call. The point
 * is that the round trip is refused locally — the provider's Save is never reached — instead of the
 * database answering with an unattributed CHECK-constraint violation.
 */
describe('BaseEntity value-list validation, end to end (#3969)', () => {
    const TEST_ROLE_ID = 'role-test-1';
    const MOCK_METADATA = {
        Applications: [],
        Entities: [
            {
                ID: 'entity-contract-types', Name: 'Contract Types', SchemaName: 'dbo',
                BaseView: 'vwContractTypes', BaseTable: 'ContractType',
                IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
                EntityFields: [
                    { ID: 'f-ct-1', EntityID: 'entity-contract-types', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, Sequence: 1 },
                    { ID: 'f-ct-2', EntityID: 'entity-contract-types', Name: 'Name', Type: 'nvarchar', MaxLength: 100, AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 },
                    // The field under test: an IN (...) CHECK represented purely as a value list.
                    { ID: 'f-ct-3', EntityID: 'entity-contract-types', Name: 'Status', Type: 'nvarchar', MaxLength: 50, AllowsNull: false, AllowUpdateAPI: true, ValueListType: 'List', NeedsQuotes: true, Sequence: 3 },
                ],
                EntityPermissions: [
                    { EntityID: 'entity-contract-types', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
                ],
            },
        ],
        get EntityFields() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []); },
        get EntityPermissions() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []); },
        EntityFieldValues: [
            { ID: 'efv-1', EntityFieldID: 'f-ct-3', Sequence: 1, Value: 'Active', Code: 'Active' },
            { ID: 'efv-2', EntityFieldID: 'f-ct-3', Sequence: 2, Value: 'Inactive', Code: 'Inactive' },
        ],
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

    /** An existing, saveable record whose provider Save is a spy, with REAL validation in play. */
    function makeRecord(): { entity: BaseEntity; saveSpy: ReturnType<typeof vi.fn> } {
        const entityInfo = provider.Entities.find(e => e.Name === 'Contract Types')!;
        const entity = new TestEntity(entityInfo);
        Object.defineProperty(entity, 'ActiveUser', { get: () => makeUser(), configurable: true });
        Object.defineProperty(entity, 'IsSaved', { get: () => true, configurable: true });
        const saveSpy = vi.fn().mockResolvedValue({ ID: 'ct-1', Name: 'Standard', Status: 'Active' });
        Object.defineProperty(entity, 'ProviderToUse', { get: () => ({ Save: saveSpy }), configurable: true });
        vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
        vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);
        entity.SetMany({ ID: 'ct-1', Name: 'Standard', Status: 'Active' }, true);
        return { entity, saveSpy };
    }

    it('wires the EntityFieldValue rows onto the field through real metadata post-processing', () => {
        const field = provider.Entities.find(e => e.Name === 'Contract Types')!.Fields.find(f => f.Name === 'Status')!;
        expect(field.ValueListTypeEnum).toBe(EntityFieldValueListType.List);
        expect(field.EntityFieldValues.map(v => v.Value)).toEqual(['Active', 'Inactive']);
    });

    it("REPRO: Validate() fails, naming the field, when Status is set off the list", () => {
        const { entity } = makeRecord();
        entity.Set('Status', 'Archived');

        const result = entity.Validate();

        expect(result.Success).toBe(false);
        expect(result.Errors.map(e => e.Source)).toContain('Status');
        expect(result.Errors.find(e => e.Source === 'Status')!.Message).toContain('must be one of');
    });

    it('refuses the Save locally — the provider is never reached', async () => {
        const { entity, saveSpy } = makeRecord();
        entity.Set('Status', 'Archived');

        const saved = await entity.Save(Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }));

        expect(saved).toBe(false);
        expect(saveSpy).not.toHaveBeenCalled();
        // A validation failure reports its detail in LatestResult.Errors (Message stays empty).
        const errors = (entity.LatestResult?.Errors ?? []).map(e => (e as { Message?: string }).Message ?? String(e));
        expect(errors.join('; ')).toContain('must be one of');
    });

    it('still saves a legal value', async () => {
        const { entity, saveSpy } = makeRecord();
        entity.Set('Status', 'Inactive');

        const saved = await entity.Save(Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }));

        expect(saved).toBe(true);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });
});
