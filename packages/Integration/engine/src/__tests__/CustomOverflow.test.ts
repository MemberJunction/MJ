import { describe, it, expect } from 'vitest';
import { computeUnmappedFields, hasUnmappedFields, reconcileOverflowValue, CUSTOM_OVERFLOW_COLUMN } from '../CustomOverflow.js';

describe('CustomOverflow', () => {
    describe('CUSTOM_OVERFLOW_COLUMN', () => {
        it('uses the __mj_integration_* system-column naming convention', () => {
            // Same family as __mj_integration_ContentHash — a hidden backend system field,
            // never user-facing metadata.
            expect(CUSTOM_OVERFLOW_COLUMN).toBe('__mj_integration_CustomOverflow');
            expect(CUSTOM_OVERFLOW_COLUMN.startsWith('__mj_integration_')).toBe(true);
        });
    });

    describe('computeUnmappedFields', () => {
        it('returns an empty object when every source key is mapped', () => {
            const mapped = new Set(['FirstName', 'LastName']);
            const out = computeUnmappedFields({ FirstName: 'Alice', LastName: 'Smith' }, mapped);
            expect(out).toEqual({});
        });

        it('returns only the keys with no field map', () => {
            const mapped = new Set(['FirstName']);
            const out = computeUnmappedFields(
                { FirstName: 'Alice', WeirdCustom: 'x', Another: 42 },
                mapped
            );
            expect(out).toEqual({ WeirdCustom: 'x', Another: 42 });
        });

        it('returns every key when nothing is mapped', () => {
            const out = computeUnmappedFields({ A: 1, B: 2 }, new Set<string>());
            expect(out).toEqual({ A: 1, B: 2 });
        });

        it('preserves falsy and structured values verbatim', () => {
            const mapped = new Set<string>();
            const out = computeUnmappedFields(
                { zero: 0, no: false, empty: '', nested: { k: 'v' }, list: [1, 2] },
                mapped
            );
            expect(out).toEqual({ zero: 0, no: false, empty: '', nested: { k: 'v' }, list: [1, 2] });
        });

        it('excludes a key even when it carries a null value, if mapped', () => {
            const mapped = new Set(['Phone']);
            const out = computeUnmappedFields({ Phone: null, Extra: 'keep' }, mapped);
            expect(out).toEqual({ Extra: 'keep' });
        });
    });

    describe('hasUnmappedFields', () => {
        it('is false for undefined / null / empty', () => {
            expect(hasUnmappedFields(undefined)).toBe(false);
            expect(hasUnmappedFields(null)).toBe(false);
            expect(hasUnmappedFields({})).toBe(false);
        });

        it('is true when at least one key is present', () => {
            expect(hasUnmappedFields({ a: 1 })).toBe(true);
        });
    });

    describe('reconcileOverflowValue (U4 — evict stale overflow keys on re-sync)', () => {
        it('serializes the CURRENT unmapped keys to JSON', () => {
            expect(reconcileOverflowValue({ Extra: 'x', More: 1 })).toBe('{"Extra":"x","More":1}');
        });

        it('returns null (clearing the column) when the record has NO extras — this is the eviction', () => {
            // The bug it fixes: when a source column vanishes the unmapped set empties, and the old code
            // skipped the write → the prior overflow JSON (with the vanished key) stuck around forever.
            expect(reconcileOverflowValue({})).toBeNull();
            expect(reconcileOverflowValue(null)).toBeNull();
            expect(reconcileOverflowValue(undefined)).toBeNull();
        });

        it('a shrunk unmapped set drops the vanished key (only the surviving keys remain)', () => {
            // Prior sync had {kept, dropped}; the source stopped sending `dropped` → reconcile emits only `kept`.
            expect(reconcileOverflowValue({ kept: 'v' })).toBe('{"kept":"v"}');
        });
    });
});

// ── RSU-spec out-of-band custom-key aggregation ────────────────────────────────
import { foldCustomKeyStats, CUSTOM_KEY_SAMPLE_CAP, type CustomKeyAccumulator } from '../CustomOverflow';

describe('foldCustomKeyStats (RSU spec — candidates exist even when every row is skipped)', () => {
    it('aggregates occurrences, max serialized length, and a bounded sample', () => {
        const agg = new Map<string, CustomKeyAccumulator>();
        foldCustomKeyStats([
            { nickname: 'ab' },
            { nickname: 'abcdef', other: 42 },
            { nickname: null },            // null → not an occurrence
            undefined,                     // record with no unmapped fields
        ], agg);
        expect(agg.get('nickname')!.occurrences).toBe(2);
        expect(agg.get('nickname')!.maxLength).toBe(6);
        expect(agg.get('other')!.occurrences).toBe(1);
        expect(agg.get('other')!.samples).toEqual([42]);
    });

    it('serializes object values as JSON for length tracking (never "[object Object]")', () => {
        const agg = new Map<string, CustomKeyAccumulator>();
        const blob = { a: 1, b: 'xyz' };
        foldCustomKeyStats([{ meta: blob }], agg);
        expect(agg.get('meta')!.maxLength).toBe(JSON.stringify(blob).length);
    });

    it('caps the per-key sample for bounded memory', () => {
        const agg = new Map<string, CustomKeyAccumulator>();
        foldCustomKeyStats(
            Array.from({ length: CUSTOM_KEY_SAMPLE_CAP + 15 }, (_, i) => ({ k: `v${i}` })),
            agg,
        );
        expect(agg.get('k')!.samples.length).toBe(CUSTOM_KEY_SAMPLE_CAP);
        expect(agg.get('k')!.occurrences).toBe(CUSTOM_KEY_SAMPLE_CAP + 15);
    });

    it('folds across multiple batches into the same accumulator', () => {
        const agg = new Map<string, CustomKeyAccumulator>();
        foldCustomKeyStats([{ k: 'short' }], agg);
        foldCustomKeyStats([{ k: 'much-longer-value' }], agg);
        expect(agg.get('k')!.occurrences).toBe(2);
        expect(agg.get('k')!.maxLength).toBe('much-longer-value'.length);
    });
});
