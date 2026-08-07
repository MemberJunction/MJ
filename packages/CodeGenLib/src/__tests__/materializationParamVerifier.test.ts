import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { verifyParamRole } from '../Database/materializationParamVerifier';

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
            const r = verifyParamRole(
                [
                    "SELECT ID, Status FROM Orders WHERE Status = 'Active'",
                    "SELECT ID, Status FROM Orders WHERE Status = 'Closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('numeric equality on a single column', () => {
            const r = verifyParamRole(
                [
                    'SELECT ID FROM Orders WHERE ChapterID = 42',
                    'SELECT ID FROM Orders WHERE ChapterID = 99',
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('ChapterID');
        });

        it('range operator (>) is a re-applicable row filter', () => {
            const r = verifyParamRole(
                [
                    'SELECT ID FROM Members WHERE Score > 10',
                    'SELECT ID FROM Members WHERE Score > 250',
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Score');
        });

        it('IN list (array param) with varying length collapses to a single bag site', () => {
            const r = verifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status IN ('A','B')",
                    "SELECT ID FROM Orders WHERE Status IN ('C','D','E')",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('only the varied predicate counts; a sibling fixed predicate is ignored', () => {
            const r = verifyParamRole(
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
            const r = verifyParamRole(
                [
                    "SELECT o.ID FROM Orders o WHERE o.Status = 'Active'",
                    "SELECT o.ID FROM Orders o WHERE o.Status = 'Closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('column-on-the-right form (literal = column) is still a row filter', () => {
            const r = verifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE 'Active' = Status",
                    "SELECT ID FROM Orders WHERE 'Closed' = Status",
                ],
                tsql,
            );
            expect(r.role).toBe('RowFilter');
            expect(r.filterColumn).toBe('Status');
        });

        it('PostgreSQL column shape ({expr:{value}}) resolves correctly', () => {
            const r = verifyParamRole(
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
            const r = verifyParamRole(
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
            const r = verifyParamRole(
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
            const r = verifyParamRole(
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
            const r = verifyParamRole(
                [
                    "SELECT 'Active' AS Tag, ID FROM Orders",
                    "SELECT 'Closed' AS Tag, ID FROM Orders",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal inside a WHERE subquery is tainted', () => {
            const r = verifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE ID IN (SELECT OrderID FROM Items WHERE Sku = 'A')",
                    "SELECT ID FROM Orders WHERE ID IN (SELECT OrderID FROM Items WHERE Sku = 'B')",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal wrapped in a function is tainted (left side is not a plain column)', () => {
            const r = verifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE LOWER(Status) = 'active'",
                    "SELECT ID FROM Orders WHERE LOWER(Status) = 'closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal in a JOIN ON clause is tainted (not the top-level WHERE)', () => {
            const r = verifyParamRole(
                [
                    "SELECT o.ID FROM Orders o JOIN Ref r ON r.ID = o.RefID AND r.Type = 'A'",
                    "SELECT o.ID FROM Orders o JOIN Ref r ON r.ID = o.RefID AND r.Type = 'B'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('a param that hits BOTH a clean WHERE predicate and the projection is refused', () => {
            const r = verifyParamRole(
                [
                    "SELECT 'Active' AS Tag, ID FROM Orders WHERE Status = 'Active'",
                    "SELECT 'Closed' AS Tag, ID FROM Orders WHERE Status = 'Closed'",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('literal in a HAVING clause is tainted (not the top-level WHERE)', () => {
            const r = verifyParamRole(
                [
                    'SELECT ChapterID, COUNT(*) AS c FROM Orders GROUP BY ChapterID HAVING COUNT(*) > 5',
                    'SELECT ChapterID, COUNT(*) AS c FROM Orders GROUP BY ChapterID HAVING COUNT(*) > 10',
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('a multi-statement render is refused (cannot verify beyond the first statement)', () => {
            const r = verifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active'; SELECT 1 AS x",
                    "SELECT ID FROM Orders WHERE Status = 'Closed'; SELECT 1 AS x",
                ],
                tsql,
            );
            expect(r.role).toBe('Unbounded');
        });

        it('value affecting multiple columns is refused (not modeled in v1)', () => {
            const r = verifyParamRole(
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
            const r = verifyParamRole(
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
            const r = verifyParamRole(
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
            const r = verifyParamRole(["SELECT ID FROM Orders WHERE Status = 'Active'"], tsql);
            expect(r.role).toBe('Unbounded');
            expect(r.reason).toMatch(/at least 2/i);
        });
    });

    describe('Structural — the SQL shape changes with the value (Bucket 2 candidate)', () => {
        it('an extra conjunct appearing/disappearing is structural, not a row filter', () => {
            const r = verifyParamRole(
                [
                    "SELECT ID FROM Orders WHERE Status = 'Active'",
                    "SELECT ID FROM Orders WHERE Status = 'Active' AND Region = 'East'",
                ],
                tsql,
            );
            expect(r.role).toBe('Structural');
        });

        it('different projected columns is structural', () => {
            const r = verifyParamRole(
                [
                    'SELECT ID FROM Orders',
                    'SELECT ID, Region FROM Orders',
                ],
                tsql,
            );
            expect(r.role).toBe('Structural');
        });
    });
});
