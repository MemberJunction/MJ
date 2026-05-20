/**
 * Tests for `RenderPipeline.applyMaxRows` — the row-cap pass that injects
 * `TOP N` (SQL Server) or `LIMIT N` (PostgreSQL) onto the outermost SELECT
 * when a `MaxRows` safety limit is supplied.
 *
 * Coverage:
 *   - Plain SELECT — TOP/LIMIT injected on outermost projection.
 *   - CTE queries (`WITH … SELECT …`) — cap applied to the outermost SELECT
 *     after the CTE block, not inside any CTE definition.
 *   - CTE with an inner `TOP N` in the definition — inner cap preserved,
 *     outer cap still injected.
 *   - Explicit outermost TOP — left untouched (caller's cap wins).
 *   - PostgreSQL CTE — `LIMIT N` appended after the outermost SELECT.
 *   - Mutations (INSERT/UPDATE/DELETE) — left untouched.
 *
 * `applyMaxRows` is a private method, so the tests drive it via
 * `RenderPipeline.Run({ MaxRows })` — the same entry the GraphQL `RunQuery`
 * layer uses at runtime.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { RenderPipeline } from '../renderPipeline';

afterEach(() => {
    vi.restoreAllMocks();
});

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as ReturnType<typeof Metadata.Provider>);
}

describe('RenderPipeline.applyMaxRows', () => {

    it('injects TOP into a plain SELECT (SQL Server)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+10\b/i);
    });

    it('injects TOP onto the outermost SELECT of a CTE query', () => {
        stubMetadata();
        const sql = `WITH x AS (SELECT 1 AS a) SELECT * FROM x`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        // The outermost SELECT (after the CTE block) must have TOP 10.
        expect(result.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
    });

    it('injects TOP onto the outermost SELECT of a multi-CTE self-join query', () => {
        stubMetadata();
        const sql = `WITH MemberEvents AS (
    SELECT MemberID, EventID FROM vwEventRegistrations
),
SharedEvents AS (
    SELECT e1.MemberID AS A, e2.MemberID AS B, COUNT(*) AS Shared
    FROM MemberEvents e1
    INNER JOIN MemberEvents e2 ON e1.EventID = e2.EventID
    WHERE e1.MemberID < e2.MemberID
    GROUP BY e1.MemberID, e2.MemberID
)
SELECT * FROM SharedEvents ORDER BY Shared DESC`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
    });

    it('preserves an inner TOP inside a CTE while injecting the outer cap', () => {
        stubMetadata();
        const sql = `WITH x AS (SELECT TOP 100 * FROM Members) SELECT * FROM x`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        // Inner CTE's TOP 100 must be preserved (AST sqlify wraps identifiers in [])
        expect(result.FinalSQL).toMatch(/WITH\s+\[?x\]?\s+AS\s+\(SELECT\s+TOP\s+100/i);
        // Outermost SELECT must have TOP 10 injected
        expect(result.FinalSQL).toMatch(/\)\s*SELECT\s+TOP\s+10\b/i);
    });

    it('respects an explicit outermost TOP (no double-injection)', () => {
        stubMetadata();
        const result = RenderPipeline.Run('SELECT TOP 5 * FROM Members', {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/SELECT\s+TOP\s+5\b/i);
        expect(result.FinalSQL).not.toMatch(/TOP\s+10\b/i);
    });

    it('appends LIMIT to a CTE query on PostgreSQL', () => {
        stubMetadata();
        const sql = `WITH x AS (SELECT 1 AS a) SELECT * FROM x`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'postgresql',
            MaxRows: 10,
        });
        expect(result.FinalSQL).toMatch(/LIMIT\s+10\b/i);
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });

    it('does not modify an INSERT statement', () => {
        stubMetadata();
        const sql = `INSERT INTO Members (Name) VALUES ('foo')`;
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 10,
        });
        expect(result.FinalSQL).not.toMatch(/\bTOP\s+10\b/i);
    });
});
