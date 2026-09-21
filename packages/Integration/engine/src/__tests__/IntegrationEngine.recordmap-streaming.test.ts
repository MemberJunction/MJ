/**
 * Paging bounds the QUERY. It does not bound the heap.
 *
 * `LoadAllRecordMaps` pages correctly and then appends every page to one array, so the stage-end
 * reconciliation of an entity with a million mappings holds a million row objects for as long as it
 * runs — and neither caller wants the rows. The push path wants two of the three columns in a Map; the
 * orphan sweep wants only the rows whose external id is missing from the fetched set, normally a
 * handful. So a caller may hand in a per-page consumer and keep just that.
 *
 * The contract that matters: streaming must read exactly the same rows, in the same order, exactly
 * once, and still report `Complete` honestly — a cheaper resident set is worthless if it changes what
 * the sweep or the push decides.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
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
interface LoadResult { Rows: RecordMapRow[]; RowsRead: number; Complete: boolean; Error?: string }

function loadStreamed(
    engine: IntegrationEngine,
    onPage: (rows: ReadonlyArray<RecordMapRow>) => void,
): Promise<LoadResult> {
    return (engine as unknown as {
        LoadAllRecordMaps: (
            ci: string, entity: string, u: UserInfo,
            onPage?: (rows: ReadonlyArray<RecordMapRow>) => void,
        ) => Promise<LoadResult>;
    }).LoadAllRecordMaps('ci-1', 'entity-1', contextUser, onPage);
}

function rows(count: number, offset = 0): RecordMapRow[] {
    return Array.from({ length: count }, (_unused, i) => ({
        ID: `map-${offset + i}`,
        EntityRecordID: `mj-${offset + i}`,
        ExternalSystemRecordID: `ext-${offset + i}`,
    }));
}

describe('IntegrationEngine.LoadAllRecordMaps — streaming', () => {
    let engine: IntegrationEngine;

    beforeEach(() => {
        engine = new IntegrationEngine();
        mockRunViewFn = vi.fn();
    });

    it('hands every row to the consumer exactly once and accumulates none of them', async () => {
        const total = PAGE_SIZE * 2 + 7;
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, 0) })
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, PAGE_SIZE) })
            .mockResolvedValueOnce({ Success: true, Results: rows(7, PAGE_SIZE * 2) });

        const seen: string[] = [];
        const result = await loadStreamed(engine, page => { for (const r of page) seen.push(r.ID); });

        expect(seen).toHaveLength(total);
        expect(new Set(seen).size).toBe(total);           // exactly once each
        expect(seen[0]).toBe('map-0');                    // and in page order
        expect(seen[total - 1]).toBe(`map-${total - 1}`);
        expect(result.Rows).toEqual([]);                  // nothing held
        expect(result.RowsRead).toBe(total);              // but counted
        expect(result.Complete).toBe(true);
    });

    it('still accumulates when no consumer is passed — "give me everything" means everything', async () => {
        mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: rows(3) });

        const result = await (engine as unknown as {
            LoadAllRecordMaps: (ci: string, e: string, u: UserInfo) => Promise<LoadResult>;
        }).LoadAllRecordMaps('ci-1', 'entity-1', contextUser);

        expect(result.Rows).toHaveLength(3);
        expect(result.RowsRead).toBe(3);
        expect(result.Complete).toBe(true);
    });

    it('reports the partial read honestly, with the rows it DID read counted', async () => {
        // The orphan sweep's refusal message quotes this count, and it is the only row number a
        // streaming caller has — `Rows` is empty by construction.
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, 0) })
            .mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'connection reset' });

        const seen: RecordMapRow[] = [];
        const result = await loadStreamed(engine, page => seen.push(...page));

        expect(result.Complete).toBe(false);
        expect(result.Error).toContain('connection reset');
        expect(result.RowsRead).toBe(PAGE_SIZE);
        expect(seen).toHaveLength(PAGE_SIZE);             // the consumer saw what was read
    });

    it('seeks on the last id of the page it just handed over, not on what it kept', async () => {
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: rows(PAGE_SIZE, 0) })
            .mockResolvedValueOnce({ Success: true, Results: rows(1, PAGE_SIZE) });

        await loadStreamed(engine, () => { /* deliberately keeps nothing at all */ });

        const calls = mockRunViewFn.mock.calls.map(c => c[0] as { AfterKey?: { KeyValuePairs?: Array<{ Value: string }> } });
        expect(calls[0].AfterKey).toBeUndefined();
        expect(calls[1].AfterKey?.KeyValuePairs?.[0]?.Value).toBe(`map-${PAGE_SIZE - 1}`);
    });
});
