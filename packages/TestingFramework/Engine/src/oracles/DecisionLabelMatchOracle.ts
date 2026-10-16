/**
 * @fileoverview `decision-label-match`: does a decision's Likelihood agree with the point's label?
 * @module @memberjunction/testing-engine
 */

import { z } from 'zod';
import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';
import {
    DecisionEvalAnswerSummarySchema,
    DecisionEvalExpectedSchema,
    DecisionLabelMatchConfigSchema,
    DescribeZodError,
    type DecisionLabelMatchConfig,
    type DecisionLabelMatchDetails
} from '../decision-eval/types';

/** The part of a Decision Eval `ActualOutput` this oracle reads: the summarized answers. */
const AnswersOnlySchema = z.object({ Answers: z.record(DecisionEvalAnswerSummarySchema) });

/**
 * `decision-label-match`: reads one Likelihood's probability from a Decision Eval run's answers
 * (by default `continues`) and compares `probability >= threshold` with `label === positiveLabel`.
 *
 * - The result passes, with score 1, when the two agree, and fails with score 0 otherwise.
 * - `details` carry `{ probability, label, positive, correct, brier }`, so the scorecard can
 *   aggregate without re-running anything.
 * - An `ambiguous` label is not scored: the result is `advisory`, so it never gates the run.
 * - A run with no such Likelihood fails, naming why.
 *
 * Configuration: `{ question = 'continues', positiveLabel = 'continue', threshold = 0.5 }`.
 */
export class DecisionLabelMatchOracle implements IOracle {
    readonly type = 'decision-label-match';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        const settings = DecisionLabelMatchConfigSchema.safeParse(config ?? {});
        if (!settings.success) {
            return this.failed(`Invalid configuration: ${DescribeZodError(settings.error)}`);
        }
        const expected = DecisionEvalExpectedSchema.safeParse(input.expectedOutput);
        if (!expected.success) {
            return this.failed(`Expected outcome has no usable label: ${DescribeZodError(expected.error)}`);
        }
        const probability = ReadLikelihood(input.actualOutput, settings.data.question);
        if (expected.data.label === 'ambiguous') {
            return this.advisory(probability, settings.data);
        }
        if (probability === null) {
            return this.failed(`No '${settings.data.question}' Likelihood in the answers`, {
                probability: null, label: expected.data.label, positive: this.positiveOf(expected.data.label, settings.data), correct: false, brier: null
            });
        }
        return this.scored(probability, expected.data.label, settings.data);
    }

    /** A scored comparison of the probability with the label. */
    private scored(probability: number, label: 'continue' | 'switch', settings: DecisionLabelMatchConfig): OracleResult {
        const positive = this.positiveOf(label, settings);
        const predictedPositive = probability >= settings.threshold;
        const correct = predictedPositive === (positive === 1);
        const details: DecisionLabelMatchDetails = { probability, label, positive, correct, brier: (probability - positive) ** 2 };
        return {
            oracleType: this.type,
            passed: correct,
            score: correct ? 1 : 0,
            message: `${settings.question} = ${probability.toFixed(3)} ${predictedPositive ? '>=' : '<'} ${settings.threshold}; `
                + `label '${label}'${correct ? '' : ' (disagrees)'}`,
            details
        };
    }

    /** An unscored result for an ambiguous label: reported, never gating. */
    private advisory(probability: number | null, settings: DecisionLabelMatchConfig): OracleResult {
        const details: DecisionLabelMatchDetails = { probability, label: 'ambiguous', positive: null, correct: null, brier: null };
        const kept = probability === null ? 'no probability' : probability >= settings.threshold ? 'kept with the previous agent' : 'moved away';
        return {
            oracleType: this.type,
            passed: true,
            score: 0,
            advisory: true,
            message: `Ambiguous label: not scored (${kept})`,
            details
        };
    }

    /** 1 when the label is the positive class, else 0. */
    private positiveOf(label: 'continue' | 'switch', settings: DecisionLabelMatchConfig): 0 | 1 {
        return label === settings.positiveLabel ? 1 : 0;
    }

    private failed(message: string, details?: DecisionLabelMatchDetails): OracleResult {
        return { oracleType: this.type, passed: false, score: 0, message, details };
    }
}

/**
 * A Likelihood's probability from a Decision Eval `ActualOutput`, or null when the output has no
 * readable answers or no Likelihood under that key.
 *
 * @param actualOutput The run's actual output, as the driver recorded it.
 * @param question The Likelihood's key.
 */
export function ReadLikelihood(actualOutput: unknown, question: string): number | null {
    const parsed = AnswersOnlySchema.safeParse(actualOutput);
    if (!parsed.success) {
        return null;
    }
    const answer = parsed.data.Answers[question];
    return answer?.Kind === 'Likelihood' && typeof answer.Probability === 'number' ? answer.Probability : null;
}
