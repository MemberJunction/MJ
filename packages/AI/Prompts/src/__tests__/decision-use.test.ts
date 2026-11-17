import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

import type { DecisionAnswer } from '@memberjunction/ai';
import { ResolveDecisionUseMode, RunDecisionUse, type DecisionUseMode, type DecisionUseRequest } from '../decision/decision-use';
import type { ShadowDecisionRunner } from '../decision/shadow-decision';
import { AIDecisionParams, type AIDecisionRunResult } from '../decision/decision-runner.types';

const CHOICE: Record<string, DecisionAnswer> = {
    category: { Kind: 'Choice', Value: 'billing', Confidence: 0.9, Probabilities: { billing: 0.9, outage: 0.1 } },
};

function run(success: boolean, answers: Record<string, DecisionAnswer> = CHOICE): AIDecisionRunResult {
    return { success, errorMessage: success ? undefined : 'no credential', Answers: success ? answers : {} } as unknown as AIDecisionRunResult; // only these fields are read
}

function runnerReturning(result: AIDecisionRunResult | Error): ShadowDecisionRunner {
    return {
        ExecuteDecision: vi.fn(async () => {
            if (result instanceof Error) {
                throw result;
            }
            return result;
        }),
        WaitForPendingPromptRunSaves: vi.fn(async () => undefined),
    };
}

function request(mode: DecisionUseMode, runner: ShadowDecisionRunner, overrides: Partial<DecisionUseRequest<string>> = {}) {
    const existing = vi.fn(async () => 'outage');
    const req: DecisionUseRequest<string> = {
        Use: 'feedback-classifier',
        Mode: mode,
        BuildDecision: () => new AIDecisionParams(),
        FromDecision: r => {
            const a = r.Answers['category'];
            return a?.Kind === 'Choice' ? a.Value : null;
        },
        RunExisting: existing,
        Compare: (answers, value) => {
            const a = answers['category'];
            return { Agreed: a?.Kind === 'Choice' && a.Value === value, Summary: 'compared' };
        },
        Runner: runner,
        ...overrides,
    };
    return { req, existing };
}

describe('ResolveDecisionUseMode', () => {
    it('reads a mode case-insensitively and falls back on anything else', () => {
        expect(ResolveDecisionUseMode('decision', 'Prompt')).toBe('Decision');
        expect(ResolveDecisionUseMode(' Shadow ', 'Prompt')).toBe('Shadow');
        expect(ResolveDecisionUseMode('sometimes', 'Shadow')).toBe('Shadow');
        expect(ResolveDecisionUseMode(undefined, 'Decision')).toBe('Decision');
        expect(ResolveDecisionUseMode(3, 'Prompt')).toBe('Prompt');
    });
});

describe('RunDecisionUse', () => {
    beforeEach(() => vi.clearAllMocks());

    it('Prompt: runs only the existing path and never builds the decision', async () => {
        const runner = runnerReturning(run(true));
        const build = vi.fn(() => new AIDecisionParams());
        const { req, existing } = request('Prompt', runner, { BuildDecision: build });
        const outcome = await RunDecisionUse(req);
        expect(outcome).toEqual({ Value: 'outage', AnsweredBy: 'Existing' });
        expect(existing).toHaveBeenCalledTimes(1);
        expect(build).not.toHaveBeenCalled();
        expect(runner.ExecuteDecision).not.toHaveBeenCalled();
    });

    it('Decision: uses the decision and skips the existing path', async () => {
        const { req, existing } = request('Decision', runnerReturning(run(true)));
        const outcome = await RunDecisionUse(req);
        expect(outcome.Value).toBe('billing');
        expect(outcome.AnsweredBy).toBe('Decision');
        expect(existing).not.toHaveBeenCalled();
    });

    it.each([
        ['the decision failed', runnerReturning(run(false)), {}],
        ['the decision threw', runnerReturning(new Error('socket hang up')), {}],
        ['the decision was unsure', runnerReturning(run(true)), { FromDecision: () => null }],
        ['cannot be asked', runnerReturning(run(true)), { BuildDecision: () => null }],
        ["reading the decision's answers threw", runnerReturning(run(true)), { FromDecision: () => { throw new Error('bad'); } }],
        ['building the decision failed', runnerReturning(run(true)), { BuildDecision: () => { throw new Error('no prompt'); } }],
    ] as const)('Decision: falls back to the existing path when %s', async (_label, runner, overrides) => {
        const { req, existing } = request('Decision', runner, overrides as Partial<DecisionUseRequest<string>>);
        const outcome = await RunDecisionUse(req);
        expect(outcome.Value).toBe('outage');
        expect(outcome.AnsweredBy).toBe('Existing');
        expect(existing).toHaveBeenCalledTimes(1);
    });

    it('Shadow: returns the existing result and starts the decision beside it', async () => {
        const runner = runnerReturning(run(true));
        const { req, existing } = request('Shadow', runner);
        const outcome = await RunDecisionUse(req);
        expect(outcome).toEqual({ Value: 'outage', AnsweredBy: 'Existing' });
        expect(existing).toHaveBeenCalledTimes(1);
        expect(runner.ExecuteDecision).toHaveBeenCalledTimes(1);
    });

    it('Shadow: still answers when the decision cannot be built', async () => {
        const runner = runnerReturning(run(true));
        const { req } = request('Shadow', runner, { BuildDecision: () => null });
        expect((await RunDecisionUse(req)).Value).toBe('outage');
        expect(runner.ExecuteDecision).not.toHaveBeenCalled();
    });

    it("propagates the existing path's own error, as today", async () => {
        const { req } = request('Prompt', runnerReturning(run(true)), { RunExisting: async () => { throw new Error('LLM down'); } });
        await expect(RunDecisionUse(req)).rejects.toThrow('LLM down');
    });
});
