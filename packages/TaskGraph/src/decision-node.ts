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
    GetValueFromPath,
    type TaskGraphDecisionAnswer,
    type TaskGraphDecisionQuestion,
    type TaskGraphNodeConfigMap,
} from '@memberjunction/ai-core-plus';
import type { MJTaskEntity_ITaskStepConfiguration } from '@memberjunction/core-entities';
import { ParseConditionOutput, type GraphDecisions } from './condition-gate';

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

/** The default state: the step's whole input. */
const WHOLE_PAYLOAD = 'payload';

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

/**
 * The state a Decision step's questions are about, resolved from its payload.
 *
 * `payload` is the whole input; `payload.<path>` is one value in it. A string or a non-empty object
 * is passed as-is; any other value (an array, a number) is passed as JSON text. Absent or empty is an
 * error: asking a model about nothing produces a confident answer about nothing.
 */
export function ResolveDecisionState(
    state: string | undefined,
    payload: Record<string, unknown>,
): { State: string | Record<string, unknown> } | { ErrorMessage: string } {
    const path = state?.trim() || WHOLE_PAYLOAD;
    if (path !== WHOLE_PAYLOAD && !path.startsWith(`${WHOLE_PAYLOAD}.`)) {
        return { ErrorMessage: `its state "${path}" is not "payload" or "payload.<path>"` };
    }

    const value = path === WHOLE_PAYLOAD ? payload : GetValueFromPath(payload, path.slice(WHOLE_PAYLOAD.length + 1));
    if (value === undefined || value === null) return { ErrorMessage: `its state "${path}" is not in the payload` };
    if (typeof value === 'string') {
        return value.trim() ? { State: value } : { ErrorMessage: `its state "${path}" is empty` };
    }
    if (isRecord(value)) {
        return Object.keys(value).length > 0 ? { State: value } : { ErrorMessage: `its state "${path}" is empty` };
    }
    return { State: JSON.stringify(value) };
}

/**
 * What a Decision step's output carries in place of an answer a condition may not act on: why it is
 * held, and never the answer itself.
 */
export type HeldDecisionAnswer = {
    /** Why the answer is held, in the words a hold reports: below its `minConfidence`, or missing. */
    held: string;
};

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
    const output: Record<string, DecisionStepOutputAnswer> = {};
    for (const [key, question] of Object.entries(questions)) {
        const answer = Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : undefined;
        // `unusableAnswerReason` reports a missing answer too, so the fallback is for the compiler.
        const reason = unusableAnswerReason(stepName, key, answer, question);
        output[key] = answer && !reason ? answer : { held: reason ?? `the decision "${stepName}" completed without an answer to "${key}"` };
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
 * How confident an answer is, on the scale `minConfidence` is written in.
 *
 * A Choice or Score states its confidence. A Likelihood's probability IS its confidence, but in one
 * direction only, so it is measured by its distance from an even call: 0.05 is as sure as 0.95.
 */
export function DecisionAnswerConfidence(answer: TaskGraphDecisionAnswer): number | undefined {
    if (typeof answer.confidence === 'number') return answer.confidence;
    if (typeof answer.probability === 'number') return Math.max(answer.probability, 1 - answer.probability);
    return undefined;
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
        for (const [key, question] of Object.entries(config.questions)) {
            // The step's output already says why it held an answer; the threshold is still applied
            // to whatever answer is there, so an output written any other way cannot bypass it.
            const reason = row.Status === 'Complete'
                ? heldReason(given[key]) ?? unusableAnswerReason(row.Name, key, given[key], question)
                : notAnsweredReason(row);
            if (reason) {
                (unresolved[config.nodeId] ??= {})[key] = reason;
            } else {
                (answers[config.nodeId] ??= {})[key] = given[key] as TaskGraphDecisionAnswer;
            }
        }
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

/** The reason a step's output gives for holding an answer, or `null` when it holds none there. */
function heldReason(entry: unknown): string | null {
    return isRecord(entry) && typeof entry.held === 'string' && entry.held ? entry.held : null;
}

/** A completed step's answers, as it wrote them into its output. */
function answersIn(outputPayload: string | null, nodeId: string): Record<string, unknown> {
    const output = ParseConditionOutput(outputPayload);
    const decisions = isRecord(output) ? output[DECISIONS_PAYLOAD_KEY] : undefined;
    const mine = isRecord(decisions) && Object.prototype.hasOwnProperty.call(decisions, nodeId) ? decisions[nodeId] : undefined;
    return isRecord(mine) ? mine : {};
}

/** Why a completed step's answer to one question may not be acted on, or `null` when it may. */
function unusableAnswerReason(
    stepName: string,
    key: string,
    answer: unknown,
    question: TaskGraphDecisionQuestion,
): string | null {
    if (!isDecisionAnswer(answer)) return `the decision "${stepName}" completed without an answer to "${key}"`;
    const min = question.minConfidence;
    if (typeof min !== 'number') return null;
    const confidence = DecisionAnswerConfidence(answer);
    if (confidence === undefined) {
        return `the decision "${stepName}" answered "${key}" with no confidence to hold to its minConfidence of ${min}`;
    }
    return confidence < min
        ? `the decision "${stepName}" answered "${key}" with confidence ${Number(confidence.toFixed(3))}, below its minConfidence of ${min}`
        : null;
}

/** Why a step that is not Complete has no usable answers. */
function notAnsweredReason(row: DecisionTaskRow): string {
    if (row.Status === 'Failed') {
        return `the decision "${row.Name}" failed${row.ErrorMessage ? `: ${row.ErrorMessage}` : ''}`;
    }
    return `the decision "${row.Name}" has not answered (it is ${row.Status})`;
}

/** An answer in the shape a condition reads: a Likelihood's probability, or a Choice's or Score's value. */
function isDecisionAnswer(value: unknown): value is TaskGraphDecisionAnswer {
    if (!isRecord(value)) return false;
    return typeof value.probability === 'number' || typeof value.value === 'string' || typeof value.value === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
