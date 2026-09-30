/**
 * judge-trace.test.ts — the trace and criteria the judge oracles evaluate.
 *
 * `LLMJudgeOracle` and `DecisionJudgeOracle` read the same criteria and judge the same trace, through
 * the helpers in `oracles/judge-trace.ts`. The `LLMJudgeOracle.evaluate` block pins the prompt data
 * the LLM judge sends, so extracting those helpers out of it is provably behaviour-neutral.
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJTestEntity } from '@memberjunction/core-entities';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { LLMJudgeOracle } from '../oracles/LLMJudgeOracle';
import { BuildJudgeTrace, ReadJudgeCriteria, type JudgeCriterion } from '../oracles/judge-trace';
import type { OracleConfig, OracleInput } from '../types';

const USER = { ID: 'user-1' } satisfies Pick<UserInfo, 'ID'>;
const JUDGE_PROMPT = { ID: 'prompt-judge', Name: 'Test LLM Judge' } satisfies Pick<MJAIPromptEntityExtended, 'ID' | 'Name'>;

/** An oracle input whose test carries only the `InputDefinition` the judges read. */
function oracleInput(inputDefinition: string | null, expectedOutput: unknown, actualOutput: unknown): OracleInput {
    const test = { InputDefinition: inputDefinition } satisfies Pick<MJTestEntity, 'InputDefinition'>;
    return {
        test: test as MJTestEntity,
        expectedOutput,
        actualOutput,
        contextUser: USER as UserInfo,
    };
}

/** A successful judge run returning `judgment` as the model's JSON text. */
function judgeRun(judgment: object, cost?: number): AIPromptRunResult {
    const run = { success: true, result: JSON.stringify(judgment), cost } satisfies Pick<AIPromptRunResult, 'success' | 'result' | 'cost'>;
    return run as AIPromptRunResult;
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

describe('LLMJudgeOracle.evaluate — the prompt data it sends', () => {
    let executePrompt: MockInstance<AIPromptRunner['ExecutePrompt']>;

    beforeEach(() => {
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([JUDGE_PROMPT as MJAIPromptEntityExtended]);
        executePrompt = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt')
            .mockResolvedValue(judgeRun({ criteriaScores: [], overallScore: 0.9, overallAssessment: 'fine' }, 0.02));
    });

    /** The `data` of the one prompt call the oracle made. */
    function sentData(): AIPromptParams['data'] {
        expect(executePrompt).toHaveBeenCalledOnce();
        return executePrompt.mock.calls[0][0].data;
    }

    it('sends the parsed input, the expected and actual outputs, and the numbered criteria', async () => {
        const expected = { judgeValidationCriteria: ['Is polite', 'Answers the question'], note: 'x' };
        await new LLMJudgeOracle().evaluate(oracleInput('{"q":"ping"}', expected, { reply: 'pong' }), {});

        expect(sentData()).toEqual({
            input: JSON.stringify({ q: 'ping' }, null, 2),
            expected: JSON.stringify(expected, null, 2),
            actual: JSON.stringify({ reply: 'pong' }, null, 2),
            criteria: '1. Is polite\n2. Answers the question',
        });
    });

    it('sends the text of each criterion in a mixed list of strings and weighted criteria', async () => {
        const expected = { judgeValidationCriteria: ['Is polite', { criterion: 'Answers the question', weight: 2 }] };
        await new LLMJudgeOracle().evaluate(oracleInput(null, expected, 'out'), {});

        expect(sentData()?.criteria).toBe('1. Is polite\n2. Answers the question');
        expect(sentData()?.criteria).not.toContain('[object Object]');
    });

    it('fails without calling the model when a criterion is malformed', async () => {
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['Fine', 42] }, 'out'), {});

        expect(executePrompt).not.toHaveBeenCalled();
        expect(result.passed).toBe(false);
        expect(result.message).toMatch(/^Criterion 2 must be a non-empty string/);
    });

    it('sends an empty object as the input when the test has no input definition', async () => {
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), {});

        expect(sentData()?.input).toBe('{}');
    });

    it("prefers the expected output's criteria over the config's", async () => {
        const config: OracleConfig = { criteria: ['From config'] };
        await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['From expected'] }, 'out'), config);

        expect(sentData()?.criteria).toBe('1. From expected');
    });

    it("falls back to the config's criteria when the expected output has none", async () => {
        const config: OracleConfig = { criteria: ['From config'] };
        await new LLMJudgeOracle().evaluate(oracleInput(null, 'plain expected text', 'out'), config);

        expect(sentData()?.criteria).toBe('1. From config');
    });

    it('does not fall back to the config when the expected output lists an empty set', async () => {
        const config: OracleConfig = { criteria: ['From config'] };
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: [] }, 'out'), config);

        expect(executePrompt).not.toHaveBeenCalled();
        expect(result).toEqual({ oracleType: 'llm-judge', passed: false, score: 0, message: 'No validation criteria provided' });
    });

    it('reports an unparseable input definition as a judge error', async () => {
        const result = await new LLMJudgeOracle().evaluate(oracleInput('{not json', { judgeValidationCriteria: ['C'] }, 'out'), {});

        expect(executePrompt).not.toHaveBeenCalled();
        expect(result.passed).toBe(false);
        expect(result.message).toMatch(/^LLM judge error: /);
    });

    it('returns the judgment with the model and cost details', async () => {
        const config: OracleConfig = { model: 'judge-model' };
        const result = await new LLMJudgeOracle().evaluate(oracleInput(null, { judgeValidationCriteria: ['C'] }, 'out'), config);

        expect(result).toEqual({
            oracleType: 'llm-judge',
            passed: true,
            score: 0.9,
            message: 'fine',
            details: { criteriaScores: [], llmModel: 'judge-model', llmCost: 0.02 },
        });
    });
});
