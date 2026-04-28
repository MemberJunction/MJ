/**
 * Tests for RerankerBudgetGuard (P2D.6).
 */
import { describe, it, expect } from 'vitest';
import { RerankerBudgetGuard } from '../rerankers/RerankerBudgetGuard';

describe('RerankerBudgetGuard', () => {
    describe('uncapped (null budget)', () => {
        it('CanSpend always returns true', () => {
            const g = new RerankerBudgetGuard(null);
            expect(g.CanSpend(0)).toBe(true);
            expect(g.CanSpend(1)).toBe(true);
            expect(g.CanSpend(1_000_000)).toBe(true);
        });

        it('Remaining returns null', () => {
            expect(new RerankerBudgetGuard(null).Remaining()).toBeNull();
        });

        it('Spent still accumulates for observability', () => {
            const g = new RerankerBudgetGuard(null);
            g.Record(0.5);
            g.Record(1.5);
            expect(g.Spent).toBeCloseTo(2);
        });

        it('treats undefined the same as null', () => {
            const g = new RerankerBudgetGuard(undefined);
            expect(g.Budget).toBeNull();
            expect(g.CanSpend(1_000_000)).toBe(true);
        });
    });

    describe('capped budget', () => {
        it('CanSpend returns true while estimate fits in remaining budget', () => {
            const g = new RerankerBudgetGuard(10);
            expect(g.CanSpend(5)).toBe(true);
            expect(g.CanSpend(10)).toBe(true);
        });

        it('CanSpend returns false when estimate exceeds remaining budget', () => {
            const g = new RerankerBudgetGuard(10);
            expect(g.CanSpend(11)).toBe(false);
        });

        it('Remaining decreases as Record is called', () => {
            const g = new RerankerBudgetGuard(10);
            expect(g.Remaining()).toBe(10);
            g.Record(3);
            expect(g.Remaining()).toBe(7);
            g.Record(2);
            expect(g.Remaining()).toBe(5);
        });

        it('clamps Remaining at 0 when over-spent (defensive — Record never blocks)', () => {
            const g = new RerankerBudgetGuard(5);
            g.Record(7);
            expect(g.Remaining()).toBe(0);
            expect(g.Spent).toBe(7);
            expect(g.CanSpend(1)).toBe(false);
        });

        it('CanSpend(0) returns true even on a depleted budget', () => {
            const g = new RerankerBudgetGuard(0);
            expect(g.CanSpend(0)).toBe(true);
            expect(g.CanSpend(0.01)).toBe(false);
        });

        it('treats negative estimates as 0 (defensive)', () => {
            const g = new RerankerBudgetGuard(0);
            expect(g.CanSpend(-5)).toBe(true);
        });

        it('clamps a negative budget input to 0', () => {
            const g = new RerankerBudgetGuard(-10);
            expect(g.Budget).toBe(0);
            expect(g.CanSpend(0.01)).toBe(false);
        });
    });

    describe('Record edge cases', () => {
        it('ignores 0', () => {
            const g = new RerankerBudgetGuard(10);
            g.Record(0);
            expect(g.Spent).toBe(0);
        });

        it('ignores negative cents (cannot un-spend)', () => {
            const g = new RerankerBudgetGuard(10);
            g.Record(2);
            g.Record(-5);
            expect(g.Spent).toBe(2);
        });

        it('ignores NaN / Infinity', () => {
            const g = new RerankerBudgetGuard(10);
            g.Record(NaN);
            g.Record(Number.POSITIVE_INFINITY);
            expect(g.Spent).toBe(0);
        });
    });

    describe('AsCostReporter', () => {
        it('returns a callable that records on this guard', () => {
            const g = new RerankerBudgetGuard(10);
            const reporter = g.AsCostReporter();
            reporter(0.25);
            reporter(0.75);
            expect(g.Spent).toBe(1);
        });

        it('captures the guard instance even when reassigned', () => {
            const g = new RerankerBudgetGuard(10);
            const detached = g.AsCostReporter();
            // Reassign to simulate the reranker's CostReporter property
            const reporter: (c: number) => void = detached;
            reporter(2);
            expect(g.Spent).toBe(2);
        });
    });

    describe('Integration scenario: Cohere-style multi-call accumulation', () => {
        it('short-circuits when the next call would exceed the cap', () => {
            // Budget: 1¢. Two consecutive 0.6¢ calls should let the first through and
            // block the second.
            const g = new RerankerBudgetGuard(1);
            const reporter = g.AsCostReporter();

            // First call
            expect(g.CanSpend(0.6)).toBe(true);
            reporter(0.6);
            expect(g.Remaining()).toBeCloseTo(0.4);

            // Second call — the budget guard rejects before we incur the cost
            expect(g.CanSpend(0.6)).toBe(false);
        });
    });
});
