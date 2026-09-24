/**
 * expectation.ts — the corpus's expectation DSL, and scoring an observation against it.
 *
 * A case states one {@link DecisionExpectation}; {@link evaluateDecision} scores an
 * {@link ObservedDecision} against it and returns the components **separately** rather than only a
 * number. That decomposition is required by test plan §3.2 so the §6.1 metrics — decision accuracy,
 * action accuracy, param fidelity — aggregate straight out of persisted `ResultDetails` without
 * re-running a single model call. A single collapsed score would make every cross-run comparison a
 * re-run.
 *
 * FRAMEWORK-FREE (test plan §2.1) — imports nothing from the testing engine.
 */
import type { DecisionKind, ObservedDecision } from './decision';
import { MatchParams, type ParamExpectation, type ParamMatchResult } from './matchers';

/** One action a correct answer invokes, with the checks that make the invocation usable. */
export interface ExpectedAction {
    name: string;
    params?: ParamExpectation[];
}

/** What a correct answer looks like — stated as a decision, never as an encoding. */
export interface DecisionExpectation {
    kind: DecisionKind;
    /** Required when `kind` is `action`. Compared as a set unless `ordered`. */
    actions?: ExpectedAction[];
    /** Sub-agent names, when `kind` is `subAgent`. */
    subAgents?: string[];
    /** Optional check on the user-facing message — e.g. a `chat` case that must mention a topic. */
    message?: ParamExpectation['matcher'];
    /**
     * Names that must NOT appear, whatever else happens.
     *
     * This is the coherence probe's instrument: with tools declared, a model
     * must *not* reach for one when chat or completion is the right answer. Expressed as a
     * prohibition rather than a kind mismatch so a case can forbid a specific tempting action
     * while still allowing others.
     */
    forbiddenActions?: string[];
    /** Whether action order is asserted. Defaults to false — parallel calls have no inherent order. */
    ordered?: boolean;
    /**
     * Whether actions BEYOND the expected set are tolerated. Defaults to false.
     *
     * False is the right default for a decision corpus: an agent that calls the right action plus
     * two speculative extras has not made the right decision, it has made three. Cases that
     * genuinely do not care set this true.
     */
    allowAdditionalActions?: boolean;
    /**
     * Matchers over dotted paths into the observed payload change request, e.g.
     * `newElements.findings`. Scored into `paramFidelity` alongside action parameters.
     */
    payload?: ParamExpectation[];
    /** Dotted paths into the payload change that must NOT be present (payload scoping). */
    forbiddenPayloadPaths?: string[];
}

/** Per-component outcome, so §6.1's metrics fall out of the stored details. */
export interface DecisionEvaluation {
    /** Metric 3 — did the agent decide the right *kind* of thing? */
    decisionKindMatch: boolean;
    /** Metric 4 — right action name(s). `null` when the case expects no action. */
    actionAccuracy: number | null;
    /** Metric 5 — share of parameter matchers that passed. `null` when the case declares none. */
    paramFidelity: number | null;
    /** Individual matcher outcomes, for reporting which parameter failed and why. */
    paramResults: ParamMatchResult[];
    /** Forbidden names the agent invoked anyway. Non-empty is always a failure. */
    forbiddenViolations: string[];
    /** Overall pass — every applicable component clean. */
    passed: boolean;
    /** Mean of the APPLICABLE components. See the note in {@link evaluateDecision}. */
    score: number;
    /** Human-readable reasons, in the order they were detected. */
    messages: string[];
}

function sameNameSet(expected: string[], observed: string[], ordered: boolean, allowAdditional = false): boolean {
    if (allowAdditional) {
        // Containment, not equality: every expected name appeared somewhere.
        const seen = [...observed];
        return expected.every((name) => {
            const at = seen.indexOf(name);
            if (at < 0) {
                return false;
            }
            seen.splice(at, 1);   // consume, so a duplicate expectation needs a duplicate call
            return true;
        });
    }
    if (expected.length !== observed.length) {
        return false;
    }
    if (ordered) {
        return expected.every((name, i) => name === observed[i]);
    }
    const a = [...expected].sort();
    const b = [...observed].sort();
    return a.every((name, i) => name === b[i]);
}

function scoreActions(expectation: DecisionExpectation, observed: ObservedDecision): {
    accuracy: number | null;
    paramResults: ParamMatchResult[];
    messages: string[];
} {
    const expectedActions = expectation.actions ?? [];
    if (expectedActions.length === 0) {
        return { accuracy: null, paramResults: [], messages: [] };
    }
    const messages: string[] = [];
    const observedNames = observed.actions.map((a) => a.name);
    const namesMatch = sameNameSet(expectedActions.map((a) => a.name), observedNames, expectation.ordered === true, expectation.allowAdditionalActions === true);
    if (!namesMatch) {
        messages.push(`expected action(s) [${expectedActions.map((a) => a.name).join(', ')}], got [${observedNames.join(', ')}]`);
    }

    const paramResults: ParamMatchResult[] = [];
    for (const expected of expectedActions) {
        if (!expected.params || expected.params.length === 0) {
            continue;
        }
        // Score against the first call of that name. A duplicate call is already a name-level
        // failure; charging it again here would double-penalize one mistake across two metrics.
        const match = observed.actions.find((a) => a.name === expected.name);
        if (!match) {
            paramResults.push(...expected.params.map((p) => ({
                param: `${expected.name}.${p.param}`,
                matcherKind: p.matcher.kind,
                passed: false,
                detail: `action '${expected.name}' was not invoked`
            })));
            continue;
        }
        paramResults.push(...MatchParams(expected.params, match.params).map((r) => ({ ...r, param: `${expected.name}.${r.param}` })));
    }
    for (const failure of paramResults.filter((r) => !r.passed)) {
        messages.push(`param ${failure.param}: ${failure.detail}`);
    }
    return { accuracy: namesMatch ? 1 : 0, paramResults, messages };
}

/**
 * Scores one observation against one expectation.
 *
 * **On `score`:** it is the mean of the components that *apply* to this case, not a fixed weighting.
 * A case expecting `chat` has no action or param component, and counting those absent components as
 * either 1 (inflating) or 0 (deflating) would make chat cases and action cases incomparable — which
 * is precisely what a corpus-wide average needs them to be. Weighting across metrics is the
 * scorecard's job at aggregation time, where it can be stated explicitly; §6.1 treats them as
 * separate metrics for the same reason.
 */
function getPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => (acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

/** Payload matchers and forbidden paths, over the observed `payloadChange`. */
function scorePayload(expectation: DecisionExpectation, observed: ObservedDecision): { paramResults: ParamMatchResult[]; messages: string[]; forbidden: string[] } {
    const matchers = expectation.payload ?? [];
    const messages: string[] = [];
    const flat = Object.fromEntries(matchers.map((m) => [m.param, getPath(observed.payloadChange, m.param)]));
    const paramResults = matchers.length === 0 ? [] : MatchParams(matchers, flat).map((r) => ({ ...r, param: `payload ${r.param}` }));
    for (const failure of paramResults.filter((r) => !r.passed)) {
        messages.push(`${failure.param}: ${failure.detail}`);
    }
    const forbidden = (expectation.forbiddenPayloadPaths ?? []).filter((path) => getPath(observed.payloadChange, path) !== undefined);
    if (forbidden.length > 0) {
        messages.push(`wrote forbidden payload path(s): [${forbidden.join(', ')}]`);
    }
    return { paramResults, messages, forbidden };
}

export function EvaluateDecision(expectation: DecisionExpectation, observed: ObservedDecision): DecisionEvaluation {
    const messages: string[] = [];

    // A payloadChange expectation is met by a mixed turn too (action + payload write, spec §2.1).
    const decisionKindMatch = observed.kind === expectation.kind
        || (expectation.kind === 'payloadChange' && observed.payloadChange !== undefined);
    if (!decisionKindMatch) {
        const why = observed.diagnostic ? ` (${observed.diagnostic})` : '';
        messages.push(`expected decision kind '${expectation.kind}', got '${observed.kind}'${why}`);
    }

    const actionScore = scoreActions(expectation, observed);
    const payloadScore = scorePayload(expectation, observed);
    const accuracy = actionScore.accuracy;
    const paramResults = [...actionScore.paramResults, ...payloadScore.paramResults];
    messages.push(...actionScore.messages, ...payloadScore.messages);

    const expectedSubAgents = expectation.subAgents ?? [];
    let subAgentsMatch = true;
    if (expectedSubAgents.length > 0) {
        subAgentsMatch = sameNameSet(expectedSubAgents, observed.subAgents.map((s) => s.name), expectation.ordered === true);
        if (!subAgentsMatch) {
            messages.push(`expected sub-agent(s) [${expectedSubAgents.join(', ')}], got [${observed.subAgents.map((s) => s.name).join(', ')}]`);
        }
    }

    // Forbidden names are checked against BOTH channels: the point is that the agent did not reach
    // for the capability, and it is equally wrong whether it did so natively or through the envelope.
    const invoked = new Set([...observed.actions.map((a) => a.name), ...observed.subAgents.map((s) => s.name)]);
    const forbiddenViolations = [
        ...(expectation.forbiddenActions ?? []).filter((name) => invoked.has(name)),
        ...payloadScore.forbidden.map((path) => `payload:${path}`)
    ];
    if (forbiddenViolations.length > 0) {
        messages.push(`invoked forbidden: [${forbiddenViolations.join(', ')}]`);
    }

    let messageMatch = true;
    if (expectation.message) {
        const result = MatchParams([{ param: 'message', matcher: expectation.message }], { message: observed.message });
        messageMatch = result[0].passed;
        if (!messageMatch) {
            messages.push(`message: ${result[0].detail}`);
        }
    }

    const paramFidelity = paramResults.length === 0 ? null : paramResults.filter((r) => r.passed).length / paramResults.length;

    const applicable: number[] = [decisionKindMatch ? 1 : 0];
    if (accuracy !== null) {
        applicable.push(accuracy);
    }
    if (paramFidelity !== null) {
        applicable.push(paramFidelity);
    }
    if (expectedSubAgents.length > 0) {
        applicable.push(subAgentsMatch ? 1 : 0);
    }
    if (expectation.message) {
        applicable.push(messageMatch ? 1 : 0);
    }
    applicable.push(forbiddenViolations.length === 0 ? 1 : 0);

    const passed = decisionKindMatch
        && (accuracy === null || accuracy === 1)
        && (paramFidelity === null || paramFidelity === 1)
        && subAgentsMatch
        && messageMatch
        && forbiddenViolations.length === 0;

    return {
        decisionKindMatch,
        actionAccuracy: accuracy,
        paramFidelity,
        paramResults,
        forbiddenViolations,
        passed,
        score: applicable.reduce((a, b) => a + b, 0) / applicable.length,
        messages
    };
}

/** @deprecated Use {@link EvaluateDecision}. */
export function evaluateDecision(expectation: DecisionExpectation, observed: ObservedDecision): DecisionEvaluation {
    return EvaluateDecision(expectation, observed);
}
