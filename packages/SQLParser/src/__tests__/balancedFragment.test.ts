import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsBalancedSQLFragment } from '../balancedFragment.js';

const sqlServer = new SQLServerDialect();
const pg = new PostgreSQLDialect();

/** The refusal reason for `fragment`, or `null` when it is balanced. */
const reasonFor = (fragment: string, dialect: SQLParserDialect = sqlServer) => IsBalancedSQLFragment(fragment, dialect).Reason;

describe('IsBalancedSQLFragment', () => {
    describe('balanced fragments', () => {
        it.each([
            '',
            '1=1',
            "Name = 'a' OR Name = 'b'",
            "(Status = 'Open' OR Status = 'Pending') AND (Priority > 2)",
            'ID IN (SELECT ID FROM [__mj].[vwUsers] WHERE IsActive = 1)',
            "Name = 'a) OR (b'",
            "Name = N'it''s (quoted)'",
            '[Odd)Name] = 1 AND [a]]b] = 2',
            '"Odd)Name" = 1',
            '/* a ) comment */ Name = 1',
            "Name = 1 -- a ) comment\n",
        ])('accepts %j on SQL Server', (fragment) => {
            expect(IsBalancedSQLFragment(fragment, sqlServer)).toEqual({ IsBalanced: true, Reason: null });
        });

        it.each([
            "Name = 'a' OR Name = 'b'",
            "Name = E'it\\'s (quoted)'",
            'Name = $$a) OR (b$$',
            'Name = $tag$a) OR (b$tag$',
            'Data #>> \'{a,b}\' = \'x\'',
            'Tags @> ARRAY[\'x\']',
            '"Odd)Name" = 1',
        ])('accepts %j on PostgreSQL', (fragment) => {
            expect(IsBalancedSQLFragment(fragment, pg)).toEqual({ IsBalanced: true, Reason: null });
        });
    });

    describe('fragments that would close the parentheses they are wrapped in', () => {
        it.each([
            '1=1) OR (1=1',
            '1=1)) OR ((1=1',
            "Name = 'a') OR (Name = 'b'",
            "[Name] = 'a') OR ([Name] = 'b'",
            '(1=1)) OR ((1=1)',
            ')',
        ])('refuses %j', (fragment) => {
            expect(reasonFor(fragment)).toMatch(/closes a parenthesis it did not open/);
            expect(reasonFor(fragment, pg)).toMatch(/closes a parenthesis it did not open/);
        });

        it('counts a parenthesis inside a bracket identifier only where brackets are not identifiers', () => {
            // SQL Server reads [a)] as one identifier; PostgreSQL has no bracket identifiers.
            expect(reasonFor('[a)] = 1')).toBeNull();
            expect(reasonFor('[a)] = 1', pg)).toMatch(/closes a parenthesis/);
        });

        it('reads backslash escapes only where escape strings exist', () => {
            // PostgreSQL reads E'\')' as one string holding a quote and a parenthesis; SQL Server has
            // no escape strings, so there the quote ends the literal and the parenthesis is code.
            const fragment = "Name = E'\\')' AND (1=1)";
            expect(reasonFor(fragment, pg)).toBeNull();
            expect(reasonFor(fragment, sqlServer)).not.toBeNull();
        });
    });

    describe('fragments that leave something open', () => {
        it.each(['(1=1', '((1=1)'])('refuses %j', (fragment) => {
            expect(reasonFor(fragment)).toMatch(/leaves a parenthesis open/);
        });

        it.each([
            ["Name = 'a", 'string literal'],
            ["Name = 'it''", 'escaped quote at the end'],
            ['[Name = 1', 'bracket identifier'],
            ['"Name = 1', 'double-quoted identifier'],
            ['Name = 1 /* comment', 'block comment'],
            ['Name = 1 /* nested /* comment */', 'nested block comment'],
            ['Name = 1 -- comment', 'line comment with no newline after it'],
        ])('refuses %j (%s)', (fragment) => {
            expect(reasonFor(fragment)).toMatch(/unterminated/);
        });

        it.each([
            "Name = E'it\\'s",
            'Name = $$a',
            'Name = $tag$a$$',
        ])('refuses %j on PostgreSQL', (fragment) => {
            expect(reasonFor(fragment, pg)).toMatch(/unterminated/);
        });
    });

    it('refuses a statement separator', () => {
        expect(reasonFor('1=1; SELECT 1')).toMatch(/statement separator/);
        expect(reasonFor("Name = ';'")).toBeNull();
    });

    describe('PostgreSQL operator characters directly before a string', () => {
        // The lexer reads @ and # as name characters (SQL Server variables and temp tables), but
        // PostgreSQL reads them as operators, so `@E'…'` starts an escape string there and `@$$`
        // a dollar-quoted one. The fragment is refused rather than read two ways.
        it.each([
            "Name @@E'x'",
            "Data #E'x'",
            "Name @@$$x$$",
            "Name @@$tag$x$tag$",
            "Name = 1E'x'",
        ])('refuses %j', (fragment) => {
            expect(reasonFor(fragment, pg)).toMatch(/ambiguous/);
        });

        it('accepts the same characters with a space, where both readings agree', () => {
            expect(reasonFor("Name @@ E'x'", pg)).toBeNull();
            expect(reasonFor('Name @@ $$x$$', pg)).toBeNull();
        });

        it('leaves @ and # alone on SQL Server, where they are name characters', () => {
            expect(reasonFor("@var = 'x' AND #temp.ID = 1")).toBeNull();
        });
    });
});
