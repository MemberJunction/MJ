import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/core', () => ({
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
    ManageMetadataBase: class {}
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
                Name: 'TestEntity',
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
    });
});
