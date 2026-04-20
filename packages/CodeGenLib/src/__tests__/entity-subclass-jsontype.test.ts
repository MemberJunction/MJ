/**
 * EntitySubClassGeneratorBase JSONType Tests
 *
 * Tests the JSONType system in CodeGen:
 * - Standard string getter preserved for JSONType fields
 * - Object-suffixed typed accessor with JSON.parse/stringify + caching
 * - Entity-prefixed interface names (e.g., TestEntityEntity_IMyConfig)
 * - Array<T> syntax for array types
 * - JSONTypeDefinition emission with name prefixing
 * - Deduplication of shared JSONTypeDefinitions
 * - JSONType without JSONTypeDefinition (type assumed available elsewhere)
 * - Zod schema generation for JSONType fields
 * - AST validation of JSONTypeDefinition
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies (same pattern as existing entity-subclass-codegen.test.ts)
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {},
    EntityFieldInfo: class {},
    EntityFieldValueListType: { None: 'None', List: 'List', ListOrUserEntry: 'ListOrUserEntry' },
    EntityInfo: class {},
    Metadata: vi.fn(),
    TypeScriptTypeFromSQLType: vi.fn((sqlType: string) => {
        const map: Record<string, string> = {
            'nvarchar': 'string',
            'varchar': 'string',
            'int': 'number',
            'bigint': 'number',
            'bit': 'boolean',
            'datetime': 'Date',
            'uniqueidentifier': 'string',
            'float': 'number',
            'decimal': 'number',
            'ntext': 'string',
            'text': 'string',
            'money': 'number'
        };
        return map[sqlType.toLowerCase()] || 'string';
    })
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(true),
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn().mockReturnValue('')
        }
    };
});

vi.mock('mssql', () => ({
    default: {}
}));

vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(),
    logStatus: vi.fn()
}));

vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: class {
        static generatedValidators: unknown[] = [];
    }
}));

vi.mock('../Config/config', () => ({
    mj_core_schema: '__mj',
    configInfo: {}
}));

vi.mock('./sql_logging', () => ({
    SQLLogging: class {}
}));

vi.mock('../Misc/util', () => ({
    makeDir: vi.fn(),
    sortBySequenceAndCreatedAt: vi.fn((items: unknown[]) => [...items])
}));

import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeField(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        Name: 'TestField',
        CodeName: 'TestField',
        DisplayName: 'Test Field',
        Type: 'nvarchar',
        SQLFullType: 'nvarchar(MAX)',
        AllowsNull: true,
        ReadOnly: false,
        IsPrimaryKey: false,
        AutoIncrement: false,
        IsVirtual: false,
        AllowUpdateAPI: true,
        ValueListType: 'None',
        ValueListTypeEnum: 'None',
        EntityFieldValues: [],
        RelatedEntity: null,
        RelatedEntityBaseView: null,
        RelatedEntityFieldName: null,
        DefaultValue: null,
        Description: '',
        Status: 'Active',
        NeedsQuotes: true,
        JSONType: null,
        JSONTypeIsArray: false,
        JSONTypeDefinition: null,
        ...overrides,
    };
}

function makePrimaryKeyField(): Record<string, unknown> {
    return makeField({
        Name: 'ID',
        CodeName: 'ID',
        DisplayName: 'ID',
        Type: 'uniqueidentifier',
        SQLFullType: 'uniqueidentifier',
        AllowsNull: false,
        IsPrimaryKey: true,
        AutoIncrement: false,
        ReadOnly: true,
    });
}

function makeEntity(fields: Record<string, unknown>[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        Name: 'Test Entity',
        ClassName: 'TestEntity',
        SchemaName: '__mj',
        BaseTable: 'TestEntity',
        BaseView: 'vwTestEntities',
        Description: '',
        PrimaryKeys: fields.filter(f => f.IsPrimaryKey),
        Fields: fields,
        EntityObjectSubclassName: '',
        EntityObjectSubclassImport: '',
        IsChildType: false,
        Status: 'Active',
        ...overrides,
    };
}

describe('EntitySubClassGeneratorBase - JSONType', () => {
    let generator: EntitySubClassGeneratorBase;

    beforeEach(() => {
        generator = new EntitySubClassGeneratorBase();
        vi.clearAllMocks();
    });

    describe('generateEntitySubClass - JSONType Object accessor', () => {
        it('should keep standard string getter and emit Object accessor with JSON.parse', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: false,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // Standard getter stays as string
            expect(result).toContain("get Config(): string | null");
            expect(result).toContain("return this.Get('Config');");
            // Object accessor has typed getter with JSON.parse
            expect(result).toContain("get ConfigObject(): TestEntityEntity_IMyConfig | null");
            expect(result).toContain("JSON.parse(raw)");
        });

        it('should emit Object accessor with JSON.stringify setter', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: false,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            expect(result).toContain("set ConfigObject(value: TestEntityEntity_IMyConfig | null)");
            expect(result).toContain("JSON.stringify(value)");
        });

        it('should use Array<T> syntax with entity prefix when JSONTypeIsArray is true', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Items',
                    CodeName: 'Items',
                    JSONType: 'IItem',
                    JSONTypeIsArray: true,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // Standard getter stays as string
            expect(result).toContain("get Items(): string | null");
            // Object accessor uses Array<T> syntax with entity prefix
            expect(result).toContain("get ItemsObject(): Array<TestEntityEntity_IItem> | null");
            expect(result).toContain("set ItemsObject(value: Array<TestEntityEntity_IItem> | null)");
        });

        it('should not include | null on Object accessor when AllowsNull is false', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: false,
                    AllowsNull: false,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            expect(result).toContain("get ConfigObject(): TestEntityEntity_IMyConfig {");
            expect(result).not.toContain("TestEntityEntity_IMyConfig | null");
        });

        it('should include prefixed JSON Type annotation in JSDoc comment', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: true,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            expect(result).toContain('JSON Type: Array<TestEntityEntity_IMyConfig>');
        });

        it('should use standard getter for fields without JSONType', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Description',
                    CodeName: 'Description',
                    Type: 'nvarchar',
                    SQLFullType: 'nvarchar(MAX)',
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            expect(result).toContain("get Description(): string | null");
            expect(result).toContain("return this.Get('Description');");
            expect(result).not.toContain("DescriptionObject");
        });

        it('should emit cache fields for Object accessor', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: false,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            expect(result).toContain("private _ConfigObject_cached");
            expect(result).toContain("private _ConfigObject_lastRaw");
        });
    });

    describe('generateEntitySubClass - JSONTypeDefinition emission', () => {
        it('should emit prefixed JSONTypeDefinition above the class', async () => {
            const typeDef = 'export interface IMyConfig {\n    Key: string;\n    Value: string;\n}';
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeDefinition: typeDef,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // The interface should be prefixed with entity class name
            expect(result).toContain('export interface TestEntityEntity_IMyConfig');
            // Should appear before the class definition
            const interfaceIndex = result.indexOf('export interface TestEntityEntity_IMyConfig');
            const classIndex = result.indexOf('export class TestEntityEntity');
            expect(interfaceIndex).toBeGreaterThan(-1);
            expect(classIndex).toBeGreaterThan(-1);
            expect(interfaceIndex).toBeLessThan(classIndex);
        });

        it('should deduplicate identical JSONTypeDefinitions', async () => {
            const typeDef = 'export interface IShared { Name: string; }';
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'FieldA',
                    CodeName: 'FieldA',
                    JSONType: 'IShared',
                    JSONTypeDefinition: typeDef,
                }),
                makeField({
                    Name: 'FieldB',
                    CodeName: 'FieldB',
                    JSONType: 'IShared',
                    JSONTypeDefinition: typeDef,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // Should appear exactly once (prefixed) despite two fields sharing the same definition
            const matches = result.match(/export interface TestEntityEntity_IShared/g);
            expect(matches).toHaveLength(1);
        });

        it('should emit multiple different JSONTypeDefinitions with prefixes', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IConfigA',
                    JSONTypeDefinition: 'export interface IConfigA { key: string; }',
                }),
                makeField({
                    Name: 'Settings',
                    CodeName: 'Settings',
                    JSONType: 'IConfigB',
                    JSONTypeDefinition: 'export interface IConfigB { value: number; }',
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            expect(result).toContain('export interface TestEntityEntity_IConfigA');
            expect(result).toContain('export interface TestEntityEntity_IConfigB');
        });

        it('should handle JSONType without JSONTypeDefinition', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IExternalType',
                    JSONTypeIsArray: false,
                    JSONTypeDefinition: null,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // Should use the prefixed type name in Object accessor
            expect(result).toContain("get ConfigObject(): TestEntityEntity_IExternalType | null");
            expect(result).toContain("set ConfigObject(value: TestEntityEntity_IExternalType | null)");
            // Should NOT emit any definition block
            expect(result).not.toContain('export interface');
        });

        it('should not emit definition block when no fields have JSONTypeDefinition', async () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Description',
                    CodeName: 'Description',
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // No JSONType content, just the standard class
            expect(result).toContain('export class TestEntityEntity');
            // Verify no interface blocks emitted
            expect(result).not.toContain('export interface');
        });

        it('should prefix all type names in multi-interface definitions', async () => {
            const typeDef = `export interface ISubItem {
                id: string;
            }
            export interface IMyConfig {
                items: ISubItem[];
            }`;
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeDefinition: typeDef,
                }),
            ];
            const entity = makeEntity(fields);

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false, true
            );

            // Both interfaces should be prefixed
            expect(result).toContain('export interface TestEntityEntity_ISubItem');
            expect(result).toContain('export interface TestEntityEntity_IMyConfig');
            // References within the definition should also be prefixed
            expect(result).toContain('TestEntityEntity_ISubItem[]');
        });
    });

    describe('GenerateSchemaAndType - JSONType Zod schema', () => {
        it('should use z.any() for JSONType fields', () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: false,
                    AllowsNull: true,
                }),
            ];
            const entity = makeEntity(fields);

            const result = generator.GenerateSchemaAndType(
                entity as Parameters<typeof generator.GenerateSchemaAndType>[0]
            );

            // Should contain z.any().nullable() for the JSONType field
            expect(result).toContain('Config: z.any().nullable()');
        });

        it('should use z.any() without nullable for non-null JSONType fields', () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: false,
                    AllowsNull: false,
                }),
            ];
            const entity = makeEntity(fields);

            const result = generator.GenerateSchemaAndType(
                entity as Parameters<typeof generator.GenerateSchemaAndType>[0]
            );

            // Should contain z.any() without nullable
            expect(result).toMatch(/Config: z\.any\(\)\.describe/);
        });

        it('should include prefixed JSON Type annotation in Zod description', () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Config',
                    CodeName: 'Config',
                    JSONType: 'IMyConfig',
                    JSONTypeIsArray: true,
                }),
            ];
            const entity = makeEntity(fields);

            const result = generator.GenerateSchemaAndType(
                entity as Parameters<typeof generator.GenerateSchemaAndType>[0]
            );

            expect(result).toContain('JSON Type: Array<TestEntityEntity_IMyConfig>');
        });

        it('should use standard Zod type for fields without JSONType', () => {
            const fields = [
                makePrimaryKeyField(),
                makeField({
                    Name: 'Description',
                    CodeName: 'Description',
                    Type: 'nvarchar',
                    AllowsNull: true,
                }),
            ];
            const entity = makeEntity(fields);

            const result = generator.GenerateSchemaAndType(
                entity as Parameters<typeof generator.GenerateSchemaAndType>[0]
            );

            // Standard field should use z.string().nullable()
            expect(result).toContain('Description: z.string().nullable()');
        });
    });

    describe('ValidateJSONTypeDefinition - AST validation', () => {
        // Access the static method via the class
        const validate = (EntitySubClassGeneratorBase as unknown as {
            ValidateJSONTypeDefinition: (def: string, typeName: string, entity: string, field: string) =>
                { valid: boolean; errors: string[] };
        }).ValidateJSONTypeDefinition.bind(EntitySubClassGeneratorBase);

        it('should accept a valid interface definition', () => {
            const def = `export interface IMyConfig {
                Name: string;
                Value?: number;
            }`;
            const result = validate(def, 'IMyConfig', 'TestEntity', 'ConfigField');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should accept a valid type alias definition', () => {
            const def = `export type MyStatus = 'active' | 'inactive' | 'pending';`;
            const result = validate(def, 'MyStatus', 'TestEntity', 'StatusField');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should accept multiple interfaces where one matches the expected type', () => {
            const def = `export interface ISubItem {
                id: string;
            }
            export interface IMyConfig {
                items: ISubItem[];
            }`;
            const result = validate(def, 'IMyConfig', 'TestEntity', 'ConfigField');
            expect(result.valid).toBe(true);
        });

        it('should reject when expected type name is not defined', () => {
            const def = `export interface IWrongName {
                Name: string;
            }`;
            const result = validate(def, 'IMyConfig', 'TestEntity', 'ConfigField');
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('IMyConfig');
            expect(result.errors[0]).toContain('not defined');
            expect(result.errors[0]).toContain('IWrongName');
        });

        it('should reject invalid TypeScript syntax', () => {
            const def = `export interface IMyConfig {
                Name: string;
                this is not valid typescript!!!
            }`;
            const result = validate(def, 'IMyConfig', 'TestEntity', 'ConfigField');
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Syntax error'))).toBe(true);
        });

        it('should reject completely unparseable input', () => {
            const def = `}}}{{{{[[[`;
            const result = validate(def, 'IMyConfig', 'TestEntity', 'ConfigField');
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should accept definition with Record<> and optional fields', () => {
            const def = `export interface IJSONSchemaProperty {
                type: string;
                title?: string;
            }
            export interface IJSONSchema {
                properties: Record<string, IJSONSchemaProperty>;
                required?: string[];
            }`;
            const result = validate(def, 'IJSONSchema', 'TestEntity', 'SchemaField');
            expect(result.valid).toBe(true);
        });

        it('should include entity and field name in error messages', () => {
            const def = `export interface IWrong { x: string; }`;
            const result = validate(def, 'IExpected', 'MyEntity', 'MyField');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('MyEntity');
            expect(result.errors[0]).toContain('MyField');
        });
    });
});
