import { describe, it, expect, beforeEach } from 'vitest';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

/**
 * Tests for tolerant SP-signature codegen (Pillar 1 of the cross-app
 * migration architecture). The SP signatures must accept NULL for any
 * non-required parameter so historical EXEC calls in migration history
 * remain valid as the schema evolves.
 *
 * Four golden-master shapes from plans/cross-app-migration-ordering.md §3.1:
 *   1. PK-only entity
 *   2. All-required (NOT NULL, no default) entity
 *   3. Mixed required / nullable / default-bearing entity
 *   4. Semantic-NULL column requiring the `_Clear` companion
 */
function createMockEntity(
    overrides: Record<string, unknown> = {},
    fieldOverrides?: Record<string, unknown>[]
): EntityInfo {
    const defaultFields = fieldOverrides || [
        {
            ID: 'pk-1',
            Name: 'ID',
            Type: 'uniqueidentifier',
            Length: 16,
            IsPrimaryKey: true,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: 'newsequentialid()',
        },
    ];

    const initData = {
        ID: 'entity-1',
        Name: 'Test Entity',
        SchemaName: '__mj',
        BaseTable: 'TestEntity',
        BaseTableCodeName: 'TestEntity',
        BaseView: 'vwTestEntities',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        CascadeDeletes: false,
        DeleteType: 'Hard',
        spCreate: '',
        spUpdate: '',
        spDelete: '',
        EntityFields: defaultFields,
        EntityPermissions: [],
        ...overrides,
    };

    return new EntityInfo(initData);
}

describe('SQLServerCodeGenProvider — tolerant SP signatures', () => {
    let provider: SQLServerCodeGenProvider;

    beforeEach(() => {
        provider = new SQLServerCodeGenProvider();
    });

    describe('generateCRUDParamString — Create', () => {
        it('Shape 1: PK-only — UUID PK with default is optional on create', () => {
            const entity = createMockEntity();
            const result = provider.generateCRUDParamString(entity.Fields, false);
            expect(result).toContain('@ID uniqueidentifier = NULL');
        });

        it('Shape 2: all-required — NOT NULL, no-default columns stay required', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                { ID: 'f3', Name: 'BaseTable', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, false);
            // PK with default is optional
            expect(result).toContain('@ID uniqueidentifier = NULL');
            // Required columns have NO `= NULL` default
            expect(result).toMatch(/@Name nvarchar\(\d+\)(?!\s*=)/);
            expect(result).toMatch(/@BaseTable nvarchar\(\d+\)(?!\s*=)/);
            expect(result).not.toContain('@Name nvarchar(255) = NULL');
            expect(result).not.toContain('@BaseTable nvarchar(255) = NULL');
        });

        it('Shape 3: mixed — nullable and default-bearing columns get `= NULL`', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' }, // required
                { ID: 'f3', Name: 'SchemaName', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'__mj'" }, // has default
                { ID: 'f4', Name: 'AllowAuditLog', Type: 'bit', Length: 1, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '0' }, // has default
                { ID: 'f5', Name: 'Email', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' }, // nullable, no default
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, false);
            // Required field has no `= NULL`
            expect(result).toMatch(/@Name nvarchar\(\d+\)(?!\s*=)/);
            // Default-bearing fields are optional
            expect(result).toContain('@SchemaName nvarchar(255) = NULL');
            expect(result).toContain('@AllowAuditLog bit = NULL');
            // Plain nullable field is optional
            expect(result).toContain('@Email nvarchar(255) = NULL');
        });

        it('Shape 4: nullable + non-NULL default emits `_Clear` companion before main param', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, false);
            expect(result).toContain('@Status_Clear bit = 0');
            expect(result).toContain('@Status nvarchar(50) = NULL');
            // Companion must come BEFORE the main parameter
            expect(result.indexOf('@Status_Clear')).toBeLessThan(result.indexOf('@Status nvarchar'));
        });

        it('emits `_Clear` companion for nullable column with no default', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Email', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, false);
            // Predicate is `AllowsNull` — every nullable column gets a _Clear companion
            // so callers can explicitly set the column to NULL through Save().
            expect(result).toContain('@Email_Clear bit = 0');
        });

        it('emits `_Clear` companion for nullable column with NULL default', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Note', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'NULL' },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, false);
            expect(result).toContain('@Note_Clear bit = 0');
        });
    });

    describe('generateCRUDParamString — Update', () => {
        it('PK is required on update (no `= NULL` default)', () => {
            const entity = createMockEntity();
            const result = provider.generateCRUDParamString(entity.Fields, true);
            expect(result).toMatch(/@ID uniqueidentifier(?!\s*=)/);
            expect(result).not.toContain('@ID uniqueidentifier = NULL');
        });

        it('all non-PK parameters are optional on update', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' }, // required-on-create, optional-on-update
                { ID: 'f3', Name: 'AllowAuditLog', Type: 'bit', Length: 1, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '0' },
                { ID: 'f4', Name: 'Email', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, true);
            expect(result).toContain('@Name nvarchar(255) = NULL');
            expect(result).toContain('@AllowAuditLog bit = NULL');
            expect(result).toContain('@Email nvarchar(255) = NULL');
        });

        it('emits `_Clear` companion on update for nullable + non-NULL-default columns', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, true);
            expect(result).toContain('@Status_Clear bit = 0');
            expect(result).toContain('@Status nvarchar(50) = NULL');
            expect(result.indexOf('@Status_Clear')).toBeLessThan(result.indexOf('@Status nvarchar'));
        });
    });

    describe('generateUpdateFieldString — merge semantics', () => {
        it('wraps non-PK columns in ISNULL(@Param, [Column])', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                { ID: 'f3', Name: 'AllowAuditLog', Type: 'bit', Length: 1, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '0' },
            ]);
            const result = provider.generateUpdateFieldString(entity.Fields);
            expect(result).toContain('[Name] = ISNULL(@Name, [Name])');
            expect(result).toContain('[AllowAuditLog] = ISNULL(@AllowAuditLog, [AllowAuditLog])');
            // PK is excluded from SET clause
            expect(result).not.toContain('[ID] =');
        });

        it('emits CASE/_Clear branch for nullable + non-NULL-default columns', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateUpdateFieldString(entity.Fields);
            expect(result).toContain('[Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END');
        });
    });

    describe('generateInsertFieldString — create-side _Clear semantics', () => {
        it('emits CASE/_Clear branch for nullable + non-NULL-default columns on create', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateInsertFieldString(entity, entity.Fields, '@', true);
            expect(result).toContain("CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, 'Active') END");
        });

        it('non-nullable column with default still uses ISNULL (no _Clear)', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'AllowAuditLog', Type: 'bit', Length: 1, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '0' },
            ]);
            const result = provider.generateInsertFieldString(entity, entity.Fields, '@', true);
            expect(result).toContain('ISNULL(@AllowAuditLog, 0)');
            expect(result).not.toContain('@AllowAuditLog_Clear');
        });

        it('nullable column with no default uses CASE WHEN _Clear pattern', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Email', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
            ]);
            const result = provider.generateInsertFieldString(entity, entity.Fields, '@', true);
            // Predicate is `AllowsNull` — every nullable column emits the _Clear CASE wrapper
            // so callers can explicitly persist NULL through Save().
            expect(result).toContain('CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email');
        });
    });

    describe('generateInsertFieldString — caller-supplied PK columns must be included', () => {
        // Regression coverage for the latent bug where the !AllowUpdateAPI clause
        // silently stripped PK columns the caller is required to supply on INSERT.
        // The metadata discovery query (buildPendingFieldsMainQuery) hardcodes
        // `AllowUpdateAPI=0` for every PK — semantically correct for UPDATE, wrong
        // for CREATE — and the runner-time filter was reading that flag without
        // distinguishing the two call paths. The fix adds an `isCallerSuppliedPK`
        // exception that keeps PK columns in the INSERT when they are neither
        // auto-generated (IDENTITY / UUID-with-default) nor explicitly excluded
        // by the caller via `excludePrimaryKey=true`.

        it('composite PK: all PK columns appear in the column list (excludePrimaryKey=false)', () => {
            const entity = createMockEntity(
                { Name: 'JunctionTable', BaseTable: 'JunctionTable', BaseTableCodeName: 'JunctionTable' },
                [
                    // Composite PK — neither column is auto-generated. Mirror what
                    // buildPendingFieldsMainQuery would emit for a composite-PK table:
                    // AllowUpdateAPI=false for both PK columns.
                    { ID: 'pk1', Name: 'AID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                    { ID: 'pk2', Name: 'BID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                    { ID: 'f3', Name: 'Note', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                ],
            );
            // prefix='' → emits the column-name list (the part inside `INSERT INTO ... (...)`).
            // excludePrimaryKey=false → composite-PK INSERT must list every PK column.
            const result = provider.generateInsertFieldString(entity, entity.Fields, '', false);
            expect(result).toContain('[AID]');
            expect(result).toContain('[BID]');
            expect(result).toContain('[Note]');
        });

        it('single non-UUID PK (e.g. string `Code`): PK column appears in the column list', () => {
            const entity = createMockEntity(
                { Name: 'CountryRef', BaseTable: 'CountryRef', BaseTableCodeName: 'CountryRef' },
                [
                    // Non-UUID single PK — `Code NVARCHAR(20) PK`. Not IDENTITY, no UUID default.
                    // buildPendingFieldsMainQuery would set AllowUpdateAPI=false here too.
                    { ID: 'pk1', Name: 'Code', Type: 'nvarchar', Length: 40, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                    { ID: 'f2', Name: 'DisplayName', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                ],
            );
            const result = provider.generateInsertFieldString(entity, entity.Fields, '', false);
            expect(result).toContain('[Code]');
            expect(result).toContain('[DisplayName]');
        });

        it('regression canary: IDENTITY PK is still omitted (clause 2 — autoGeneratedPrimaryKey)', () => {
            const entity = createMockEntity(
                { Name: 'IntPkTable', BaseTable: 'IntPkTable', BaseTableCodeName: 'IntPkTable' },
                [
                    // IDENTITY PK — DB generates it, INSERT must NOT list it.
                    { ID: 'pk1', Name: 'ID', Type: 'int', Length: 4, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: true, DefaultValue: '' },
                    { ID: 'f2', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                ],
            );
            const result = provider.generateInsertFieldString(entity, entity.Fields, '', false);
            expect(result).not.toContain('[ID]');
            expect(result).toContain('[Name]');
        });

        it('regression canary: UUID-with-default PK is still omitted when excludePrimaryKey=true (clause 1)', () => {
            const entity = createMockEntity({}, [
                // The runner-internal UUID-with-default branch passes excludePrimaryKey=true
                // because it injects the PK via its own OUTPUT-INSERTED-or-similar mechanism.
                { ID: 'pk1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateInsertFieldString(entity, entity.Fields, '', true);
            expect(result).not.toContain('[ID]');
            expect(result).toContain('[Status]');
        });

        it('regression canary: non-PK `AllowUpdateAPI=false` audit column is still omitted (clause 4 still fires for non-PKs)', () => {
            const entity = createMockEntity({}, [
                { ID: 'pk1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                // Audit timestamp — AllowUpdateAPI=false, but it's not a PK so the new
                // isCallerSuppliedPK exception must NOT kick in here.
                { ID: 'f3', Name: '__mj_CreatedAt', Type: 'datetimeoffset', Length: 10, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: 'GETUTCDATE()' },
            ]);
            const result = provider.generateInsertFieldString(entity, entity.Fields, '', false);
            expect(result).toContain('[Name]');
            expect(result).not.toContain('[__mj_CreatedAt]');
        });
    });

    describe('generateSingleCascadeOperation — _Clear flag for nullable FK', () => {
        it('cascade update emits _Clear = 1 for the nullable FK field being NULLed', () => {
            // Parent entity (Conversation) being deleted
            const parentEntity = createMockEntity(
                { Name: 'Conversation', BaseTable: 'Conversation', BaseTableCodeName: 'Conversation', SchemaName: '__mj' },
                [
                    { ID: 'pk1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                ]
            );

            // Related entity (AIAgentRun) with a nullable FK to Conversation
            const relatedEntity = createMockEntity(
                { Name: 'MJ: AI Agent Runs', BaseTable: 'AIAgentRun', BaseTableCodeName: 'MJAIAgentRun', SchemaName: '__mj', AllowUpdateAPI: true },
                [
                    { ID: 'pk1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                    { ID: 'f1', Name: 'AgentID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                    { ID: 'f2', Name: 'ConversationID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                    { ID: 'f3', Name: 'Status', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Running'" },
                ]
            );

            const fkField = relatedEntity.Fields.find((f: EntityFieldInfo) => f.Name === 'ConversationID')!;

            const result = provider.generateSingleCascadeOperation({
                parentEntity,
                relatedEntity,
                fkField,
                operation: 'update',
            });

            // The EXEC call must include @ConversationID_Clear = 1 so the tolerant
            // update SP actually sets the column to NULL instead of treating NULL as
            // "leave unchanged".
            expect(result).toContain('@ConversationID_Clear = 1');
            expect(result).toContain('@ConversationID = @');
            // Other nullable fields should NOT get _Clear = 1 — only the FK being cleared
            expect(result).not.toContain('@Status_Clear = 1');
            expect(result).not.toContain('@AgentID_Clear');
        });
    });
});
