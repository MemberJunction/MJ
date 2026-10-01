/**
 * @fileoverview `discovery-label-match`: did agent discovery reach the agent the request's label
 * names, or, for a request no specialist should handle, stay out of the way?
 * @module @memberjunction/testing-engine
 */

import { UUIDsEqual } from '@memberjunction/global';
import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';
import { DescribeZodError } from '../decision-eval/types';
import {
    DiscoveryEvalActualOutputSchema,
    DiscoveryEvalExpectedSchema,
    type DiscoveryEvalActualOutput,
    type DiscoveryEvalExpected,
    type DiscoveryLabelMatchDetails
} from '../decision-eval/discovery-types';

/**
 * `discovery-label-match`: scores an agent-discovery run against its label, for either arm.
 *
 * - An `agent` label is correct when the chosen agent is the labelled agent: the Choice's pick for
 *   the decision, whatever its confidence, or the first row `Find Candidate Agents` would return
 *   for the `semantic-search` baseline.
 * - A `none` label is correct when discovery would not inject a suggestion (the run's `WouldInject`):
 *   `JudgeDecisionDiscovery` not confident at production's threshold, or the discovery finishing
 *   after production's timeout (decision), or no candidate reaching the action's similarity floor
 *   (baseline).
 * - A run with no usable answer fails, naming why, with `correct: null`.
 *
 * `details` carry `{ arm, label, kind, expectedAgentId, chosenAgentId, confidence, anyApplies,
 * wouldInject, topScore, correct }`, so the scorecard can aggregate without re-running anything.
 * It takes no configuration.
 */
export class DiscoveryLabelMatchOracle implements IOracle {
    readonly type = 'discovery-label-match';

    async evaluate(input: OracleInput, _config: OracleConfig): Promise<OracleResult> {
        const expected = DiscoveryEvalExpectedSchema.safeParse(input.expectedOutput);
        if (!expected.success) {
            return this.failed(`Expected outcome has no usable label: ${DescribeZodError(expected.error)}`);
        }
        const actual = DiscoveryEvalActualOutputSchema.safeParse(input.actualOutput);
        if (!actual.success) {
            return this.failed(`Actual output is not a discovery run's: ${DescribeZodError(actual.error)}`);
        }
        const details = ScoreDiscoveryRun(expected.data, actual.data);
        if (details.correct === null) {
            return this.failed(`No usable answer: ${actual.data.Error ?? actual.data.VerdictReason ?? 'the run chose no agent'}`, details);
        }
        return {
            oracleType: this.type,
            passed: details.correct,
            score: details.correct ? 1 : 0,
            message: describe(details),
            details
        };
    }

    private failed(message: string, details?: DiscoveryLabelMatchDetails): OracleResult {
        return { oracleType: this.type, passed: false, score: 0, message, details };
    }
}

/**
 * Scores one discovery run against its label (see {@link DiscoveryLabelMatchOracle}). `correct` is
 * null when the run has no usable answer: `WouldInject` unknown, or, for the decision, no Choice.
 *
 * @param expected The run's label.
 * @param actual The run's actual output.
 */
export function ScoreDiscoveryRun(expected: DiscoveryEvalExpected, actual: DiscoveryEvalActualOutput): DiscoveryLabelMatchDetails {
    const expectedAgentId = expected.label === 'agent' ? expected.agentId : null;
    const answered = actual.WouldInject !== null && (actual.Arm !== 'decision' || actual.ChosenAgentId !== null);
    return {
        arm: actual.Arm,
        label: expected.label,
        kind: expected.label === 'none' ? expected.kind : null,
        expectedAgentId,
        chosenAgentId: actual.ChosenAgentId,
        confidence: actual.Confidence,
        anyApplies: actual.AnyApplies,
        wouldInject: actual.WouldInject,
        topScore: actual.Baseline?.TopMatch?.Score ?? null,
        correct: !answered ? null : expectedAgentId !== null
            ? !!actual.ChosenAgentId && UUIDsEqual(actual.ChosenAgentId, expectedAgentId)
            : actual.WouldInject === false
    };
}

/** The result's message. */
function describe(details: DiscoveryLabelMatchDetails): string {
    const verdict = details.correct ? '' : ' (disagrees)';
    if (details.label === 'agent') {
        return `chose ${details.chosenAgentId ?? 'no agent'}; labelled ${details.expectedAgentId}${verdict}`;
    }
    return `${details.wouldInject ? 'would suggest' : 'would not suggest'} ${details.chosenAgentId ?? 'an agent'}; labelled none (${details.kind})${verdict}`;
}
