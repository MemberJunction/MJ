/**
 * What a Decision step stores, reads and produces, decided without touching the database.
 *
 * A Decision step answers typed questions in one call and hands the answers to the edges that route
 * on them. Everything here is a decision about data rather than I/O — which state the questions are
 * about, where the answers land, and which answers a condition may act on — so it lives beside
 * `condition-gate` rather than inside the dispatcher, where it would be testable only through mocks.
 *
 * @module @memberjunction/task-graph
 */
import {
    DecisionReferencesIn,
    ResolveDecisionStepAnswers,
    type EdgeConditionOutcome,
    type GraphDecisions,
    type HeldDecisionAnswer,
    type TaskGraphDecisionAnswer,
    type TaskGraphDecisionQuestion,
    type TaskGraphNodeConfigMap,
} from '@memberjunction/ai-core-plus';
import type { MJTaskEntity_ITaskStepConfiguration } from '@memberjunction/core-entities';
import { ParseConditionOutput } from './condition-gate';

/**
 * What a Decision step keeps in `Task.Configuration.decision`: its spec configuration, plus the name
 * conditions use for it.
 */
export type TaskDecisionStepConfiguration = TaskGraphNodeConfigMap['Decision'] & {
    /**
     * The node's `tempId` in the submitted spec — the `<step>` in `decisions.<step>.<question>`.
     *
     * Stored because nothing else survives submission: Task rows have real IDs, and the tempIds the
     * conditions were written against are otherwise gone.
     */
    nodeId: string;
};

/**
 * `Task.Configuration` as this package writes it: the generated bag, plus a Decision step's settings.
 *
 * An intersection rather than a new member of `ITaskStepConfiguration`, because that interface is
 * generated from a metadata JSONType. Everything else in the bag is read and written through the
 * generated type unchanged.
 */
export type TaskStepConfiguration = MJTaskEntity_ITaskStepConfiguration & {
    /** Settings for a Decision step. The decision prompt itself is `Task.PromptID`. */
    decision?: TaskDecisionStepConfiguration;
};

/** The Task columns the decision readers use. Structural, so `MJTaskEntity` satisfies it as-is. */
export type DecisionTaskRow = {
    Name: string;
    Status: string;
    StepType: string | null;
    Configuration: string | null;
    OutputPayload: string | null;
    ErrorMessage: string | null;
};

/** The payload key a Decision step writes its answers under, by step. */
export const DECISIONS_PAYLOAD_KEY = 'decisions';

/**
 * Reads a Decision step's settings from its stored `Configuration`, or `null` when they are absent
 * or unusable. A step without them cannot ask anything, and a caller must say so rather than guess.
 */
export function ReadDecisionStepConfiguration(configuration: string | null | undefined): TaskDecisionStepConfiguration | null {
    let parsed: unknown;
    try {
        parsed = configuration ? JSON.parse(configuration) : null;
    } catch {
        return null;
    }
    if (!isRecord(parsed) || !isRecord(parsed.decision)) return null;
    const decision = parsed.decision;
    if (typeof decision.nodeId !== 'string' || !decision.nodeId || !isRecord(decision.questions)) return null;
    // Only `nodeId` and the shape of `questions` are checked here. The runner is the real guard on
    // the questions themselves: `AIDecisionTaskRunner` passes them through `ToDecisionQuestions`
    // and refuses the call on any invalid one. A caller that uses them any other way must check them.
    return decision as TaskDecisionStepConfiguration;
}

/** One question's entry in a Decision step's output: the answer, or why it is held. */
export type DecisionStepOutputAnswer = TaskGraphDecisionAnswer | HeldDecisionAnswer;

/**
 * A Decision step's answers as its output carries them: each usable answer as given, and for every
 * other question the reason it is held.
 *
 * **An answer below its question's `minConfidence` never leaves the step.** The output is what later
 * steps read, and a condition can reach it too (`payload.decisions…`) — the validator refuses that,
 * but a below-threshold answer that is simply not there cannot be acted on by anything that slips
 * past it, or by a later step's prompt. The edges that route on the decision read the graph's own
 * answers through `ResolveGraphDecisions`, which reads the reasons back from here and holds.
 */
export function DecisionStepOutputAnswers(
    stepName: string,
    questions: Readonly<Record<string, TaskGraphDecisionQuestion>>,
    answers: Readonly<Record<string, TaskGraphDecisionAnswer>>,
): Record<string, DecisionStepOutputAnswer> {
    // The shared answer rules decide which are usable, so this copy and every hold agree.
    const resolved = ResolveDecisionStepAnswers({ Name: stepName, Status: 'Complete', ErrorMessage: null }, questions, answers);
    const output: Record<string, DecisionStepOutputAnswer> = {};
    for (const key of Object.keys(questions)) {
        output[key] = Object.prototype.hasOwnProperty.call(resolved.Answers, key)
            ? resolved.Answers[key]
            // Every question the rules do not use has a reason; the fallback is for the compiler.
            : { held: resolved.Unresolved[key] ?? `the decision "${stepName}" completed without an answer to "${key}"` };
    }
    return output;
}

/**
 * Why a Decision step cannot add its answers to this payload, or `null` when it can.
 *
 * The answers go under `decisions`, merged into whatever object is already there. Anything else
 * there — a list, a string — is business data the merge would destroy, so the step is failed before
 * its call rather than overwrite it.
 */
export function DecisionsPayloadConflict(payload: Readonly<Record<string, unknown>>): string | null {
    const existing = payload[DECISIONS_PAYLOAD_KEY];
    if (existing === undefined || existing === null || isRecord(existing)) return null;
    const kind = Array.isArray(existing) ? 'a list' : `a ${typeof existing}`;
    return `its payload already has a "${DECISIONS_PAYLOAD_KEY}" field holding ${kind}, which its answers would replace; `
        + `rename that field, since a Decision step writes its answers under "${DECISIONS_PAYLOAD_KEY}"`;
}

/**
 * The payload a Decision step hands downstream: its input, with its answers added under
 * `decisions.<step>`.
 *
 * Earlier steps' answers are kept, so a later step's prompt sees every decision made on its way.
 * Conditions do not read this copy — they read the graph's own, from `ResolveGraphDecisions` — so a
 * downstream step that rewrites the payload cannot change what an edge decides. Pass the answers
 * through {@link DecisionStepOutputAnswers}, so that one below its threshold is not among them, and
 * check {@link DecisionsPayloadConflict} first: a `decisions` field that is not an object is replaced.
 */
export function BuildDecisionStepOutput(
    payload: Record<string, unknown>,
    nodeId: string,
    answers: Readonly<Record<string, DecisionStepOutputAnswer>>,
): Record<string, unknown> {
    const existing = payload[DECISIONS_PAYLOAD_KEY];
    const earlier = isRecord(existing) ? existing : {};
    return { ...payload, [DECISIONS_PAYLOAD_KEY]: { ...earlier, [nodeId]: { ...answers } } };
}

/**
 * Every Decision step's answers in a graph, split into those a condition may act on and, for the
 * rest, why not.
 *
 * Built from the steps' own rows, not from whatever reached an edge's origin through the payload, so
 * `decisions.<step>` means the same thing on every edge. A step that has not completed contributes
 * only reasons: one still running has not answered, one that failed never will, and one that was
 * skipped was not asked. In every case a condition reading it holds rather than reading `false`.
 */
export function ResolveGraphDecisions(rows: readonly DecisionTaskRow[]): GraphDecisions {
    const answers: Record<string, Record<string, TaskGraphDecisionAnswer>> = {};
    const unresolved: Record<string, Record<string, string>> = {};
    for (const row of rows) {
        if (row.StepType !== 'Decision') continue;
        const config = ReadDecisionStepConfiguration(row.Configuration);
        if (!config) continue;

        const given = row.Status === 'Complete' ? answersIn(row.OutputPayload, config.nodeId) : {};
        const resolved = ResolveDecisionStepAnswers(row, config.questions, given);
        if (Object.keys(resolved.Answers).length > 0) Object.assign(answers[config.nodeId] ??= {}, resolved.Answers);
        if (Object.keys(resolved.Unresolved).length > 0) Object.assign(unresolved[config.nodeId] ??= {}, resolved.Unresolved);
    }
    return { Answers: answers, Unresolved: unresolved };
}

/**
 * The questions a completed Decision step is holding, with why: each answer below its question's
 * `minConfidence`, and each question it gave no answer to.
 *
 * Empty for any other step, and for a Decision whose answers are all usable. This is what makes such
 * a step retryable — the edges that read these answers hold until it is asked again.
 */
export function HeldDecisionAnswers(row: DecisionTaskRow): Record<string, string> {
    if (row.StepType !== 'Decision' || row.Status !== 'Complete') return {};
    const config = ReadDecisionStepConfiguration(row.Configuration);
    if (!config) return {};
    return { ...ResolveGraphDecisions([row]).Unresolved[config.nodeId] };
}

/** The `tempId`s of the graph's Decision steps whose call failed. */
export function FailedDecisionIDs(rows: readonly DecisionTaskRow[]): Set<string> {
    const failed = new Set<string>();
    for (const row of rows) {
        if (row.StepType !== 'Decision' || row.Status !== 'Failed') continue;
        const config = ReadDecisionStepConfiguration(row.Configuration);
        if (config) failed.add(config.nodeId);
    }
    return failed;
}

/** True when a condition reads any of the given Decision steps. */
export function ReadsFailedDecision(condition: string, failedDecisionIDs: ReadonlySet<string>): boolean {
    if (failedDecisionIDs.size === 0 || !condition) return false;
    return DecisionReferencesIn(condition).References.some((r) => failedDecisionIDs.has(r.NodeId));
}

/**
 * An exclusive fork's edges with each path that reads a FAILED decision counted as not taken, in
 * every fork that has a satisfied path — so the satisfied one wins whatever its rank.
 *
 * A failed decision call is a failed step, and a flow's failure handling is its outgoing paths: the
 * recovery path its author drew (`stepResult.Success === false`, or a fallback) is how the flow goes
 * on. Holding the fork because a higher-ranked path reads the answer that never came would stop it
 * from ever being taken. The paths are not evaluated — a negated read of a missing answer would come
 * out true — only set aside.
 *
 * A fork with NO satisfied path is left alone: every path is unevaluable, the fork holds, and a
 * Retry of the failed Decision step can still route it. An answer below `minConfidence` is never set
 * aside; it holds, because its path might have been the one to take.
 */
export function PassOverFailedDecisionPaths<E extends { id: string; exclusiveGroup: string; conditionOutcome: EdgeConditionOutcome }>(
    edges: readonly E[],
    readsFailedDecision: (edge: E) => boolean,
): E[] {
    const recoverable = new Set(edges.filter((e) => e.conditionOutcome === 'satisfied').map((e) => e.exclusiveGroup));
    return edges.map((e) =>
        e.conditionOutcome === 'unevaluable' && recoverable.has(e.exclusiveGroup) && readsFailedDecision(e)
            ? { ...e, conditionOutcome: 'unsatisfied' }
            : e,
    );
}

/**
 * The usable answers a Decision step already gave, read from its own output: the answers a retry
 * keeps.
 *
 * **A usable answer is final.** The graph acts on it as soon as the step completes: a fork's losing
 * branch is Skipped, and nothing puts it back. So a retry asks only the questions the step is
 * holding. Asking a usable one again could flip a fork whose other branch is already gone, and leave
 * neither branch to run.
 *
 * Empty for a step with no answers of its own: a first run has no output yet, and a failed step's
 * output is cleared when it is retried (`PrepareTaskForRetry`).
 */
export function KeptDecisionAnswers(
    row: Pick<DecisionTaskRow, 'Name' | 'StepType' | 'Configuration' | 'OutputPayload'>,
): Record<string, TaskGraphDecisionAnswer> {
    const config = ReadDecisionStepConfiguration(row.Configuration);
    if (!config || !row.OutputPayload) return {};
    // Read as the completed step that wrote this output, so the same answer rules apply. Copied field
    // by field, not spread: the row is usually an entity, whose fields are getters a spread drops.
    const written: DecisionTaskRow = {
        Name: row.Name,
        StepType: row.StepType,
        Configuration: row.Configuration,
        OutputPayload: row.OutputPayload,
        Status: 'Complete',
        ErrorMessage: null,
    };
    return { ...ResolveGraphDecisions([written]).Answers[config.nodeId] };
}

/** The questions a Decision step asks on this run: every one it has no kept answer to. */
export function QuestionsToAsk(
    questions: Readonly<Record<string, TaskGraphDecisionQuestion>>,
    kept: Readonly<Record<string, TaskGraphDecisionAnswer>>,
): Record<string, TaskGraphDecisionQuestion> {
    const toAsk: Record<string, TaskGraphDecisionQuestion> = {};
    for (const [key, question] of Object.entries(questions)) {
        if (!Object.prototype.hasOwnProperty.call(kept, key)) toAsk[key] = question;
    }
    return toAsk;
}

/**
 * The output of a retried Decision step that could not answer again: its earlier output, with the
 * same usable answers, and each question it asked again held for `reason`.
 *
 * The step stays `Complete` rather than failing. Failing it would undo answers the graph has already
 * acted on: under `'block'` the branch those answers chose would block, and the next retry would find
 * no answers left to keep.
 */
export function StillHoldingDecisionOutput(
    previousOutput: string | null,
    stepName: string,
    nodeId: string,
    questions: Readonly<Record<string, TaskGraphDecisionQuestion>>,
    kept: Readonly<Record<string, TaskGraphDecisionAnswer>>,
    reason: string,
): Record<string, unknown> {
    const previous = ParseConditionOutput(previousOutput);
    const answers: Record<string, DecisionStepOutputAnswer> = {};
    for (const key of Object.keys(questions)) {
        answers[key] = Object.prototype.hasOwnProperty.call(kept, key)
            ? kept[key]
            : { held: `the decision "${stepName}" was asked "${key}" again and could not answer: ${reason}` };
    }
    return BuildDecisionStepOutput(isRecord(previous) ? previous : {}, nodeId, answers);
}

/** A completed step's answers, as it wrote them into its output. */
function answersIn(outputPayload: string | null, nodeId: string): Record<string, unknown> {
    const output = ParseConditionOutput(outputPayload);
    const decisions = isRecord(output) ? output[DECISIONS_PAYLOAD_KEY] : undefined;
    const mine = isRecord(decisions) && Object.prototype.hasOwnProperty.call(decisions, nodeId) ? decisions[nodeId] : undefined;
    return isRecord(mine) ? mine : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
