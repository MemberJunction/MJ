import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BandFor, DraftProblems, Frozen, WeightShares } from '../authoring.js';
import type { RubricNodeSnapshot, RubricScaleSnapshot } from '../types.js';

const scale: RubricScaleSnapshot = {
    id: 'scale',
    scaleType: 'Levels',
    higherIsBetter: true,
    levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }],
};

function leaf(id: string, weight: number, extra: Partial<RubricNodeSnapshot> = {}): RubricNodeSnapshot {
    return {
        id, key: id, name: id, nodeType: 'Criterion', scaleId: 'scale', weight,
        isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0,
        ...extra,
    };
}

describe('rubric authoring helpers', () => {
    it('shares weight among non-advisory siblings and matches a parent id in another case', () => {
        const shares = WeightShares([
            leaf('a', 1, { parentId: 'GROUP' }),
            leaf('b', 3, { parentId: 'group' }),
            leaf('note', 5, { parentId: 'group', isAdvisory: true }),
        ]);
        expect(shares.get('a')).toBe(25);
        expect(shares.get('b')).toBe(75);
        expect(shares.get('note')).toBe(0);
    });

    it('names a duplicate key, a missing scale, a gate with no minimum, and a cycle', () => {
        const problems = DraftProblems([
            leaf('a', 1),
            leaf('b', 1, { key: 'a' }),
            leaf('c', 1, { scaleId: null }),
            leaf('d', 1, { isGate: true }),
            leaf('parent', 1, { parentId: 'CHILD' }),
            leaf('child', 1, { id: 'child', parentId: 'parent' }),
        ], [scale]);
        const text = problems.join(' ');
        expect(text).toMatch(/Duplicate key a/);
        expect(text).toMatch(/c needs a scale/);
        expect(text).toMatch(/d is a gate with no minimum/);
        expect(text).toMatch(/parent is inside its own descendant/);
    });

    it('puts a boundary score in the next band after rounding to six places', () => {
        const bands = [
            { id: 'under', label: 'Under', minScore: 0, maxScore: 0.8, displayTone: 'Warning', sequence: 0 },
            { id: 'met', label: 'Met', minScore: 0.8, maxScore: 1, displayTone: 'Success', sequence: 1 },
        ];
        expect(BandFor(0.5, bands)?.id).toBe('under');
        expect(BandFor(0.8, bands)?.id).toBe('met');
        expect(BandFor(0.7999999999999999, bands)?.id).toBe('met');
        expect(BandFor(1, bands)?.id).toBe('met');
        expect(BandFor(null, bands)).toBeNull();
    });

    it('freezes a scale only when a published version uses it, ignoring case', () => {
        expect(Frozen(['USED'], 'used')).toBe(true);
        expect(Frozen(['used'], 'draft-scale')).toBe(false);
        expect(Frozen(['used'], null)).toBe(false);
        expect(Frozen(['used'], '')).toBe(false);
    });

    it('is the band rule scoring uses', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../RubricScoring.ts'), 'utf8');
        expect(source).toContain('return BandFor(score, version.bands)?.id ?? null');
        expect(source).not.toContain('function round6');
    });
});
