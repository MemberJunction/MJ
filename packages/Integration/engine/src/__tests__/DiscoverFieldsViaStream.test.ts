import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type {
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
    FetchContext,
    FetchBatchResult,
} from '../BaseIntegrationConnector.js';
import type { StreamDiscoveryOptions, PkPickOptions } from '../StreamingDiscovery.js';

/**
 * Minimal concrete connector that exposes the protected `DiscoverFieldsViaStream` bridge so the
 * mapping from streamed statistics → ExternalFieldSchema can be exercised directly. (BaseEntity-free
 * — the helper only touches the record stream + the stats math, not any provider.)
 */
@RegisterClass(BaseIntegrationConnector, 'StreamDiscoveryTestConnector')
class StreamDiscoveryTestConnector extends BaseIntegrationConnector {
    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'OK' }; }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> { return []; }
    public async DiscoverFields(): Promise<ExternalFieldSchema[]> { return []; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> { return { Records: [], HasMore: false }; }

    /** Public passthrough to the protected helper for testing. */
    public Run(
        records: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
        opts?: { Discovery?: StreamDiscoveryOptions; Pk?: PkPickOptions; ReadOnly?: boolean }
    ): Promise<ExternalFieldSchema[]> {
        return this.DiscoverFieldsViaStream(records, opts);
    }
}

/** A clock that advances by `step` each call — for deterministic time-budget tests. */
function steppedClock(step: number): () => number {
    let t = 0;
    return () => { const v = t; t += step; return v; };
}

/** Builds N rows: a unique non-null `id`, a repeating `region`, a sometimes-missing `score`. */
function sampleRows(n: number): Record<string, unknown>[] {
    return Array.from({ length: n }, (_, i) => {
        const row: Record<string, unknown> = { id: `id-${i}`, region: i % 2 === 0 ? 'West' : 'East' };
        if (i % 3 !== 0) row.score = i; // present on ~2/3 of rows → nullable
        return row;
    });
}

describe('BaseIntegrationConnector.DiscoverFieldsViaStream', () => {
    const connector = new StreamDiscoveryTestConnector();
    const find = (fields: ExternalFieldSchema[], name: string) => fields.find(f => f.Name === name)!;

    it('encodes the data-informed PK + uniqueness + nullability into the standard flags', async () => {
        const fields = await connector.Run(sampleRows(60), { Pk: { MinRowsForSignificance: 50 } });

        const id = find(fields, 'id');
        const region = find(fields, 'region');
        const score = find(fields, 'score');

        // id: unique + non-null over 60 rows → the statistics-first PK + unique key
        expect(id.IsPrimaryKey).toBe(true);
        expect(id.IsUniqueKey).toBe(true);
        expect(id.AllowsNull).toBeUndefined(); // never observed null → not asserted nullable

        // region: non-null but repeats → NOT a PK, NOT unique
        expect(region.IsPrimaryKey).toBeUndefined();
        expect(region.IsUniqueKey).toBe(false);

        // score: observed missing on some rows → asserted nullable; not unique; not a PK
        expect(score.AllowsNull).toBe(true);
        expect(score.IsPrimaryKey).toBeUndefined();
    });

    it('defaults fields to read-only (stream discovery targets read feeds), overridable via opts', async () => {
        const ro = await connector.Run(sampleRows(3));
        expect(ro.every(f => f.IsReadOnly)).toBe(true);

        const rw = await connector.Run(sampleRows(3), { ReadOnly: false });
        expect(rw.every(f => !f.IsReadOnly)).toBe(true);
    });

    it('never asserts NOT NULL — leaves AllowsNull undefined for columns no null was seen on', async () => {
        const fields = await connector.Run([{ a: '1' }, { a: '2' }, { a: '3' }]);
        expect(find(fields, 'a').AllowsNull).toBeUndefined();
    });

    it('picks a SOFT PK on a sub-threshold sample (convention id) — best-available, no hard gate', async () => {
        // Only 3 rows (below the confidence threshold), but `id` is all-distinct + convention-named →
        // soft best-available key. A PK-less object stalls CodeGen; the key is soft (can't reject a row).
        // The genuine "no unique column at all → no PK" case is covered by the large-sample test above.
        const fields = await connector.Run(sampleRows(3));
        expect(find(fields, 'id').IsPrimaryKey).toBe(true);
    });

    it('fabricates no PK when no column is unique even over a large sample', async () => {
        // Every row identical on the only column → never unique.
        const rows = Array.from({ length: 60 }, () => ({ tag: 'same' }));
        const fields = await connector.Run(rows, { Pk: { MinRowsForSignificance: 50 } });
        expect(find(fields, 'tag').IsPrimaryKey).toBeUndefined();
        expect(find(fields, 'tag').IsUniqueKey).toBe(false);
    });

    it('stops at the time budget and still emits fields from what it gathered', async () => {
        const rows = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
        // clock steps 10ms/call; budget 25ms → stops after a few rows, but still returns the column.
        const fields = await connector.Run(rows, { Discovery: { TimeBudgetMs: 25, Now: steppedClock(10) } });
        expect(fields.map(f => f.Name)).toContain('id');
        // Partial scan must NOT fabricate NOT NULL on the unseen tail.
        expect(find(fields, 'id').AllowsNull).toBeUndefined();
    });

    it('carries the inferred data type + bounded MaxLength onto the field schema', async () => {
        const fields = await connector.Run([{ name: 'abc' }, { name: 'de' }, { name: 'fghi' }]);
        const name = find(fields, 'name');
        expect(name.DataType).toBe('string');
        expect(typeof name.MaxLength).toBe('number');
        expect(name.MaxLength!).toBeGreaterThan(0);
    });
});
