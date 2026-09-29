/**
 * DecisionJudgeOracle.test.ts — the `decision-judge` oracle (plan Task 3.0).
 *
 * `AIDecisionRunner.ExecuteDecision` and the `AIEngine` prompt catalog are mocked, so these run
 * without a database or a model. They cover the question shape (one call for N criteria), the pass
 * threshold, the weighted score, the result details, failures that fail the oracle without throwing,
 * and registration in the TestEngine under `decision-judge`.
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJTestEntity } from '@memberjunction/core-entities';
import type { DecisionAnswer } from '@memberjunction/ai';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionRunner, type AIDecisionParams, type AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import { DecisionJudgeOracle } from '../oracles/DecisionJudgeOracle';
import { LLMJudgeOracle } from '../oracles/LLMJudgeOracle';
import { TestEngine } from '../engine/TestEngine';
import type { OracleConfig, OracleInput } from '../types';

const USER = { ID: 'user-1' } satisfies Pick<UserInfo, 'ID'>;
const DEFAULT_PROMPT = { ID: 'prompt-default', Name: 'Default Decision' } satisfies Pick<MJAIPromptEntityExtended, 'ID' | 'Name'>;
const CUSTOM_PROMPT = { ID: 'prompt-custom', Name: 'Strict Judge' } satisfies Pick<MJAIPromptEntityExtended, 'ID' | 'Name'>;
const PROMPT_RUN = { ID: 'prompt-run-1' } satisfies Pick<MJAIPromptRunEntity, 'ID'>;

/** An oracle input whose test carries only the `InputDefinition` the judge reads. */
function oracleInput(expectedOutput: unknown, actualOutput: unknown = { reply: 'pong' }): OracleInput {
    const test = { InputDefinition: '{"q":"ping"}' } satisfies Pick<MJTestEntity, 'InputDefinition'>;
    return { test: test as MJTestEntity, expectedOutput, actualOutput, contextUser: USER as UserInfo };
}

/** An expected output listing these criteria, as a test definition would. */
function expecting(...criteria: unknown[]): { judgeValidationCriteria: unknown[] } {
    return { judgeValidationCriteria: criteria };
}

/** A successful decision answering criterion N with the Nth probability. */
function answered(...probabilities: number[]): AIDecisionRunResult {
    const Answers: Record<string, DecisionAnswer> = {};
    probabilities.forEach((probability, index) => {
        Answers[`criterion_${index + 1}`] = { Kind: 'Likelihood', Probability: probability };
    });
    return {
        success: true,
        Answers,
        promptRun: PROMPT_RUN as MJAIPromptRunEntity,
        modelInfo: { modelId: 'model-1', modelName: 'Decision Model' },
        cost: 0.0004,
    };
}

describe('DecisionJudgeOracle', () => {
    let executeDecision: MockInstance<AIDecisionRunner['ExecuteDecision']>;

    beforeEach(() => {
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([
            DEFAULT_PROMPT as MJAIPromptEntityExtended,
            CUSTOM_PROMPT as MJAIPromptEntityExtended,
        ]);
        executeDecision = vi.spyOn(AIDecisionRunner.prototype, 'ExecuteDecision');
    });

    /** The params of the one decision call the oracle made. */
    function sentParams(): AIDecisionParams {
        expect(executeDecision).toHaveBeenCalledOnce();
        return executeDecision.mock.calls[0][0];
    }

    describe('the questions', () => {
        it('asks one Likelihood question per criterion, all in one call', async () => {
            executeDecision.mockResolvedValue(answered(0.9, 0.8, 0.7));

            await new DecisionJudgeOracle().evaluate(
                oracleInput(expecting('Is polite', { criterion: 'Answers the question', weight: 2 }, 'Cites a source')),
                {},
            );

            expect(sentParams().Questions).toEqual({
                criterion_1: { Kind: 'Likelihood', Instructions: 'The response satisfies: Is polite' },
                criterion_2: { Kind: 'Likelihood', Instructions: 'The response satisfies: Answers the question' },
                criterion_3: { Kind: 'Likelihood', Instructions: 'The response satisfies: Cites a source' },
            });
        });

        it("states the LLM judge's trace: the input, the expected output and the actual output", async () => {
            executeDecision.mockResolvedValue(answered(0.9));
            const expected = expecting('Is polite');

            await new DecisionJudgeOracle().evaluate(oracleInput(expected, { reply: 'pong' }), {});

            expect(sentParams().State).toBe([
                `Input:\n${JSON.stringify({ q: 'ping' }, null, 2)}`,
                `Expected Output Requirements:\n${JSON.stringify(expected, null, 2)}`,
                `Actual Output:\n${JSON.stringify({ reply: 'pong' }, null, 2)}`,
            ].join('\n\n'));
        });

        it('states a missing actual output as (none)', async () => {
            executeDecision.mockResolvedValue(answered(0.9));

            const input = oracleInput(expecting('Is polite'));
            input.actualOutput = undefined;

            await new DecisionJudgeOracle().evaluate(input, {});

            expect(sentParams().State).toContain('Actual Output:\n(none)');
        });

        it('asks through the Default Decision prompt, as the calling user', async () => {
            executeDecision.mockResolvedValue(answered(0.9));

            await new DecisionJudgeOracle().evaluate(oracleInput(expecting('Is polite')), {});

            expect(sentParams().prompt).toBe(DEFAULT_PROMPT);
            expect(sentParams().contextUser).toBe(USER);
        });

        it('asks through the prompt the config names, matched ignoring case and spaces', async () => {
            executeDecision.mockResolvedValue(answered(0.9));

            await new DecisionJudgeOracle().evaluate(oracleInput(expecting('Is polite')), { promptName: '  strict JUDGE ' });

            expect(sentParams().prompt).toBe(CUSTOM_PROMPT);
        });

        it("reads the config's criteria when the expected output has none", async () => {
            executeDecision.mockResolvedValue(answered(0.9));

            await new DecisionJudgeOracle().evaluate(oracleInput('plain text'), { criteria: ['From config'] });

            expect(sentParams().Questions).toEqual({
                criterion_1: { Kind: 'Likelihood', Instructions: 'The response satisfies: From config' },
            });
        });
    });

    describe('the pass threshold', () => {
        it('passes at the default threshold of 0.5 when every criterion is at or above it', async () => {
            executeDecision.mockResolvedValue(answered(0.5, 0.95));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A', 'B')), {});

            expect(result.passed).toBe(true);
            expect(result.message).toBe('All 2 criteria are at or above the pass threshold of 0.5');
        });

        it('fails when any one criterion is below the threshold, however high the others are', async () => {
            executeDecision.mockResolvedValue(answered(0.49, 1));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A', 'B')), {});

            expect(result.passed).toBe(false);
            expect(result.message).toBe('1 of 2 criteria are below the pass threshold of 0.5: "A" (0.49)');
        });

        it("applies the config's passThreshold", async () => {
            executeDecision.mockResolvedValue(answered(0.8, 0.79));
            const config: OracleConfig = { passThreshold: 0.8 };

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A', 'B')), config);

            expect(result.passed).toBe(false);
            expect(result.details).toMatchObject({
                passThreshold: 0.8,
                criteriaProbabilities: [
                    { criterion: 'A', probability: 0.8, passed: true },
                    { criterion: 'B', probability: 0.79, passed: false },
                ],
            });
        });

        it.each([1.5, -0.1, 'high', Number.NaN])('rejects a passThreshold of %s without asking', async (passThreshold) => {
            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A')), { passThreshold });

            expect(executeDecision).not.toHaveBeenCalled();
            expect(result.passed).toBe(false);
            expect(result.message).toMatch(/^passThreshold must be a number from 0 to 1/);
        });
    });

    describe('the score', () => {
        it('is the mean of the probabilities when no criterion is weighted', async () => {
            executeDecision.mockResolvedValue(answered(0.9, 0.6, 0.3));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A', 'B', 'C')), {});

            expect(result.score).toBeCloseTo(0.6, 10);
        });

        it('is the weighted mean of the probabilities', async () => {
            executeDecision.mockResolvedValue(answered(0.9, 0.5));

            const result = await new DecisionJudgeOracle().evaluate(
                oracleInput(expecting({ criterion: 'A', weight: 3 }, 'B')),
                {},
            );

            // (0.9 * 3 + 0.5 * 1) / (3 + 1)
            expect(result.score).toBeCloseTo(0.8, 10);
        });

        it('gives a zero-weight criterion no say in the score but still gates the pass', async () => {
            executeDecision.mockResolvedValue(answered(0.9, 0.1));

            const result = await new DecisionJudgeOracle().evaluate(
                oracleInput(expecting('A', { criterion: 'B', weight: 0 })),
                {},
            );

            expect(result.score).toBeCloseTo(0.9, 10);
            expect(result.passed).toBe(false);
        });

        it('is 0 when every weight is 0', async () => {
            executeDecision.mockResolvedValue(answered(0.9));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting({ criterion: 'A', weight: 0 })), {});

            expect(result.score).toBe(0);
        });

        it.each([
            ['an empty string', ''],
            ['a negative weight', { criterion: 'A', weight: -1 }],
            ['a non-numeric weight', { criterion: 'A', weight: 'heavy' }],
            ['an object without a criterion', { weight: 2 }],
            ['a number', 42],
        ])('rejects %s as a criterion without asking', async (_label, criterion) => {
            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('Fine', criterion)), {});

            expect(executeDecision).not.toHaveBeenCalled();
            expect(result.passed).toBe(false);
            expect(result.message).toMatch(/^Criterion 2 must be a non-empty string/);
        });
    });

    describe('the result details', () => {
        it("carries every probability, the settings, and the decision run's ID, model and cost (as llmCost, like the LLM judge)", async () => {
            executeDecision.mockResolvedValue(answered(0.9, 0.4));

            const result = await new DecisionJudgeOracle().evaluate(
                oracleInput(expecting('A', { criterion: 'B', weight: 2 })),
                {},
            );

            expect(result).toEqual({
                oracleType: 'decision-judge',
                passed: false,
                score: (0.9 + 0.4 * 2) / 3,
                message: '1 of 2 criteria are below the pass threshold of 0.5: "B" (0.40)',
                details: {
                    criteriaProbabilities: [
                        { criterion: 'A', probability: 0.9, weight: 1, passed: true },
                        { criterion: 'B', probability: 0.4, weight: 2, passed: false },
                    ],
                    passThreshold: 0.5,
                    promptName: 'Default Decision',
                    decisionRunId: 'prompt-run-1',
                    decisionModel: 'Decision Model',
                    llmCost: 0.0004,
                },
            });
        });

    });

    describe('failure', () => {
        it('fails with the error message, and the run details, when the decision call fails', async () => {
            executeDecision.mockResolvedValue({
                success: false,
                errorMessage: 'No Decision model has credentials available',
                Answers: {},
                promptRun: PROMPT_RUN as MJAIPromptRunEntity,
            });

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A')), {});

            expect(result).toEqual({
                oracleType: 'decision-judge',
                passed: false,
                score: 0,
                message: 'Decision judgment failed: No Decision model has credentials available',
                details: { decisionRunId: 'prompt-run-1', decisionModel: undefined, llmCost: undefined },
            });
        });

        it('fails, and does not throw, when the decision call throws', async () => {
            executeDecision.mockRejectedValue(new Error('socket hang up'));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A')), {});

            expect(result).toEqual({
                oracleType: 'decision-judge',
                passed: false,
                score: 0,
                message: 'Decision judge error: socket hang up',
            });
        });

        it('fails, and does not throw, when the AI engine cannot load', async () => {
            vi.spyOn(AIEngine.Instance, 'Config').mockRejectedValue(new Error('no provider'));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A')), {});

            expect(executeDecision).not.toHaveBeenCalled();
            expect(result.passed).toBe(false);
            expect(result.message).toBe('Decision judge error: no provider');
        });

        it('fails when an answer is missing, rather than scoring the rest', async () => {
            executeDecision.mockResolvedValue(answered(0.9));

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A', 'B')), {});

            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toBe('The decision returned no Likelihood answer for criterion 2: B');
        });

        it('fails when an answer is not a Likelihood', async () => {
            executeDecision.mockResolvedValue({
                success: true,
                Answers: { criterion_1: { Kind: 'Score', Value: 1, Probabilities: { low: 0, high: 1 }, Confidence: 1 } },
            });

            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A')), {});

            expect(result.passed).toBe(false);
            expect(result.message).toBe('The decision returned no Likelihood answer for criterion 1: A');
        });

        it('fails without asking when the decision prompt is not found', async () => {
            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting('A')), { promptName: 'Missing Prompt' });

            expect(executeDecision).not.toHaveBeenCalled();
            expect(result.passed).toBe(false);
            expect(result.message).toBe('Decision prompt "Missing Prompt" not found in AIEngine.Instance.Prompts');
        });

        it('fails without asking when there are no criteria', async () => {
            const result = await new DecisionJudgeOracle().evaluate(oracleInput(expecting()), { criteria: ['Ignored'] });

            expect(executeDecision).not.toHaveBeenCalled();
            expect(result).toEqual({ oracleType: 'decision-judge', passed: false, score: 0, message: 'No validation criteria provided' });
        });
    });
});

describe('TestEngine oracle registration', () => {
    it('registers the decision judge under decision-judge, next to the LLM judge', async () => {
        vi.spyOn(TestEngineBase.Instance, 'Config').mockResolvedValue(undefined);

        await TestEngine.Instance.Config(false, USER as UserInfo);

        expect(TestEngine.Instance.GetOracle('decision-judge')).toBeInstanceOf(DecisionJudgeOracle);
        expect(TestEngine.Instance.GetOracle('llm-judge')).toBeInstanceOf(LLMJudgeOracle);
    });
});
