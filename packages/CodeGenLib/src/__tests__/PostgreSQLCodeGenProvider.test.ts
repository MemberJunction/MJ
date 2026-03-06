import { describe, it, expect, beforeEach } from 'vitest';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { CRUDType, BaseViewGenerationContext } from '../Database/codeGenDatabaseProvider';
import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';

/**
 * Creates a mock EntityInfo using the constructor init data pattern.
 * EntityInfo.Fields can only be set through the constructor via _Fields/EntityFields.
 */
function createMockEntity(
    overrides: Record<string, unknown> = {},
    fieldOverrides?: Record<string, unknown>[],
    permissionOverrides?: Record<string, unknown>[]
): EntityInfo {
    // Note: For nvarchar, Length is in bytes (2x character count) per SQL Server metadata
    const defaultFields = fieldOverrides || [
        {
            ID: 'pk-field-1',
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
        {
            ID: 'name-field-1',
            Name: 'Name',
            Type: 'nvarchar',
            Length: 510, // 255 chars * 2 bytes
            IsPrimaryKey: false,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: '',
        },
        {
            ID: 'email-field-1',
            Name: 'Email',
            Type: 'nvarchar',
            Length: 1000, // 500 chars * 2 bytes
            IsPrimaryKey: false,
            AllowsNull: true,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: '',
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
        EntityPermissions: permissionOverrides || [],
        ...overrides,
    };

    return new EntityInfo(initData);
}

describe('PostgreSQLCodeGenProvider', () => {
    let provider: PostgreSQLCodeGenProvider;

    beforeEach(() => {
        provider = new PostgreSQLCodeGenProvider();
    });

    describe('PlatformKey and Dialect', () => {
        it('should return postgresql as PlatformKey', () => {
            expect(provider.PlatformKey).toBe('postgresql');
        });

        it('should return a PostgreSQLDialect instance', () => {
            expect(provider.Dialect.PlatformKey).toBe('postgresql');
        });
    });

    describe('generateDropGuard', () => {
        it('should generate DROP VIEW IF EXISTS', () => {
            const sql = provider.generateDropGuard('VIEW', '__mj', 'vwTestEntities');
            expect(sql).toContain('DROP VIEW IF EXISTS');
            expect(sql).toContain('__mj');
            expect(sql).toContain('"vwTestEntities"');
            expect(sql).toContain('CASCADE');
        });

        it('should generate DROP FUNCTION IF EXISTS', () => {
            const sql = provider.generateDropGuard('FUNCTION', '__mj', 'fn_create_test');
            expect(sql).toContain('DROP FUNCTION IF EXISTS');
            expect(sql).toContain('CASCADE');
        });

        it('should generate DROP PROCEDURE IF EXISTS', () => {
            const sql = provider.generateDropGuard('PROCEDURE', '__mj', 'some_proc');
            expect(sql).toContain('DROP PROCEDURE IF EXISTS');
        });
    });

    describe('getCRUDRoutineName', () => {
        it('should generate fn_create_ name', () => {
            const entity = createMockEntity();
            const name = provider.getCRUDRoutineName(entity, CRUDType.Create);
            expect(name).toBe('fn_create_test_entity');
        });

        it('should generate fn_update_ name', () => {
            const entity = createMockEntity();
            const name = provider.getCRUDRoutineName(entity, CRUDType.Update);
            expect(name).toBe('fn_update_test_entity');
        });

        it('should generate fn_delete_ name', () => {
            const entity = createMockEntity();
            const name = provider.getCRUDRoutineName(entity, CRUDType.Delete);
            expect(name).toBe('fn_delete_test_entity');
        });

        it('should use custom SP name when set on entity', () => {
            const entity = createMockEntity({ spCreate: 'custom_fn_create' });
            expect(provider.getCRUDRoutineName(entity, CRUDType.Create)).toBe('custom_fn_create');
        });
    });

    describe('generateBaseView', () => {
        it('should generate CREATE OR REPLACE VIEW', () => {
            const entity = createMockEntity();
            const context: BaseViewGenerationContext = {
                entity,
                relatedFieldsSelect: '',
                relatedFieldsJoins: '',
                parentFieldsSelect: '',
                parentJoins: '',
                rootFieldsSelect: '',
                rootJoins: '',
            };

            const sql = provider.generateBaseView(context);
            expect(sql).toContain('CREATE OR REPLACE VIEW');
            expect(sql).toContain('__mj."vwTestEntities"');
            expect(sql).toContain('t.*');
            expect(sql).toContain('__mj."TestEntity" AS t');
        });

        it('should include soft delete WHERE clause', () => {
            const entity = createMockEntity({ DeleteType: 'Soft' });
            const context: BaseViewGenerationContext = {
                entity,
                relatedFieldsSelect: '',
                relatedFieldsJoins: '',
                parentFieldsSelect: '',
                parentJoins: '',
                rootFieldsSelect: '',
                rootJoins: '',
            };

            const sql = provider.generateBaseView(context);
            expect(sql).toContain('IS NULL');
            expect(sql).toContain('__mj_DeletedAt');
        });

        it('should include related fields and joins when provided', () => {
            const entity = createMockEntity();
            const context: BaseViewGenerationContext = {
                entity,
                relatedFieldsSelect: 'r."CategoryName"',
                relatedFieldsJoins: 'LEFT OUTER JOIN __mj."Categories" AS r ON t."CategoryID" = r."ID"',
                parentFieldsSelect: '',
                parentJoins: '',
                rootFieldsSelect: '',
                rootJoins: '',
            };

            const sql = provider.generateBaseView(context);
            expect(sql).toContain('r."CategoryName"');
            expect(sql).toContain('LEFT OUTER JOIN');
        });
    });

    describe('generateCRUDCreate', () => {
        it('should generate CREATE FUNCTION returning SETOF view', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDCreate(entity);

            expect(sql).toContain('CREATE OR REPLACE FUNCTION');
            expect(sql).toContain('fn_create_test_entity');
            expect(sql).toContain('RETURNS SETOF');
            expect(sql).toContain('vwTestEntities');
            expect(sql).toContain('INSERT INTO');
            expect(sql).toContain('RETURN QUERY');
            expect(sql).toContain('LANGUAGE plpgsql');
        });

        it('should use COALESCE with gen_random_uuid() for UUID primary keys', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDCreate(entity);

            // UUID PKs use pre-INSERT variable assignment instead of RETURNING
            expect(sql).toContain('COALESCE');
            expect(sql).toContain('gen_random_uuid()');
            expect(sql).toContain('v_new_id');
        });

        it('should generate params with p_ prefix', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDCreate(entity);

            expect(sql).toContain('p_name');
            expect(sql).toContain('p_email');
        });
    });

    describe('generateCRUDUpdate', () => {
        it('should generate UPDATE function', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDUpdate(entity);

            expect(sql).toContain('CREATE OR REPLACE FUNCTION');
            expect(sql).toContain('fn_update_test_entity');
            expect(sql).toContain('RETURNS SETOF');
            expect(sql).toContain('UPDATE');
            expect(sql).toContain('SET');
            expect(sql).toContain('ROW_COUNT');
        });

        it('should include PK in WHERE clause', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDUpdate(entity);

            expect(sql).toContain('"ID" = p_id');
        });

        it('should return empty on zero rows affected', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDUpdate(entity);

            expect(sql).toContain('v_updated_count = 0');
            expect(sql).toContain('RETURN;');
        });
    });

    describe('generateCRUDDelete', () => {
        it('should generate hard delete function', () => {
            const entity = createMockEntity({ DeleteType: 'Hard' });
            const sql = provider.generateCRUDDelete(entity, '');

            expect(sql).toContain('CREATE OR REPLACE FUNCTION');
            expect(sql).toContain('fn_delete_test_entity');
            expect(sql).toContain('DELETE FROM');
            expect(sql).toContain('RETURNS TABLE');
            expect(sql).toContain('#variable_conflict use_column');
        });

        it('should generate soft delete with UPDATE', () => {
            const entity = createMockEntity({ DeleteType: 'Soft' });
            const sql = provider.generateCRUDDelete(entity, '');

            expect(sql).not.toContain('DELETE FROM');
            expect(sql).toContain('UPDATE');
            expect(sql).toContain('__mj_DeletedAt');
            expect(sql).toContain("NOW() AT TIME ZONE 'UTC'");
        });

        it('should include cascade SQL when provided', () => {
            const entity = createMockEntity();
            const cascadeSQL = '    -- Cascade delete children\n    PERFORM __mj.fn_delete_child(v_rec."ID");';
            const sql = provider.generateCRUDDelete(entity, cascadeSQL);

            expect(sql).toContain('Cascade delete children');
        });

        it('should return NULL PKs on zero rows affected', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDDelete(entity, '');

            expect(sql).toContain('v_affected_count = 0');
            expect(sql).toContain('NULL::UUID');
        });
    });

    describe('generateTimestampTrigger', () => {
        it('should generate trigger function + trigger pair', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                { ID: 'f2', Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar', Length: 255, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                { ID: 'f3', Name: '__mj_UpdatedAt', IsPrimaryKey: false, Type: 'datetimeoffset', Length: 0, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
            ]);

            const sql = provider.generateTimestampTrigger(entity);

            expect(sql).toContain('CREATE OR REPLACE FUNCTION');
            expect(sql).toContain('fn_trg_update_test_entity');
            expect(sql).toContain('RETURNS TRIGGER');
            expect(sql).toContain("NEW.__mj_UpdatedAt := NOW() AT TIME ZONE 'UTC'");
            expect(sql).toContain('RETURN NEW');
            expect(sql).toContain('CREATE TRIGGER');
            expect(sql).toContain('BEFORE UPDATE');
            expect(sql).toContain('FOR EACH ROW');
            expect(sql).toContain('EXECUTE FUNCTION');
        });

        it('should return empty string when no updatedAt field', () => {
            const entity = createMockEntity();
            const sql = provider.generateTimestampTrigger(entity);
            expect(sql).toBe('');
        });
    });

    describe('generateForeignKeyIndexes', () => {
        it('should generate indexes for FK fields', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '', RelatedEntityID: null },
                { ID: 'f2', Name: 'CategoryID', IsPrimaryKey: false, Type: 'uniqueidentifier', Length: 16, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '', RelatedEntityID: 'category-entity-id' },
            ]);

            const indexes = provider.generateForeignKeyIndexes(entity);
            expect(indexes.length).toBe(1);
            expect(indexes[0]).toContain('CREATE INDEX IF NOT EXISTS');
            expect(indexes[0]).toContain('"CategoryID"');
            expect(indexes[0]).toContain('__mj."TestEntity"');
        });

        it('should not create index for PK fields', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '', RelatedEntityID: 'some-id' },
            ]);

            const indexes = provider.generateForeignKeyIndexes(entity);
            expect(indexes.length).toBe(0);
        });
    });

    describe('generateFullTextSearch', () => {
        it('should generate tsvector + GIN index + search function', () => {
            const entity = createMockEntity();
            const searchFields = entity.Fields.filter((f: EntityFieldInfo) => !f.IsPrimaryKey);

            const result = provider.generateFullTextSearch(entity, searchFields, 'PK_TestEntity');
            expect(result.functionName).toBe('fn_search_test_entity');
            expect(result.sql).toContain('TSVECTOR');
            expect(result.sql).toContain('GIN');
            expect(result.sql).toContain('to_tsvector');
            expect(result.sql).toContain('plainto_tsquery');
            expect(result.sql).toContain('@@');
            expect(result.sql).toContain('BEFORE INSERT OR UPDATE');
        });
    });

    describe('generateRootIDFunction', () => {
        it('should generate recursive CTE function', () => {
            const entity = createMockEntity();
            const field = new EntityFieldInfo({ Name: 'ParentID', Type: 'uniqueidentifier', Length: 16 });

            const sql = provider.generateRootIDFunction(entity, field);
            expect(sql).toContain('WITH RECURSIVE cte_root_parent');
            expect(sql).toContain('UNION ALL');
            expect(sql).toContain('depth < 100');
            expect(sql).toContain('LANGUAGE sql STABLE');
        });
    });

    describe('generateViewPermissions', () => {
        it('should generate GRANT SELECT for roles', () => {
            const entity = createMockEntity({}, undefined, [
                { RoleSQLName: 'mj_reader', CanRead: true },
                { RoleSQLName: 'mj_admin', CanRead: true },
            ]);

            const sql = provider.generateViewPermissions(entity);
            expect(sql).toContain('GRANT SELECT ON');
            expect(sql).toContain('"mj_reader"');
            expect(sql).toContain('"mj_admin"');
        });

        it('should return empty string when no roles', () => {
            const entity = createMockEntity({}, undefined, []);
            expect(provider.generateViewPermissions(entity)).toBe('');
        });
    });

    describe('generateCRUDPermissions', () => {
        it('should generate GRANT EXECUTE for create permissions', () => {
            const entity = createMockEntity({}, undefined, [
                { RoleSQLName: 'mj_writer', CanCreate: true },
            ]);

            const sql = provider.generateCRUDPermissions(entity, 'fn_create_test', CRUDType.Create);
            expect(sql).toContain('GRANT EXECUTE ON FUNCTION');
            expect(sql).toContain('"mj_writer"');
        });

        it('should not grant execute for roles without permission', () => {
            const entity = createMockEntity({}, undefined, [
                { RoleSQLName: 'mj_reader', CanCreate: false, CanUpdate: false, CanDelete: false },
            ]);

            const sql = provider.generateCRUDPermissions(entity, 'fn_create_test', CRUDType.Create);
            expect(sql).toBe('');
        });
    });

    describe('generateTimestampColumns', () => {
        it('should generate ALTER TABLE with both timestamp columns', () => {
            const sql = provider.generateTimestampColumns('__mj', 'TestEntity');
            expect(sql).toContain('__mj_CreatedAt');
            expect(sql).toContain('__mj_UpdatedAt');
            expect(sql).toContain('TIMESTAMPTZ');
            expect(sql).toContain("NOW() AT TIME ZONE 'UTC'");
        });
    });

    describe('formatDefaultValue', () => {
        it('should return NULL for empty/null values', () => {
            expect(provider.formatDefaultValue('', false)).toBe('NULL');
            expect(provider.formatDefaultValue(null as unknown as string, false)).toBe('NULL');
        });

        it('should map SQL Server functions to PG equivalents', () => {
            expect(provider.formatDefaultValue('newid()', false)).toBe('gen_random_uuid()');
            expect(provider.formatDefaultValue('GETUTCDATE()', false)).toBe("NOW() AT TIME ZONE 'UTC'");
            expect(provider.formatDefaultValue('(newsequentialid())', false)).toBe('gen_random_uuid()');
        });

        it('should handle quoted string values', () => {
            expect(provider.formatDefaultValue("'Active'", true)).toBe("'Active'");
        });

        it('should add quotes when needed', () => {
            expect(provider.formatDefaultValue('Active', true)).toBe("'Active'");
        });

        it('should pass through numeric values', () => {
            expect(provider.formatDefaultValue('42', false)).toBe('42');
        });
    });

    describe('generateCRUDParamString', () => {
        it('should generate p_ prefixed parameters', () => {
            const entity = createMockEntity();
            const result = provider.generateCRUDParamString(entity.Fields, false);

            // ID field should be included (non-auto-increment UUID)
            expect(result).toContain('p_id');
            expect(result).toContain('p_name');
            expect(result).toContain('p_email');
        });

        it('should skip virtual fields', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                { ID: 'f2', Name: 'VirtualField', IsPrimaryKey: false, Type: 'nvarchar', Length: 100, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: true, AutoIncrement: false, DefaultValue: '' },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, false);
            expect(result).not.toContain('virtual');
        });
    });

    describe('generateUpdateFieldString', () => {
        it('should generate SET clause with quoted identifiers', () => {
            const entity = createMockEntity();
            const result = provider.generateUpdateFieldString(entity.Fields);

            expect(result).toContain('"Name" = p_name');
            expect(result).toContain('"Email" = p_email');
            // Should NOT include PK
            expect(result).not.toContain('"ID" = p_id');
        });
    });

    describe('generateSQLFileHeader', () => {
        it('should include entity name and item name', () => {
            const entity = createMockEntity();
            const header = provider.generateSQLFileHeader(entity, 'Base View');
            expect(header).toContain('Test Entity');
            expect(header).toContain('Base View');
        });
    });

    describe('buildPrimaryKeyComponents', () => {
        it('should build correct PK components for single PK', () => {
            const entity = createMockEntity();
            const result = provider.buildPrimaryKeyComponents(entity);

            expect(result.varDeclarations).toContain('UUID');
            expect(result.selectFields).toContain('"ID"');
            expect(result.fetchInto).toContain('v_related_id');
            expect(result.routineParams).toContain('p_id := v_related_id');
        });
    });

    describe('generateSingleCascadeOperation', () => {
        it('should generate update-to-NULL for nullable FK', () => {
            const parentEntity = createMockEntity();
            const relatedEntity = createMockEntity({
                ID: 'entity-2',
                Name: 'Child Entity',
                BaseTable: 'ChildEntity',
                BaseTableCodeName: 'ChildEntity',
                AllowUpdateAPI: true,
            });
            const fkField = new EntityFieldInfo({
                Name: 'ParentID',
                AllowsNull: true,
                RelatedEntityID: 'entity-1',
                Type: 'uniqueidentifier',
                Length: 16,
            });

            const sql = provider.generateSingleCascadeOperation({
                parentEntity,
                relatedEntity,
                fkField,
                operation: 'update',
            });

            expect(sql).toContain('"ParentID" = NULL');
            expect(sql).toContain('FOR v_rec IN');
        });

        it('should generate cascade delete for non-nullable FK', () => {
            const parentEntity = createMockEntity();
            const relatedEntity = createMockEntity({
                ID: 'entity-2',
                Name: 'Child Entity',
                BaseTable: 'ChildEntity',
                BaseTableCodeName: 'ChildEntity',
                AllowDeleteAPI: true,
            });
            const fkField = new EntityFieldInfo({
                Name: 'ParentID',
                AllowsNull: false,
                RelatedEntityID: 'entity-1',
                Type: 'uniqueidentifier',
                Length: 16,
            });

            const sql = provider.generateSingleCascadeOperation({
                parentEntity,
                relatedEntity,
                fkField,
                operation: 'delete',
            });

            expect(sql).toContain('PERFORM');
            expect(sql).toContain('fn_delete_child_entity');
        });

        it('should generate warning when entity disallows delete', () => {
            const parentEntity = createMockEntity();
            const relatedEntity = createMockEntity({
                ID: 'entity-2',
                Name: 'Child Entity',
                BaseTable: 'ChildEntity',
                BaseTableCodeName: 'ChildEntity',
                AllowDeleteAPI: false,
            });
            const fkField = new EntityFieldInfo({
                Name: 'ParentID',
                AllowsNull: false,
                RelatedEntityID: 'entity-1',
                Type: 'uniqueidentifier',
                Length: 16,
            });

            const sql = provider.generateSingleCascadeOperation({
                parentEntity,
                relatedEntity,
                fkField,
                operation: 'delete',
            });

            expect(sql).toContain('WARNING');
        });
    });
});
