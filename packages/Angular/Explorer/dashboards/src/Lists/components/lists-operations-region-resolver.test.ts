import { describe, it, expect } from 'vitest';
import { resolveVennRegion, type ResolvableVennRegion } from './lists-operations-region-resolver';

/**
 * Focused unit tests for the pure region resolver used by the Lists
 * Operations agent client tool (SelectVennRegion). Covers exact, tolerant,
 * set-label, substring, and ambiguity cases.
 */
describe('resolveVennRegion', () => {
    const regions: ResolvableVennRegion[] = [
        { label: 'A ∩ B', setLabels: ['List A', 'List B'], size: 12 },
        { label: 'Only A', setLabels: ['List A'], size: 30 },
        { label: 'Only B', setLabels: ['List B'], size: 18 },
    ];

    it('matches an exact label', () => {
        expect(resolveVennRegion(regions, 'A ∩ B')?.size).toBe(12);
    });

    it('matches a label case- and whitespace-insensitively', () => {
        expect(resolveVennRegion(regions, '  only a ')?.label).toBe('Only A');
    });

    it('matches by comma-separated operand set-labels in any order', () => {
        expect(resolveVennRegion(regions, 'List B, List A')?.label).toBe('A ∩ B');
    });

    it('matches a single multi-word operand set-label', () => {
        const r = resolveVennRegion(regions, 'list a');
        expect(r?.label).toBe('Only A');
    });

    it('falls back to an unambiguous substring match', () => {
        // "∩" appears in only one label.
        expect(resolveVennRegion(regions, '∩')?.label).toBe('A ∩ B');
    });

    it('returns null when a substring match is ambiguous', () => {
        // "only" appears in two labels → ambiguous → no match.
        expect(resolveVennRegion(regions, 'only')).toBeNull();
    });

    it('returns null for an unknown region', () => {
        expect(resolveVennRegion(regions, 'List C')).toBeNull();
    });

    it('returns null for empty query or empty region set', () => {
        expect(resolveVennRegion(regions, '')).toBeNull();
        expect(resolveVennRegion([], 'A ∩ B')).toBeNull();
    });
});
