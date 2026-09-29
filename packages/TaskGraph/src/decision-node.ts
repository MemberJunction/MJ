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
    ResolveDecisionStepAnswers,
    type GraphDecisions,
    type TaskGraphDecisionAnswer,
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
 * The payload a Decision step hands downstream: its input, with its answers added under
 * `decisions.<step>`.
 *
 * Earlier steps' answers are kept, so a later step's prompt sees every decision made on its way.
 * Conditions do not read this copy — they read the graph's own, from `ResolveGraphDecisions` — so a
 * downstream step that rewrites the payload cannot change what an edge decides.
 */
export function BuildDecisionStepOutput(
    payload: Record<string, unknown>,
    nodeId: string,
    answers: Readonly<Record<string, TaskGraphDecisionAnswer>>,
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
