import { describe, it, expect } from 'vitest';
import { TypeMapper } from '../TypeMapper.js';
import type { ColumnDefinition } from '../interfaces.js';

const col = (overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
    Name: 'TestCol',
    Type: 'string',
    IsNullable: true,
    ...overrides,
});

describe('TypeMapper', () => {
    const mapper = new TypeMapper();

    describe('MapType', () => {
        it('maps string → NVARCHAR(255) on SQL Server (default length)', () => {
            expect(mapper.MapType('string', col(), 'sqlserver')).toBe('NVARCHAR(255)');
        });

        it('maps string → VARCHAR(255) on PostgreSQL (default length)', () => {
            expect(mapper.MapType('string', col(), 'postgresql')).toBe('VARCHAR(255)');
        });

        it('maps string with MaxLength=100 → NVARCHAR(100)', () => {
            expect(mapper.MapType('string', col({ MaxLength: 100 }), 'sqlserver')).toBe('NVARCHAR(100)');
        });

        it('maps string with MaxLength>4000 → NVARCHAR(MAX) on SQL Server', () => {
            expect(mapper.MapType('string', col({ MaxLength: 5000 }), 'sqlserver')).toBe('NVARCHAR(MAX)');
        });

        it('maps text → NVARCHAR(MAX)', () => {
            expect(mapper.MapType('text', col({ Type: 'text' }), 'sqlserver')).toBe('NVARCHAR(MAX)');
        });

        it('maps integer → INT / INTEGER', () => {
            expect(mapper.MapType('integer', col({ Type: 'integer' }), 'sqlserver')).toBe('INT');
            expect(mapper.MapType('integer', col({ Type: 'integer' }), 'postgresql')).toBe('INTEGER');
        });

        it('maps boolean → BIT / BOOLEAN', () => {
            expect(mapper.MapType('boolean', col({ Type: 'boolean' }), 'sqlserver')).toBe('BIT');
            expect(mapper.MapType('boolean', col({ Type: 'boolean' }), 'postgresql')).toBe('BOOLEAN');
        });

        it('maps datetime → DATETIMEOFFSET / TIMESTAMPTZ', () => {
            expect(mapper.MapType('datetime', col({ Type: 'datetime' }), 'sqlserver')).toBe('DATETIMEOFFSET');
            expect(mapper.MapType('datetime', col({ Type: 'datetime' }), 'postgresql')).toBe('TIMESTAMPTZ');
        });

        it('maps uuid → UNIQUEIDENTIFIER / UUID', () => {
            expect(mapper.MapType('uuid', col({ Type: 'uuid' }), 'sqlserver')).toBe('UNIQUEIDENTIFIER');
            expect(mapper.MapType('uuid', col({ Type: 'uuid' }), 'postgresql')).toBe('UUID');
        });

        it('maps json → NVARCHAR(MAX) / JSONB', () => {
            expect(mapper.MapType('json', col({ Type: 'json' }), 'sqlserver')).toBe('NVARCHAR(MAX)');
            expect(mapper.MapType('json', col({ Type: 'json' }), 'postgresql')).toBe('JSONB');
        });

        it('maps decimal with precision/scale', () => {
            expect(mapper.MapType('decimal', col({ Type: 'decimal', Precision: 10, Scale: 4 }), 'sqlserver'))
                .toBe('DECIMAL(10,4)');
        });

        it('maps decimal with default precision (18,2)', () => {
            expect(mapper.MapType('decimal', col({ Type: 'decimal' }), 'sqlserver')).toBe('DECIMAL(18,2)');
        });

        it('handles case-insensitive source types', () => {
            expect(mapper.MapType('STRING' as 'string', col(), 'sqlserver')).toBe('NVARCHAR(255)');
        });

        it('falls back to NVARCHAR(MAX) / TEXT for unknown types', () => {
            expect(mapper.MapType('unknown' as 'string', col(), 'sqlserver')).toBe('NVARCHAR(MAX)');
            expect(mapper.MapType('unknown' as 'string', col(), 'postgresql')).toBe('TEXT');
        });
    });

    describe('MapSourceType', () => {
        it('delegates to MapType with loose string input', () => {
            expect(mapper.MapSourceType('integer', col({ Type: 'integer' }), 'sqlserver')).toBe('INT');
        });
    });

    describe('GetMJFieldType', () => {
        it('returns correct MJ field types', () => {
            expect(mapper.GetMJFieldType('string')).toBe('nvarchar');
            expect(mapper.GetMJFieldType('integer')).toBe('int');
            expect(mapper.GetMJFieldType('boolean')).toBe('bit');
            expect(mapper.GetMJFieldType('uuid')).toBe('uniqueidentifier');
        });

        it('returns nvarchar for unknown types', () => {
            expect(mapper.GetMJFieldType('unknown')).toBe('nvarchar');
        });
    });

    describe('GetAllMappings', () => {
        it('returns all 12 type mappings', () => {
            const mappings = mapper.GetAllMappings();
            expect(mappings.length).toBe(12);
        });
    });
});
