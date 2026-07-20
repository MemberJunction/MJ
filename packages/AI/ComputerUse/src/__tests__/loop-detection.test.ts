import { describe, it, expect } from 'vitest';
import { normalizeUrlForLoop, computeStateSignature, detectLoop } from '../engine/loop-detection.js';

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
