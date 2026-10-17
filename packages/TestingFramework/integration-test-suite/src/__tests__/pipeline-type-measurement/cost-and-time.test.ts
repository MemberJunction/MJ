/**
 * cost-and-time.test.ts — wall time, cost and latency per 1,000 records, and reading a prompt run's cost
 * (`TotalCost`, falling back to `Cost`), against hand-computed values.
 */
import { describe, expect, it } from 'vitest';
import {
    DistinctPromptRunIDs, IsPromptRunFinished, PROMPT_RUN_COST_FIELDS, Per1000, PredictionCost, SummarizeCost, SummarizeLatency, SummarizeWallTime, ToPromptRunCost,
} from '../../pipeline-type-measurement/cost-and-time';
import type { PromptRunCostRow } from '../../pipeline-type-measurement/cost-and-time';
import type { BatchTiming } from '../../pipeline-type-measurement/types';
import { Answer, RunCost } from './fixtures';

function row(overrides: Partial<PromptRunCostRow>): PromptRunCostRow {
    return { ID: 'run', Status: 'Completed', TotalCost: null, Cost: null, CostCurrency: 'USD', ExecutionTimeMS: 250, Model: 'Jev', Vendor: 'OpenRouter', ...overrides };
}

describe('Per1000', () => {
    it('scales a total to 1,000 records', () => {
        expect(Per1000(5, 10)).toBe(500);
        expect(Per1000(0.03, 4)).toBeCloseTo(7.5, 10);
    });

    it('is null with no records', () => {
        expect(Per1000(1, 0)).toBeNull();
    });
});

describe('SummarizeWallTime', () => {
    it('sums one type\'s ProcessBatch calls and rates them per 1,000 records', () => {
        const timings: BatchTiming[] = [
            { Type: 'LLM', Rep: 1, RecordCount: 100, WallMs: 20_000 },
            { Type: 'LLM', Rep: 2, RecordCount: 50, WallMs: 10_000 },
            { Type: 'Decision', Rep: 1, RecordCount: 150, WallMs: 3_000 },
        ];
        expect(SummarizeWallTime(timings, 'LLM')).toEqual({ Records: 150, TotalWallMs: 30_000, MsPer1000: 200_000 });
        expect(SummarizeWallTime(timings, 'Decision')).toEqual({ Records: 150, TotalWallMs: 3_000, MsPer1000: 20_000 });
    });
});

describe('SummarizeCost', () => {
    const answers = [Answer('LLM', 1, 'r1', 'A'), Answer('LLM', 1, 'r2', 'A'), Answer('LLM', 1, 'r3', 'B'), { ...Answer('LLM', 1, 'r4', null), PromptRunID: null }];

    it('spreads the known cost over every answer and counts what is unknown', () => {
        const costs = new Map([
            ['LLM-1-r1', RunCost('LLM-1-r1', 0.01)],
            ['LLM-1-r2', RunCost('LLM-1-r2', 0.02)],
            ['LLM-1-r3', RunCost('LLM-1-r3', null)],
        ]);
        // 0.03 over 4 answers = 7.5 per 1,000; 2 of 3 runs have a cost; the 4th answer has no run.
        const cost = SummarizeCost(answers, costs);
        expect(cost).toMatchObject({ Records: 4, Runs: 3, RunsWithCost: 2, Currencies: ['USD'] });
        expect(cost.TotalCost).toBeCloseTo(0.03, 10);
        expect(cost.CostPer1000).toBeCloseTo(7.5, 10);
    });

    it('has no cost per 1,000 when no run\'s cost is known', () => {
        expect(SummarizeCost(answers, new Map()).CostPer1000).toBeNull();
    });

    it('reads one answer\'s cost', () => {
        const costs = new Map([['LLM-1-r1', RunCost('LLM-1-r1', 0.01)]]);
        expect(PredictionCost(answers[0], costs)).toBe(0.01);
        expect(PredictionCost(answers[3], costs)).toBeNull();
        expect(PredictionCost(undefined, costs)).toBeNull();
    });
});

describe('DistinctPromptRunIDs', () => {
    it('lists each prompt run once, in first-seen order, skipping answers with none', () => {
        const runA = Answer('LLM', 1, 'a', 'A');
        expect(DistinctPromptRunIDs([runA, { ...Answer('LLM', 1, 'b', null), PromptRunID: null }, runA, Answer('LLM', 1, 'c', 'B')])).toEqual(['LLM-1-a', 'LLM-1-c']);
    });
});

describe('SummarizeLatency', () => {
    it('takes the nearest-rank median and 90th percentile of the runs\' ExecutionTimeMS', () => {
        const answers = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => Answer('Decision', 1, id, 'A'));
        const costs = new Map(answers.map((a, i) => [a.PromptRunID ?? '', RunCost(a.PromptRunID ?? '', 0.001, [300, 100, 500, 200, 400][i])]));
        expect(SummarizeLatency(answers, costs)).toEqual({ Known: 5, P50Ms: 300, P90Ms: 500 });
    });

    it('is empty when no latency is known', () => {
        expect(SummarizeLatency([Answer('LLM', 1, 'r1', 'A')], new Map())).toEqual({ Known: 0, P50Ms: null, P90Ms: null });
    });
});

describe('ToPromptRunCost', () => {
    it('reads TotalCost, which includes descendant cost', () => {
        expect(ToPromptRunCost('run', row({ TotalCost: 0.5, Cost: 0.2 })).Cost).toBe(0.5);
    });

    it('falls back to Cost when TotalCost is not set', () => {
        expect(ToPromptRunCost('run', row({ TotalCost: null, Cost: 0.2 })).Cost).toBe(0.2);
    });

    it('keeps a TotalCost of zero rather than falling back', () => {
        expect(ToPromptRunCost('run', row({ TotalCost: 0, Cost: 0.2 })).Cost).toBe(0);
    });

    it('has no cost when neither is set, or when the row was not found', () => {
        expect(ToPromptRunCost('run', row({})).Cost).toBeNull();
        expect(ToPromptRunCost('run', undefined)).toEqual({ PromptRunID: 'run', Cost: null, Currency: null, ExecutionTimeMS: null, Model: null, Vendor: null, Finished: false });
    });

    it('reads the model that answered and its vendor', () => {
        expect(ToPromptRunCost('run', row({ Model: 'LLM Decision', Vendor: 'MemberJunction' }))).toMatchObject({ Model: 'LLM Decision', Vendor: 'MemberJunction' });
    });

    it('reads the model and vendor columns', () => {
        expect(PROMPT_RUN_COST_FIELDS).toEqual(expect.arrayContaining(['Model', 'Vendor']));
    });

    it('is finished only once the finalize save set a terminal status', () => {
        expect(IsPromptRunFinished(row({ Status: 'Completed' }))).toBe(true);
        expect(IsPromptRunFinished(row({ Status: 'Failed' }))).toBe(true);
        expect(IsPromptRunFinished(row({ Status: 'Running' }))).toBe(false);
        expect(IsPromptRunFinished(undefined)).toBe(false);
    });
});
