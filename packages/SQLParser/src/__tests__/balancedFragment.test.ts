import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsBalancedSQLFragment, SplitTopLevelAndTerms } from '../balancedFragment.js';

const sqlServer = new SQLServerDialect();
const pg = new PostgreSQLDialect();
const ALLOW_COMMENTS = { AllowComments: true };

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
            'Café = 1',
        ])('accepts %j on SQL Server', (fragment) => {
            expect(IsBalancedSQLFragment(fragment, sqlServer)).toEqual({ IsBalanced: true, Reason: null });
        });

        it.each([
            "Name = 'a' OR Name = 'b'",
            "Name = E'it\\'s (quoted)'",
            "Name = E'x' AND Other = 'y'",
            'Data #>> \'{a,b}\' = \'x\'',
            'Tags @> ARRAY[\'x\']',
            '"Odd)Name" = 1',
            "Name = 'Café Noir'",
            '"Café" = 1',
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
            ['Name = 1 -- comment', 'line comment with no line break after it'],
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

    describe('comments', () => {
        it.each(['Name = 1 /* note */', 'Name = 1 -- note\n'])('refuses %j unless comments are allowed', (fragment) => {
            expect(reasonFor(fragment)).toMatch(/comment/);
            expect(reasonFor(fragment, pg)).toMatch(/comment/);
            expect(IsBalancedSQLFragment(fragment, sqlServer, ALLOW_COMMENTS).IsBalanced).toBe(true);
        });

        it('ignores a parenthesis inside a closed comment when comments are allowed', () => {
            expect(IsBalancedSQLFragment('/* a ) note */ Name = 1', sqlServer, ALLOW_COMMENTS).IsBalanced).toBe(true);
            expect(IsBalancedSQLFragment('Name = 1 -- a ) note\n', pg, ALLOW_COMMENTS).IsBalanced).toBe(true);
        });

        it.each([
            ['SQL Server', sqlServer],
            ['PostgreSQL', pg],
        ])('ends a line comment at a CR, as %s does', (_name, dialect) => {
            // After the CR the parenthesis is code again, so it is counted.
            expect(IsBalancedSQLFragment('Name = 1 -- note\r)', dialect, ALLOW_COMMENTS).Reason).toMatch(/closes a parenthesis/);
            expect(IsBalancedSQLFragment('Name = 1 -- note\r', dialect, ALLOW_COMMENTS).IsBalanced).toBe(true);
        });
    });

    describe('PostgreSQL: what the lexer cannot read the way PostgreSQL does is refused', () => {
        // PostgreSQL reads every character outside ASCII as part of a name: Unicode spaces too, and
        // inside dollar-quote tags. The lexer treats Unicode spaces as whitespace and allows only
        // ASCII tags, so such text is refused outside string literals and quoted identifiers.
        it.each([
            ['Café = 1', 'a name'],
            ['Name = 1', 'a no-break space between tokens'],
            ['Name = 1　', 'an ideographic space'],
            ['Name = $é$x$é$', 'a dollar-quote tag'],
        ])('refuses %j (%s)', (fragment) => {
            expect(reasonFor(fragment, pg)).toMatch(/outside ASCII/);
        });

        it.each([
            ['Name = $$x$$', 'a dollar-quoted string'],
            ['Name = $tag$x$tag$', 'a tagged dollar-quoted string'],
            ['Name = $1', 'a positional parameter'],
        ])('refuses a dollar sign outside a name (%#: %s)', (fragment) => {
            expect(reasonFor(fragment, pg)).toMatch(/dollar/);
        });

        it.each(["Name = E'x'\n'y'", "Name = E'x' 'y'", "Name = E'x' -- note\n'y'"])(
            'refuses an escape string followed by another string literal: %j',
            (fragment) => {
                // PostgreSQL joins string literals separated by a line break and reads the second in
                // escape mode, where the lexer reads it as a plain string.
                expect(IsBalancedSQLFragment(fragment, pg, ALLOW_COMMENTS).Reason).toMatch(/escape string/);
            },
        );
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

        it('accepts an escape string after the operator and a space, where both readings agree', () => {
            expect(reasonFor("Name @@ E'x'", pg)).toBeNull();
        });

        it('leaves @ and # alone on SQL Server, where they are name characters', () => {
            expect(reasonFor("@var = 'x' AND #temp.ID = 1")).toBeNull();
        });
    });
});

describe('SplitTopLevelAndTerms', () => {
    const termsOf = (fragment: string) => SplitTopLevelAndTerms(fragment, sqlServer)?.map(t => t.trim()) ?? null;

    it('splits a chain of top-level ANDs into its terms, as written', () => {
        expect(termsOf("(A = 1) AND (B = 'x AND y') AND [C AND D] = 2")).toEqual(['(A = 1)', "(B = 'x AND y')", '[C AND D] = 2']);
    });

    it('returns a fragment with no top-level AND as its only term', () => {
        expect(SplitTopLevelAndTerms('A = 1', sqlServer)).toEqual(['A = 1']);
        expect(termsOf('(A = 1 AND B = 2)')).toEqual(['(A = 1 AND B = 2)']);
    });

    it('does not split at the AND of a BETWEEN or inside CASE … END', () => {
        expect(termsOf('A NOT BETWEEN 1 AND 2 AND B = 3')).toEqual(['A NOT BETWEEN 1 AND 2', 'B = 3']);
        expect(termsOf('CASE WHEN A = 1 AND B = 2 THEN 1 ELSE 0 END = 1 AND C = 3')).toEqual([
            'CASE WHEN A = 1 AND B = 2 THEN 1 ELSE 0 END = 1',
            'C = 3',
        ]);
    });

    it('returns null for a fragment with a top-level OR, where splitting would change its meaning', () => {
        expect(SplitTopLevelAndTerms('A = 1 OR B = 2 AND C = 3', sqlServer)).toBeNull();
        expect(termsOf('(A = 1 OR B = 2) AND C = 3')).toEqual(['(A = 1 OR B = 2)', 'C = 3']);
        expect(termsOf('CASE WHEN A = 1 OR B = 2 THEN 1 END = 1 AND C = 3')).toEqual(['CASE WHEN A = 1 OR B = 2 THEN 1 END = 1', 'C = 3']);
    });
});
