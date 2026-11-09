/**
 * sampling.ts — the seeded, stratified sample the measurement runs on.
 *
 * Pure and deterministic: the same records, values, size and seed give the same sample, whatever order
 * the database returned the rows in (they are sorted by ID before anything random happens).
 */
import type { LabeledRecord } from './types';

/**
 * A seeded pseudo-random generator (mulberry32) returning floats in [0, 1). Not cryptographic; it only
 * has to make a sample and a bootstrap reproducible from `--seed`.
 */
export function CreateSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A shuffled copy of `items` (Fisher–Yates), driven by `random`. */
export function SeededShuffle<T>(items: readonly T[], random: () => number): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/** The value in `values` that `raw` names (trimmed, case-insensitive), or null when it names none. */
export function CanonicalLabel(values: readonly string[], raw: string | null | undefined): string | null {
    const wanted = raw?.trim().toLowerCase();
    if (!wanted) {
        return null;
    }
    return values.find((v) => v.toLowerCase() === wanted) ?? null;
}

/** How many records carry each value, in `values` order (zero for a value with none). */
export function CountPerValue(records: readonly LabeledRecord[], values: readonly string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const value of values) {
        counts[value] = records.filter((r) => r.Label === value).length;
    }
    return counts;
}

/**
 * Takes up to `size` records, as equal per value as the data allows. Each round gives every value that
 * still has records an equal share of what is left; the remainder of an uneven split goes to the first
 * values in `values` order. A value with fewer records than its share gives all it has. Records whose
 * label is not one of `values` are ignored. The sample is returned shuffled, so batches mix values.
 */
export function StratifiedSample(records: readonly LabeledRecord[], values: readonly string[], size: number, seed: number): LabeledRecord[] {
    const random = CreateSeededRandom(seed);
    const groups = groupByValue(records, values, random);
    const allocation = allocateEvenly(groups, values, size);
    const chosen = values.flatMap((value) => (groups.get(value) ?? []).slice(0, allocation.get(value) ?? 0));
    return SeededShuffle(chosen, random);
}

/** Each value's records, sorted by ID and then shuffled, so the database's row order never matters. */
function groupByValue(records: readonly LabeledRecord[], values: readonly string[], random: () => number): Map<string, LabeledRecord[]> {
    const sorted = [...records].sort((a, b) => (a.RecordID < b.RecordID ? -1 : a.RecordID > b.RecordID ? 1 : 0));
    const groups = new Map<string, LabeledRecord[]>();
    for (const value of values) {
        groups.set(value, SeededShuffle(sorted.filter((r) => r.Label === value), random));
    }
    return groups;
}

/** How many records each value contributes: an equal share per round, until `size` or the data runs out. */
function allocateEvenly(groups: Map<string, LabeledRecord[]>, values: readonly string[], size: number): Map<string, number> {
    const allocation = new Map<string, number>(values.map((v) => [v, 0]));
    const available = (value: string): number => (groups.get(value)?.length ?? 0) - (allocation.get(value) ?? 0);
    const total = values.reduce((sum, v) => sum + (groups.get(v)?.length ?? 0), 0);
    let remaining = Math.min(Math.max(0, size), total);
    while (remaining > 0) {
        const open = values.filter((v) => available(v) > 0);
        const share = Math.max(1, Math.floor(remaining / open.length));
        for (const value of open) {
            const take = Math.min(share, available(value), remaining);
            allocation.set(value, (allocation.get(value) ?? 0) + take);
            remaining -= take;
        }
    }
    return allocation;
}
