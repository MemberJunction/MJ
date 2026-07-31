import { describe, it, expect } from 'vitest';
import { normalizeUrlForLoop, computeStateSignature, detectLoop , stateRepeatThresholdFor } from '../engine/loop-detection.js';

describe('normalizeUrlForLoop (CU-B1)', () => {
    it('strips the hash fragment', () => {
        expect(normalizeUrlForLoop('http://h/app/x#frag')).toBe('http://h/app/x');
    });

    it('strips declared volatile params but keeps the rest', () => {
        const out = normalizeUrlForLoop('http://h/app?entity=A&_t=999', ['_t']);
        expect(out).toBe('http://h/app?entity=A');
    });

    it('sorts params so order does not matter', () => {
        expect(normalizeUrlForLoop('http://h/app?b=2&a=1')).toBe(normalizeUrlForLoop('http://h/app?a=1&b=2'));
    });

    it('returns non-URL strings trimmed rather than throwing', () => {
        expect(normalizeUrlForLoop('  not a url  ')).toBe('not a url');
        expect(normalizeUrlForLoop('')).toBe('');
    });
});

describe('computeStateSignature (CU-B1)', () => {
    it('combines normalized URL and hash', () => {
        expect(computeStateSignature('http://h/app#x', 'abc123', [])).toBe('http://h/app|abc123');
    });

    it('returns empty when there is no hash (unperceivable step)', () => {
        expect(computeStateSignature('http://h/app', '', [])).toBe('');
    });

    it('same page + same screen → equal signatures even with a volatile token', () => {
        const a = computeStateSignature('http://h/app?_t=1', 'HASH', ['_t']);
        const b = computeStateSignature('http://h/app?_t=2', 'HASH', ['_t']);
        expect(a).toBe(b);
    });
});

describe('detectLoop (CU-B1)', () => {
    it('returns null below the repeat threshold', () => {
        expect(detectLoop(['a', 'b', 'a'], 3)).toBeNull();
    });

    it('flags a repeated state at the threshold', () => {
        const loop = detectLoop(['a', 'b', 'a', 'c', 'a'], 3);
        expect(loop?.kind).toBe('repeat-state');
        expect(loop?.count).toBe(3);
        expect(loop?.detail).toContain('3 times');
    });

    it('ignores empty signatures (unperceivable steps do not count as a repeat)', () => {
        expect(detectLoop(['', '', ''], 3)).toBeNull();
    });

    it('detects a period-2 A/B cycle', () => {
        const loop = detectLoop(['x', 'a', 'b', 'a', 'b'], 99); // threshold high so only cycle can fire
        expect(loop?.kind).toBe('cycle');
        expect(loop?.count).toBe(2);
    });

    it('detects a period-3 cycle', () => {
        const loop = detectLoop(['a', 'b', 'c', 'a', 'b', 'c'], 99);
        expect(loop?.kind).toBe('cycle');
        expect(loop?.count).toBe(3);
    });

    it('does not flag a healthy, progressing run', () => {
        expect(detectLoop(['a', 'b', 'c', 'd', 'e'], 3)).toBeNull();
    });

    it('prefers repeat-state over cycle when both apply', () => {
        // "a" appears 3× (threshold) and there is also an a/b cycle.
        const loop = detectLoop(['a', 'b', 'a', 'b', 'a'], 3);
        expect(loop?.kind).toBe('repeat-state');
    });
});

describe('stateRepeatThresholdFor', () => {
    it('leaves a single-goal run on the base threshold', () => {
        expect(stateRepeatThresholdFor(3, 0)).toBe(3);
    });

    it('allows one extra revisit per requested part', () => {
        // A 6-section tour must tolerate returning to its hub once per section.
        expect(stateRepeatThresholdFor(3, 6)).toBe(9);
        expect(stateRepeatThresholdFor(3, 3)).toBe(6);
    });

    it('covers the criteria-scored case that made T124 unpassable', () => {
        // "Clearing the filter RESTORES the fuller list" requires returning to an
        // earlier state as the PASS condition — 3 criteria, so 3 extra revisits.
        expect(stateRepeatThresholdFor(3, 3)).toBe(6);
    });

    it('never returns below the base threshold for junk input', () => {
        expect(stateRepeatThresholdFor(3, -5)).toBe(3);
        expect(stateRepeatThresholdFor(3, Number.NaN)).toBe(3);
        expect(stateRepeatThresholdFor(3, Infinity)).toBe(3);
    });

    it('floors fractional part counts', () => {
        expect(stateRepeatThresholdFor(3, 2.9)).toBe(5);
    });

    it('honors a non-default base threshold from the app profile', () => {
        expect(stateRepeatThresholdFor(5, 4)).toBe(9);
    });
});

describe('cycle tolerance for multi-part goals', () => {
    // hub → section → hub → section: one repetition of a 2-state block.
    const tourShape = ['hub', 'sect', 'hub', 'sect'];

    it('trips on a single A-B-A-B repetition at the default tolerance', () => {
        const signal = detectLoop(tourShape, 99, 2);
        expect(signal?.kind).toBe('cycle');
    });

    it('does NOT trip on that same shape when tolerance is raised', () => {
        // This is the T038 regression: latching 2 of 6 checkpoints requires
        // alternating hub/section, and the old hardcoded 2 killed it at step 12.
        expect(detectLoop(tourShape, 99, 3)).toBeNull();
    });

    it('still trips once the block genuinely repeats enough times', () => {
        const spinning = ['hub', 'sect', 'hub', 'sect', 'hub', 'sect'];
        expect(detectLoop(spinning, 99, 3)?.kind).toBe('cycle');
    });

    it('reports how many repetitions it required', () => {
        const spinning = ['a', 'b', 'a', 'b', 'a', 'b'];
        expect(detectLoop(spinning, 99, 3)?.detail).toContain('3× over');
    });

    it('clamps a nonsense tolerance up to the minimum of 2', () => {
        expect(detectLoop(tourShape, 99, 0)?.kind).toBe('cycle');
        expect(detectLoop(tourShape, 99, -4)?.kind).toBe('cycle');
    });

    it('no longer puts fabricated step numbers in repeat-state evidence', () => {
        // The engine clears this history on checkpoint progress, so array indices
        // stop matching real step numbers — reporting them was misleading.
        const detail = detectLoop(['x', 'x', 'x'], 3)?.detail ?? '';
        expect(detail).toContain('3 times');
        expect(detail).not.toMatch(/steps? \d/);
    });
});
