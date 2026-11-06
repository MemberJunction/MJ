import type { Bucket, Catch } from '../types';
import type { Settings } from '../settings';

const ORDER: Record<Bucket, number> = { High: 2, Medium: 1, Low: 0 };

/**
 * Ranks non-dropped weak catches 1..n by median bucket, then TP probability, then boost count, then ID.
 * Other catches get a null Rank. Returns new catch objects sorted by Rank, unranked last in input order.
 */
export function RankCatches(catches: Catch[]): Catch[] {
    const eligible = catches.filter((c) => c.DroppedByRule === null && c.Verdict.Label === 'WeakCatch').sort((a, b) => (ORDER[b.Median ?? 'Low'] - ORDER[a.Median ?? 'Low']) || ((b.TPProb ?? -1) - (a.TPProb ?? -1)) || (b.Boosts.length - a.Boosts.length) || a.ID.localeCompare(b.ID));
    const ranks = new Map(eligible.map((c, i) => [c.ID, i + 1]));
    return catches.map((c) => ({ ...c, Rank: ranks.get(c.ID) ?? null })).sort((a, b) => (a.Rank ?? Number.POSITIVE_INFINITY) - (b.Rank ?? Number.POSITIVE_INFINITY));
}

/**
 * Sets Reported on ranked catches that pass the label or nightly threshold.
 * Label: median at or above MinMedian, capped at MaxReported. Nightly: median at or above MinMedian,
 * or Medium with a listed boost. Returns new catch objects sorted by Rank (unranked last).
 */
export function SelectReported(catches: Catch[], threshold: Settings['Thresholds']['Label'] | Settings['Thresholds']['Nightly'], kind: 'Label' | 'Nightly'): Catch[] {
    const passes = (c: Catch): boolean => {
        if (c.Rank === null || c.Median === null) return false;
        if (kind === 'Nightly') { const t = threshold as Settings['Thresholds']['Nightly']; return ORDER[c.Median] >= ORDER[t.MinMedian] || (c.Median === 'Medium' && c.Boosts.some((b) => t.MediumWithBoosts.includes(b))); }
        return ORDER[c.Median] >= ORDER[(threshold as Settings['Thresholds']['Label']).MinMedian];
    };
    const max = kind === 'Label' ? (threshold as Settings['Thresholds']['Label']).MaxReported : Number.POSITIVE_INFINITY; let n = 0;
    return [...catches].sort((a, b) => (a.Rank ?? 1e9) - (b.Rank ?? 1e9)).map((c) => ({ ...c, Reported: passes(c) && n++ < max }));
}
