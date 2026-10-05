/**
 * judge-trace.test.ts — the trace and criteria the judge oracles evaluate.
 *
 * `LLMJudgeOracle` and `DecisionJudgeOracle` read the same criteria and judge the same trace, through
 * the helpers in `oracles/judge-trace.ts`. The `LLMJudgeOracle.evaluate` block pins the prompt request
 * the LLM judge sends through the rubric prompt service: the shipped evaluator prompt, its judge, the
 * criteria as template data, and the trace as the delimited subject message.
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTestEntity } from '@memberjunction/core-entities';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { RubricCriterionTemplateData, RubricPromptOutput, RubricPromptRequest, RubricPromptRef } from '@memberjunction/rubrics';
import { LLMJudgeOracle } from '../oracles/LLMJudgeOracle';
import {
    BuildJudgeTrace,
    DEFAULT_JUDGE_TIMEOUT_MS,
    ReadJudgeCriteria,
    ReadJudgeTimeoutMS,
    type JudgeCriterion,
} from '../oracles/judge-trace';
import type { OracleConfig, OracleInput } from '../types';

const USER = { ID: 'user-1' } satisfies Pick<UserInfo, 'ID'>;

/**
 * The prompt service the oracle runs through. Criteria render to "rendered <name>"; Run is set per test.
 * The real service loads the prompts from metadata, which a unit test has no database for.
 */
const promptService = vi.hoisted(() => ({
    Run: vi.fn<(input: RubricPromptRequest) => Promise<RubricPromptOutput>>(),
    RenderCriteria: vi.fn(async (input: { Prompt: RubricPromptRef; Items: RubricCriterionTemplateData[] }) => input.Items.map(item => `rendered ${item.Criterion.Name}`)),
    Preview: vi.fn(async () => ''),
}));

vi.mock('@memberjunction/rubrics', async importOriginal => ({
    ...await importOriginal<typeof import('@memberjunction/rubrics')>(),
    ProviderPromptService: () => promptService,
}));
const JUDGE_MODEL = { ID: 'model-judge', Name: 'judge-model', APIName: 'judge-model' };

/** An oracle input whose test carries only the `InputDefinition` the judges read. */
function oracleInput(inputDefinition: string | null, expectedOutput: unknown, actualOutput: unknown): OracleInput {
    const test = { InputDefinition: inputDefinition } satisfies Pick<MJTestEntity, 'InputDefinition'>;
    return {
        test: test as MJTestEntity,
        expectedOutput,
        actualOutput,
        contextUser: USER as UserInfo,
        provider: {} as IMetadataProvider,
    };
}

/** A judge reply carrying `judgment` as the model's JSON text. */
function judgeReply(judgment: object, cost?: number): RubricPromptOutput {
    return { Text: JSON.stringify(judgment), PromptRunID: 'run-1', Cost: cost ?? null };
}

describe('BuildJudgeTrace', () => {
    it('renders the parsed input definition, the expected output and the actual output as JSON', () => {
        const trace = BuildJudgeTrace(oracleInput('{"q":"ping"}', { want: 'pong' }, { reply: 'pong' }));

        expect(trace).toEqual({
            Input: JSON.stringify({ q: 'ping' }, null, 2),
            Expected: JSON.stringify({ want: 'pong' }, null, 2),
            Actual: JSON.stringify({ reply: 'pong' }, null, 2),
        });
    });

    it('renders an empty object when the test has no input definition', () => {
        expect(BuildJudgeTrace(oracleInput(null, 'e', 'a')).Input).toBe('{}');
    });

    it('leaves a part undefined when its value is undefined', () => {
        expect(BuildJudgeTrace(oracleInput(null, 'e', undefined)).Actual).toBeUndefined();
    });

    it('throws when the input definition is not valid JSON', () => {
        expect(() => BuildJudgeTrace(oracleInput('{not json', 'e', 'a'))).toThrow(SyntaxError);
    });
});

describe('ReadJudgeCriteria', () => {
    /** The criteria read from this expected output and config, asserting they were read. */
    function readCriteria(expected: unknown, config: OracleConfig): JudgeCriterion[] {
        const result = ReadJudgeCriteria(oracleInput(null, expected, 'a'), config);
        if (!result.Success) {
            throw new Error(`Expected criteria, got: ${result.ErrorMessage}`);
        }
        return result.Value;
    }

    /** The reason these criteria cannot be read, asserting they were not. */
    function readError(expected: unknown, config: OracleConfig): string {
        const result = ReadJudgeCriteria(oracleInput(null, expected, 'a'), config);
        if (result.Success) {
            throw new Error(`Expected an error, got: ${JSON.stringify(result.Value)}`);
        }
        return result.ErrorMessage;
    }

    it("reads the expected output's judgeValidationCriteria first", () => {
        expect(readCriteria({ judgeValidationCriteria: ['E'] }, { criteria: ['C'] })).toEqual([{ Criterion: 'E', Weight: 1 }]);
    });

    it.each([
        ['a string', 'plain text'],
        ['null', null],
        ['an object without criteria', { other: 1 }],
    ])("falls back to the config's criteria when the expected output is %s", (_label, expected) => {
        expect(readCriteria(expected, { criteria: ['C'] })).toEqual([{ Criterion: 'C', Weight: 1 }]);
    });

    it('reads a mixed list of strings and weighted criteria, in order', () => {
        const criteria = readCriteria(
            { judgeValidationCriteria: ['Is polite', { criterion: 'Answers', weight: 2 }, { criterion: 'Cites', weight: null }] },
            {},
        );

        expect(criteria).toEqual([
            { Criterion: 'Is polite', Weight: 1 },
            { Criterion: 'Answers', Weight: 2 },
            { Criterion: 'Cites', Weight: 1 },
        ]);
    });

    it('keeps an empty criteria list from the expected output rather than falling back, and reports none', () => {
        expect(readError({ judgeValidationCriteria: [] }, { criteria: ['C'] })).toBe('No validation criteria provided');
    });

    it('reports none when neither source sets criteria', () => {
        expect(readError({}, {})).toBe('No validation criteria provided');
    });

    it('rejects criteria whose weights are all 0', () => {
        expect(readError({ judgeValidationCriteria: [{ criterion: 'A', weight: 0 }, { criterion: 'B', weight: 0 }] }, {}))
            .toBe('Every criterion has weight 0, so none counts toward the score: give at least one a weight above 0');
    });

    it('accepts a weight of 0 when another criterion weighs more', () => {
        expect(readCriteria({ judgeValidationCriteria: [{ criterion: 'A', weight: 0 }, 'B'] }, {})).toEqual([
            { Criterion: 'A', Weight: 0 },
            { Criterion: 'B', Weight: 1 },
        ]);
    });

    it('rejects criteria that are not an array', () => {
        expect(readError({ judgeValidationCriteria: 'Is polite' }, {})).toBe('Validation criteria must be an array of criteria, not a string');
    });

    it.each([
        ['an empty string', '  '],
        ['a negative weight', { criterion: 'A', weight: -1 }],
        ['an infinite weight', { criterion: 'A', weight: Number.POSITIVE_INFINITY }],
        ['a non-numeric weight', { criterion: 'A', weight: 'heavy' }],
        ['an empty criterion', { criterion: '', weight: 2 }],
        ['an object without a criterion', { weight: 2 }],
        ['a number', 42],
        ['null', null],
    ])('rejects %s, naming its position', (_label, entry) => {
        expect(readError({ judgeValidationCriteria: ['Fine', entry] }, {})).toMatch(/^Criterion 2 must be a non-empty string/);
    });
});

describe('ReadJudgeTimeoutMS', () => {
    it('defaults to two minutes when the config sets none', () => {
        expect(ReadJudgeTimeoutMS({})).toEqual({ Success: true, Value: DEFAULT_JUDGE_TIMEOUT_MS });
        expect(DEFAULT_JUDGE_TIMEOUT_MS).toBe(120_000);
    });

    it("reads the config's timeoutMS", () => {
        expect(ReadJudgeTimeoutMS({ timeoutMS: 30_000 })).toEqual({ Success: true, Value: 30_000 });
    });

    it.each([
        [0, '0'],
        [-5, '-5'],
        [Number.NaN, 'NaN'],
        [Number.POSITIVE_INFINITY, 'Infinity'],
        ['30s', '"30s"'],
        [true, 'true'],
    ])('rejects a timeoutMS of %s', (timeoutMS, shown) => {
        expect(ReadJudgeTimeoutMS({ timeoutMS })).toEqual({
            Success: false,
            ErrorMessage: `timeoutMS must be a positive number of milliseconds, not ${shown}`,
        });
    });
});

describe('LLMJudgeOracle.evaluate — the prompt request it sends', () => {
    beforeEach(() => {
        promptService.Run.mockReset();
        promptService.RenderCriteria.mockClear();
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([JUDGE_MODEL as MJAIModelEntityExtended]);
        promptService.Run.mockResolvedValue(judgeReply({ decisions: [{ key: 'c0', level: 'Met', rationale: 'fine' }, { key: 'c1', level: 'Met' }] }, 0.02));
    });

    /** The one evaluator prompt request the oracle made. */
    function sent(): RubricPromptRequest {
        expect(promptService.Run).toHaveBeenCalledOnce();
        return promptService.Run.mock.calls[0][0];
    }

    it('runs the Rubric Evaluator with the default judge, the criteria as data, and the trace as the subject', async () => {
        const expected = { judgeValidationCriteria: ['Is polite', 'Answers the question'], note: 'x' };
        await new LLMJudgeOracle().evaluate(oracleInput('{"q":"ping"}', expected, { reply: 'pong' }), {});

        const request = sent();
        expect(request.Prompt).toEqual({ Name: 'Rubric Evaluator' });
        expect(request.Judge).toEqual({ Name: 'Rubric Evaluator - Default Judge' });
        expect(request.Data.Mode).toBe('SinglePass');
        expect(request.Data.Criteria.map(item => item.Name)).toEqual(['Is polite', 'Answers the question']);
        expect(request.Data.Criteria.map(item => item.Text)).toEqual(['rendered Is polite', 'rendered Answers the question']);
        expect(request.Data.Subject.EntityName).toBe('MJ: Test Runs');
        expect(promptService.RenderCriteria.mock.calls[0][0].Prompt).toEqual({ Name: 'Rubric Criterion' });
        expect(request.Subject).toContain('"q": "ping"');
        expect(request.Subject).toContain('"note": "x"');
        expect(request.Subject).toContain('"reply": "pong"');
        expect(request.Subject).toMatch(/<rubric-subject [0-9a-f]{32}>/);
    });

    it('swaps in the judge prompt the config names', async () => {
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), { judgePrompt: 'Rubric Judge - Sage' });

        expect(sent().Judge).toEqual({ Name: 'Rubric Judge - Sage' });
    });

    it('scores a mixed list of strings and weighted criteria', async () => {
        promptService.Run.mockResolvedValue(judgeReply({
            decisions: [
                { key: 'c0', level: 'Not met' },
                { key: 'c1', level: 'Met' },
            ],
        }));
        const expected = { judgeValidationCriteria: ['Is polite', { criterion: 'Answers the question', weight: 2 }] };
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, expected, 'out'), {});

        expect(sent().Data.Criteria.map(item => item.Name)).toEqual(['Is polite', 'Answers the question']);
        expect(result.score).toBeCloseTo(2 / 3, 6);
    });

    it('leaves a criterion the model omitted unanswered instead of scoring it Not met', async () => {
        promptService.Run.mockResolvedValue(judgeReply({ decisions: [{ key: 'c0', level: 'Met' }] }));
        const result = await new LLMJudgeOracle().evaluate(
            oracleInput(null, { judgeValidationCriteria: ['First', 'Second'] }, 'out'),
            {},
        );

        expect(result.score).toBe(1);
        expect(result.passed).toBe(false);
        expect(result.message).toContain('Incomplete');
        const details = result.details as { Criteria: { NormalizedScore: number | null }[] };
        expect(details.Criteria[1].NormalizedScore).toBeNull();
    });

    it('fails without calling the model when a criterion is malformed', async () => {
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['Fine', 42] }, 'out'), {});

        expect(promptService.Run).not.toHaveBeenCalled();
        expect(result.passed).toBe(false);
        expect(result.message).toMatch(/^Criterion 2 must be a non-empty string/);
    });

    it('bounds the judge call with the default judge timeout', async () => {
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), {});

        expect(sent().TimeoutMS).toBe(DEFAULT_JUDGE_TIMEOUT_MS);
    });

    it("applies the config's timeoutMS to the judge call", async () => {
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), { timeoutMS: 45_000 });

        expect(sent().TimeoutMS).toBe(45_000);
    });

    it('fails without calling the model when timeoutMS is invalid', async () => {
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), { timeoutMS: 0 });

        expect(promptService.Run).not.toHaveBeenCalled();
        expect(result).toEqual({
            oracleType: 'llm-judge',
            passed: false,
            score: 0,
            message: 'timeoutMS must be a positive number of milliseconds, not 0',
        });
    });

    it('sends an empty object as the input when the test has no input definition', async () => {
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), {});

        expect(sent().Subject).toContain('Input:\n{}');
    });

    it("prefers the expected output's criteria over the config's", async () => {
        const config: OracleConfig = { criteria: ['From config'] };
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['From expected'] }, 'out'), config);

        expect(sent().Data.Criteria.map(item => item.Name)).toEqual(['From expected']);
    });

    it("falls back to the config's criteria when the expected output has none", async () => {
        const config: OracleConfig = { criteria: ['From config'] };
        await new LLMJudgeOracle().evaluate(oracleInput(null, 'plain expected text', 'out'), config);

        expect(sent().Data.Criteria.map(item => item.Name)).toEqual(['From config']);
    });

    it('does not fall back to the config when the expected output lists an empty set', async () => {
        const config: OracleConfig = { criteria: ['From config'] };
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: [] }, 'out'), config);

        expect(promptService.Run).not.toHaveBeenCalled();
        expect(result).toEqual({ oracleType: 'llm-judge', passed: false, score: 0, message: 'No validation criteria provided' });
    });

    it('reports an unparseable input definition as a judge error', async () => {
        const result = await new LLMJudgeOracle().evaluate(oracleInput('{not json', { judgeValidationCriteria: ['C'] }, 'out'), {});

        expect(promptService.Run).not.toHaveBeenCalled();
        expect(result.passed).toBe(false);
        expect(result.message).toMatch(/^LLM judge error: /);
    });

    it('reports a failed prompt run as a judge error', async () => {
        promptService.Run.mockRejectedValue(new Error('The Rubric Evaluator prompt failed.'));
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), {});

        expect(result).toEqual({ oracleType: 'llm-judge', passed: false, score: 0, message: 'LLM judge error: The Rubric Evaluator prompt failed.' });
    });

    it('returns the judgment with the model, cost, prompt run, and judge details', async () => {
        const config: OracleConfig = { model: 'judge-model' };
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), config);

        expect(result.oracleType).toBe('llm-judge');
        expect(result.passed).toBe(true);
        expect(result.score).toBe(1);
        expect(result.details).toMatchObject({
            inline: true, llmModel: 'judge-model', llmCost: 0.02, llmPromptRunId: 'run-1', judgePrompt: 'Rubric Evaluator - Default Judge',
        });
        expect(result.details).not.toHaveProperty('RubricEvaluationID');
        expect(sent().ModelID).toBe('model-judge');
    });

    it('fails without calling the model when the named judge model is not in the catalog', async () => {
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), { model: 'missing-model' });

        expect(promptService.Run).not.toHaveBeenCalled();
        expect(result).toEqual({
            oracleType: 'llm-judge',
            passed: false,
            score: 0,
            message: 'Judge model "missing-model" was not found.',
        });
    });
});
