import { describe, it, expect } from 'vitest';
import { discoverFromStream, pickKeyFromStats } from '../StreamingDiscovery.js';

/**
 * An observed duplicate disproves keyness. Full stop.
 *
 * `subsetKeyness` decided keyness purely by Chao1 domain saturation (D̂ > n) and never checked that
 * the sampled tuples were actually distinct. Chao1 estimates how LARGE the value domain is — evidence
 * about future collisions — which says nothing about collisions already sitting in the sample. Its
 * bias-corrected branch (no doubletons) also grows quadratically in the singleton count, so a column
 * with nine copies of one value among 100 rows scored D̂ ≈ 4187 and was reported as a
 * "Provable 1-column key".
 *
 * Consequence: two source records sharing that value collapse onto one MJ row. It does not error —
 * it silently loses a record, the mirror image of the duplicate-record failure.
 */
const rows = (n: number, fn: (i: number) => Record<string, unknown>) =>
    Array.from({ length: n }, (_v, i) => fn(i));

const verdict = async (data: Array<Record<string, unknown>>) => {
    const scan = await discoverFromStream(data);
    return pickKeyFromStats(scan.Columns, scan.RowSamples, {});
};

describe('pickKeyFromStats — a duplicate in the sample is disproof', () => {
    it('refuses a near-unique column: 92 distinct of 100 rows is NOT a key', async () => {
        // The exact shape that scored D̂ ≈ 4187 and was declared provable.
        const v = await verdict(rows(100, i => ({ customer_id: `c${i < 92 ? i : 0}` })));
        expect(v.Fields).toBeNull();
    });

    it('refuses even ONE duplicate among 500 rows', async () => {
        // No ratio threshold to hide behind: a single repeat is still a repeat.
        const v = await verdict(rows(500, i => ({ id: `k${i === 499 ? 0 : i}` })));
        expect(v.Fields).toBeNull();
    });

    it('still accepts a genuinely unique column', async () => {
        const v = await verdict(rows(100, i => ({ id: `k${i}` })));
        expect(v.Fields).toEqual(['id']);
    });

    it('still accepts a genuine COMPOSITE key whose parts are individually duplicated', async () => {
        // 10 tenants x 10 rows: neither column alone is unique, the pair is. This is the case the
        // duplicate check must not break.
        const v = await verdict(rows(100, i => ({ tenant_id: `t${i % 10}`, row_id: `r${Math.floor(i / 10)}` })));
        expect(v.Fields).not.toBeNull();
        expect([...(v.Fields ?? [])].sort()).toEqual(['row_id', 'tenant_id']);
    });

    it('refuses a composite whose combined tuple still repeats', async () => {
        // Every pair appears twice — a saturated domain wearing a composite disguise.
        const v = await verdict(rows(100, i => ({ a: `a${Math.floor(i / 2) % 10}`, b: `b${Math.floor(i / 20)}` })));
        expect(v.Fields).toBeNull();
    });

    it('a low-cardinality category is refused, as it always was', async () => {
        const v = await verdict(rows(100, i => ({ status_id: `s${i % 3}` })));
        expect(v.Fields).toBeNull();
    });
});
