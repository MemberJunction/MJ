/**
 * sampling.test.ts — the stratified sample is seeded (reproducible, whatever order the rows came in)
 * and balanced (equal per value where the data allows).
 */
import { describe, expect, it } from 'vitest';
import { CanonicalLabel, CountPerValue, CreateSeededRandom, SeededShuffle, StratifiedSample } from '../../pipeline-type-measurement/sampling';
import type { LabeledRecord } from '../../pipeline-type-measurement/types';

const VALUES = ['System', 'Data', 'Utilities', 'File Storage'];

/** `count` records per value, with IDs like `Data-007`. */
function records(counts: Record<string, number>): LabeledRecord[] {
    return Object.entries(counts).flatMap(([label, count]) =>
        Array.from({ length: count }, (_, i) => ({ RecordID: `${label}-${String(i).padStart(3, '0')}`, Label: label }))
    );
}

const PLENTY = records({ System: 100, Data: 100, Utilities: 100, 'File Storage': 100 });

describe('CreateSeededRandom', () => {
    it('repeats its sequence for a seed and stays in [0, 1)', () => {
        const a = CreateSeededRandom(7);
        const b = CreateSeededRandom(7);
        const draws = Array.from({ length: 50 }, () => a());
        expect(draws).toEqual(Array.from({ length: 50 }, () => b()));
        expect(draws.every((d) => d >= 0 && d < 1)).toBe(true);
    });

    it('differs between seeds', () => {
        expect(CreateSeededRandom(7)()).not.toBe(CreateSeededRandom(8)());
    });
});

describe('SeededShuffle', () => {
    it('permutes without losing or adding items, and leaves the input alone', () => {
        const input = [1, 2, 3, 4, 5, 6];
        const shuffled = SeededShuffle(input, CreateSeededRandom(1));
        expect([...shuffled].sort()).toEqual(input);
        expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    });
});

describe('StratifiedSample', () => {
    it('is balanced, giving an uneven remainder to the first values', () => {
        expect(CountPerValue(StratifiedSample(PLENTY, VALUES, 200, 7), VALUES)).toEqual({ System: 50, Data: 50, Utilities: 50, 'File Storage': 50 });
        expect(CountPerValue(StratifiedSample(PLENTY, VALUES, 10, 7), VALUES)).toEqual({ System: 3, Data: 3, Utilities: 2, 'File Storage': 2 });
    });

    it('takes all of a scarce value and spreads its share over the others', () => {
        const scarce = records({ System: 1, Data: 100, Utilities: 100, 'File Storage': 100 });
        expect(CountPerValue(StratifiedSample(scarce, VALUES, 10, 7), VALUES)).toEqual({ System: 1, Data: 3, Utilities: 3, 'File Storage': 3 });
    });

    it('returns every record when fewer exist than requested', () => {
        const few = records({ System: 2, Data: 1, Utilities: 0, 'File Storage': 3 });
        expect(StratifiedSample(few, VALUES, 200, 7)).toHaveLength(6);
    });

    it('is the same for the same seed, whatever order the rows came in', () => {
        const first = StratifiedSample(PLENTY, VALUES, 40, 7);
        expect(StratifiedSample([...PLENTY].reverse(), VALUES, 40, 7)).toEqual(first);
        expect(StratifiedSample(SeededShuffle(PLENTY, CreateSeededRandom(99)), VALUES, 40, 7)).toEqual(first);
    });

    it('differs for another seed', () => {
        const ids = (seed: number): string[] => StratifiedSample(PLENTY, VALUES, 40, seed).map((r) => r.RecordID).sort();
        expect(ids(8)).not.toEqual(ids(7));
    });

    it('ignores records whose label is not one of the values, and never repeats a record', () => {
        const mixed = [...records({ System: 5, Data: 5 }), ...records({ Other: 50 })];
        const sample = StratifiedSample(mixed, ['System', 'Data'], 100, 7);
        expect(sample).toHaveLength(10);
        expect(new Set(sample.map((r) => r.RecordID)).size).toBe(10);
        expect(sample.every((r) => r.Label !== 'Other')).toBe(true);
    });
});

describe('CanonicalLabel', () => {
    it('maps a raw label to the value it names, ignoring case and spaces', () => {
        expect(CanonicalLabel(VALUES, ' file storage ')).toBe('File Storage');
        expect(CanonicalLabel(VALUES, 'Other')).toBeNull();
        expect(CanonicalLabel(VALUES, null)).toBeNull();
    });
});
