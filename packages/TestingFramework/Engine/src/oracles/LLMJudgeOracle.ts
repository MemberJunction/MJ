/**
 * @fileoverview LLM Judge oracle implementation
 * @module @memberjunction/testing-engine
 */

import { IOracle } from './IOracle';
import { BuildJudgeTrace, ReadJudgeCriteria, ReadJudgeTimeoutMS } from './judge-trace';
import { InlineOracleResult, InlineVersion, ScoreInline } from './inline-rubric';
import { OracleInput, OracleConfig, OracleResult } from '../types';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { renderRubricEvaluatorPrompt } from '@memberjunction/rubrics';

/** The prompt whose model selection this judge uses. The rendered rubric text is the user message. */
const RUBRIC_EVALUATOR_PROMPT = 'Rubric Evaluator';

/**
 * LLM Judge Oracle.
 *
 * Uses an LLM to evaluate output quality based on custom criteria.
 * Provides semantic evaluation beyond deterministic checks.
 *
 * Criteria come from `expectedOutput.judgeValidationCriteria`, or else from `config.criteria`. Each is
 * a string or `{ "criterion": "...", "weight": 2 }`, as for {@link DecisionJudgeOracle}. The weight
 * is the leaf weight. A criterion the model does not answer stays unanswered. Malformed criteria fail
 * the oracle without a call.
 *
 * Configuration:
 * - criteria: Array of validation criteria (required)
 * - model: Model name or API name. When set, that model is required. Otherwise the Rubric Evaluator prompt selects one.
 * - temperature: Temperature for LLM (default: 0.1 for consistency)
 * - promptTemplate: Custom prompt template (optional, uses default if not provided)
 * - strictMode: Require all criteria to pass (default: false, uses weighted scoring)
 * - timeoutMS: How long to wait for each judge model call, in milliseconds (default: 120000, two
 *   minutes). A call that runs over fails the oracle.
 *
 * @example
 * ```typescript
 * const oracle = new LLMJudgeOracle();
 * const result = await oracle.evaluate({
 *     actualOutput: { response: 'Sales by region report created successfully' },
 *     expectedOutput: {
 *         judgeValidationCriteria: [
 *             'Response accurately answers the user\'s question',
 *             'Response includes actionable information',
 *             'Response is professional and clear'
 *         ]
 *     },
 *     contextUser
 * }, {
 *     model: 'claude-sonnet-4',
 *     temperature: 0.1
 * });
 * ```
 */
function answersFromModel(raw: unknown, criteria: string[]): { index: number; met: boolean; rationale?: string }[] {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw as { decisions?: { key?: string; criterion?: string; level?: string; met?: boolean; rationale?: string }[]; criteriaScores?: { criterion?: string; score?: number; explanation?: string }[] };
    const decisions = parsed?.decisions ?? [];
    const scores = parsed?.criteriaScores ?? [];
    const answers: { index: number; met: boolean; rationale?: string }[] = [];
    criteria.forEach((text, index) => {
        const decision = decisions.find((item: { key?: string; criterion?: string }) => item.key === `c${index}` || item.criterion === text);
        const scored = scores.find((item: { criterion?: string }) => item.criterion === text);
        if (!decision && !scored) return;
        const met = decision?.level === 'Met' || decision?.met === true || (typeof scored?.score === 'number' && scored.score >= 1);
        answers.push({ index, met, rationale: decision?.rationale ?? scored?.explanation });
    });
    return answers;
}

/** Input, expected output, and actual output, inside the template's one untrusted fence. */
function judgeSubject(trace: { Input?: string; Expected?: string; Actual?: string }): string {
    return ['Input:', trace.Input ?? '', '', 'Expected:', trace.Expected ?? '', '', 'Actual:', trace.Actual ?? ''].join('\n');
}

export class LLMJudgeOracle implements IOracle {
    readonly type = 'llm-judge';

    /**
     * Evaluate output using LLM judge.
     *
     * @param input - Oracle input with expected criteria and actual output
     * @param config - Oracle configuration
     * @returns Oracle result with LLM judgment
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const criteria = ReadJudgeCriteria(input, config);

            if (!criteria.Success) {
                return this.failed(criteria.ErrorMessage);
            }

            const timeout = ReadJudgeTimeoutMS(config);
            if (!timeout.Success) {
                return this.failed(timeout.ErrorMessage);
            }

            const trace = BuildJudgeTrace(input);
            const leaves = criteria.Value.map(item => ({ text: item.Criterion, weight: item.Weight }));
            const texts = leaves.map(leaf => leaf.text);
            const strict = config.strictMode === true;
            const passThreshold = typeof config.passThreshold === 'number' ? config.passThreshold : 0.7;
            const version = InlineVersion(leaves, strict, passThreshold);
            const rendered = renderRubricEvaluatorPrompt(version, { text: judgeSubject(trace) }, 'SinglePass');

            await AIEngine.Instance.Config(false, input.contextUser);
            const prompt = AIEngine.Instance.Prompts.find(item => item.Name === RUBRIC_EVALUATOR_PROMPT);
            if (!prompt) {
                return this.failed('The Rubric Evaluator prompt is not configured.');
            }

            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.systemPromptOverride = rendered;
            // The Rubric Evaluator record stores TemplateText and may have no TemplateID. A user
            // message still reaches the model in that case; an override alone would not.
            promptParams.templateMessageRole = 'none';
            promptParams.conversationMessages = [{ role: 'user', content: rendered }];
            promptParams.data = { criteria: texts, input: trace.Input, expected: trace.Expected, actual: trace.Actual, model: config.model };
            promptParams.contextUser = input.contextUser;
            promptParams.timeoutMS = timeout.Value;
            const requestedModel = typeof config.model === 'string' ? config.model.trim() : '';
            if (requestedModel) {
                const model = AIEngine.Instance.Models.find(item => item.Name === requestedModel || item.APIName === requestedModel);
                if (!model) {
                    return this.failed(`Judge model "${requestedModel}" was not found.`);
                }
                promptParams.override = { modelId: model.ID };
            }

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt(promptParams);
            if (!result.success) {
                return this.failed(`LLM judgment failed: ${result.errorMessage}`);
            }

            const answers = answersFromModel(result.result, texts);
            const scored = ScoreInline(leaves, answers, { strict, passThreshold });
            const evidence: (string | undefined)[] = [];
            for (const answer of answers) evidence[answer.index] = answer.rationale;
            const report = InlineOracleResult(texts, scored, evidence);
            report.details = { ...(report.details as object), llmModel: config.model || 'default', llmCost: result.cost };
            return report;

        } catch (error) {
            return this.failed(`LLM judge error: ${(error as Error).message}`);
        }
    }

    /** A failed result with this message and a score of 0. */
    private failed(message: string): OracleResult {
        return { oracleType: this.type, passed: false, score: 0, message };
    }
}
