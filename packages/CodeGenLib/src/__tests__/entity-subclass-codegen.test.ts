import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/core', () => {
    // Minimal BaseEntity mock with representative members so that getBaseEntityMemberNames()
    // can walk the prototype chain and build the reserved-name set used by SafeCodeName().
    class MockBaseEntity {
        Config() {}
        Save() {}
        Delete() {}
        Validate() {}
        Get() {}
        Set() {}
        Refresh() {}
        Revert() {}
        NewRecord() {}
        GetAll() {}
        SetMany() {}
        GetFieldByName() {}
        InnerLoad() {}
        LoadFromData() {}
        get Dirty() { return false; }
        get EntityInfo() { return null; }
        get Fields() { return []; }
        get PrimaryKey() { return null; }
        get IsSaved() { return false; }
    }
    return {
    BaseEntity: MockBaseEntity,
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
};
});

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

describe('EntitySubClassGeneratorBase', () => {
    let generator: EntitySubClassGeneratorBase;

    beforeEach(() => {
        generator = new EntitySubClassGeneratorBase();
        vi.clearAllMocks();
    });

    describe('generateEntitySubClassFileHeader', () => {
        it('should include BaseEntity import', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('BaseEntity');
        });

        it('should include RegisterClass import', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('RegisterClass');
        });

        it('should include zod import', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('import { z } from "zod"');
        });

        it('should include loadModule export', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('export const loadModule');
        });

        it('should import from @memberjunction/core', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('@memberjunction/core');
        });

        it('should import from @memberjunction/global', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('@memberjunction/global');
        });

        it('should include EntitySaveOptions import', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('EntitySaveOptions');
        });

        it('should include ValidationResult import', () => {
            const header = generator.generateEntitySubClassFileHeader();
            expect(header).toContain('ValidationResult');
        });
    });

    describe('generateEntitySubClass', () => {
        it('should return empty string for entity with no primary keys', async () => {
            const entity = {
                Name: 'MJTestEntity',
                PrimaryKeys: [],
                Fields: []
            };
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false,
                false
            );
            expect(result).toBe('');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no primary keys'));
            warnSpy.mockRestore();
        });

        it('should rename field getter/setter when name conflicts with BaseEntity member', async () => {
            const entity = {
                Name: 'Actions',
                ClassName: 'Action',
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID', TSType: 'string', IsPrimaryKey: true, AutoIncrement: false }],
                Fields: [
                    { Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, ReadOnly: false, IsPrimaryKey: true, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true },
                    { Name: 'Config', CodeName: 'Config', Type: 'nvarchar', SQLFullType: 'nvarchar(MAX)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true }
                ],
                EntityObjectSubclassName: '',
                EntityObjectSubclassImport: '',
                AllowDeleteAPI: true,
                AllowCreateAPI: true,
                AllowUpdateAPI: true,
                CascadeDeletes: false,
                IsChildType: false,
                Status: 'Active',
                SchemaName: '__mj',
                BaseTable: 'Action',
                BaseView: 'vwActions',
                Description: ''
            };

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false,
                true
            );

            // Config should be renamed to Config_ to avoid shadowing BaseEntity.Config
            expect(result).toContain('get Config_()');
            expect(result).toContain('set Config_(value:');
            expect(result).toContain('avoid conflict with BaseEntity.Config');
            // The underlying Get/Set calls should still use the original DB field name
            expect(result).toContain("return this.Get('Config')");
            expect(result).toContain("this.Set('Config', value)");
        });

        it('should NOT rename field getter/setter when name does not conflict', async () => {
            const entity = {
                Name: 'Actions',
                ClassName: 'Action',
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID', TSType: 'string', IsPrimaryKey: true, AutoIncrement: false }],
                Fields: [
                    { Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, ReadOnly: false, IsPrimaryKey: true, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true },
                    { Name: 'Description', CodeName: 'Description', Type: 'nvarchar', SQLFullType: 'nvarchar(MAX)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true }
                ],
                EntityObjectSubclassName: '',
                EntityObjectSubclassImport: '',
                AllowDeleteAPI: true,
                AllowCreateAPI: true,
                AllowUpdateAPI: true,
                CascadeDeletes: false,
                IsChildType: false,
                Status: 'Active',
                SchemaName: '__mj',
                BaseTable: 'Action',
                BaseView: 'vwActions',
                Description: ''
            };

            const result = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false,
                true
            );

            // Description should NOT be renamed — it doesn't conflict with BaseEntity
            expect(result).toContain('get Description()');
            expect(result).toContain('set Description(value:');
            expect(result).not.toContain('Description_');
        });

        // ── Base-class selection for external data source entities ──
        const makeEntity = (overrides: Record<string, unknown>) => ({
            Name: 'Snowflake Sales',
            ClassName: 'SnowflakeSales',
            PrimaryKeys: [{ Name: 'ID', CodeName: 'ID', TSType: 'string', IsPrimaryKey: true, AutoIncrement: false }],
            Fields: [
                { Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, ReadOnly: false, IsPrimaryKey: true, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true },
                { Name: 'Amount', CodeName: 'Amount', Type: 'decimal', SQLFullType: 'decimal(18,2)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: false }
            ],
            EntityObjectSubclassName: '',
            EntityObjectSubclassImport: '',
            ExternalDataSourceID: null,
            ExternalObjectName: null,
            AllowDeleteAPI: false,
            AllowCreateAPI: false,
            AllowUpdateAPI: false,
            CascadeDeletes: false,
            IsChildType: false,
            Status: 'Active',
            SchemaName: '__mj',
            BaseTable: 'SnowflakeSales',
            BaseView: 'vwSnowflakeSales',
            Description: '',
            ...overrides
        });

        const generate = async (entity: Record<string, unknown>) =>
            generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                false,
                true
            );

        it('should extend ReadOnlyExternalBaseEntity when entity has an ExternalDataSourceID', async () => {
            const result = await generate(makeEntity({ ExternalDataSourceID: 'ds-123', ExternalObjectName: 'SALES_FACT' }));
            expect(result).toContain('extends ReadOnlyExternalBaseEntity');
            expect(result).toContain("import { ReadOnlyExternalBaseEntity } from '@memberjunction/core-entities';");
            expect(result).not.toContain('extends BaseEntity<');
        });

        it('should extend BaseEntity for a normal (non-external) entity', async () => {
            const result = await generate(makeEntity({ ExternalDataSourceID: null }));
            expect(result).toContain('extends BaseEntity<');
            expect(result).not.toContain('ReadOnlyExternalBaseEntity');
        });

        it('should prefer an explicit custom subclass over the external base class', async () => {
            const result = await generate(makeEntity({
                ExternalDataSourceID: 'ds-123',
                EntityObjectSubclassName: 'MyCustomBase',
                EntityObjectSubclassImport: '@my/pkg'
            }));
            expect(result).toContain('extends MyCustomBase');
            expect(result).toContain("import { MyCustomBase } from '@my/pkg';");
            expect(result).not.toContain('ReadOnlyExternalBaseEntity');
        });
    });

    describe('GenerateSchemaAndType', () => {
        it('should rename Zod schema key when field name conflicts with BaseEntity member', () => {
            const entity = {
                Name: 'Actions',
                ClassName: 'Action',
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
                Fields: [
                    { Name: 'Config', CodeName: 'Config', Type: 'nvarchar', SQLFullType: 'nvarchar(MAX)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true, DisplayName: '', RelatedEntity: '', DefaultValue: '', Description: '' }
                ]
            };

            const result = generator.GenerateSchemaAndType(
                entity as Parameters<typeof generator.GenerateSchemaAndType>[0]
            );

            // Zod key should use Config_ to match the getter/setter
            expect(result).toContain('Config_: z.');
            expect(result).not.toMatch(/(?<![_])Config: z\./);
        });
    });
});
