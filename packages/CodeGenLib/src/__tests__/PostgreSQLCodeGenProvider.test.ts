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
        // PG codegen now emits sp{Verb}{TableCodeName} (PascalCase) to match the
        // baseline-ported SP names (which are SQL Server names ported verbatim into
        // PG) and the runtime PostgreSQLDataProvider, which calls procs by that
        // exact convention. Earlier we emitted `fn_<verb>_<snake>` and the runtime
        // could never find the function.
        it('should generate spCreate name matching baseline convention', () => {
            const entity = createMockEntity();
            const name = provider.getCRUDRoutineName(entity, CRUDType.Create);
            expect(name).toBe('spCreateTestEntity');
        });

        it('should generate spUpdate name matching baseline convention', () => {
            const entity = createMockEntity();
            const name = provider.getCRUDRoutineName(entity, CRUDType.Update);
            expect(name).toBe('spUpdateTestEntity');
        });

        it('should generate spDelete name matching baseline convention', () => {
            const entity = createMockEntity();
            const name = provider.getCRUDRoutineName(entity, CRUDType.Delete);
            expect(name).toBe('spDeleteTestEntity');
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

        it('should only emit DROP VIEW inside the 42P16 EXCEPTION recovery block', () => {
            // The base view generator wraps CREATE OR REPLACE in a DO block that
            // catches invalid_table_definition (42P16 — raised when the column
            // list changes in a way OR REPLACE can't accept) and falls back to
            // DROP VIEW IF EXISTS ... CASCADE; CREATE VIEW. The DROP is the
            // recovery path, not the default. Regression guard: the only DROP
            // VIEW in the output must live inside that EXCEPTION block.
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
            // Recovery path is present
            expect(sql).toMatch(/EXCEPTION\s+WHEN\s+invalid_table_definition/i);
            expect(sql).toMatch(/\bDROP\s+VIEW\s+IF\s+EXISTS\b[^;]*\bCASCADE\b/i);
            // No DROP VIEW outside the EXCEPTION block (i.e. before it)
            const beforeException = sql.split(/EXCEPTION\s+WHEN\s+invalid_table_definition/i)[0];
            expect(beforeException).not.toMatch(/\bDROP\s+VIEW\b/i);
        });
    });

    describe('generateCRUDCreate', () => {
        it('should generate CREATE FUNCTION returning SETOF view', () => {
            const entity = createMockEntity();
            const sql = provider.generateCRUDCreate(entity);

            expect(sql).toContain('CREATE OR REPLACE FUNCTION');
            expect(sql).toContain('spCreateTestEntity');
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
            expect(sql).toContain('spUpdateTestEntity');
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

    describe('generateCRUDCreate / generateCRUDUpdate (JSON-arg shape for wide entities)', () => {
        // Build an entity that will project past POSTGRESQL_PROCEDURE_PARAM_LIMIT (90)
        // under broad rule. ~50 nullable cols × 2 (base + _Clear) + ~10 not-null cols + PK
        // = comfortably over 90.
        function createWideEntity(): EntityInfo {
            const fields: Record<string, unknown>[] = [
                {
                    ID: 'pk',
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
            for (let i = 0; i < 10; i++) {
                fields.push({
                    ID: `not-null-${i}`,
                    Name: `RequiredCol${i}`,
                    Type: 'nvarchar',
                    Length: 100,
                    IsPrimaryKey: false,
                    AllowsNull: false,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                    DefaultValue: '',
                });
            }
            for (let i = 0; i < 50; i++) {
                fields.push({
                    ID: `nullable-${i}`,
                    Name: `OptionalCol${i}`,
                    Type: i % 4 === 0 ? 'int' : i % 4 === 1 ? 'datetimeoffset' : i % 4 === 2 ? 'bit' : 'nvarchar',
                    Length: 100,
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                    DefaultValue: '',
                });
            }
            return createMockEntity({ BaseTable: 'WideEntity', BaseTableCodeName: 'WideEntity', BaseView: 'vwWideEntities' }, fields);
        }

        it('UPDATE wide entity uses single p_data JSONB param', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDUpdate(entity);
            expect(sql).toContain('JSON-arg shape');
            expect(sql).toContain('(p_data JSONB)');
            // No typed-param explosion:
            expect(sql).not.toMatch(/p_optionalcol\d+\s+(integer|timestamp|boolean|nvarchar|text)/i);
        });

        it('UPDATE wide entity body uses CASE WHEN p_data ? for each writable column', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDUpdate(entity);
            expect(sql).toContain(`CASE WHEN p_data ? 'OptionalCol0' THEN`);
            expect(sql).toContain(`CASE WHEN p_data ? 'RequiredCol0' THEN`);
            // ELSE branch preserves the existing column value
            expect(sql).toMatch(/ELSE "OptionalCol0" END/);
        });

        it('UPDATE wide entity body always touches __mj_UpdatedAt', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDUpdate(entity);
            expect(sql).toContain('"__mj_UpdatedAt" = NOW()');
        });

        it('UPDATE wide entity raises when p_data is missing the PK', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDUpdate(entity);
            expect(sql).toMatch(/RAISE EXCEPTION.*p_data must include.*"ID"/);
        });

        it('UPDATE wide entity casts non-text columns appropriately', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDUpdate(entity);
            // Integer cast (i % 4 === 0): OptionalCol0, OptionalCol4, ...
            expect(sql).toContain(`(p_data->>'OptionalCol0')::INT`);
            // Boolean cast (i % 4 === 2): OptionalCol2, OptionalCol6, ...
            expect(sql).toContain(`(p_data->>'OptionalCol2')::BOOLEAN`);
            // TIMESTAMPTZ cast (i % 4 === 1): OptionalCol1, OptionalCol5, ...
            expect(sql).toContain(`(p_data->>'OptionalCol1')::TIMESTAMPTZ`);
            // Plain text — no cast suffix
            expect(sql).toContain(`(p_data->>'OptionalCol3')`);
        });

        it('CREATE wide entity uses single p_data JSONB param and dynamic INSERT', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDCreate(entity);
            expect(sql).toContain('JSON-arg shape');
            expect(sql).toContain('(p_data JSONB)');
            expect(sql).toContain(`format(`);
            expect(sql).toContain(`'INSERT INTO`);
            expect(sql).toContain('FOREACH v_field_name IN ARRAY');
        });

        it('CREATE wide entity passes p_data to EXECUTE via USING (not direct reference)', () => {
            // Regression guard: cast expressions inside the dynamic SQL string must
            // reference $1 (a positional parameter), and EXECUTE must bind p_data
            // to that parameter via USING. Referencing p_data directly inside the
            // dynamic SQL fails because it's not in scope of the EXECUTE'd query.
            const entity = createWideEntity();
            const sql = provider.generateCRUDCreate(entity);
            expect(sql).toContain('EXECUTE v_sql USING p_data');
            // Cast expressions in the value list should reference $1, not p_data.
            expect(sql).toContain(`($1->>''OptionalCol0'')::INT`);
            expect(sql).not.toMatch(/'\(p_data->>''[A-Za-z]+''\)/);
        });

        it('CREATE wide entity auto-generates UUID PK when absent from p_data', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDCreate(entity);
            expect(sql).toContain(`IF p_data ? 'ID' THEN`);
            expect(sql).toContain('gen_random_uuid()');
        });

        it('narrow entities still emit typed-arg shape', () => {
            const entity = createMockEntity(); // 3 fields, well under the limit
            const createSql = provider.generateCRUDCreate(entity);
            const updateSql = provider.generateCRUDUpdate(entity);
            // No JSON-arg markers
            expect(createSql).not.toContain('p_data JSONB');
            expect(updateSql).not.toContain('p_data JSONB');
            expect(createSql).not.toContain('JSON-arg shape');
            expect(updateSql).not.toContain('JSON-arg shape');
            // Typed-arg markers present
            expect(createSql).toContain('p_name');
            expect(updateSql).toContain('"ID" = p_id');
        });

        it('spDelete stays typed-arg even on wide entities', () => {
            const entity = createWideEntity();
            const sql = provider.generateCRUDDelete(entity, '');
            expect(sql).not.toContain('p_data JSONB');
            expect(sql).toContain('p_id');
        });
    });

    describe('generateCRUDDelete', () => {
        it('should generate hard delete function', () => {
            const entity = createMockEntity({ DeleteType: 'Hard' });
            const sql = provider.generateCRUDDelete(entity, '');

            expect(sql).toContain('CREATE OR REPLACE FUNCTION');
            expect(sql).toContain('spDeleteTestEntity');
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
            expect(sql).toContain('NEW."__mj_UpdatedAt" := NOW()');

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

        // Tolerant-SP `_Clear` companion is emitted for nullable fields that have a
        // non-NULL DB default. On SQL Server it's `bit DEFAULT 0` and `= 1` in CASE;
        // on PostgreSQL it must be `boolean DEFAULT false` and `= true` — otherwise
        // PG raises "operator does not exist: boolean = integer" at runtime.
        it('should emit _Clear companion as `boolean DEFAULT false` (not `bit DEFAULT 0`)', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', IsPrimaryKey: false, Type: 'nvarchar', Length: 40, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateCRUDParamString(entity.Fields, true);
            // PG-correct: boolean type + false default
            // (ParameterRef lowercases the name in PG snake_case convention)
            expect(result).toContain('p_status_clear boolean DEFAULT false');
            // PG-incorrect: SS-style bit + 0 default
            expect(result).not.toContain('p_status_clear bit DEFAULT 0');
        });
    });

    describe('generateUpdateFieldString', () => {
        it('should generate SET clause with quoted identifiers and tolerant merge semantics', () => {
            // Use a field that qualifies under PG's narrow `_Clear` rule:
            // nullable AND has a non-NULL DB default. PG's 100-arg ceiling
            // forces `PostgreSQLCodeGenProvider.needsClearCompanion` to use
            // the narrow rule (only fields with non-NULL defaults), so the
            // `Email` mock above (DefaultValue: '') does NOT get a `_Clear`
            // companion. We use `Status` with a `'Active'` default to verify
            // the CASE/COALESCE pattern on a field that DOES qualify.
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '' },
                { ID: 'f3', Name: 'Status', IsPrimaryKey: false, Type: 'nvarchar', Length: 40, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateUpdateFieldString(entity.Fields);

            // Tolerant SP merge wrap: omitting a parameter preserves the existing value.
            // PostgreSQL has no ISNULL keyword; it emits COALESCE.
            // Non-nullable columns: plain COALESCE merge.
            expect(result).toContain('"Name" = COALESCE(p_name, "Name")');
            // Nullable column with a non-NULL default: CASE WHEN _Clear THEN NULL
            // ELSE COALESCE(...) END so callers can explicitly set the column to
            // NULL via the _Clear companion. PG comparison is `= true` (not `= 1`)
            // to match the `boolean DEFAULT false` parameter type — see
            // `dialect.BooleanLiteral(true)` in the codegen template.
            expect(result).toContain('"Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END');
            // Should NOT include PK
            expect(result).not.toContain('"ID" = ');
        });

        // _Clear companion CASE: on PG it must compare against `true`, not `1` —
        // matches the `boolean DEFAULT false` parameter type and avoids
        // "operator does not exist: boolean = integer" at runtime.
        it('should emit `_Clear = true` in the CASE expression (not `_Clear = 1`)', () => {
            const entity = createMockEntity({}, [
                { ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', Length: 16, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: 'newsequentialid()' },
                { ID: 'f2', Name: 'Status', IsPrimaryKey: false, Type: 'nvarchar', Length: 40, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: "'Active'" },
            ]);
            const result = provider.generateUpdateFieldString(entity.Fields);
            expect(result).toContain('CASE WHEN p_status_clear = true THEN');
            expect(result).not.toContain('CASE WHEN p_status_clear = 1 THEN');
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
            expect(sql).toContain('spDeleteChildEntity');
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
