/**
 * A condition (WHERE, HAVING, QUALIFY, JOIN … ON) is one expression. A comma at its top level is
 * a mistake, such as a value list written without IN, and the document is not read completely.
 */
import { describe, it, expect } from 'vitest';
import { CodesOf, PLATFORMS, Parse, ParseClean } from './helpers.js';

describe.each(PLATFORMS)('a top-level comma in a condition (%s)', (_name, dialect) => {
    const cases: ReadonlyArray<readonly [string, string]> = [
        ['WHERE', "SELECT ID FROM Orders WHERE Status = 'a','b' AND X = 1"],
        ['HAVING', 'SELECT ID FROM Orders GROUP BY ID HAVING COUNT(*) > 1, 2'],
        ['JOIN … ON', "SELECT o.ID FROM Orders o JOIN C c ON c.ID = o.ID, 'b' WHERE 1 = 1"],
    ];

    for (const [clause, sql] of cases) {
        it(`is a diagnostic in ${clause}`, () => {
            const doc = Parse(sql, dialect);
            expect(doc.IsComplete).toBe(false);
            expect(CodesOf(doc)).toContain('SQL_UNKNOWN_SYNTAX');
        });
    }

    it('points at the comma in a WHERE', () => {
        const doc = Parse("SELECT ID FROM Orders WHERE Status = 'a','b' AND X = 1", dialect);
        expect(doc.Diagnostics.map(d => doc.Text(d.Span))).toEqual([',']);
    });

    it('does not report commas inside parentheses', () => {
        ParseClean("SELECT ID FROM Orders WHERE Status IN ('a', 'b') AND COALESCE(X, 0) = 1", dialect);
        ParseClean('SELECT ID FROM Orders GROUP BY ID HAVING MAX(COALESCE(X, 0)) > 1', dialect);
        ParseClean("SELECT ID FROM Orders WHERE EXISTS (SELECT a, b FROM T WHERE T.ID = Orders.ID)", dialect);
    });

    it('leaves the condition readable to the analyses', () => {
        const doc = Parse("SELECT ID FROM Orders WHERE Status = 'a','b'", dialect);
        expect(doc.TableReferences().Complete).toBe(false);
        expect(doc.IsReadOnly().Value.IsReadOnly).toBe(false);
    });
});
