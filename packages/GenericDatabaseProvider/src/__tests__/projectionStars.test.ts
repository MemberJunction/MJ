/**
 * FindProjectionStars: the `*` / `alias.*` select items whose columns reach a saved query's result
 * only as output columns. Field-level security runs such a star and drops the denied columns;
 * every other star stays refused by the token gate.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect } from '@memberjunction/sql-dialect';
import { FindProjectionStars } from '../fieldSecurity/projectionStars';

const SS = GetDialect('sqlserver');
const PG = GetDialect('postgresql');

/** The text at each projection star's offset (always `*`), in order, and how many there are. */
function stars(sql: string, dialect = SS): number[] {
    const offsets = [...FindProjectionStars(sql, dialect)].sort((a, b) => a - b);
    for (const offset of offsets) expect(sql[offset]).toBe('*');
    return offsets;
}

describe('FindProjectionStars', () => {
    it('finds a plain star and a qualified star in the statement\'s select list', () => {
        expect(stars('SELECT * FROM vwPeople')).toEqual([7]);
        expect(stars('SELECT p.*, j.ID FROM vwPeople p JOIN vwProjects j ON j.OwnerID = p.ID')).toHaveLength(1);
        expect(stars('SELECT p . * FROM vwPeople p')).toHaveLength(1);
    });

    it('follows rows through CTE bodies, derived tables and APPLY', () => {
        expect(stars('WITH x AS (SELECT * FROM vwPeople) SELECT * FROM x')).toHaveLength(2);
        expect(stars('SELECT d.* FROM (SELECT * FROM vwPeople) d')).toHaveLength(2);
        expect(stars('SELECT a.*, b.* FROM vwPeople a CROSS APPLY (SELECT * FROM vwProjects j WHERE j.OwnerID = a.ID) b')).toHaveLength(3);
    });

    it('finds a star in a nested WITH on PostgreSQL', () => {
        expect(stars('SELECT * FROM (WITH x AS (SELECT * FROM vwPeople) SELECT * FROM x) q', PG)).toHaveLength(3);
    });

    const refused: Array<[string, string]> = [
        ['DISTINCT', 'SELECT DISTINCT * FROM vwPeople'],
        ['GROUP BY', 'SELECT * FROM vwPeople GROUP BY ID'],
        ['a set operation branch', 'SELECT * FROM vwPeople UNION SELECT * FROM vwPeople'],
        ['a value subquery', 'SELECT ID FROM vwProjects WHERE OwnerID IN (SELECT * FROM vwPeople)'],
        ['EXISTS', 'SELECT ID FROM vwProjects WHERE EXISTS (SELECT * FROM vwPeople)'],
        ['a function of the row', 'SELECT CHECKSUM(*) FROM vwPeople'],
        ['FOR JSON', 'SELECT * FROM vwPeople FOR JSON PATH'],
        ['NATURAL JOIN', 'SELECT * FROM vwPeople NATURAL JOIN vwProjects'],
        ['an ordinal ORDER BY', 'SELECT * FROM vwPeople ORDER BY 2'],
        ['PIVOT', 'SELECT * FROM (SELECT * FROM vwPeople) s PIVOT (MAX(Name) FOR DepartmentID IN ([a])) p'],
        ['stacked statements', 'SELECT * FROM vwPeople; SELECT 1'],
        ['text that is not read completely', "SELECT * FROM vwPeople WHERE Name = 'a','b'"],
    ];

    for (const [what, sql] of refused) {
        it(`finds none for ${what}`, () => {
            expect(stars(sql)).toEqual([]);
        });
    }

    it('finds none for a row value on PostgreSQL', () => {
        expect(stars('SELECT row_to_json(p) FROM (SELECT * FROM vwPeople) p', PG)).toEqual([]);
    });

    it('keeps the stars of qualifying blocks when another block of the statement does not qualify', () => {
        // The CTE body qualifies; the outer DISTINCT does not, and is left to the token gate.
        expect(stars('WITH x AS (SELECT * FROM vwPeople) SELECT DISTINCT * FROM x')).toHaveLength(1);
    });
});
