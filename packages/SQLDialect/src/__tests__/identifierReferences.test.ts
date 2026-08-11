/**
 * FindReferencedIdentifiers
 *
 * The detector behind field-level security's predicate gate: an ExtraFilter or OrderBy naming
 * a field the user cannot read must be rejected, because output stripping alone leaks — a user
 * denied `Salary` can send `ExtraFilter: "Salary > 200000"` and reconstruct values from which
 * rows return, without the column ever appearing in a result.
 *
 * The bias here is deliberately opposite to the rest of the validator: a false positive rejects
 * a legitimate query and the caller rewrites it; a false negative silently leaks the data the
 * feature exists to protect.
 */

import { describe, it, expect } from 'vitest';
import { FindReferencedIdentifiers } from '../identifierReferences';

const find = (expr: string, ids: string[]) => FindReferencedIdentifiers(expr, ids);

describe('FindReferencedIdentifiers', () => {
    describe('detection', () => {
        it('finds a bare identifier in a comparison', () => {
            expect(find('Salary > 200000', ['Salary'])).toEqual(['Salary']);
        });

        it('matches case-insensitively', () => {
            expect(find('salary > 200000', ['Salary'])).toEqual(['Salary']);
            expect(find('SALARY > 200000', ['Salary'])).toEqual(['Salary']);
        });

        it('returns the candidate in its ORIGINAL casing, not the expression casing', () => {
            // The caller renders this into an error message, which should read like metadata.
            expect(find('salary > 1', ['Salary'])).toEqual(['Salary']);
        });

        it('finds bracketed identifiers', () => {
            expect(find('[Salary] > 200000', ['Salary'])).toEqual(['Salary']);
        });

        it('finds double-quoted identifiers', () => {
            expect(find('"Salary" > 200000', ['Salary'])).toEqual(['Salary']);
        });

        it('finds a schema/table-qualified reference', () => {
            expect(find('e.Salary > 200000', ['Salary'])).toEqual(['Salary']);
        });

        it('finds an identifier in an ORDER BY with a direction', () => {
            expect(find('Salary DESC', ['Salary'])).toEqual(['Salary']);
        });

        it('finds an identifier inside a function call', () => {
            expect(find('ISNULL(Salary, 0) > 100', ['Salary'])).toEqual(['Salary']);
        });

        it('finds an identifier inside a subquery', () => {
            const expr = "ID IN (SELECT EmployeeID FROM Payroll WHERE Salary > 100)";
            expect(find(expr, ['Salary'])).toEqual(['Salary']);
        });

        it('deduplicates repeated references', () => {
            expect(find('Salary > 1 AND Salary < 9', ['Salary'])).toEqual(['Salary']);
        });

        it('finds several distinct denied fields', () => {
            const hits = find('Salary > 1 AND Bonus < 2', ['Salary', 'Bonus']);
            expect(hits.sort()).toEqual(['Bonus', 'Salary']);
        });
    });

    describe('non-matches', () => {
        it('does not match a longer identifier with the same prefix', () => {
            expect(find('SalaryBand = 3', ['Salary'])).toEqual([]);
        });

        it('does not match a longer identifier with the same suffix', () => {
            expect(find('BaseSalary = 3', ['Salary'])).toEqual([]);
        });

        it('returns empty when no candidate appears', () => {
            expect(find('Status = 1 AND IsActive = 1', ['Salary'])).toEqual([]);
        });

        it('returns empty for a blank or missing expression', () => {
            expect(find('', ['Salary'])).toEqual([]);
            expect(FindReferencedIdentifiers(null as unknown as string, ['Salary'])).toEqual([]);
        });

        it('returns empty when no candidates are supplied', () => {
            expect(find('Salary > 1', [])).toEqual([]);
        });

        it('ignores blank candidate names rather than matching everything', () => {
            expect(find('Salary > 1', ['', '   '])).toEqual([]);
        });
    });

    describe('field names outside the identifier character class (regression: silent fail-open)', () => {
        // An earlier version tokenized the SQL with [A-Z_][A-Z0-9_]* and looked tokens up in the
        // denied set. Every name below was therefore UNMATCHABLE and silently permitted. Column
        // names come from the database, so none of these shapes can be assumed away.
        it('matches a name containing a space (SQL Server bracket-quoted)', () => {
            expect(find('[Base Salary] > 100', ['Base Salary'])).toEqual(['Base Salary']);
        });

        it('matches a name containing a space (PostgreSQL double-quoted)', () => {
            expect(find('"Base Salary" > 100', ['Base Salary'])).toEqual(['Base Salary']);
        });

        it('matches a name containing regex metacharacters', () => {
            expect(find('[Salary%] > 100', ['Salary%'])).toEqual(['Salary%']);
            expect(find('[Rate(%)] > 1', ['Rate(%)'])).toEqual(['Rate(%)']);
            expect(find('[A.B] > 1', ['A.B'])).toEqual(['A.B']);
        });

        it('matches a non-ASCII name', () => {
            expect(find('Salário > 100', ['Salário'])).toEqual(['Salário']);
        });

        it('matches a name with a leading underscore or digits', () => {
            expect(find('_Salary2 > 1', ['_Salary2'])).toEqual(['_Salary2']);
        });

        it('matches a hyphenated name', () => {
            expect(find('[Base-Salary] > 1', ['Base-Salary'])).toEqual(['Base-Salary']);
        });
    });

    describe('dialect agnosticism — no SQL grammar is parsed', () => {
        it('matches inside SQL Server syntax', () => {
            expect(find("ISNULL([Salary], 0) > 1 AND Name LIKE N'x%'", ['Salary'])).toEqual(['Salary']);
        });

        it('matches inside PostgreSQL syntax (cast, ILIKE, regex operator)', () => {
            expect(find('"Salary"::numeric > 1', ['Salary'])).toEqual(['Salary']);
            expect(find('Name ILIKE \'x%\' AND Salary > 1', ['Salary'])).toEqual(['Salary']);
            expect(find("Name ~ '^a' AND Salary > 1", ['Salary'])).toEqual(['Salary']);
        });

        it('matches inside PostgreSQL dollar-quoted text', () => {
            expect(find('Notes = $$Salary$$', ['Salary'])).toEqual(['Salary']);
        });

        it('matches across newlines and mixed whitespace', () => {
            expect(find('Status = 1\n   AND\tSalary > 1', ['Salary'])).toEqual(['Salary']);
        });

        it('matches a backtick-quoted identifier', () => {
            expect(find('`Salary` > 1', ['Salary'])).toEqual(['Salary']);
        });
    });

    describe('overlapping candidate names', () => {
        it('prefers the longer name when one is a prefix of another', () => {
            const hits = find('[Salary Band] = 3', ['Salary', 'Salary Band']);
            expect(hits).toEqual(['Salary Band']);
        });

        it('still finds the short name when only it is present', () => {
            expect(find('Salary > 1', ['Salary', 'Salary Band'])).toEqual(['Salary']);
        });

        it('finds both when both are genuinely present', () => {
            const hits = find('Salary > 1 AND [Salary Band] = 3', ['Salary', 'Salary Band']);
            expect(hits.sort()).toEqual(['Salary', 'Salary Band']);
        });
    });

    describe('input hygiene', () => {
        it('trims candidate names (nchar-padded metadata)', () => {
            expect(find('Salary > 1', ['  Salary  '])).toEqual(['  Salary  ']);
        });

        it('terminates and returns nothing on a candidate list of only blanks', () => {
            expect(find('Salary > 1', ['', '  '])).toEqual([]);
        });

        it('does not treat a candidate as a regex pattern', () => {
            // If the name were interpolated raw, '.' would match any character and this would hit.
            expect(find('SalaryX > 1', ['Salar.'])).toEqual([]);
        });

        it('handles a very long expression without pathological behavior', () => {
            const expr = Array.from({ length: 500 }, (_, i) => `Col${i} = ${i}`).join(' AND ') + ' AND Salary > 1';
            expect(find(expr, ['Salary'])).toEqual(['Salary']);
        });
    });

    describe('conservative bias — these SHOULD match even though they are false positives', () => {
        it('matches a denied name inside a string literal', () => {
            // Rejecting this costs a caller one rewrite. NOT rejecting it would require
            // proving the literal can never be an injection or extraction vector, which is
            // exactly the reasoning that produces leaks.
            expect(find("Notes = 'Salary review pending'", ['Salary'])).toEqual(['Salary']);
        });

        it('matches a denied name inside a SQL comment', () => {
            expect(find('Status = 1 -- Salary handled elsewhere', ['Salary'])).toEqual(['Salary']);
        });

        it('matches a denied name used as a column alias', () => {
            expect(find('Base AS Salary', ['Salary'])).toEqual(['Salary']);
        });
    });
});
