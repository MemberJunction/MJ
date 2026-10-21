/**
 * The dialect members the query rendering pipeline reads instead of checking the platform name:
 * paging ORDER BY rules, string literal forms the lexer must recognise, query hints, string
 * literal prefixes, LIKE escaping and boolean parameter values.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '../sqlServerDialect';
import { PostgreSQLDialect } from '../postgresqlDialect';

const tsql = new SQLServerDialect();
const pg = new PostgreSQLDialect();

describe('paging ORDER BY rules', () => {
    it('SQL Server orders set operations and DISTINCT by the first column and needs an ORDER BY to skip rows', () => {
        expect(tsql.SelectListPagingOrderBy).toBe('1');
        expect(tsql.PagingRequiresOrderBy).toBe(true);
    });

    it('PostgreSQL uses its default ORDER BY for every shape and pages without one', () => {
        expect(pg.SelectListPagingOrderBy).toBeNull();
        expect(pg.PagingRequiresOrderBy).toBe(false);
    });
});

describe('string literal forms and query hints', () => {
    it('only PostgreSQL has E-strings and dollar-quoted strings', () => {
        expect([tsql.SupportsEscapeStringLiterals, tsql.SupportsDollarQuotedStrings]).toEqual([false, false]);
        expect([pg.SupportsEscapeStringLiterals, pg.SupportsDollarQuotedStrings]).toEqual([true, true]);
    });

    it('only SQL Server has a trailing query-hint clause', () => {
        expect(tsql.QueryHintKeyword).toBe('OPTION');
        expect(pg.QueryHintKeyword).toBeNull();
    });
});

describe('StringLiteralPrefix', () => {
    it('SQL Server prefixes N only for text outside ASCII', () => {
        expect(tsql.StringLiteralPrefix('plain')).toBe('');
        expect(tsql.StringLiteralPrefix('日本語')).toBe('N');
        expect(tsql.StringLiteralPrefix('café')).toBe('N');
    });

    it('PostgreSQL never prefixes', () => {
        expect(pg.StringLiteralPrefix('日本語')).toBe('');
    });
});

describe('EscapeLikePattern', () => {
    it('SQL Server bracket-escapes [, % and _', () => {
        expect(tsql.EscapeLikePattern('a[b]%c_d\\e')).toBe('a[[]b][%]c[_]d\\e');
    });

    it('PostgreSQL backslash-escapes \\, % and _', () => {
        expect(pg.EscapeLikePattern('a[b]%c_d\\e')).toBe('a[b]\\%c\\_d\\\\e');
    });
});

describe('BooleanParameterValue', () => {
    it('SQL Server binds 1 / 0 and PostgreSQL binds true / false', () => {
        expect([tsql.BooleanParameterValue(true), tsql.BooleanParameterValue(false)]).toEqual([1, 0]);
        expect([pg.BooleanParameterValue(true), pg.BooleanParameterValue(false)]).toEqual([true, false]);
    });
});
