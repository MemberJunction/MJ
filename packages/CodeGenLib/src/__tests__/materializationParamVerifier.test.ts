import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { VerifyParamRole } from '../Database/materializationParamVerifier';

/**
 * Phase 2b — the render-and-diff AST oracle (plan §9 Bucket 1, §10 asymmetric-risk).
 * Each test feeds full-query SQL variants (what the renderer would emit for distinct values of
 * ONE parameter, all others fixed) and asserts the verified ParamRole. Soundness bias: anything
 * not provably a clean top-level conjunctive WHERE row filter must NOT be classified RowFilter.
 */
describe('verifyParamRole (render-and-diff verifier)', () => {
    const tsql = new SQLServerDialect();
    const pg = new PostgreSQLDialect();

    describe('RowFilter — clean top-level conjunctive WHERE predicates', () => {
        it('string equality on a single column', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID, Status FROM Orders WHERE Status = 'Active'",
                    "SELECT ID, Status FROM Orders WHERE Status = 'Closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
            expect(r.filterOperator).toBe('=');
            expect(r.filterKind).toBe('scalar');
        });

        it('numeric equality on a single column', () => {
            const r = VerifyParamRole(
                [
                    'SELECT ID FROM Orders WHERE ChapterID = 42',
                    'SELECT ID FROM Orders WHERE ChapterID = 99',
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('ChapterID');
            expect(r.filterOperator).toBe('=');
            expect(r.filterKind).toBe('scalar');
        });

        it('range operator (>) is a re-applicable row filter, operator captured', () => {
            const r = VerifyParamRole(
                [
                    'SELECT ID FROM Members WHERE Score > 10',
                    'SELECT ID FROM Members WHERE Score > 250',
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Score');
            expect(r.filterOperator).toBe('>');
            expect(r.filterKind).toBe('scalar');
        });

        it('range with column-on-the-right FLIPS the operator (100 < Score ⟺ Score > 100)', () => {
            // The critical directionality case: read-time injection emits `column <op> value`, so a
            // `value < column` predicate must be recorded as the flipped `>` — else the materialized read
            // would invert the predicate and silently return the complementary row set.
            const r = VerifyParamRole(
                [
                    'SELECT ID FROM Members WHERE 100 < Score',
                    'SELECT ID FROM Members WHERE 250 < Score',
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Score');
            expect(r.filterOperator).toBe('>'); // flipped from the written `<`
            expect(r.filterKind).toBe('scalar');
        });

        it('IN list (array param) with varying length → list kind, IN operator', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status IN ('A','B')",
                    "SELECT ID FROM Orders WHERE Status IN ('C','D','E')",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
            expect(r.filterOperator).toBe('IN');
            expect(r.filterKind).toBe('list');
        });

        it('only the varied predicate counts; a sibling fixed predicate is ignored', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active' AND ChapterID = 42",
                    "SELECT ID FROM Orders WHERE Status = 'Closed' AND ChapterID = 42",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('table-qualified column resolves to the bare column name', () => {
            const r = VerifyParamRole(
                [
                    "SELECT o.ID FROM Orders o WHERE o.Status = 'Active'",
                    "SELECT o.ID FROM Orders o WHERE o.Status = 'Closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('column-on-the-right form (literal = column) is still a row filter (= is symmetric)', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE 'Active' = Status",
                    "SELECT ID FROM Orders WHERE 'Closed' = Status",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
            expect(r.filterOperator).toBe('='); // symmetric — flip is a no-op
            expect(r.filterKind).toBe('scalar');
        });

        it('PostgreSQL column shape ({expr:{value}}) resolves correctly', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID, Status FROM Orders WHERE Status = 'Active'",
                    "SELECT ID, Status FROM Orders WHERE Status = 'Closed'",
                ],
                pg,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('BETWEEN bounds on a single column is a row filter', () => {
            const r = VerifyParamRole(
                [
                    'SELECT ID FROM Members WHERE Score BETWEEN 10 AND 50',
                    'SELECT ID FROM Members WHERE Score BETWEEN 200 AND 50',
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Score');
        });

        it('agrees across 3 variants on the same column', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'A'",
                    "SELECT ID FROM Orders WHERE Status = 'B'",
                    "SELECT ID FROM Orders WHERE Status = 'C'",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });
    });

    describe('Unbounded — tainted positions are refused (read-time filtering would be unsound)', () => {
        it('predicate under OR is tainted (re-filtering would drop the OR-branch rows)', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active' OR IsAdmin = 1",
                    "SELECT ID FROM Orders WHERE Status = 'Closed' OR IsAdmin = 1",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
            expect(r.reason).toMatch(/clean top-level conjunctive WHERE/i);
        });

        it('literal in the SELECT projection is not a row filter', () => {
            const r = VerifyParamRole(
                [
                    "SELECT 'Active' AS Tag, ID FROM Orders",
                    "SELECT 'Closed' AS Tag, ID FROM Orders",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal inside a WHERE subquery is tainted', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE ID IN (SELECT OrderID FROM Items WHERE Sku = 'A')",
                    "SELECT ID FROM Orders WHERE ID IN (SELECT OrderID FROM Items WHERE Sku = 'B')",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal wrapped in a function is tainted (left side is not a plain column)', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE LOWER(Status) = 'active'",
                    "SELECT ID FROM Orders WHERE LOWER(Status) = 'closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal in a JOIN ON clause is tainted (not the top-level WHERE)', () => {
            const r = VerifyParamRole(
                [
                    "SELECT o.ID FROM Orders o JOIN Ref r ON r.ID = o.RefID AND r.Type = 'A'",
                    "SELECT o.ID FROM Orders o JOIN Ref r ON r.ID = o.RefID AND r.Type = 'B'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('a param that hits BOTH a clean WHERE predicate and the projection is refused', () => {
            const r = VerifyParamRole(
                [
                    "SELECT 'Active' AS Tag, ID FROM Orders WHERE Status = 'Active'",
                    "SELECT 'Closed' AS Tag, ID FROM Orders WHERE Status = 'Closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal in a HAVING clause is tainted (not the top-level WHERE)', () => {
            const r = VerifyParamRole(
                [
                    'SELECT ChapterID, COUNT(*) AS c FROM Orders GROUP BY ChapterID HAVING COUNT(*) > 5',
                    'SELECT ChapterID, COUNT(*) AS c FROM Orders GROUP BY ChapterID HAVING COUNT(*) > 10',
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('a multi-statement render is refused (cannot verify beyond the first statement)', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active'; SELECT 1 AS x",
                    "SELECT ID FROM Orders WHERE Status = 'Closed'; SELECT 1 AS x",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('value affecting multiple columns is refused (not modeled in v1)', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE FromCode = 'x' AND ToCode = 'x'",
                    "SELECT ID FROM Orders WHERE FromCode = 'y' AND ToCode = 'y'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
            expect(r.reason).toMatch(/multiple columns/i);
        });

        it('no observable effect (identical SQL) cannot prove a row filter', () => {
            const r = VerifyParamRole(
                [
                    'SELECT ID FROM Orders WHERE ChapterID = 42',
                    'SELECT ID FROM Orders WHERE ChapterID = 42',
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
            expect(r.reason).toMatch(/no observable SQL change/i);
        });

        it('a variant that fails to parse forces a refuse', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active'",
                    'SELECT FROM WHERE (((( totally broken',
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
            expect(r.reason).toMatch(/failed to parse/i);
        });

        it('fewer than 2 variants cannot be verified', () => {
            const r = VerifyParamRole(["SELECT ID FROM Orders WHERE Status = 'Active'"], tsql);
            expect(r.role).toBe('Unbounded');
            expect(r.reason).toMatch(/at least 2/i);
        });
    });

    describe('Structural — the SQL shape changes with the value (Bucket 2 candidate)', () => {
        it('an extra conjunct appearing/disappearing is structural, not a row filter', () => {
            const r = VerifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active'",
                    "SELECT ID FROM Orders WHERE Status = 'Active' AND Region = 'East'",
                ],
                tsql,
            );
            expect(r.role).toBe('Structural');
        });

        it('different projected columns is structural', () => {
            const r = VerifyParamRole(
                [
                    'SELECT ID FROM Orders',
                    'SELECT ID, Region FROM Orders',
                ],
                tsql,
            );
            expect(r.role).toBe('Structural');
        });
    });

    describe('structure read from the author\'s text', () => {
        const pair = (a: string, b: string, dialect: SQLServerDialect | PostgreSQLDialect = tsql) => VerifyParamRole([a, b], dialect);

        it('a WITH-headed query: the outer WHERE is the top-level WHERE', () => {
            const cte = 'WITH r AS (SELECT ID, Status FROM Orders)';
            const r = pair(`${cte} SELECT ID FROM r WHERE Status = 'A'`, `${cte} SELECT ID FROM r WHERE Status = 'B'`);
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('a literal inside a CTE body is not the top-level WHERE', () => {
            const r = pair(
                "WITH r AS (SELECT ID FROM Orders WHERE Status = 'A') SELECT ID FROM r",
                "WITH r AS (SELECT ID FROM Orders WHERE Status = 'B') SELECT ID FROM r",
            );
            expect(r.role).toBe('Unbounded');
        });

        it('a conjunct inside a parenthesized AND group is still clean', () => {
            const r = pair(
                "SELECT ID FROM Orders WHERE (Status = 'A' AND ChapterID = 1) AND Region = 'E'",
                "SELECT ID FROM Orders WHERE (Status = 'B' AND ChapterID = 1) AND Region = 'E'",
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('AND binds tighter than OR: a predicate in `a AND b OR c` is tainted', () => {
            const r = pair(
                "SELECT ID FROM Orders WHERE Status = 'A' AND ChapterID = 1 OR IsAdmin = 1",
                "SELECT ID FROM Orders WHERE Status = 'B' AND ChapterID = 1 OR IsAdmin = 1",
            );
            expect(r.role).toBe('Unbounded');
        });

        it('a predicate under NOT is tainted', () => {
            const r = pair("SELECT ID FROM Orders WHERE NOT Status = 'A'", "SELECT ID FROM Orders WHERE NOT Status = 'B'");
            expect(r.role).toBe('Unbounded');
        });

        it('a literal inside a CASE in the WHERE is tainted', () => {
            const r = pair(
                "SELECT ID FROM Orders WHERE CASE WHEN Status = 'A' AND ID > 0 THEN 1 ELSE 0 END = 1",
                "SELECT ID FROM Orders WHERE CASE WHEN Status = 'B' AND ID > 0 THEN 1 ELSE 0 END = 1",
            );
            expect(r.role).toBe('Unbounded');
        });

        it('BETWEEN bounds are a list value; the conjunct after the BETWEEN is separate', () => {
            const r = pair(
                'SELECT ID FROM Members WHERE Score BETWEEN 10 AND 50 AND ChapterID = 2',
                'SELECT ID FROM Members WHERE Score BETWEEN 20 AND 50 AND ChapterID = 2',
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Score');
            expect(r.filterOperator).toBe('BETWEEN');
            expect(r.filterKind).toBe('list');
        });

        it('comments and whitespace do not count as a change of shape', () => {
            const r = pair(
                "SELECT ID FROM Orders /* a */ WHERE Status = 'A'",
                "SELECT ID\nFROM Orders WHERE Status = 'B' -- b",
            );
            expect(r.role).toBe('RowFilter');
        });

        it('a literal whose category changes (string to number) is a change of shape', () => {
            const r = pair("SELECT ID FROM Orders WHERE Code = 'A'", 'SELECT ID FROM Orders WHERE Code = 1');
            expect(r.role).toBe('Structural');
        });

        it('a SELECT ... INTO cannot host a clean row filter', () => {
            const r = pair("SELECT ID INTO #t FROM Orders WHERE Status = 'A'", "SELECT ID INTO #t FROM Orders WHERE Status = 'B'");
            expect(r.role).toBe('Unbounded');
        });

        it('a UNION cannot host a clean row filter', () => {
            const r = pair(
                "SELECT ID FROM Orders WHERE Status = 'A' UNION SELECT ID FROM Archive",
                "SELECT ID FROM Orders WHERE Status = 'B' UNION SELECT ID FROM Archive",
            );
            expect(r.role).toBe('Unbounded');
        });

        it('PostgreSQL: a quoted column resolves to its name; TRUE/FALSE are literals', () => {
            const r = pair('SELECT "ID" FROM "Orders" WHERE "IsActive" = TRUE', 'SELECT "ID" FROM "Orders" WHERE "IsActive" = FALSE', pg);
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('IsActive');
        });
    });
});
