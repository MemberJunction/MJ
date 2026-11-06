import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs'; // mocked below (vi.mock('fs')) — used to capture generated file content

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
            readFileSync: vi.fn().mockReturnValue(''),
            // Per-schema emit lists its output directory to prune files no live schema
            // claims. existsSync is stubbed true above, so without these the pruner
            // reaches the real filesystem.
            readdirSync: vi.fn().mockReturnValue([]),
            unlinkSync: vi.fn()
        }
    };
});

vi.mock('mssql', () => ({
    default: {}
}));

vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(),
    logStatus: vi.fn(),
    LogWarning: vi.fn(),
    get logWarning() { return this.LogWarning; }
}));

vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {
        entityName = '';
        sourceCheckConstraint = '';
        functionText = '';
        functionName = '';
        functionDescription = '';
        generatedCodeId = '';
    },
    ManageMetadataBase: class {
        static generatedValidators: unknown[] = [];
    }
}));

vi.mock('../Config/config', () => ({
    MjCoreSchema: '__mj',
    get mj_core_schema() { return this.MjCoreSchema; },
    configInfo: {},
    ResolveEntityPackageName: () => 'mj_generatedentities',
    get resolveEntityPackageName() { return this.ResolveEntityPackageName; },
    ResolveEntityImportPackage: () => {
        throw new Error('resolveEntityImportPackage should not be called without peer embeds/collections');
    },
    get resolveEntityImportPackage() { return this.ResolveEntityImportPackage; },
}));

vi.mock('./sql_logging', () => ({
    SQLLogging: class {}
}));

vi.mock('../Misc/util', () => ({
    MakeDir: vi.fn(),
    get makeDir() { return this.MakeDir; },
    SortBySequenceAndCreatedAt: vi.fn((items: unknown[]) => [...items]),
    get sortBySequenceAndCreatedAt() { return this.SortBySequenceAndCreatedAt; }
}));

import ts from 'typescript';
import { Metadata } from '@memberjunction/core';
import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';
import { ManageMetadataBase, ValidatorResult } from '../Database/manage-metadata';
import { LogWarning } from '../Misc/status_logging';

/** Syntax diagnostics of a TypeScript source, read the same way the generator validates JSON types. */
function SyntaxErrors(source: string): string[] {
    const sf = ts.createSourceFile('out.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] };
    return (sf.parseDiagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('EntitySubClassGeneratorBase', () => {
    let generator: EntitySubClassGeneratorBase;

    beforeEach(() => {
        generator = new EntitySubClassGeneratorBase();
        vi.clearAllMocks();
        // clearAllMocks drops return values too. Per-schema emit lists its output directory
        // to prune files no live schema claims, so a case that stubs existsSync true reaches
        // readdirSync — and an unset mock returns undefined, not an empty listing.
        vi.mocked(fs.readdirSync).mockReturnValue([]);
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

        it('omits loadModule from a per-schema file so the barrel owns the symbol', () => {
            const header = generator.generateEntitySubClassFileHeader(false);
            expect(header).not.toContain('export const loadModule');
            expect(header).toContain('import { z } from "zod"');
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

        // ── Binary fields (varbinary / bytea): getter doc tells consumers how to decode ──
        describe('binary field getter documentation', () => {
            const BINARY_DOC_LINE = '* * Binary Value: base64-encoded string. Decode with Base64ToBytes() — or Base64ToFloat32Vector() for an embedding — from @memberjunction/global.';

            const binaryEntity = () => ({
                Name: 'Vector Things',
                ClassName: 'VectorThing',
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID', TSType: 'string', IsPrimaryKey: true, AutoIncrement: false }],
                Fields: [
                    { Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, ReadOnly: false, IsPrimaryKey: true, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true, IsBinaryFieldType: false },
                    { Name: 'Embedding', CodeName: 'Embedding', Type: 'varbinary', SQLFullType: 'varbinary(MAX)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true, IsBinaryFieldType: true },
                    { Name: 'Label', CodeName: 'Label', Type: 'nvarchar', SQLFullType: 'nvarchar(100)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 0, EntityFieldValues: [], Status: 'Active', NeedsQuotes: true, IsBinaryFieldType: false },
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
                BaseTable: 'VectorThing',
                BaseView: 'vwVectorThings',
                Description: ''
            });

            const generateBinary = () =>
                generator.generateEntitySubClass(
                    {} as Parameters<typeof generator.generateEntitySubClass>[0],
                    binaryEntity() as Parameters<typeof generator.generateEntitySubClass>[1],
                    false,
                    true
                );

            /** The JSDoc block that immediately precedes `get <name>()`. */
            const docFor = (source: string, getterName: string): string => {
                const getterIdx = source.indexOf(`get ${getterName}()`);
                expect(getterIdx, `getter ${getterName}`).toBeGreaterThan(-1);
                const docStart = source.lastIndexOf('/**', getterIdx);
                return source.substring(docStart, getterIdx);
            };

            it('adds the base64 decode note to the binary field getter, right after its SQL data type', async () => {
                const result = await generateBinary();
                const doc = docFor(result, 'Embedding');

                expect(doc).toContain(BINARY_DOC_LINE);
                expect(doc).toMatch(/SQL Data Type: varbinary\(MAX\)\n\s*\* \* Binary Value: base64-encoded string\./);
            });

            it('emits the note exactly once — only for the binary field', async () => {
                const result = await generateBinary();

                expect(result.split(BINARY_DOC_LINE).length - 1).toBe(1);
                expect(docFor(result, 'Label')).not.toContain('Binary Value');
                expect(docFor(result, 'ID')).not.toContain('Binary Value');
            });

            it('still types the binary getter as a string', async () => {
                const result = await generateBinary();

                expect(result).toMatch(/get Embedding\(\): string \| null/);
            });
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

        // includeFileHeader=true → a complete standalone single-entity file. The base-class import is
        // emitted inline in this mode (for the multi-entity file path the assembler hoists + dedupes it —
        // see the "exactly once" regression test below).
        const generate = async (entity: Record<string, unknown>) =>
            generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                entity as Parameters<typeof generator.generateEntitySubClass>[1],
                true,
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

        it('emits the ReadOnlyExternalBaseEntity import exactly once for a file with multiple external entities', async () => {
            // Regression (fix C): the import was previously emitted inline per external entity, so a file
            // with 2+ external entities produced duplicate `import { ReadOnlyExternalBaseEntity }` lines
            // → TS2300 duplicate identifier. The assembler now hoists + de-duplicates subclass imports.
            // Two entities in the SAME schema share one per-schema file.
            const writeMock = vi.mocked(fs.writeFileSync);
            writeMock.mockClear();
            const bronze = makeEntity({ Name: 'Bronze Sales', ClassName: 'BronzeSales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales', SchemaName: 'bronze', BaseTable: 'sales', BaseView: 'vwBronzeSales' });
            const bronze2 = makeEntity({ Name: 'Bronze Quotes', ClassName: 'BronzeQuotes', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'quotes', SchemaName: 'bronze', BaseTable: 'quotes', BaseView: 'vwBronzeQuotes' });
            const ok = await generator.generateAllEntitySubClasses(
                {} as Parameters<typeof generator.generateAllEntitySubClasses>[0],
                [bronze, bronze2] as Parameters<typeof generator.generateAllEntitySubClasses>[1],
                '/out',
                true
            );
            expect(ok).toBe(true);
            const schemaCall = writeMock.mock.calls.find((c) => String(c[0]).endsWith('bronze.ts'));
            expect(schemaCall).toBeTruthy();
            const content = String(schemaCall![1]);
            const importMatches = content.match(/import \{ ReadOnlyExternalBaseEntity \} from '@memberjunction\/core-entities';/g) || [];
            expect(importMatches.length).toBe(1); // exactly one, not one-per-entity
            expect((content.match(/extends ReadOnlyExternalBaseEntity/g) || []).length).toBe(2); // both still extend it
            const barrelCall = writeMock.mock.calls.find((c) => String(c[0]).endsWith('entity_subclasses.ts'));
            expect(String(barrelCall![1])).toContain("export * from './entities/bronze.js'");
        });

        it('emits one TypeScript file per schema plus a barrel', async () => {
            const writeMock = vi.mocked(fs.writeFileSync);
            writeMock.mockClear();
            const bronze = makeEntity({ Name: 'Bronze Sales', ClassName: 'BronzeSales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales', SchemaName: 'bronze', BaseTable: 'sales', BaseView: 'vwBronzeSales' });
            const silver = makeEntity({ Name: 'Silver Sales', ClassName: 'SilverSales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales', SchemaName: 'silver', BaseTable: 'sales', BaseView: 'vwSilverSales' });
            const ok = await generator.generateAllEntitySubClasses(
                {} as Parameters<typeof generator.generateAllEntitySubClasses>[0],
                [bronze, silver] as Parameters<typeof generator.generateAllEntitySubClasses>[1],
                '/out',
                true
            );
            expect(ok).toBe(true);
            const written = writeMock.mock.calls.map((c) => String(c[0]));
            expect(written.some((p) => p.endsWith('entities/bronze.ts'))).toBe(true);
            expect(written.some((p) => p.endsWith('entities/silver.ts'))).toBe(true);
            expect(written.some((p) => p.endsWith('entity_subclasses.ts'))).toBe(true);
        });

        it('skips schema files that exist when the dirty set is empty', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const writeMock = vi.mocked(fs.writeFileSync);
            writeMock.mockClear();
            const bronze = makeEntity({ Name: 'Bronze Sales', ClassName: 'BronzeSales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales', SchemaName: 'bronze', BaseTable: 'sales', BaseView: 'vwBronzeSales' });
            const ok = await generator.generateAllEntitySubClasses(
                {} as Parameters<typeof generator.generateAllEntitySubClasses>[0],
                [bronze] as Parameters<typeof generator.generateAllEntitySubClasses>[1],
                '/out',
                true,
                { dirtySchemas: new Set() },
            );
            expect(ok).toBe(true);
            const written = writeMock.mock.calls.map((c) => String(c[0]));
            expect(written.some((p) => p.endsWith('entities/bronze.ts'))).toBe(false);
            expect(written.some((p) => p.endsWith('entity_subclasses.ts'))).toBe(true);
        });

        it('can still emit the historical single-file monolith', async () => {
            const writeMock = vi.mocked(fs.writeFileSync);
            writeMock.mockClear();
            const bronze = makeEntity({ Name: 'Bronze Sales', ClassName: 'BronzeSales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales', SchemaName: 'bronze', BaseTable: 'sales', BaseView: 'vwBronzeSales' });
            const ok = await generator.generateAllEntitySubClasses(
                {} as Parameters<typeof generator.generateAllEntitySubClasses>[0],
                [bronze] as Parameters<typeof generator.generateAllEntitySubClasses>[1],
                '/out',
                true,
                { perSchema: false },
            );
            expect(ok).toBe(true);
            const monolith = writeMock.mock.calls.find((c) => String(c[0]).endsWith('entity_subclasses.ts'));
            expect(monolith).toBeTruthy();
            expect(String(monolith![1])).toContain('extends ReadOnlyExternalBaseEntity');
            expect(String(monolith![1])).not.toContain("export * from './entities/");
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
    describe('generated validators', () => {
        type FieldSpec = { Name: string; Type: string; AllowsNull?: boolean; IsPrimaryKey?: boolean };
        const field = (f: FieldSpec) => ({
            Name: f.Name, CodeName: f.Name, Type: f.Type, SQLFullType: f.Type, AllowsNull: f.AllowsNull ?? false, ReadOnly: false,
            IsPrimaryKey: f.IsPrimaryKey ?? false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '',
            ValueListTypeEnum: 'None', EntityFieldValues: [], Status: 'Active', NeedsQuotes: true,
            IsUniqueIdentifier: f.Type === 'uniqueidentifier',
        });
        const entity = () => ({
            Name: 'Tasks', ClassName: 'Task', PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
            Fields: [
                field({ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }),
                field({ Name: 'ParentID', Type: 'uniqueidentifier', AllowsNull: true }),
                field({ Name: 'Name', Type: 'nvarchar' }),
            ],
            EntityObjectSubclassName: '', EntityObjectSubclassImport: '', ExternalDataSourceID: null, AllowDeleteAPI: true,
            AllowCreateAPI: true, AllowUpdateAPI: true, CascadeDeletes: false, IsChildType: false, Status: 'Active',
            SchemaName: 'app', BaseTable: 'Task', BaseView: 'vwTasks', Description: '',
        });
        const validator = (v: Partial<ValidatorResult>): ValidatorResult => Object.assign(new ValidatorResult(), {
            entityName: 'Tasks', sourceCheckConstraint: '([ParentID]<>[ID])', functionDescription: 'A task cannot be its own parent',
            generatedCodeId: '', success: true, wasGenerated: false, ...v,
        });
        const notSelf = (name: string, comparison: string) =>
            `public ${name}(result: ValidationResult) {\n\tif (this.ParentID != null && ${comparison}) {\n\t\tresult.Errors.push(new ValidationErrorInfo("ParentID", "A task cannot be its own parent", this.ParentID, ValidationErrorType.Failure));\n\t}\n}`;
        const setValidators = (validators: ValidatorResult[]) => {
            (ManageMetadataBase as unknown as { generatedValidators: ValidatorResult[] }).generatedValidators = validators;
        };
        const generateValidate = () =>
            generator.GenerateValidateFunction(entity() as Parameters<typeof generator.GenerateValidateFunction>[0]);

        beforeEach(() => {
            vi.mocked(Metadata).mockImplementation(function () { return { EntityByName: () => undefined } as unknown as Metadata; });
        });
        afterEach(() => setValidators([]));

        it('emits UUIDsEqual for a UUID self-reference compared with === (#3984)', () => {
            setValidators([validator({ fieldName: 'ParentID', functionName: 'ValidateParentIDNotSelf', functionText: notSelf('ValidateParentIDNotSelf', 'this.ParentID === this.ID') })]);
            const code = generateValidate()!.code;
            expect(code).toContain('this.ParentID != null && UUIDsEqual(this.ParentID, this.ID)');
            expect(code).not.toContain('this.ParentID === this.ID');
        });

        it('keeps the stored function text unchanged so only the emitted class is rewritten', () => {
            const text = notSelf('ValidateParentIDNotSelf', 'this.ParentID === this.ID');
            setValidators([validator({ fieldName: 'ParentID', functionName: 'ValidateParentIDNotSelf', functionText: text })]);
            expect(generateValidate()!.validators[0].functionText).toBe(text);
        });

        it('imports UUIDsEqual in the file header only when a validator calls it', async () => {
            const writeMock = vi.mocked(fs.writeFileSync);
            const emit = async () => {
                writeMock.mockClear();
                await generator.generateAllEntitySubClasses(
                    {} as Parameters<typeof generator.generateAllEntitySubClasses>[0],
                    [entity()] as Parameters<typeof generator.generateAllEntitySubClasses>[1],
                    '/out',
                    true,
                );
                return String(writeMock.mock.calls.find((c) => String(c[0]).endsWith('app.ts'))![1]);
            };

            setValidators([validator({ fieldName: 'ParentID', functionName: 'ValidateParentIDNotSelf', functionText: notSelf('ValidateParentIDNotSelf', 'this.ParentID === this.ID') })]);
            const withUUID = await emit();
            expect(withUUID).toContain('import { RegisterClass, UUIDsEqual } from "@memberjunction/global";');
            expect(SyntaxErrors(withUUID)).toEqual([]);

            setValidators([validator({ fieldName: 'Name', sourceCheckConstraint: "([Name]<>'')", functionName: 'ValidateNameNotEmpty', functionText: "public ValidateNameNotEmpty(result: ValidationResult) {\n\tif (this.Name === '') { return; }\n}" })]);
            const without = await emit();
            expect(without).toContain('import { RegisterClass } from "@memberjunction/global";');
            expect(without).not.toContain('UUIDsEqual');
        });

        it('emits one method for two stored rows of the same field-level CHECK and logs the dropped row (#5834)', () => {
            setValidators([
                validator({ fieldName: 'ParentID', functionName: 'ValidateParentIDNotSelf', generatedCodeId: 'AAAA', functionText: notSelf('ValidateParentIDNotSelf', 'UUIDsEqual(this.ParentID, this.ID)') }),
                validator({ fieldName: 'ParentID', functionName: 'ValidateParentIDNotEqualToID', generatedCodeId: 'BBBB', functionText: notSelf('ValidateParentIDNotEqualToID', 'UUIDsEqual(this.ParentID, this.ID)') }),
            ]);
            const result = generateValidate()!;
            expect(result.validators.map((v) => v.functionName)).toEqual(['ValidateParentIDNotEqualToID']);
            expect(result.code).not.toContain('ValidateParentIDNotSelf');
            expect(vi.mocked(LogWarning)).toHaveBeenCalledWith(expect.stringMatching(/Tasks\.ParentID: .*emitting ValidateParentIDNotEqualToID \(GeneratedCode BBBB\).*dropping GeneratedCode AAAA/));
        });

        it('dedupes two table-level rows of the same CHECK', () => {
            const tableLevel = (name: string, id: string) => validator({ fieldName: undefined, sourceCheckConstraint: '([StartDate]<[EndDate])', functionName: name, generatedCodeId: id, functionText: `public ${name}(result: ValidationResult) {\n}` });
            setValidators([tableLevel('ValidateDates', 'AAAA'), tableLevel('ValidateStartBeforeEnd', 'BBBB')]);
            expect(generateValidate()!.validators.map((v) => v.functionName)).toEqual(['ValidateDates']);
            expect(vi.mocked(LogWarning)).toHaveBeenCalledWith(expect.stringContaining('Tasks (table level)'));
        });

        it('keeps two methods for two different CHECK constraints on one field', () => {
            setValidators([
                validator({ fieldName: 'ParentID', functionName: 'ValidateParentIDNotSelf', functionText: notSelf('ValidateParentIDNotSelf', 'UUIDsEqual(this.ParentID, this.ID)') }),
                validator({ fieldName: 'ParentID', sourceCheckConstraint: "([ParentID]<>'00000000-0000-0000-0000-000000000000')", functionName: 'ValidateParentIDNotEmptyGuid', functionText: notSelf('ValidateParentIDNotEmptyGuid', "this.ParentID === '00000000-0000-0000-0000-000000000000'") }),
            ]);
            expect(generateValidate()!.validators.map((v) => v.functionName)).toEqual(['ValidateParentIDNotEmptyGuid', 'ValidateParentIDNotSelf']);
            expect(vi.mocked(LogWarning)).not.toHaveBeenCalled();
        });
    });

    describe('value-list escaping (#5952)', () => {
        const values = ['PASS', '\\', "Women's Network", 'a*/b', 'back`tick', '${x}'];
        const valueListEntity = () => ({
            Name: 'Grades', ClassName: 'Grade', PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
            Fields: [
                { Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, ReadOnly: false, IsPrimaryKey: true, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: '', ValueListTypeEnum: 'None', EntityFieldValues: [], Status: 'Active', NeedsQuotes: true, DisplayName: '', RelatedEntity: '', DefaultValue: '', Description: '' },
                { Name: 'Grade', CodeName: 'Grade', Type: 'nvarchar', SQLFullType: 'nvarchar(50)', AllowsNull: true, ReadOnly: false, IsPrimaryKey: false, AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: 'List', ValueListTypeEnum: 'List', EntityFieldValues: values.map((Value) => ({ Value, Description: '' })), Status: 'Active', NeedsQuotes: true, DisplayName: '', RelatedEntity: '', DefaultValue: '', Description: '' },
            ],
            EntityObjectSubclassName: '', EntityObjectSubclassImport: '', ExternalDataSourceID: null, AllowDeleteAPI: true,
            AllowCreateAPI: true, AllowUpdateAPI: true, CascadeDeletes: false, IsChildType: false, Status: 'Active',
            SchemaName: 'app', BaseTable: 'Grade', BaseView: 'vwGrades', Description: '',
        });

        it('emits a Zod schema that parses, with every value as an escaped literal', () => {
            const out = generator.GenerateSchemaAndType(valueListEntity() as Parameters<typeof generator.GenerateSchemaAndType>[0]);
            expect(SyntaxErrors(out)).toEqual([]);
            expect(out).toContain("z.literal('\\\\')");
            expect(out).toContain("z.literal('Women\\'s Network')");
            expect(out).toContain("z.literal('PASS')");
            expect(out).toContain('*   * \\\\');
            expect(out).toContain('*   * back\\`tick');
            expect(out).toContain('*   * \\${x}');
        });

        it('emits an entity class whose union type and doc comment parse', async () => {
            vi.mocked(Metadata).mockImplementation(function () { return { EntityByName: () => undefined } as unknown as Metadata; });
            const out = await generator.generateEntitySubClass(
                {} as Parameters<typeof generator.generateEntitySubClass>[0],
                valueListEntity() as Parameters<typeof generator.generateEntitySubClass>[1],
                false,
                true,
            );
            expect(SyntaxErrors(out)).toEqual([]);
            expect(out).toContain("'PASS' | '\\\\' | 'Women\\'s Network' | 'a*/b' | 'back`tick' | '${x}' | null");
            expect(out).toContain('*   * a*\\/b');
        });

        it('escapes line terminators in a single-quoted value', () => {
            const escaped = (EntitySubClassGeneratorBase as unknown as { EscapeSingleQuotes(v: string): string }).EscapeSingleQuotes('a\nb\rc\u2028d\u2029e');
            expect(escaped).toBe('a\\nb\\rc\\u2028d\\u2029e');
        });
    });
});
