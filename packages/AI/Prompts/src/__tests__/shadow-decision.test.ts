import { describe, it, expect, vi, beforeEach } from 'vitest';

const logError = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (...args: unknown[]) => logError(...args) };
});

import type { DecisionAnswer } from '@memberjunction/ai';
import { BuildShadowDecisionRecord, StartShadowDecision, SHADOW_DECISION_RUN_NAME_PREFIX, type ShadowDecisionRunner } from '../decision/shadow-decision';
import { AIDecisionParams, type AIDecisionRunResult } from '../decision/decision-runner.types';

/** The fields of a decision run row the shadow helper writes. */
interface FakePromptRun {
    RunName: string | null;
    Comments: string | null;
    Save: () => Promise<boolean>;
    LatestResult?: { CompleteMessage: string };
}

const answers: Record<string, DecisionAnswer> = {
    category: { Kind: 'Choice', Value: 'billing', Confidence: 0.92, Probabilities: { billing: 0.92, outage: 0.08 } },
};

function makeRun(success: boolean, promptRun?: FakePromptRun): AIDecisionRunResult {
    return {
        success,
        errorMessage: success ? undefined : 'no credential',
        Answers: success ? answers : {},
        promptRun,
    } as unknown as AIDecisionRunResult; // a stand-in for the run result; only these fields are read
}

function makeRunner(run: AIDecisionRunResult | Error): ShadowDecisionRunner & { Waited: number } {
    const runner = {
        Waited: 0,
        ExecuteDecision: vi.fn(async () => {
            if (run instanceof Error) {
                throw run;
            }
            return run;
        }),
        WaitForPendingPromptRunSaves: vi.fn(async () => {
            runner.Waited++;
        }),
    };
    return runner;
}

const compareCategory = (decided: Record<string, DecisionAnswer>, primary: string) => {
    const choice = decided['category'];
    const value = choice?.Kind === 'Choice' ? choice.Value : null;
    return { Agreed: value === primary, Summary: `decision chose ${value}, prompt chose ${primary}` };
};

describe('BuildShadowDecisionRecord', () => {
    it('records the comparison when the decision answered', () => {
        const record = BuildShadowDecisionRecord('feedback-classifier', makeRun(true), 'billing', compareCategory);
        expect(record).toEqual({
            Shadow: { Use: 'feedback-classifier', DecisionSucceeded: true, Comparison: { Agreed: true, Summary: 'decision chose billing, prompt chose billing' } },
        });
    });

    it('records the error and compares nothing when the decision failed', () => {
        const compare = vi.fn(compareCategory);
        const record = BuildShadowDecisionRecord('feedback-classifier', makeRun(false), 'billing', compare);
        expect(record.Shadow.DecisionSucceeded).toBe(false);
        expect(record.Shadow.Error).toBe('no credential');
        expect(compare).not.toHaveBeenCalled();
    });

    it('records a comparison that throws as an error, never throwing itself', () => {
        const record = BuildShadowDecisionRecord('feedback-classifier', makeRun(true), 'billing', () => {
            throw new Error('bad shape');
        });
        expect(record.Shadow.Error).toBe('the comparison threw: bad shape');
    });
});

describe('StartShadowDecision', () => {
    beforeEach(() => logError.mockClear());

    it('starts the decision at once, then tags its run with the use and the comparison', async () => {
        const promptRun: FakePromptRun = { RunName: null, Comments: null, Save: vi.fn(async () => true) };
        const runner = makeRunner(makeRun(true, promptRun));
        const handle = StartShadowDecision<string>({ Use: 'feedback-classifier', Decision: new AIDecisionParams(), Compare: compareCategory, Runner: runner });

        expect(runner.ExecuteDecision).toHaveBeenCalledTimes(1);
        const record = await handle.Record('outage');

        expect(record?.Shadow.Comparison?.Agreed).toBe(false);
        expect(runner.Waited).toBe(1);
        expect(promptRun.RunName).toBe(`${SHADOW_DECISION_RUN_NAME_PREFIX}feedback-classifier`);
        expect(JSON.parse(promptRun.Comments ?? '{}')).toEqual(record);
        expect(promptRun.Save).toHaveBeenCalledTimes(1);
        expect(logError).not.toHaveBeenCalled();
    });

    it('logs a failed save and still returns the record', async () => {
        const promptRun: FakePromptRun = { RunName: null, Comments: null, Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'permission denied' } };
        const record = await StartShadowDecision<string>({
            Use: 'feedback-classifier', Decision: new AIDecisionParams(), Compare: compareCategory, Runner: makeRunner(makeRun(true, promptRun)),
        }).Record('billing');

        expect(record?.Shadow.Comparison?.Agreed).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    });

    it('never throws when the decision throws, and records why', async () => {
        const record = await StartShadowDecision<string>({
            Use: 'feedback-classifier', Decision: new AIDecisionParams(), Compare: compareCategory, Runner: makeRunner(new Error('socket hang up')),
        }).Record('billing');

        expect(record?.Shadow.DecisionSucceeded).toBe(false);
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('socket hang up'));
    });

    it('logs when the decision wrote no run to record on', async () => {
        const record = await StartShadowDecision<string>({
            Use: 'feedback-classifier', Decision: new AIDecisionParams(), Compare: compareCategory, Runner: makeRunner(makeRun(true)),
        }).Record('billing');

        expect(record?.Shadow.Comparison?.Agreed).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('no prompt run'));
    });
});
