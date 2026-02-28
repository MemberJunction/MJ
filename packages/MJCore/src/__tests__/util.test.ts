import { describe, it, expect } from 'vitest';
import { FormatValue, SQLFullType, SQLMaxLength, TypeScriptTypeFromSQLType } from '../generic/util';

describe('FormatValue / FormatValueInternal', () => {
    describe('SQL Server types', () => {
        it('formats money values', () => {
            expect(FormatValue('money', 1234.56, 2, 'USD')).toMatch(/1,234\.56/);
        });
        it('formats datetime values', () => {
            const result = FormatValue('datetime', '2024-01-15T00:00:00Z');
            expect(result).toBeTruthy();
        });
        it('formats int values', () => {
            expect(FormatValue('int', 42000)).toMatch(/42,000/);
        });
        it('formats decimal values', () => {
            expect(FormatValue('decimal', 3.14159, 2)).toMatch(/3\.14/);
        });
    });

    describe('PostgreSQL types', () => {
        it('formats timestamp values', () => {
            const result = FormatValue('timestamp', '2024-01-15T12:00:00Z');
            expect(result).toBeTruthy();
        });
        it('formats timestamptz values', () => {
            const result = FormatValue('timestamptz', '2024-01-15T12:00:00Z');
            expect(result).toBeTruthy();
        });
        it('formats integer values', () => {
            expect(FormatValue('integer', 42000)).toMatch(/42,000/);
        });
        it('formats bigint values', () => {
            expect(FormatValue('bigint', 9999999)).toMatch(/9,999,999/);
        });
        it('formats smallint values', () => {
            expect(FormatValue('smallint', 42)).toBe('42');
        });
        it('formats double precision values', () => {
            expect(FormatValue('double precision', 3.14159, 2)).toMatch(/3\.14/);
        });
        it('formats boolean true', () => {
            expect(FormatValue('boolean', true)).toBe('true');
        });
        it('formats boolean false', () => {
            expect(FormatValue('boolean', false)).toBe('false');
        });
        it('formats bool (short) type', () => {
            expect(FormatValue('bool', true)).toBe('true');
        });
        it('formats uuid values as string', () => {
            const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
            expect(FormatValue('uuid', uuid)).toBe(uuid);
        });
        it('formats text values as string', () => {
            expect(FormatValue('text', 'hello world')).toBe('hello world');
        });
        it('formats jsonb values as string', () => {
            const obj = { key: 'value' };
            expect(FormatValue('jsonb', obj)).toBe('[object Object]');
        });
        it('formats serial values', () => {
            expect(FormatValue('serial', 123)).toBe('123');
        });
    });

    describe('null/undefined handling', () => {
        it('returns null for null value', () => {
            expect(FormatValue('int', null)).toBeNull();
        });
        it('returns undefined for undefined value', () => {
            expect(FormatValue('int', undefined)).toBeUndefined();
        });
    });

    describe('maxLength truncation', () => {
        it('truncates long strings', () => {
            const longString = 'a'.repeat(100);
            const result = FormatValue('text', longString, 2, 'USD', 10);
            expect(result.length).toBeLessThanOrEqual(13); // 10 + '...'
        });
    });
});

describe('SQLFullType', () => {
    describe('SQL Server types', () => {
        it('varchar with length', () => {
            expect(SQLFullType('varchar', 50, 0, 0)).toBe('varchar(50)');
        });
        it('varchar with MAX', () => {
            expect(SQLFullType('varchar', 0, 0, 0)).toBe('varchar(MAX)');
        });
        it('nvarchar halves length', () => {
            expect(SQLFullType('nvarchar', 100, 0, 0)).toBe('nvarchar(50)');
        });
        it('decimal with precision/scale', () => {
            expect(SQLFullType('decimal', 0, 18, 4)).toBe('decimal(18, 4)');
        });
        it('numeric with precision/scale', () => {
            expect(SQLFullType('numeric', 0, 28, 6)).toBe('numeric(28, 6)');
        });
        it('float with precision', () => {
            expect(SQLFullType('float', 0, 53, 0)).toBe('float(53)');
        });
    });

    describe('PostgreSQL types (no length params)', () => {
        it('text returns just type name', () => {
            expect(SQLFullType('text', 0, 0, 0)).toBe('text');
        });
        it('boolean returns just type name', () => {
            expect(SQLFullType('boolean', 0, 0, 0)).toBe('boolean');
        });
        it('uuid returns just type name', () => {
            expect(SQLFullType('uuid', 0, 0, 0)).toBe('uuid');
        });
        it('jsonb returns just type name', () => {
            expect(SQLFullType('jsonb', 0, 0, 0)).toBe('jsonb');
        });
        it('timestamptz returns just type name', () => {
            expect(SQLFullType('timestamptz', 0, 0, 0)).toBe('timestamptz');
        });
        it('bytea returns just type name', () => {
            expect(SQLFullType('bytea', 0, 0, 0)).toBe('bytea');
        });
    });
});

describe('SQLMaxLength', () => {
    describe('SQL Server types', () => {
        it('varchar with length', () => {
            expect(SQLMaxLength('varchar', 50)).toBe(50);
        });
        it('varchar MAX (-1)', () => {
            expect(SQLMaxLength('varchar', -1)).toBe(0);
        });
        it('nvarchar halves length', () => {
            expect(SQLMaxLength('nvarchar', 100)).toBe(50);
        });
        it('text with length', () => {
            expect(SQLMaxLength('text', 2147483647)).toBe(2147483647);
        });
    });

    describe('PostgreSQL types', () => {
        it('text with no length returns 0 (unlimited)', () => {
            expect(SQLMaxLength('text', 0)).toBe(0);
        });
        it('text with -1 returns 0 (unlimited)', () => {
            expect(SQLMaxLength('text', -1)).toBe(0);
        });
        it('non-string types return 0', () => {
            expect(SQLMaxLength('integer', 0)).toBe(0);
            expect(SQLMaxLength('boolean', 0)).toBe(0);
            expect(SQLMaxLength('uuid', 0)).toBe(0);
            expect(SQLMaxLength('jsonb', 0)).toBe(0);
        });
    });
});

describe('TypeScriptTypeFromSQLType', () => {
    describe('PostgreSQL type mapping', () => {
        it('maps uuid to string', () => {
            expect(TypeScriptTypeFromSQLType('uuid')).toBe('string');
        });
        it('maps bytea to string', () => {
            expect(TypeScriptTypeFromSQLType('bytea')).toBe('string');
        });
        it('maps timestamp to Date', () => {
            expect(TypeScriptTypeFromSQLType('timestamp')).toBe('Date');
        });
        it('maps timestamptz to Date', () => {
            expect(TypeScriptTypeFromSQLType('timestamptz')).toBe('Date');
        });
        it('maps boolean to boolean', () => {
            expect(TypeScriptTypeFromSQLType('boolean')).toBe('boolean');
        });
        it('maps bool to boolean', () => {
            expect(TypeScriptTypeFromSQLType('bool')).toBe('boolean');
        });
    });
});
