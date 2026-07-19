/**
 * Regression suite for the AdhocQueryResolver pagination / total-row-count bug.
 *
 * Bug #4 — First-page ad-hoc queries reported a TotalRowCount equal to the
 *          returned page size, so the artifact viewer's pager never appeared
 *          and a >100-row result looked like it only had 100 rows.
 *
 *          Two compounding causes in ExecuteAdhocQuery:
 *            1. `usePaging` required `startRow > 0`, so page 1 (StartRow 0)
 *               fell back to a TOP-N hard cap instead of OFFSET/FETCH paging.
 *            2. `TotalRowCount` was set to `recordset.length` (the capped page),
 *               with no COUNT(*) query — so the true total was never computed.
 *
 *          The fix pages whenever `MaxRows > 0` (including StartRow 0) and reads
 *          the true total from the RenderPipeline's PagingResult.CountSQL —
 *          matching the saved-query path (GenericDatabaseProvider → WrapWithPaging).
 *
 * Same hybrid strategy as AdhocQueryResolver.bugs.test.ts:
 *   1. Source-shape contract tests — assert structural properties of the fix.
 *   2. Pipeline behavior tests — exercise RenderPipeline.Run with the exact
 *      first-page inputs the resolver now relies on (data OFFSET/FETCH + count).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Metadata } from '@memberjunction/core';
import { RenderPipeline } from '@memberjunction/generic-database-provider';

const ADHOC_RESOLVER_PATH = resolve(__dirname, '../resolvers/AdhocQueryResolver.ts');

function readResolverSource(): string {
    return readFileSync(ADHOC_RESOLVER_PATH, 'utf8');
}

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as ReturnType<typeof Metadata.Provider>);
}

afterEach(() => {
    vi.restoreAllMocks();
});

// The real-world query from the bug report: no top-level TOP, an ORDER BY,
// ~2,087 rows in production, requested as page 1 (StartRow 0, MaxRows 100).
const BUG_REPORT_SQL = `SELECT
    d.ID,
    d.Title,
    d.Value,
    ISNULL(d.DealStage, 'Open (Unspecified)') AS DealStage
FROM crm.vwDeals d
WHERE
    d.IsDeleted = 0
    AND (d.DealStage NOT IN ('Closed won', 'Closed lost') OR d.DealStage IS NULL)
ORDER BY
    d.Value DESC,
    d.CloseDate ASC`;

// ════════════════════════════════════════════════════════════════════
// Source-shape contract tests
// ════════════════════════════════════════════════════════════════════

describe('AdhocQueryResolver pagination source-shape contract', () => {

    it('must NOT gate paging on `startRow > 0` (page 1 must still page)', () => {
        const src = readResolverSource();
        // The bug: `usePaging = ... && startRow > 0`. After the fix, first-page
        // requests (StartRow 0) must page too, so no `startRow > 0` guard remains.
        expect(/startRow\s*>\s*0/.test(src)).toBe(false);
    });

    it('must derive TotalRowCount from a COUNT query, not the returned page length', () => {
        const src = readResolverSource();
        // The bug: `TotalRowCount: recordset.length`. After the fix, the total
        // comes from the count query (via a resolved variable), never directly
        // from the page recordset length.
        expect(/TotalRowCount:\s*recordset\.length/.test(src)).toBe(false);
    });

    it('must consume the RenderPipeline PagingResult.CountSQL', () => {
        const src = readResolverSource();
        expect(/PagingResult\??\.CountSQL/.test(src)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════
// Pipeline behavior — first page (StartRow 0) yields data + count SQL
// ════════════════════════════════════════════════════════════════════

describe('RenderPipeline first-page paging (the contract the resolver relies on)', () => {

    it('StartRow 0 + MaxRows 100 produces a PagingResult with OFFSET/FETCH data SQL AND a COUNT(*) count SQL', () => {
        stubMetadata();

        const result = RenderPipeline.Run(BUG_REPORT_SQL, {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 100 },
        });

        // Paging must be applied even at StartRow 0 (the bug caused it to be skipped).
        expect(result.PagingResult).not.toBeNull();

        // Data SQL: OFFSET/FETCH at the first page, preserving the query's ORDER BY.
        expect(result.FinalSQL).toMatch(/OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i);
        expect(result.PagingResult!.DataSQL).toMatch(/OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i);

        // Count SQL: a COUNT(*) over the full (uncapped) set — the true total the
        // viewer's pager needs. It must NOT carry the page's OFFSET/FETCH cap.
        expect(result.PagingResult!.CountSQL).toMatch(/COUNT\(\*\)\s+AS\s+TotalRowCount/i);
        expect(result.PagingResult!.CountSQL).not.toMatch(/FETCH\s+NEXT\s+100\s+ROWS/i);
    });
});
