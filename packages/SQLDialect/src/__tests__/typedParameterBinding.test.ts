/**
 * `DialectBinding.TypedParameter`: how a statement refers to a bind parameter that carries a
 * column's database type. SQL Server names it (the driver declares the type); PostgreSQL casts it.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect } from '../dialectFactory.js';

describe('DialectBinding.TypedParameter', () => {
    it('SQL Server: a named @mj_pN parameter, no cast', () => {
        expect(GetDialect('sqlserver').Binding.TypedParameter(3, 'varchar(50)')).toEqual({ Placeholder: '@mj_p3', Name: 'mj_p3' });
    });

    it('PostgreSQL: $N cast to the type', () => {
        const binding = GetDialect('postgresql').Binding;
        expect(binding.TypedParameter(0, 'character varying(50)')).toEqual({ Placeholder: '$1::character varying(50)', Name: '$1' });
        expect(binding.TypedParameter(1, 'timestamp(3) with time zone').Placeholder).toBe('$2::timestamp(3) with time zone');
        expect(binding.TypedParameter(2, 'numeric(18, 2)').Placeholder).toBe('$3::numeric(18, 2)');
        expect(binding.TypedParameter(3, 'integer[]').Placeholder).toBe('$4::integer[]');
    });

    it('PostgreSQL: refuses text that is not a type name', () => {
        const binding = GetDialect('postgresql').Binding;
        expect(() => binding.TypedParameter(0, 'text); DROP TABLE x; --')).toThrow(/not a type name/);
        expect(() => binding.TypedParameter(0, '"Quoted"')).toThrow(/not a type name/);
    });
});
