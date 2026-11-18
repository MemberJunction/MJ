/** TypedBindValue: a value converted to what a parameter of a column's database type binds. */
import { describe, it, expect } from 'vitest';
import { IsTypedQueryParameterList, TypedBindValue, TypedQueryParameter } from '../typedQueryParameter';

describe('TypedBindValue', () => {
    it('binds text for character and uuid columns', () => {
        expect(TypedBindValue('Active', 'varchar(20)')).toBe('Active');
        expect(TypedBindValue(42, 'nvarchar(max)')).toBe('42');
        expect(TypedBindValue('9b6f…', 'uniqueidentifier')).toBe('9b6f…');
        expect(TypedBindValue('a', 'character varying(50)')).toBe('a');
        expect(TypedBindValue({ a: 1 }, 'varchar(5)')).toBeUndefined();
    });

    it('binds finite numbers for numeric columns and refuses anything else', () => {
        expect(TypedBindValue('42', 'int')).toBe(42);
        expect(TypedBindValue(' 1.5 ', 'decimal(18,2)')).toBe(1.5);
        expect(TypedBindValue(7, 'double precision')).toBe(7);
        expect(TypedBindValue('abc', 'int')).toBeUndefined();
        expect(TypedBindValue('', 'integer')).toBeUndefined();
    });

    it('binds booleans for bit and boolean columns', () => {
        expect(TypedBindValue(true, 'bit')).toBe(true);
        expect(TypedBindValue('false', 'boolean')).toBe(false);
        expect(TypedBindValue(1, 'bit')).toBe(true);
        expect(TypedBindValue('maybe', 'bit')).toBeUndefined();
    });

    it('binds dates, reading zone-less ISO text as that UTC wall-clock time', () => {
        expect(TypedBindValue('2026-01-02T10:30:00.000Z', 'datetime2(7)')).toEqual(new Date('2026-01-02T10:30:00.000Z'));
        expect(TypedBindValue('2026-01-02 10:30', 'datetime')).toEqual(new Date('2026-01-02T10:30:00Z'));
        expect(TypedBindValue('2026-01-02', 'date')).toEqual(new Date('2026-01-02T00:00:00Z'));
        expect(TypedBindValue('2026-01-02T10:30:00+02:00', 'timestamp with time zone')).toEqual(new Date('2026-01-02T08:30:00Z'));
        expect(TypedBindValue('02/01/2026', 'timestamp(3) without time zone')).toBeUndefined();
        expect(TypedBindValue('not a date', 'datetimeoffset')).toBeUndefined();
    });

    it('recognises a list of typed parameters', () => {
        expect(IsTypedQueryParameterList([new TypedQueryParameter('mj_p0', 'int', 1)])).toBe(true);
        expect(IsTypedQueryParameterList([1, 2])).toBe(false);
        expect(IsTypedQueryParameterList([])).toBe(false);
    });
});
