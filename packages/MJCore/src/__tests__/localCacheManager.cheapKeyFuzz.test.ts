/**
 * Property / fuzz tests for LocalCacheManager's cheap PK keying (Fix 1 — delimiter collision).
 *
 * Companion to localCacheManager.cheapKey.test.ts (read that first for the private-access pattern
 * and the CompositeKey/KeyValuePair construction style). Where that file exercises a handful of
 * hand-picked collision cases, this file generates HUNDREDS of distinct composite-key tuples
 * DETERMINISTICALLY (a seeded, index-driven generator — never Math.random, so a failure always
 * reproduces) and asserts the two invariants the cache correctness relies on:
 *
 *   (a) Injectivity — two DISTINCT tuples never collapse to the same cheap key (the delimiter is
 *       the NUL char precisely so embedded spaces/punctuation can't shift a field boundary).
 *   (b) Round-trip parity — cheapRowKey(row, fields) === cheapKeyFromCompositeKey(key) when the row
 *       object and the CompositeKey are built from the SAME tuple with the SAME field order.
 *
 * Values intentionally vary field count (1–4) and include embedded spaces, punctuation, digits,
 * empty strings, and nulls (but never the NUL char itself, which is the reserved delimiter).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

type Internal = {
    cheapRowKey: (row: Record<string, unknown>, pkFieldNames: string[]) => string;
    cheapKeyFromCompositeKey: (key: CompositeKey) => string;
};
const asInternal = (cm: LocalCacheManager) => cm as unknown as Internal;

/** One generated PK field: a field name + a coerced-to-key value. */
type GenField = { field: string; value: string | number | null };
type GenTuple = GenField[];

/**
 * A small deterministic LCG so the corpus is reproducible across runs (NOT Math.random).
 * Numbers are only used to pick from fixed value/field pools — never as cache keys.
 */
function makeRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        // Numerical Recipes LCG constants
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

// Value pool deliberately includes the adversarial cases: embedded spaces, punctuation, digits,
// empty string, and null. NUL is excluded on purpose — it is the reserved field delimiter.
const VALUE_POOL: Array<string | number | null> = [
    'A', 'B', 'C', 'AB', 'A B', 'B C', 'A B C', '  pad  ',
    '', 'x,y', 'a|b', 'k:v', 'tab\tend', 'line\nbreak', 'quote"s', "apo'strophe",
    0, 1, 7, 42, -3, 'A B  C', 'A  B C', 'A-B', 'A_B', 'üñîçødé', null,
];

// The FIRST PK field must be a non-falsy string: CompositeKey's constructor discards the entire
// key-value array unless `KeyValuePairs[0].FieldName && KeyValuePairs[0].Value` are both truthy
// (i.e. a falsy leading value collapses the key to empty). Real PK first columns are non-empty IDs,
// so this mirrors actual caller behavior; the adversarial falsy/null/empty values still get
// exercised in every non-leading position via VALUE_POOL.
const FIRST_VALUE_POOL: Array<string | number> = [
    'A', 'B', 'C', 'AB', 'A B', 'B C', 'A B C', '  pad  ', 'x,y', 'a|b', 'k:v',
    'tab\tend', 'quote"s', "apo'strophe", 1, 7, 42, -3, 'A B  C', 'A-B', 'A_B', 'üñîçødé',
];

const FIELD_POOL = ['F1', 'F2', 'F3', 'F4'];

/** Build a tuple of `count` fields, choosing values deterministically from the pool. */
function buildTuple(rng: () => number, count: number): GenTuple {
    const t: GenTuple = [];
    for (let i = 0; i < count; i++) {
        const pool = i === 0 ? FIRST_VALUE_POOL : VALUE_POOL;
        const v = pool[Math.floor(rng() * pool.length)];
        t.push({ field: FIELD_POOL[i], value: v });
    }
    return t;
}

/** The logical identity of a tuple — exactly how cheap keys coerce values (null/undefined → ''). */
function canonical(t: GenTuple): string {
    // Use a delimiter that cannot appear in field/value text so this canonical form is itself
    // injective and independent of the production NUL delimiter (we don't want to "test the impl
    // with the impl"). The record separator (U+001E) never appears in the value pool.
    return t.map(f => `${f.field}=${String(f.value ?? '')}`).join('');
}

function rowFromTuple(t: GenTuple): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const f of t) row[f.field] = f.value;
    return row;
}

function keyFromTuple(t: GenTuple): CompositeKey {
    return CompositeKey.FromKeyValuePairs(t.map(f => new KeyValuePair(f.field, f.value)));
}

describe('LocalCacheManager cheap PK keying — property/fuzz', () => {
    let cm: LocalCacheManager;
    beforeEach(() => {
        resetLocalCacheManager();
        cm = LocalCacheManager.Instance;
    });

    // Generate a large deterministic corpus once per assertion-set.
    function generateCorpus(seed: number, n: number): GenTuple[] {
        const rng = makeRng(seed);
        const out: GenTuple[] = [];
        for (let i = 0; i < n; i++) {
            const count = 1 + Math.floor(rng() * 4); // 1..4 fields
            out.push(buildTuple(rng, count));
        }
        return out;
    }

    it('(b) round-trip parity: cheapRowKey(row) === cheapKeyFromCompositeKey(key) for hundreds of tuples', () => {
        const corpus = generateCorpus(0xC0FFEE, 600);
        const internal = asInternal(cm);
        let checked = 0;
        for (const t of corpus) {
            const fields = t.map(f => f.field);
            const rowKey = internal.cheapRowKey(rowFromTuple(t), fields);
            const targetKey = internal.cheapKeyFromCompositeKey(keyFromTuple(t));
            expect(rowKey).toBe(targetKey);
            checked++;
        }
        expect(checked).toBe(600);
    });

    it('(a) injectivity: DISTINCT logical tuples never collide to the same cheap key', () => {
        const corpus = generateCorpus(0x1234ABCD, 800);
        const internal = asInternal(cm);
        // Map each cheap key -> the canonical identity that produced it. A collision is only a
        // failure if two DIFFERENT canonical identities map to the SAME cheap key.
        const seen = new Map<string, string>();
        let distinctChecked = 0;
        for (const t of corpus) {
            const canon = canonical(t);
            const cheap = internal.cheapKeyFromCompositeKey(keyFromTuple(t));
            const prior = seen.get(cheap);
            if (prior === undefined) {
                seen.set(cheap, canon);
                distinctChecked++;
            } else {
                // Same cheap key seen before — it MUST be the same logical tuple, otherwise the
                // delimiter failed to keep two distinct composites apart.
                expect(prior).toBe(canon);
            }
        }
        // Sanity: the corpus actually produced a healthy number of distinct keys (not all dupes).
        expect(distinctChecked).toBeGreaterThan(100);
    });

    it('(a+b) cross-builder injectivity: distinct tuples produce distinct keys via BOTH builders identically', () => {
        const corpus = generateCorpus(0x55AA55AA, 500);
        const internal = asInternal(cm);
        const byRowKey = new Map<string, string>();
        for (const t of corpus) {
            const canon = canonical(t);
            const fields = t.map(f => f.field);
            const rowKey = internal.cheapRowKey(rowFromTuple(t), fields);
            const compositeKey = internal.cheapKeyFromCompositeKey(keyFromTuple(t));
            // Parity again, on this corpus.
            expect(rowKey).toBe(compositeKey);
            // Injectivity via the row builder.
            const prior = byRowKey.get(rowKey);
            if (prior === undefined) byRowKey.set(rowKey, canon);
            else expect(prior).toBe(canon);
        }
    });

    it('the same seed reproduces an identical corpus (determinism guard)', () => {
        const a = generateCorpus(99, 50).map(canonical);
        const b = generateCorpus(99, 50).map(canonical);
        expect(a).toEqual(b);
    });
});
