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
import { BuildJudgeTrace, ReadJudgeCriteria } from '../oracles/judge-trace';
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
    it("reads the expected output's judgeValidationCriteria first", () => {
        const criteria = ReadJudgeCriteria(oracleInput(null, { judgeValidationCriteria: ['E'] }, 'a'), { criteria: ['C'] });

        expect(criteria).toEqual(['E']);
    });

    it.each([
        ['a string', 'plain text'],
        ['null', null],
        ['an object without criteria', { other: 1 }],
    ])("falls back to the config's criteria when the expected output is %s", (_label, expected) => {
        expect(ReadJudgeCriteria(oracleInput(null, expected, 'a'), { criteria: ['C'] })).toEqual(['C']);
    });

    it('keeps an empty criteria list from the expected output rather than falling back', () => {
        expect(ReadJudgeCriteria(oracleInput(null, { judgeValidationCriteria: [] }, 'a'), { criteria: ['C'] })).toEqual([]);
    });

    it('returns undefined when neither source sets criteria', () => {
        expect(ReadJudgeCriteria(oracleInput(null, {}, 'a'), {})).toBeUndefined();
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
