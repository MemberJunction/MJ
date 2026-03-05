import { describe, it, expect } from 'vitest';
import { TypeMapper } from '../TypeMapper.js';
import type { SourceFieldInfo } from '../interfaces.js';

function MakeField(overrides: Partial<SourceFieldInfo> = {}): SourceFieldInfo {
    return {
        Name: 'TestField',
        Label: 'Test Field',
        SourceType: 'string',
        IsRequired: false,
        MaxLength: null,
        Precision: null,
        Scale: null,
        DefaultValue: null,
        IsPrimaryKey: false,
        IsForeignKey: false,
        ForeignKeyTarget: null,
        ...overrides,
    };
}

describe('TypeMapper', () => {
    const mapper = new TypeMapper();

    describe('MapSourceType', () => {
        it('should map string with MaxLength to NVARCHAR(n) on SQL Server', () => {
            const field = MakeField({ MaxLength: 100 });
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(100)');
        });

        it('should map string with MaxLength to VARCHAR(n) on PostgreSQL', () => {
            const field = MakeField({ MaxLength: 100 });
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(100)');
        });

        it('should default string without MaxLength to 255', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(255)');
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(255)');
        });

        it('should map string with MaxLength > 4000 to NVARCHAR(MAX) on SQL Server', () => {
            const field = MakeField({ MaxLength: 5000 });
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
        });

        it('should map string with MaxLength > 4000 to VARCHAR(5000) on PostgreSQL', () => {
            const field = MakeField({ MaxLength: 5000 });
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(5000)');
        });

        it('should map text to NVARCHAR(MAX) / TEXT', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('text', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('text', 'postgresql', field)).toBe('TEXT');
        });

        it('should map integer to INT / INTEGER', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('integer', 'sqlserver', field)).toBe('INT');
            expect(mapper.MapSourceType('integer', 'postgresql', field)).toBe('INTEGER');
        });

        it('should map boolean to BIT / BOOLEAN', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('boolean', 'sqlserver', field)).toBe('BIT');
            expect(mapper.MapSourceType('boolean', 'postgresql', field)).toBe('BOOLEAN');
        });

        it('should map datetime to DATETIMEOFFSET / TIMESTAMPTZ', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('datetime', 'sqlserver', field)).toBe('DATETIMEOFFSET');
            expect(mapper.MapSourceType('datetime', 'postgresql', field)).toBe('TIMESTAMPTZ');
        });

        it('should map uuid to UNIQUEIDENTIFIER / UUID', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('uuid', 'sqlserver', field)).toBe('UNIQUEIDENTIFIER');
            expect(mapper.MapSourceType('uuid', 'postgresql', field)).toBe('UUID');
        });

        it('should map json to NVARCHAR(MAX) / JSONB', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('json', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('json', 'postgresql', field)).toBe('JSONB');
        });

        it('should map decimal with precision/scale', () => {
            const field = MakeField({ Precision: 10, Scale: 4 });
            expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toBe('DECIMAL(10,4)');
            expect(mapper.MapSourceType('decimal', 'postgresql', field)).toBe('NUMERIC(10,4)');
        });

        it('should default decimal precision to 18,2', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toBe('DECIMAL(18,2)');
        });

        it('should fall back to text for unknown types', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('foobar', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('foobar', 'postgresql', field)).toBe('TEXT');
        });

        it('should handle case-insensitive source types', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('STRING', 'sqlserver', field)).toBe('NVARCHAR(255)');
            expect(mapper.MapSourceType('  Integer  ', 'sqlserver', field)).toBe('INT');
        });
    });

    describe('GetMJFieldType', () => {
        it('should return nvarchar for string', () => {
            expect(mapper.GetMJFieldType('string')).toBe('nvarchar');
        });

        it('should return int for integer', () => {
            expect(mapper.GetMJFieldType('integer')).toBe('int');
        });

        it('should return nvarchar for unknown types', () => {
            expect(mapper.GetMJFieldType('foobar')).toBe('nvarchar');
        });
    });

    describe('GetAllMappings', () => {
        it('should return all type mappings', () => {
            const mappings = mapper.GetAllMappings();
            expect(mappings.length).toBeGreaterThan(0);
            expect(mappings.find(m => m.SourceType === 'string')).toBeTruthy();
            expect(mappings.find(m => m.SourceType === 'integer')).toBeTruthy();
        });
    });
});
