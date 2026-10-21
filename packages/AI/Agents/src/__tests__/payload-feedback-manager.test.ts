import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { AgentDecisionService, AgentDecisionAskParams } from '../AgentDecisionService';
import { PayloadFeedbackConfig, PayloadFeedbackManager } from '../PayloadFeedbackManager';
import {
    ContentTruncationWarning,
    KeyRemovalWarning,
    PayloadChangeAnalyzer,
    PayloadWarningType,
} from '../PayloadChangeAnalyzer';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

const USER = { ID: 'user-1' } as UserInfo;

/** Payload text that must never reach the decision model. */
const SECRET = 'CONFIDENTIAL-PAYLOAD-TEXT';

const INSTRUCTION_PREFIX = "Given the agent's stated reasoning, this change was intended: ";

function truncation(path = 'summary'): ContentTruncationWarning {
    return {
        type: PayloadWarningType.ContentTruncation,
        severity: 'critical',
        path,
        message: 'Content reduced by 95.0% (from 1200 to 60 characters)',
        requiresFeedback: true,
        details: {
            originalLength: 1200,
            newLength: 60,
            reductionPercentage: 95,
            contentPreview: { before: `${SECRET} before`, after: `${SECRET} after` },
        },
    };
}

function keyRemoval(): KeyRemovalWarning {
    return {
        type: PayloadWarningType.KeyRemoval,
        severity: 'high',
        path: 'config',
        message: '2 non-empty keys removed (66.7% reduction)',
        requiresFeedback: true,
        details: { removedKeys: ['alpha', 'beta'], hadContent: true, contentSize: 300 },
    };
}

/** A successful decision result with one Likelihood per question, keyed as QueryAgent keys them. */
function likelihoods(...probabilities: number[]): AIDecisionRunResult {
    const Answers: AIDecisionRunResult['Answers'] = {};
    probabilities.forEach((p, i) => {
        Answers[`change_${i + 1}`] = { Kind: 'Likelihood', Probability: p };
    });
    return { success: true, Answers };
}

/** A manager whose decision service is a spy, so no model is ever called. */
function makeManager(config?: PayloadFeedbackConfig) {
    const service = new AgentDecisionService();
    const ask = vi.spyOn(service, 'Ask');
    return { manager: new PayloadFeedbackManager(config, service), ask };
}

function stateOf(asked: AgentDecisionAskParams): string {
    return typeof asked.State === 'string' ? asked.State : JSON.stringify(asked.State);
}

describe('PayloadFeedbackManager.QueryAgent', () => {
    describe('the question', () => {
        it('asks every question in one decision call, one Likelihood per change', async () => {
            const { manager, ask } = makeManager();
            ask.mockResolvedValueOnce(likelihoods(0.9, 0.8));
            const questions = manager.GenerateQuestions([truncation(), keyRemoval()]);

            await manager.QueryAgent(questions, { Reasoning: 'Shortening it', AgentID: 'agent-1' }, USER);

            expect(ask).toHaveBeenCalledTimes(1);
            const asked = ask.mock.calls[0][0];
            expect(asked.Questions).toEqual({
                change_1: {
                    Kind: 'Likelihood',
                    Instructions: `${INSTRUCTION_PREFIX}Content reduced by 95.0% (from 1200 to 60 characters) at "summary"`,
                },
                change_2: {
                    Kind: 'Likelihood',
                    Instructions: `${INSTRUCTION_PREFIX}2 non-empty keys removed (66.7% reduction) at "config" (removed: alpha, beta)`,
                },
            });
            expect(asked.ContextUser).toBe(USER);
            expect(asked.AgentID).toBe('agent-1');
            // Its own signal, which the time limit and the run's cancellation both abort.
            expect(asked.CancellationToken).toBeInstanceOf(AbortSignal);
            expect(asked.PromptName).toBeUndefined();
        });

        it('asks on the run\'s execution scope, so the decision spends the run\'s credentials', async () => {
            const { manager, ask } = makeManager();
            ask.mockResolvedValueOnce(likelihoods(0.9));
            const scope = { apiKeys: [{ driverClass: 'GeminiLLM', apiKey: 'sk-gemini' }], configurationId: 'config-1', CredentialScope: 'RuntimeOnly' as const };

            await manager.QueryAgent(manager.GenerateQuestions([truncation()]), { ExecutionScope: scope }, USER);

            expect(ask.mock.calls[0][0].ExecutionScope).toBe(scope);
        });

        it('keeps the decision call\'s result, so the caller can link its prompt run to a step', async () => {
            const { manager, ask } = makeManager();
            const result = likelihoods(0.9);
            ask.mockResolvedValueOnce(result);

            expect(manager.LastDecisionResult).toBeUndefined();
            await manager.QueryAgent(manager.GenerateQuestions([truncation()]), {}, USER);

            expect(manager.LastDecisionResult).toBe(result);
        });

        it('uses the configured decision prompt', async () => {
            const { manager, ask } = makeManager({ decisionPromptName: 'Custom Decision' });
            ask.mockResolvedValueOnce(likelihoods(0.9));

            await manager.QueryAgent(manager.GenerateQuestions([truncation()]), {}, USER);

            expect(ask.mock.calls[0][0].PromptName).toBe('Custom Decision');
        });

        it('states the reasoning, the change reasoning, the message and the changes, but never the payload', async () => {
            const { manager, ask } = makeManager();
            ask.mockResolvedValueOnce(likelihoods(0.9, 0.9));

            await manager.QueryAgent(
                manager.GenerateQuestions([truncation(), keyRemoval()]),
                { Reasoning: 'The user wants one line.', ChangeReasoning: 'Replace the summary.', Message: 'Here is the short version.' },
                USER
            );

            const state = stateOf(ask.mock.calls[0][0]);
            expect(state).toContain("The agent's reasoning for this step:\nThe user wants one line.");
            expect(state).toContain("The agent's reasoning for the payload change:\nReplace the summary.");
            expect(state).toContain("The agent's message:\nHere is the short version.");
            expect(state).toContain('1. Content reduced by 95.0% (from 1200 to 60 characters) at "summary"');
            expect(state).toContain('2. 2 non-empty keys removed (66.7% reduction) at "config" (removed: alpha, beta)');
            expect(state).not.toContain(SECRET);
        });

        it('keeps real payload content out of the state and the questions', async () => {
            const original = { summary: `${SECRET} `.repeat(20) };
            const changed = { summary: 'Short.' };
            const analysis = new PayloadChangeAnalyzer().AnalyzeChangeRequest(original, { updateElements: changed }, changed);
            const { manager, ask } = makeManager();
            const questions = manager.GenerateQuestions(analysis.warnings);
            ask.mockResolvedValueOnce(likelihoods(...questions.map(() => 0.9)));

            await manager.QueryAgent(questions, { Reasoning: 'Shortening it' }, USER);

            expect(questions.length).toBeGreaterThan(0);
            const asked = ask.mock.calls[0][0];
            expect(stateOf(asked)).toContain('"summary"');
            expect(stateOf(asked)).toContain(`from ${original.summary.length} to 6 characters`);
            expect(stateOf(asked)).not.toContain(SECRET);
            expect(JSON.stringify(asked.Questions)).not.toContain(SECRET);
        });

        it('says so in the state when the agent gave no reasoning or message', async () => {
            const { manager, ask } = makeManager();
            ask.mockResolvedValueOnce(likelihoods(0.9));

            await manager.QueryAgent(manager.GenerateQuestions([truncation('')]), { Reasoning: '   ' }, USER);

            const state = stateOf(ask.mock.calls[0][0]);
            expect(state).toContain('The agent gave no reasoning or message for this step.');
            expect(state).toContain('at the payload root');
        });

        it('asks nothing, and returns nothing, when there are no questions', async () => {
            const { manager, ask } = makeManager();

            expect(await manager.QueryAgent([], {}, USER)).toEqual([]);
            expect(ask).not.toHaveBeenCalled();
        });
    });

    describe('the threshold', () => {
        it('judges a change intended at or above 0.5 by default, and the explanation carries the probability', async () => {
            const { manager, ask } = makeManager();
            ask.mockResolvedValueOnce(likelihoods(0.5, 0.49));
            const questions = manager.GenerateQuestions([truncation(), keyRemoval()]);

            const responses = await manager.QueryAgent(questions, {}, USER);

            expect(manager.IntendedThreshold).toBe(0.5);
            expect(responses).toEqual([
                { questionId: questions[0].id, intended: true, probability: 0.5, explanation: 'Probability the change was intended: 0.50 (threshold 0.5)' },
                { questionId: questions[1].id, intended: false, probability: 0.49, explanation: 'Probability the change was intended: 0.49 (threshold 0.5)' },
            ]);
        });

        it('uses a configured intendedThreshold', async () => {
            const { manager, ask } = makeManager({ intendedThreshold: 0.8 });
            ask.mockResolvedValueOnce(likelihoods(0.79, 0.8));

            const responses = await manager.QueryAgent(manager.GenerateQuestions([truncation(), keyRemoval()]), {}, USER);

            expect(responses.map(r => r.intended)).toEqual([false, true]);
        });

        it.each([[1.5], [-0.1], [Number.NaN]])('falls back to 0.5 when intendedThreshold is %s', (threshold) => {
            const { manager } = makeManager({ intendedThreshold: threshold });
            expect(manager.IntendedThreshold).toBe(0.5);
        });
    });

    describe('the fallback: every change is accepted, as before, and the explanation says why', () => {
        it('when the decision call fails', async () => {
            const { manager, ask } = makeManager();
            ask.mockResolvedValueOnce({ success: false, errorMessage: 'Decision prompt "Default Decision" not found', Answers: {} });

            const responses = await manager.QueryAgent(manager.GenerateQuestions([truncation(), keyRemoval()]), {}, USER);

            expect(responses.map(r => r.intended)).toEqual([true, true]);
            expect(responses.every(r => r.probability === undefined)).toBe(true);
            expect(responses[0].explanation).toBe('Accepted by default (the decision call failed: Decision prompt "Default Decision" not found)');
        });

        it('when the decision call throws', async () => {
            const { manager, ask } = makeManager();
            ask.mockRejectedValueOnce(new Error('network down'));

            const responses = await manager.QueryAgent(manager.GenerateQuestions([truncation()]), {}, USER);

            expect(responses).toEqual([expect.objectContaining({ intended: true, explanation: 'Accepted by default (the decision call failed: network down)' })]);
        });

        it('when there is no context user, without asking', async () => {
            const { manager, ask } = makeManager();

            const responses = await manager.QueryAgent(manager.GenerateQuestions([truncation()]), {}, undefined);

            expect(ask).not.toHaveBeenCalled();
            expect(responses).toEqual([expect.objectContaining({ intended: true, explanation: 'Accepted by default (no context user for the decision call)' })]);
        });

        it('for a change with no usable answer, while the others are still judged', async () => {
            const { manager, ask } = makeManager();
            const answers = likelihoods(0.1, Number.NaN);
            answers.Answers.change_3 = { Kind: 'Choice', Value: 'yes', Probabilities: { yes: 0.9, no: 0.1 }, Confidence: 0.9 };
            ask.mockResolvedValueOnce(answers);
            const questions = manager.GenerateQuestions([truncation('a'), truncation('b'), truncation('c'), truncation('d')]);

            const responses = await manager.QueryAgent(questions, {}, USER);

            expect(responses.map(r => r.intended)).toEqual([false, true, true, true]);
            expect(responses.slice(1).map(r => r.explanation)).toEqual([
                'Accepted by default (no usable answer for this change)',
                'Accepted by default (no usable answer for this change)',
                'Accepted by default (no usable answer for this change)',
            ]);
        });

        it('for the questions beyond maxQuestionsPerBatch, which stay out of the one call', async () => {
            const { manager, ask } = makeManager({ maxQuestionsPerBatch: 2 });
            ask.mockResolvedValueOnce(likelihoods(0.1, 0.1));
            const questions = manager.GenerateQuestions([truncation('a'), truncation('b'), truncation('c')]);

            const responses = await manager.QueryAgent(questions, {}, USER);

            expect(ask).toHaveBeenCalledTimes(1);
            expect(Object.keys(ask.mock.calls[0][0].Questions)).toEqual(['change_1', 'change_2']);
            expect(responses.map(r => r.intended)).toEqual([false, false, true]);
            expect(responses[2].explanation).toBe('Accepted by default (over the limit of 2 questions per decision call)');
        });
    });
});

describe('PayloadFeedbackManager.QueryAgent: the time limit and cancellation', () => {
    const TIMEOUT = PayloadFeedbackManager.DECISION_TIMEOUT_MS;

    /** A decision call that never answers, and the signal it was given. */
    function neverAnswers(ask: ReturnType<typeof makeManager>['ask']): { signal: () => AbortSignal | undefined } {
        let signal: AbortSignal | undefined;
        ask.mockImplementationOnce((params) => {
            signal = params.CancellationToken;
            return new Promise<AIDecisionRunResult>(() => undefined);
        });
        return { signal: () => signal };
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    it('allows 30 seconds, as the catalog narrowing decision does', () => {
        expect(TIMEOUT).toBe(30_000);
    });

    it('accepts every change, and aborts the call, when the call takes longer than the limit', async () => {
        vi.useFakeTimers();
        const { manager, ask } = makeManager();
        const call = neverAnswers(ask);
        let settled = false;
        const pending = manager.QueryAgent(manager.GenerateQuestions([truncation(), keyRemoval()]), {}, USER).then((responses) => {
            settled = true;
            return responses;
        });

        await vi.advanceTimersByTimeAsync(TIMEOUT - 1);
        expect(settled).toBe(false);
        expect(call.signal()?.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        const responses = await pending;

        expect(call.signal()?.aborted).toBe(true);
        expect(responses.map((r) => r.intended)).toEqual([true, true]);
        expect(responses.every((r) => r.probability === undefined)).toBe(true);
        expect(responses[0].explanation).toBe(`Accepted by default (the decision call failed: timed out after ${TIMEOUT} ms)`);
        expect(manager.LastDecisionResult?.success).toBe(false);
    });

    it('clears its timer when the call answers in time', async () => {
        vi.useFakeTimers();
        const { manager, ask } = makeManager();
        ask.mockResolvedValueOnce(likelihoods(0.1));

        const responses = await manager.QueryAgent(manager.GenerateQuestions([truncation()]), {}, USER);

        expect(responses[0].intended).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops waiting, and aborts the call, when the run is cancelled', async () => {
        const { manager, ask } = makeManager();
        const call = neverAnswers(ask);
        const run = new AbortController();

        const pending = manager.QueryAgent(manager.GenerateQuestions([truncation()]), { CancellationToken: run.signal }, USER);
        expect(ask).toHaveBeenCalledTimes(1);
        run.abort();
        const responses = await pending;

        expect(call.signal()?.aborted).toBe(true);
        expect(responses).toEqual([expect.objectContaining({ intended: true, explanation: 'Accepted by default (the decision call failed: the run was cancelled)' })]);
    });

    it('asks nothing when the run is already cancelled', async () => {
        const { manager, ask } = makeManager();
        const run = new AbortController();
        run.abort();

        const responses = await manager.QueryAgent(manager.GenerateQuestions([truncation()]), { CancellationToken: run.signal }, USER);

        expect(ask).not.toHaveBeenCalled();
        expect(responses).toEqual([expect.objectContaining({ intended: true, explanation: 'Accepted by default (the decision call failed: the run was cancelled)' })]);
    });
});

describe('PayloadFeedbackManager.BuildUnintendedChangesMessage', () => {
    const REBUILD = 'The original values are not shown here, so rebuild each one from where it came from '
        + '(an action result, a sub-agent result or the conversation). If you cannot, say in your message what was lost.';

    it('lists only the changes judged unintended, and says how to confirm them or put them back', async () => {
        const { manager, ask } = makeManager();
        ask.mockResolvedValueOnce(likelihoods(0.12, 0.95));
        const questions = manager.GenerateQuestions([truncation(), keyRemoval()]);
        const responses = await manager.QueryAgent(questions, {}, USER);

        const message = manager.BuildUnintendedChangesMessage(questions, responses);

        expect(message).toBe([
            'Payload change check: these changes to the payload may not have been intended.',
            '- Content reduced by 95.0% (from 1200 to 60 characters) at "summary" (probability it was intended: 0.12)',
            'Nothing was reverted. If you meant a change, confirm it in your reasoning and carry on.',
            `If not, put the data back with a payloadChangeRequest: set each shortened or changed value again under updateElements. ${REBUILD}`,
        ].join('\n'));
    });

    it('tells the agent to add a removed key back under newElements, since it is never given the value', async () => {
        const { manager, ask } = makeManager();
        ask.mockResolvedValueOnce(likelihoods(0.95, 0.2));
        const questions = manager.GenerateQuestions([truncation(), keyRemoval()]);
        const responses = await manager.QueryAgent(questions, {}, USER);

        const message = manager.BuildUnintendedChangesMessage(questions, responses);

        expect(message).toBe([
            'Payload change check: these changes to the payload may not have been intended.',
            '- 2 non-empty keys removed (66.7% reduction) at "config" (removed: alpha, beta) (probability it was intended: 0.20)',
            'Nothing was reverted. If you meant a change, confirm it in your reasoning and carry on.',
            `If not, put the data back with a payloadChangeRequest: add each removed key back under newElements. ${REBUILD}`,
        ].join('\n'));
    });

    it('gives both instructions when both kinds of change are listed', async () => {
        const { manager, ask } = makeManager();
        ask.mockResolvedValueOnce(likelihoods(0.1, 0.1));
        const questions = manager.GenerateQuestions([truncation(), keyRemoval()]);
        const responses = await manager.QueryAgent(questions, {}, USER);

        const message = manager.BuildUnintendedChangesMessage(questions, responses);

        expect(message).toContain('add each removed key back under newElements, and set each shortened or changed value again under updateElements.');
        expect(message).not.toContain(SECRET);
    });

    it('is undefined when every change was judged intended or accepted by default', async () => {
        const { manager, ask } = makeManager();
        ask.mockResolvedValueOnce({ success: false, errorMessage: 'down', Answers: {} });
        const questions = manager.GenerateQuestions([truncation(), keyRemoval()]);

        const responses = await manager.QueryAgent(questions, {}, USER);

        expect(manager.BuildUnintendedChangesMessage(questions, responses)).toBeUndefined();
    });
});
