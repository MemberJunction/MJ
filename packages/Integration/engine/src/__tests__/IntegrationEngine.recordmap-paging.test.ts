/**
 * Record-map loading must not silently stop at the row cap.
 *
 * `RunView` with no `MaxRows` is NOT unbounded — it falls back to the entity's
 * `UserViewMaxRows`, which defaults to 1000. Both callers that load the full record map for an
 * entity map read it as "every mapping that exists", and both did so with an uncapped RunView:
 *
 *  - the orphan sweep treats anything in the map but not in the fetched set as deleted. Truncated
 *    at 1000, it simply never sees the rest — orphans past row 1000 are never cleaned up.
 *  - the full-push path treats a missing mapping as "never pushed". Truncated, it re-creates
 *    records in the external system that already exist.
 *
 * One is a silent no-op, the other duplicates customer data in a live system. So the loader pages,
 * and reports whether it got everything; a caller that did not get everything must not act on a
 * partial map.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompositeKey, UserInfo } from '@memberjunction/core';
import { IntegrationEngine } from '../IntegrationEngine.js';

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) { return mockRunViewFn(...args); }
        },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;
const PAGE_SIZE = IntegrationEngine.RecordMapPageSize;

interface RecordMapRow { ID: string; EntityRecordID: string; ExternalSystemRecordID: string }
interface LoadResult { Rows: RecordMapRow[]; Complete: boolean; Error?: string }

/** Invokes the private loader — the seam both callers depend on. */
function loadAllRecordMaps(engine: IntegrationEngine, ci = 'ci-1', entity = 'entity-1'): Promise<LoadResult> {
    return (engine as unknown as {
        LoadAllRecordMaps: (ci: string, entity: string, u: UserInfo) => Promise<LoadResult>;
    }).LoadAllRecordMaps(ci, entity, contextUser);
}

function rows(count: number, offset = 0): RecordMapRow[] {
    return Array.from({ length: count }, (_, i) => ({
        ID: `map-${offset + i}`,
        EntityRecordID: `mj-${offset + i}`,
        ExternalSystemRecordID: `ext-${offset + i}`,
    }));
}

describe('IntegrationEngine.LoadAllRecordMaps', () => {
    let engine: IntegrationEngine;

    beforeEach(() => {
        engine = new IntegrationEngine();
        mockRunViewFn = vi.fn();
    });

    it('reads past the default row cap — two full pages plus a partial come back in full', async () => {
        const total = PAGE_SIZE * 2 + 2000;
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, 0) })
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, PAGE_SIZE) })
            .mockResolvedValueOnce({ Success: true, Results: rows(2000, PAGE_SIZE * 2) });

        const result = await loadAllRecordMaps(engine);

        expect(result.Rows).toHaveLength(total);
        expect(result.Complete).toBe(true);
        expect(mockRunViewFn).toHaveBeenCalledTimes(3);
        // Distinct external IDs — paging must not re-read the same page.
        expect(new Set(result.Rows.map(r => r.ExternalSystemRecordID)).size).toBe(total);
    });

    it('seeks on the last ID of the previous page and never sends StartRow', async () => {
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, 0) })
            .mockResolvedValueOnce({ Success: true, Results: rows(1, PAGE_SIZE) });

        await loadAllRecordMaps(engine);

        const calls = mockRunViewFn.mock.calls.map(c => c[0] as {
            StartRow?: number; AfterKey?: CompositeKey; MaxRows: number;
            IgnoreMaxRows: boolean; OrderBy: string; BypassCache: boolean; Fields: string[];
        });

        // Keyset, not OFFSET. StartRow would set the provider's usingPagination flag and force a
        // COUNT(*) over the whole record-map view on every page.
        for (const c of calls) expect(c.StartRow).toBeUndefined();

        expect(calls[0].AfterKey).toBeUndefined();                     // first page seeks from nothing
        expect(calls[1].AfterKey?.KeyValuePairs?.[0]?.Value)           // subsequent pages seek on the last ID seen
            .toBe(`map-${PAGE_SIZE - 1}`);

        for (const c of calls) {
            expect(c.MaxRows).toBe(PAGE_SIZE);
            expect(c.IgnoreMaxRows).toBe(true);      // the entity cap is exactly what we defeat
            expect(c.OrderBy).toBe('ID ASC');        // keyset requires the sort to be the PK alone
            expect(c.BypassCache).toBe(true);        // sync decisions need committed state
            expect(c.Fields).toContain('ID');        // the seek key must come back with each page
        }
    });

    it('stops and reports Complete:false rather than looping forever on full pages', async () => {
        // A provider that ignored AfterKey would return a full page every time. The loop must be
        // bounded, and must NOT claim the map is complete. Shrink the page size so the backstop is
        // reachable in a unit test.
        const realPageSize = IntegrationEngine.RecordMapPageSize;
        Object.defineProperty(IntegrationEngine, 'RecordMapPageSize', { value: 2, configurable: true });
        try {
            mockRunViewFn.mockImplementation(() => Promise.resolve({ Success: true, Results: rows(2, 0) }));

            const result = await loadAllRecordMaps(engine);

            expect(result.Complete).toBe(false);
            expect(result.Error).toContain('exceeded');
        } finally {
            Object.defineProperty(IntegrationEngine, 'RecordMapPageSize', { value: realPageSize, configurable: true });
        }
    }, 30_000);

    it('stops after one read when the first page is short', async () => {
        mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: rows(3) });

        const result = await loadAllRecordMaps(engine);

        expect(result.Complete).toBe(true);
        expect(result.Rows).toHaveLength(3);
        expect(mockRunViewFn).toHaveBeenCalledTimes(1);
    });

    it('reports Complete:false when a page fails — callers must not act on a partial map', async () => {
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, 0) })
            .mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'connection reset' });

        const result = await loadAllRecordMaps(engine);

        expect(result.Complete).toBe(false);
        expect(result.Error).toContain('connection reset');
        // What it DID read is still handed back, so a caller can report scope — but the flag is
        // what decides whether the orphan sweep or the full push is allowed to proceed.
        expect(result.Rows).toHaveLength(PAGE_SIZE);
    });

    it('reports Complete:false when the very first read fails', async () => {
        mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [] });

        const result = await loadAllRecordMaps(engine);

        expect(result.Complete).toBe(false);
        expect(result.Rows).toHaveLength(0);
    });
});
