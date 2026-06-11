import { describe, it, expect } from 'vitest';
import { discoverFromStream, pickPrimaryKeyFromStats, type DiscoveredColumnStat } from '../StreamingDiscovery.js';

/** A clock that advances by `step` each call — for deterministic time-budget tests. */
function steppedClock(step: number): () => number {
    let t = 0;
    return () => { const v = t; t += step; return v; };
}

function col(over: Partial<DiscoveredColumnStat> & { Key: string }): DiscoveredColumnStat {
    return {
        Occurrences: 100, TotalRows: 100, DistinctNonNull: 100, DistinctCapped: false,
        SampleValues: ['x'], Inferred: { SchemaFieldType: 'string', SqlServerType: 'NVARCHAR(255)', PostgresType: 'VARCHAR(255)', MaxLength: 255 },
        ...over,
    };
}

describe('discoverFromStream', () => {
    it('accumulates the full column corpus + per-column uniqueness/null stats in one pass', async () => {
        const rows = [
            { id: '1', region: 'West', score: 5 },
            { id: '2', region: 'East', score: 7 },
            { id: '3', region: 'West' },          // score missing → null
        ];
        const res = await discoverFromStream(rows);
        expect(res.RowsScanned).toBe(3);
        expect(res.StoppedReason).toBe('exhausted');

        const id = res.Columns.find(c => c.Key === 'id')!;
        const region = res.Columns.find(c => c.Key === 'region')!;
        const score = res.Columns.find(c => c.Key === 'score')!;

        // id: present on all 3, all distinct → unique + non-null
        expect(id.Occurrences).toBe(3);
        expect(id.DistinctNonNull).toBe(3);
        // region: present on all 3, only 2 distinct (West repeats) → non-null but NOT unique
        expect(region.Occurrences).toBe(3);
        expect(region.DistinctNonNull).toBe(2);
        // score: present on 2 of 3 → nullable
        expect(score.Occurrences).toBe(2);
        expect(score.TotalRows).toBe(3);
    });

    it('catches a column that appears in only one row (completeness, not sampling)', async () => {
        const rows = [{ a: 1 }, { a: 2 }, { a: 3, rareCustom: 'x' }];
        const res = await discoverFromStream(rows);
        expect(res.Columns.map(c => c.Key).sort()).toEqual(['a', 'rareCustom']);
    });

    it('stops at the time budget and reports it, using what it gathered', async () => {
        const rows = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
        // clock steps 10ms/call; budget 25ms → stops after ~3 rows
        const res = await discoverFromStream(rows, { TimeBudgetMs: 25, Now: steppedClock(10) });
        expect(res.StoppedReason).toBe('time-budget');
        expect(res.RowsScanned).toBeLessThan(1000);
        expect(res.RowsScanned).toBeGreaterThan(0);
    });

    it('caps retained sample values per column (bounded memory)', async () => {
        const rows = Array.from({ length: 50 }, (_, i) => ({ k: i }));
        const res = await discoverFromStream(rows, { SampleValueCap: 5 });
        expect(res.Columns[0].SampleValues).toHaveLength(5);
        expect(res.Columns[0].Occurrences).toBe(50);
    });

    it('flags DistinctCapped when distinct values exceed the cap (uniqueness unprovable)', async () => {
        const rows = Array.from({ length: 20 }, (_, i) => ({ k: `v${i}` }));
        const res = await discoverFromStream(rows, { MaxDistinctTracked: 5 });
        expect(res.Columns[0].DistinctCapped).toBe(true);
    });
});

describe('pickPrimaryKeyFromStats', () => {
    it('picks the single unique + non-null column (statistically the key)', () => {
        const v = pickPrimaryKeyFromStats([
            col({ Key: 'id', Occurrences: 100, TotalRows: 100, DistinctNonNull: 100 }),
            col({ Key: 'region', Occurrences: 100, TotalRows: 100, DistinctNonNull: 4 }), // not unique
        ]);
        expect(v.Field).toBe('id');
        expect(v.AmbiguousForLLM).toBe(false);
    });

    it('returns no PK when nothing is provably unique+non-null (no fabrication)', () => {
        const v = pickPrimaryKeyFromStats([
            col({ Key: 'region', DistinctNonNull: 4 }),
            col({ Key: 'note', Occurrences: 40, TotalRows: 100 }), // nullable
        ]);
        expect(v.Field).toBeNull();
    });

    it('picks a thin-sample near-unique convention column as a SOFT best-available key (no hard significance gate)', () => {
        // Soft policy: a small sample no longer blocks the pick — a PK-less object stalls CodeGen, and
        // the key is soft (can't reject a row). `id` here is all-distinct + non-null + convention-named.
        const v = pickPrimaryKeyFromStats([col({ Key: 'id', Occurrences: 5, TotalRows: 5, DistinctNonNull: 5 })], { MinRowsForSignificance: 50 });
        expect(v.Field).toBe('id');
        expect(v.AmbiguousForLLM).toBe(false);
    });

    it('does NOT pick a distinct-capped column with no convention name (uniqueness unprovable, no signal)', () => {
        const v = pickPrimaryKeyFromStats([col({ Key: 'payload', DistinctCapped: true })]);
        expect(v.Field).toBeNull();
    });

    it('picks a distinct-capped HIGH-cardinality column when its name matches the convention (soft)', () => {
        // capped `id` = more distinct values than the cap, literally named id → overwhelmingly the key.
        const v = pickPrimaryKeyFromStats([col({ Key: 'id', DistinctCapped: true })]);
        expect(v.Field).toBe('id');
    });

    it('takes a near-unique (not perfectly unique) convention column as a soft key when none is confident', () => {
        // 99/100 distinct — a couple of dup/edge rows, no confident candidate, but plainly the identity.
        const v = pickPrimaryKeyFromStats([
            col({ Key: 'id', Occurrences: 100, TotalRows: 100, DistinctNonNull: 99 }),
            col({ Key: 'status', Occurrences: 100, TotalRows: 100, DistinctNonNull: 3 }),
        ]);
        expect(v.Field).toBe('id');
    });

    it('still returns no PK when nothing is plausibly identifying (no fabrication)', () => {
        const v = pickPrimaryKeyFromStats([
            col({ Key: 'status', DistinctNonNull: 3 }),
            col({ Key: 'note', Occurrences: 30, TotalRows: 100, DistinctNonNull: 30 }), // mostly null, unnamed
        ]);
        expect(v.Field).toBeNull();
    });

    it('breaks a multi-unique tie by naming when it can', () => {
        const v = pickPrimaryKeyFromStats(
            [col({ Key: 'id' }), col({ Key: 'email' })],
            { NameRank: (n) => (n === 'id' ? 10 : 1) },
        );
        expect(v.Field).toBe('id');
        expect(v.AmbiguousForLLM).toBe(false);
    });

    it('defers to the LLM tiebreaker when multiple unique columns rank equally', () => {
        const v = pickPrimaryKeyFromStats([col({ Key: 'id' }), col({ Key: 'uuid' })]); // no NameRank → equal
        expect(v.Field).toBeNull();
        expect(v.AmbiguousForLLM).toBe(true);
        expect(v.UniqueCandidates.sort()).toEqual(['id', 'uuid']);
    });
});
