/**
 * wellFormed.ts — metrics 1 and 2: was the output usable at all?
 *
 * This is the oracle that measures the `MALFORMED_FUNCTION_CALL` class directly (test plan §3.2,
 * §6.1) — the headline number the whole native-tool-calling effort exists to move. It answers a
 * narrower question than {@link evaluateDecision}: not "was the decision right" but "did the model
 * produce something the framework could read." A run can be well-formed and wrong; it cannot be
 * malformed and right.
 *
 * Keeping the two separate matters for attribution. A comparison run weighs baseline against native, and
 * "malformed rate fell" and "decision accuracy rose" are different claims with different causes.
 *
 * FRAMEWORK-FREE (test plan §2.1) — imports nothing from the testing engine.
 */
import { LOOP_NEXT_STEP_TYPES } from '@memberjunction/ai-agents';
import type { ObservedDecision } from './decision';

/**
 * The step types the runtime will actually dispatch, derived from the agent framework rather than
 * restated here — a hand-copied list would drift the moment a step type is added.
 *
 * Casing is load-bearing: `LoopAgentType.DetermineNextStep` switches on the raw string, so a
 * lower-cased `'chat'` passes the validator (which compares case-insensitively) and then falls
 * through to `default:` — a forced Retry that costs a whole iteration. That is a malformed
 * response by any measure the issue cares about, so it is checked here.
 */
const DISPATCHABLE_STEP_TYPES = new Set<string>(LOOP_NEXT_STEP_TYPES);

/** What the harness knows about the turn beyond the decision itself. */
export interface WellFormedInput {
    decision: ObservedDecision;
    /** The provider's `finish_reason`, when the driver captured one. */
    finishReason?: string | null;
    /** Set when the prompt run itself failed (provider error, timeout, cancellation). */
    executionError?: string | null;
}

export interface WellFormedConfig {
    /**
     * Whether an envelope was required on this turn.
     *
     * Native-mode cells set this false: a clean tool call with no text is a *complete* answer
     * there, and text never accompanies a call on Google — so requiring an
     * envelope would fail every correct native turn.
     */
    requireEnvelope?: boolean;
    /**
     * Finish reasons that indicate the model was cut off or refused rather than finishing.
     *
     * Defaults cover the values seen across the provider matrix plus the documented failure modes. Values are
     * compared case-insensitively because providers disagree on casing — see MJ#4335.
     */
    unacceptableFinishReasons?: string[];
}

const DEFAULT_UNACCEPTABLE_FINISH_REASONS = [
    'malformed_function_call',
    'content_filter',
    'safety',
    'recitation',
    'length',
    'max_tokens'
];

export interface WellFormedResult {
    passed: boolean;
    score: number;
    message: string;
    details: {
        kind: ObservedDecision['kind'];
        encoding: ObservedDecision['encoding'];
        envelopeParsed: boolean | null;
        stepType: string | null;
        finishReason: string | null;
    };
}

/** Judges whether a turn produced usable output. */
export function EvaluateWellFormed(input: WellFormedInput, config: WellFormedConfig = {}): WellFormedResult {
    const { decision } = input;
    const details = {
        kind: decision.kind,
        encoding: decision.encoding,
        envelopeParsed: decision.envelopeParsed,
        stepType: decision.stepType ?? null,
        finishReason: input.finishReason ?? null
    };
    const fail = (message: string): WellFormedResult => ({ passed: false, score: 0, message, details });

    // An execution error outranks everything: there is no output to judge.
    if (input.executionError) {
        return fail(`execution failed: ${input.executionError}`);
    }
    if (decision.kind === 'empty') {
        return fail('no output received from model');
    }
    if (decision.kind === 'unparseable') {
        return fail(decision.diagnostic ?? 'output could not be read as a decision');
    }

    const unacceptable = (config.unacceptableFinishReasons ?? DEFAULT_UNACCEPTABLE_FINISH_REASONS).map((r) => r.toLowerCase());
    const finish = input.finishReason?.toLowerCase().trim();
    if (finish && unacceptable.includes(finish)) {
        return fail(`unacceptable finish reason: ${input.finishReason}`);
    }

    if (decision.stepType && !DISPATCHABLE_STEP_TYPES.has(decision.stepType)) {
        const canonical = LOOP_NEXT_STEP_TYPES.find((t) => t.toLowerCase() === decision.stepType?.toLowerCase().trim());
        return fail(canonical
            ? `nextStep.type '${decision.stepType}' is the wrong case — the dispatcher switches on '${canonical}' and would force a Retry`
            : `nextStep.type '${decision.stepType}' is not a dispatchable step type`);
    }

    // Parsed JSON that is not a LoopAgentResponse at all: no dispatchable nextStep, not complete,
    // no payload write, no responseForm. Production has nothing to act on and forces a Retry — the
    // same cost as a bad step type above, so it belongs in the same bucket. Counting it as usable
    // is what let Cerebras's `{"weather":"unavailable", ...}` score as a usable envelope response.
    // Guarded on stepType being absent: a valid-but-contentless step ('Retry') IS dispatchable.
    if (decision.kind === 'other' && !decision.stepType) {
        return fail('parsed JSON is not a LoopAgentResponse — nothing for the loop to dispatch');
    }

    if (config.requireEnvelope === true && decision.envelopeParsed !== true) {
        return fail(decision.encoding === 'native'
            // Worth naming precisely: this is the exact mechanism the provider matrix reproduced, where a
            // correct decision arrives through a channel the caller was not reading.
            ? 'answered with a native tool call while an envelope was required'
            : 'envelope required but not parsed');
    }

    return { passed: true, score: 1, message: `usable ${decision.encoding} response (${decision.kind})`, details };
}

/** @deprecated Use {@link EvaluateWellFormed}. */
export function evaluateWellFormed(input: WellFormedInput, config: WellFormedConfig = {}): WellFormedResult {
    return EvaluateWellFormed(input, config);
}
