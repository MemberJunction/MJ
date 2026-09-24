/**
 * @fileoverview Agent-decision oracles — the centrepiece of the prompt-eval corpus (test plan §3.2).
 * @module @memberjunction/testing-engine
 */

import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';
import { NormalizeDecision, type RawTurn } from '../eval/decision';
import { type DecisionExpectation } from '../eval/expectation';
import { EvaluateCorpusExpectation, type CorpusExpectation } from '../eval/corpus';
import { EvaluateWellFormed, type WellFormedConfig } from '../eval/wellFormed';

/**
 * The shape a driver hands oracles as `actualOutput` for a prompt-eval test.
 *
 * Deliberately minimal and encoding-neutral: the raw text and, when the driver requested tools, the
 * normalized calls. Anything richer would couple the oracles to a driver, and the whole point of
 * §2.1 is that the same evaluation runs under a different runner unchanged.
 */
export interface PromptEvalActualOutput {
    turn: RawTurn;
    finishReason?: string | null;
    executionError?: string | null;
}

function readActual(input: OracleInput): PromptEvalActualOutput {
    const actual = input.actualOutput as PromptEvalActualOutput | undefined;
    // A driver that produced nothing at all still has to be judged rather than crash the run —
    // "no output" is the single most important observation this suite makes.
    return actual?.turn ? actual : { turn: { text: typeof actual === 'string' ? actual : '' } };
}

/**
 * `agent-decision-match` — did the agent decide the right thing?
 *
 * Reads the decision off whichever channel the model used (envelope or native tool calls) and
 * compares it against an encoding-independent expectation. That normalization is what lets a
 * baseline cell and a native cell be compared on an identical corpus case: the
 * yardstick does not move between them, only the model's behavior does.
 *
 * The result's `details` carry the components separately — decision kind, action accuracy, param
 * fidelity, per-matcher outcomes — so §6.1's metrics aggregate out of persisted `ResultDetails`
 * without re-running anything.
 *
 * Configuration is the {@link DecisionExpectation} itself.
 */
export class AgentDecisionOracle implements IOracle {
    readonly type = 'agent-decision-match';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const expectation = config as unknown as DecisionExpectation;
            if (!expectation?.kind) {
                return { oracleType: this.type, passed: false, score: 0, message: "Configuration requires a 'kind' (the expected decision)" };
            }
            const actual = readActual(input);
            const observed = NormalizeDecision(actual.turn);
            // evaluateCorpusExpectation, NOT evaluateDecision: only the former unwraps `anyOf`.
            // `anyOf` is a corpus-level kind — a case that legitimately admits several decisions —
            // and evaluateDecision would compare the literal string 'anyOf' against the observed
            // kind and fail every time, which is a scored failure the model can never avoid.
            const evaluation = EvaluateCorpusExpectation(
                (input.test?.Name ?? 'case'), expectation as unknown as CorpusExpectation, observed);

            return {
                oracleType: this.type,
                passed: evaluation.passed,
                score: evaluation.score,
                message: evaluation.passed
                    ? `decided '${observed.kind}' via ${observed.encoding} as expected`
                    : evaluation.messages.join('; '),
                details: {
                    expectedKind: expectation.kind,
                    observedKind: observed.kind,
                    encoding: observed.encoding,
                    decisionKindMatch: evaluation.decisionKindMatch,
                    actionAccuracy: evaluation.actionAccuracy,
                    paramFidelity: evaluation.paramFidelity,
                    paramResults: evaluation.paramResults,
                    forbiddenViolations: evaluation.forbiddenViolations,
                    observedActions: observed.actions.map((a) => a.name),
                    observedSubAgents: observed.subAgents.map((s) => s.name),
                    // Surfaced so the scorecard can count dual-channel
                    // turns and concatenated envelopes without re-running anything.
                    dualChannel: observed.dualChannel ?? false,
                    payloadChanged: observed.payloadChange !== undefined,
                    narrationWithCalls: observed.narrationWithCalls ?? false,
                    placeholderCall: observed.placeholderCall ?? false,
                    shadowEnvelopeKind: observed.shadowEnvelopeKind,
                    diagnostic: observed.diagnostic
                }
            };
        } catch (error) {
            return { oracleType: this.type, passed: false, score: 0, message: `Decision evaluation error: ${(error as Error).message}` };
        }
    }
}

/**
 * `response-well-formed` — was the output usable at all?
 *
 * This is the oracle that measures the malformed/discard class directly — the issue's headline
 * number. It asks strictly less than {@link AgentDecisionOracle}: a turn can be well-formed and
 * wrong, but never malformed and right. Keeping them apart is what lets a comparison say *which* of
 * "malformed rate fell" and "decision accuracy rose" actually happened.
 *
 * Configuration is a {@link WellFormedConfig}. Note `requireEnvelope` defaults to **off**: measurement
 * measured that a correct native tool call carries no text at all on Google, so requiring an
 * envelope unconditionally would fail every correct native turn.
 */
export class ResponseWellFormedOracle implements IOracle {
    readonly type = 'response-well-formed';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const actual = readActual(input);
            const observed = NormalizeDecision(actual.turn);
            const result = EvaluateWellFormed(
                { decision: observed, finishReason: actual.finishReason, executionError: actual.executionError },
                config as WellFormedConfig
            );
            return { oracleType: this.type, passed: result.passed, score: result.score, message: result.message, details: result.details };
        } catch (error) {
            return { oracleType: this.type, passed: false, score: 0, message: `Well-formedness evaluation error: ${(error as Error).message}` };
        }
    }
}
