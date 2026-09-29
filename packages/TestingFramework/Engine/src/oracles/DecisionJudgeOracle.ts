/**
 * @fileoverview Decision Judge oracle implementation
 * @module @memberjunction/testing-engine
 */

import { DecisionQuestion } from '@memberjunction/ai';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionParams, AIDecisionRunResult, AIDecisionRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { IOracle } from './IOracle';
import { BuildJudgeTrace, JudgeTrace, ReadJudgeCriteria } from './judge-trace';
import { OracleInput, OracleConfig, OracleResult } from '../types';

/** A criterion to judge, with its weight in the score. */
interface WeightedCriterion {
    criterion: string;
    weight: number;
}

/** The settings read from the oracle's config. */
interface JudgeSettings {
    passThreshold: number;
    promptName: string;
}

/** One criterion's outcome, as reported in `details.criteriaProbabilities`. */
interface CriterionProbability {
    criterion: string;
    probability: number;
    weight: number;
    passed: boolean;
}

/** The decision run's details, reported on every result the decision call produced. */
interface DecisionRunDetails {
    decisionRunId?: string;
    decisionModel?: string;
    llmCost?: number;
}

/**
 * Decision Judge Oracle.
 *
 * Judges output against the same criteria, and the same trace, as {@link LLMJudgeOracle}, but asks a
 * typed decision model instead of parsing an LLM's JSON. Each criterion becomes one Likelihood
 * question, "The response satisfies: <criterion>", and every question travels in one
 * `AIDecisionRunner` call. The pass rule and the weighting live here, in code, not in the prompt.
 *
 * Criteria come from `expectedOutput.judgeValidationCriteria`, or else from `config.criteria`, as for
 * the LLM judge. Each is either a string or `{ "criterion": "...", "weight": 2 }`.
 *
 * Configuration:
 * - criteria: Array of criteria, used when the expected output has none
 * - passThreshold: The probability every criterion must reach to pass (default: 0.5). The default is a
 *   placeholder: calibration (Task 2.4) sets real values.
 * - promptName: The decision prompt whose model bindings choose the decision model
 *   (default: 'Default Decision')
 *
 * Result:
 * - passed: every criterion's probability is at or above `passThreshold`
 * - score: the weighted mean of the probabilities (weights default to 1)
 * - details: `criteriaProbabilities` (one entry per criterion), `passThreshold`, `promptName`,
 *   `decisionRunId` (the `MJ: AI Prompt Runs` row), `decisionModel`, and `llmCost`, which is where the
 *   LLM judge reports its cost
 *
 * A failed decision call gives a failed result with the error message. The oracle never throws.
 *
 * @example
 * ```typescript
 * const oracle = new DecisionJudgeOracle();
 * const result = await oracle.evaluate({
 *     test,
 *     actualOutput: { response: 'Sales by region report created successfully' },
 *     expectedOutput: {
 *         judgeValidationCriteria: [
 *             'Response accurately answers the user\'s question',
 *             { criterion: 'Response includes actionable information', weight: 2 }
 *         ]
 *     },
 *     contextUser
 * }, {
 *     passThreshold: 0.7
 * });
 * ```
 */
export class DecisionJudgeOracle implements IOracle {
    readonly type = 'decision-judge';

    /** The decision prompt used when the config names none. */
    public static readonly DEFAULT_PROMPT_NAME = 'Default Decision';

    /** The per-criterion pass probability used when the config sets none, until calibration (Task 2.4) sets real values. */
    public static readonly DEFAULT_PASS_THRESHOLD = 0.5;

    /**
     * Evaluate output with a typed decision: one Likelihood question per criterion, in one call.
     *
     * @param input - Oracle input with the criteria, the expected output and the actual output
     * @param config - Oracle configuration
     * @returns Oracle result with the per-criterion probabilities; failed, never thrown, on any error
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const criteria = this.readCriteria(input, config);
            if (typeof criteria === 'string') {
                return this.failed(criteria);
            }
            const settings = this.readSettings(config);
            if (typeof settings === 'string') {
                return this.failed(settings);
            }

            await AIEngine.Instance.Config(false, input.contextUser);
            const prompt = this.findPrompt(settings.promptName);
            if (!prompt) {
                return this.failed(`Decision prompt "${settings.promptName}" not found in AIEngine.Instance.Prompts`);
            }

            const run = await new AIDecisionRunner().ExecuteDecision(this.buildParams(input, prompt, criteria));
            return this.judge(run, criteria, settings);
        } catch (error) {
            return this.failed(`Decision judge error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** The criteria to judge, or the reason they cannot be read. */
    private readCriteria(input: OracleInput, config: OracleConfig): WeightedCriterion[] | string {
        const raw = ReadJudgeCriteria(input, config);
        if (!Array.isArray(raw) || raw.length === 0) {
            return 'No validation criteria provided';
        }
        const entries: unknown[] = raw;
        const criteria: WeightedCriterion[] = [];
        for (const [index, entry] of entries.entries()) {
            const criterion = this.readCriterion(entry);
            if (!criterion) {
                return `Criterion ${index + 1} must be a non-empty string, or an object with a non-empty "criterion" ` +
                    'and an optional "weight" that is a number of 0 or more';
            }
            criteria.push(criterion);
        }
        return criteria;
    }

    /** One criterion: a string (weight 1), or `{ criterion, weight? }`. Undefined when it is neither. */
    private readCriterion(entry: unknown): WeightedCriterion | undefined {
        if (typeof entry === 'string') {
            return entry.trim() ? { criterion: entry, weight: 1 } : undefined;
        }
        if (typeof entry !== 'object' || entry === null || !('criterion' in entry)) {
            return undefined;
        }
        const text = entry.criterion;
        const weight = 'weight' in entry && entry.weight != null ? entry.weight : 1;
        if (typeof text !== 'string' || !text.trim()) {
            return undefined;
        }
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
            return undefined;
        }
        return { criterion: text, weight };
    }

    /** The pass threshold and prompt name, defaulted, or the reason the config is invalid. */
    private readSettings(config: OracleConfig): JudgeSettings | string {
        const passThreshold = config.passThreshold ?? DecisionJudgeOracle.DEFAULT_PASS_THRESHOLD;
        if (typeof passThreshold !== 'number' || !(passThreshold >= 0 && passThreshold <= 1)) {
            return `passThreshold must be a number from 0 to 1, not ${JSON.stringify(passThreshold)}`;
        }
        const promptName = config.promptName ?? DecisionJudgeOracle.DEFAULT_PROMPT_NAME;
        if (typeof promptName !== 'string' || !promptName.trim()) {
            return `promptName must be a non-empty string, not ${JSON.stringify(promptName)}`;
        }
        return { passThreshold, promptName };
    }

    /** The decision prompt with this name, ignoring case and surrounding spaces. */
    private findPrompt(promptName: string): MJAIPromptEntityExtended | undefined {
        const target = promptName.trim().toLowerCase();
        return AIEngine.Instance.Prompts.find(p => (p.Name ?? '').trim().toLowerCase() === target);
    }

    /** The one decision call: the judge's trace as the state, and a question per criterion. */
    private buildParams(input: OracleInput, prompt: MJAIPromptEntityExtended, criteria: WeightedCriterion[]): AIDecisionParams {
        const params = new AIDecisionParams();
        params.prompt = prompt;
        params.contextUser = input.contextUser;
        params.State = this.buildState(BuildJudgeTrace(input));
        params.Questions = this.buildQuestions(criteria);
        return params;
    }

    /** The trace as text, under the section names of the LLM judge's prompt. */
    private buildState(trace: JudgeTrace): string {
        return [
            `Input:\n${trace.Input ?? '(none)'}`,
            `Expected Output Requirements:\n${trace.Expected ?? '(none)'}`,
            `Actual Output:\n${trace.Actual ?? '(none)'}`,
        ].join('\n\n');
    }

    /** One Likelihood question per criterion, keyed by position: a key is a label for code only. */
    private buildQuestions(criteria: WeightedCriterion[]): Record<string, DecisionQuestion> {
        const questions: Record<string, DecisionQuestion> = {};
        criteria.forEach((c, index) => {
            questions[this.questionKey(index)] = {
                Kind: 'Likelihood',
                Instructions: `The response satisfies: ${c.criterion}`,
            };
        });
        return questions;
    }

    private questionKey(index: number): string {
        return `criterion_${index + 1}`;
    }

    /** Turns the decision into the oracle result: the pass rule and the weighted score, in code. */
    private judge(run: AIDecisionRunResult, criteria: WeightedCriterion[], settings: JudgeSettings): OracleResult {
        const runDetails = this.runDetails(run);
        if (!run.success) {
            return this.failed(`Decision judgment failed: ${run.errorMessage || 'unknown error'}`, runDetails);
        }
        const outcomes = this.readOutcomes(run, criteria, settings.passThreshold);
        if (typeof outcomes === 'string') {
            return this.failed(outcomes, runDetails);
        }
        return {
            oracleType: this.type,
            passed: outcomes.every(o => o.passed),
            score: this.weightedMean(outcomes),
            message: this.summarize(outcomes, settings.passThreshold),
            details: {
                criteriaProbabilities: outcomes,
                passThreshold: settings.passThreshold,
                promptName: settings.promptName,
                ...runDetails,
            },
        };
    }

    /** Each criterion's probability and pass, or the reason an answer is missing. */
    private readOutcomes(run: AIDecisionRunResult, criteria: WeightedCriterion[], passThreshold: number): CriterionProbability[] | string {
        const outcomes: CriterionProbability[] = [];
        for (const [index, c] of criteria.entries()) {
            const answer = run.Answers[this.questionKey(index)];
            if (answer?.Kind !== 'Likelihood' || !Number.isFinite(answer.Probability)) {
                return `The decision returned no Likelihood answer for criterion ${index + 1}: ${c.criterion}`;
            }
            outcomes.push({
                criterion: c.criterion,
                probability: answer.Probability,
                weight: c.weight,
                passed: answer.Probability >= passThreshold,
            });
        }
        return outcomes;
    }

    /** The weighted mean of the probabilities; 0 when every weight is 0. */
    private weightedMean(outcomes: CriterionProbability[]): number {
        const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
        if (totalWeight === 0) {
            return 0;
        }
        return outcomes.reduce((sum, o) => sum + o.probability * o.weight, 0) / totalWeight;
    }

    private summarize(outcomes: CriterionProbability[], passThreshold: number): string {
        const below = outcomes.filter(o => !o.passed);
        if (below.length === 0) {
            return `All ${outcomes.length} criteria are at or above the pass threshold of ${passThreshold}`;
        }
        const list = below.map(o => `"${o.criterion}" (${o.probability.toFixed(2)})`).join(', ');
        return `${below.length} of ${outcomes.length} criteria are below the pass threshold of ${passThreshold}: ${list}`;
    }

    private runDetails(run: AIDecisionRunResult): DecisionRunDetails {
        return {
            decisionRunId: run.promptRun?.ID,
            decisionModel: run.modelInfo?.modelName,
            llmCost: run.cost,
        };
    }

    private failed(message: string, details?: DecisionRunDetails): OracleResult {
        const result: OracleResult = { oracleType: this.type, passed: false, score: 0, message };
        if (details) {
            result.details = details;
        }
        return result;
    }
}
