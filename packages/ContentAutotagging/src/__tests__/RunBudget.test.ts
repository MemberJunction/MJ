import { describe, it, expect } from 'vitest';
import { RunBudget } from '../Engine/generic/RunBudget';

describe('RunBudget', () => {
    it('returns ok when no limits set', () => {
        const b = new RunBudget({});
        b.recordTagCreated();
        b.recordTokens(10000);
        b.recordCost(99.99);
        expect(b.checkBudgets().ok).toBe(true);
    });

    it('flags MaxNewTagsPerRunExceeded once cap reached', () => {
        const b = new RunBudget({ MaxNewTagsPerRun: 2 });
        b.recordTagCreated();
        expect(b.checkBudgets().ok).toBe(true);
        b.recordTagCreated();
        const verdict = b.checkBudgets();
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('MaxNewTagsPerRunExceeded');
    });

    it('flags MaxTokensPerRunExceeded once tokens exceeded', () => {
        const b = new RunBudget({ MaxTokensPerRun: 1000 });
        b.recordTokens(500);
        expect(b.checkBudgets().ok).toBe(true);
        b.recordTokens(600);
        expect(b.checkBudgets().reason).toBe('MaxTokensPerRunExceeded');
    });

    it('flags MaxCostPerRunExceeded once cost exceeded', () => {
        const b = new RunBudget({ MaxCostPerRun: 1.0 });
        b.recordCost(0.5);
        expect(b.checkBudgets().ok).toBe(true);
        b.recordCost(0.6);
        expect(b.checkBudgets().reason).toBe('MaxCostPerRunExceeded');
    });

    it('reports stable order: tags → tokens → cost when multiple breached', () => {
        const b = new RunBudget({ MaxNewTagsPerRun: 1, MaxTokensPerRun: 1, MaxCostPerRun: 1 });
        b.recordTagCreated();
        b.recordTokens(1);
        b.recordCost(1);
        expect(b.checkBudgets().reason).toBe('MaxNewTagsPerRunExceeded');
    });

    it('per-item budget exhausts independently of run budget', () => {
        const b = new RunBudget({ MaxNewTagsPerItem: 2 });
        b.startItem();
        b.recordTagCreated();
        b.recordTagCreated();
        expect(b.itemTagBudgetExhausted()).toBe(true);

        // Reset on new item
        b.startItem();
        expect(b.itemTagBudgetExhausted()).toBe(false);
    });

    it('snapshot reports current counters', () => {
        const b = new RunBudget({});
        b.recordTagCreated();
        b.recordTokens(50);
        b.recordCost(0.25);
        const snap = b.snapshot();
        expect(snap.tagsRun).toBe(1);
        expect(snap.tokens).toBe(50);
        expect(snap.cost).toBe(0.25);
    });

    it('ignores non-positive recordTokens / recordCost', () => {
        const b = new RunBudget({});
        b.recordTokens(-5);
        b.recordTokens(NaN);
        b.recordCost(-1);
        const snap = b.snapshot();
        expect(snap.tokens).toBe(0);
        expect(snap.cost).toBe(0);
    });

    describe('MaxItemsPerRun', () => {
        it('returns ok when MaxItemsPerRun unset, regardless of items processed', () => {
            const b = new RunBudget({});
            b.recordItemsProcessed(10_000);
            expect(b.checkBudgets().ok).toBe(true);
        });

        it('flags MaxItemsPerRunExceeded once item count reaches the cap', () => {
            const b = new RunBudget({ MaxItemsPerRun: 5 });
            b.recordItemsProcessed(3);
            expect(b.checkBudgets().ok).toBe(true);
            b.recordItemsProcessed(2);
            const verdict = b.checkBudgets();
            expect(verdict.ok).toBe(false);
            expect(verdict.reason).toBe('MaxItemsPerRunExceeded');
            expect(verdict.details).toContain('5/5');
        });

        it('accumulates across multiple recordItemsProcessed calls', () => {
            const b = new RunBudget({ MaxItemsPerRun: 10 });
            for (let i = 0; i < 4; i++) b.recordItemsProcessed(2);
            expect(b.checkBudgets().ok).toBe(true);
            expect(b.snapshot().items).toBe(8);
            b.recordItemsProcessed(3);
            expect(b.checkBudgets().ok).toBe(false);
            expect(b.snapshot().items).toBe(11);
        });

        it('items takes priority over other reasons when multiple breached', () => {
            // Priority order is items → tags → tokens → cost — the items knob is
            // most user-facing so it wins reporting when several caps trip together.
            const b = new RunBudget({
                MaxItemsPerRun: 1,
                MaxNewTagsPerRun: 1,
                MaxTokensPerRun: 1,
                MaxCostPerRun: 1,
            });
            b.recordItemsProcessed(1);
            b.recordTagCreated();
            b.recordTokens(1);
            b.recordCost(1);
            expect(b.checkBudgets().reason).toBe('MaxItemsPerRunExceeded');
        });

        it('ignores non-positive recordItemsProcessed', () => {
            const b = new RunBudget({ MaxItemsPerRun: 5 });
            b.recordItemsProcessed(-3);
            b.recordItemsProcessed(NaN);
            b.recordItemsProcessed(0);
            expect(b.snapshot().items).toBe(0);
            expect(b.checkBudgets().ok).toBe(true);
        });

        it('snapshot reports items counter', () => {
            const b = new RunBudget({});
            b.recordItemsProcessed(7);
            expect(b.snapshot().items).toBe(7);
        });
    });
});
