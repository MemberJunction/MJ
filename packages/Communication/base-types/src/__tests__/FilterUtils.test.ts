/**
 * `CombineFilterClauses` — the primitive that replaced assignment with composition.
 *
 * Written against the CONTRACT rather than the implementation. The behaviour that matters is not
 * "joins strings"; it is that a clause a caller supplied can never be dropped on the floor, because
 * that is the failure it was extracted to prevent — every provider had independently written
 * `query = contextData.query`, discarding whatever it had already built and telling nobody.
 */
import { describe, expect, it } from 'vitest';
import { CombineFilterClauses } from '../FilterUtils';

describe('CombineFilterClauses', () => {
    it('joins the clauses with the operator it was given', () => {
        expect(CombineFilterClauses(['a', 'b'], ' and ')).toBe('a and b');
    });

    it('uses a bare space when that is the operator, for Gmail-style implicit AND', () => {
        expect(CombineFilterClauses(['is:unread', 'after:123'], ' ')).toBe('is:unread after:123');
    });

    it('returns a single clause untouched, with no operator anywhere', () => {
        expect(CombineFilterClauses(['only'], ' and ')).toBe('only');
    });

    it('returns empty string when there is nothing to say', () => {
        // Every caller passes the result straight to its client, so '' has to mean "no filter"
        // rather than being something a provider has to special-case.
        expect(CombineFilterClauses([], ' and ')).toBe('');
    });

    describe('absent clauses contribute nothing rather than an empty term', () => {
        // All four of these arise naturally from a conditionally-built clause list. Any of them
        // leaking through would produce a trailing operator and a syntactically invalid query.
        for (const absent of [null, undefined, '', '   ']) {
            it(`drops ${JSON.stringify(absent)}`, () => {
                expect(CombineFilterClauses(['a', absent, 'b'], ' and ')).toBe('a and b');
            });
        }

        it('returns empty string when every clause is absent', () => {
            expect(CombineFilterClauses([null, undefined, '', '  '], ' and ')).toBe('');
        });

        it('does not emit a leading or trailing operator when the edges are absent', () => {
            expect(CombineFilterClauses([null, 'middle', undefined], ' and ')).toBe('middle');
        });
    });

    it('trims surrounding whitespace off the clauses it keeps', () => {
        expect(CombineFilterClauses(['  a  ', ' b '], ' and ')).toBe('a and b');
    });

    it('preserves order, because filter order is the caller-readable form', () => {
        expect(CombineFilterClauses(['first', 'second', 'third'], ' and ')).toBe('first and second and third');
    });

    it('NEVER discards a clause — the whole point', () => {
        // The direction of this assertion is what matters. A refactor that reintroduced assignment
        // would still pass "joins strings" but would fail here.
        const clauses = ['unread', 'dated', 'custom'];
        const combined = CombineFilterClauses(clauses, ' and ');
        for (const c of clauses) expect(combined).toContain(c);
    });

    it('does not parenthesise — grouping is the caller\'s decision', () => {
        // Graph parenthesises its own clauses because `and`/`or` precedence matters there; Gmail
        // does not. Doing it here would corrupt one of them.
        expect(CombineFilterClauses(['a or b', 'c'], ' and ')).toBe('a or b and c');
    });
});
