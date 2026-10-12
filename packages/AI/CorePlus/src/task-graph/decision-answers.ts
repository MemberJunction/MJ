/**
 * @fileoverview Which Decision answers a condition may act on, and why the rest may not.
 *
 * Two engines route on a Decision step's answers: the task-graph dispatcher, which reads them from
 * Task rows, and the Flow agent's in-run walker, which holds them in memory. Both have to agree on
 * three things, or a flow routes one way when dispatched and another way when walked:
 *
 *  - which answers are usable — the call succeeded, and each answer clears its question's
 *    `minConfidence`, measured the same way;
 *  - why an answer is not usable, in words the author reads when a run stops on it;
 *  - that a condition reading an unusable answer HOLDS, and is never evaluated.
 *
 * So those rules live here, in the package both engines already depend on, and each engine keeps
 * only how it stores the answers.
 *
 * @module @memberjunction/ai-core-plus
 */
import type { DecisionAnswer } from '@memberjunction/ai';
import { DecisionReferencesIn } from './decision-conditions';
import { GetValueFromPath } from './payload-mapping';
import type { TaskGraphDecisionAnswer, TaskGraphDecisionQuestion } from './task-graph-spec';

/**
 * Every Decision step's answers in one graph, keyed by the step's `tempId` and then by question.
 *
 * `Answers` holds only the answers a condition may act on. `Unresolved` says, per question, why the
 * rest are missing — the step has not answered yet, its call failed, or the answer fell below its
 * question's `minConfidence` — and a condition that reads one of them holds.
 */
export type GraphDecisions = {
    Answers: Readonly<Record<string, Readonly<Record<string, TaskGraphDecisionAnswer>>>>;
    Unresolved: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

/** A graph with no Decision steps. */
export const NO_DECISIONS: GraphDecisions = Object.freeze({ Answers: Object.freeze({}), Unresolved: Object.freeze({}) });

/**
 * The parts of one Decision step's run that say whether, and how, it answered.
 *
 * Structural, so a Task row satisfies it as-is and the in-run walker can build one from a step.
 */
export type DecisionStepRun = {
    /** The step's name, for reasons a person reads. */
    Name: string;
    /** `Complete` when it answered, `Failed` when its call failed; anything else means it was not asked. */
    Status: string;
    /** Why the call failed, when it did. */
    ErrorMessage: string | null;
};

/**
 * What a Decision step's output carries in place of an answer a condition may not act on: why it is
 * held, and never the answer itself. {@link ResolveDecisionStepAnswers} reads the reason back.
 */
export type HeldDecisionAnswer = {
    /** Why the answer is held, in the words a hold reports: below its `minConfidence`, or missing. */
    held: string;
};

/** One Decision step's answers, split into those a condition may act on and, for the rest, why not. */
export type DecisionStepAnswers = {
    Answers: Record<string, TaskGraphDecisionAnswer>;
    Unresolved: Record<string, string>;
};

/**
 * Why a condition cannot be answered yet because of a decision it reads, or `null` when it can.
 *
 * Asked BEFORE evaluation, because evaluation cannot tell "no" from "not known": a missing answer
 * reads as `undefined`, and `undefined === 'billing'` is a confident, wrong `false` that would drop
 * the edge or lose the fork. So a condition that reads a failed decision, one below its question's
 * `minConfidence`, or one not given yet is refused evaluation and holds.
 *
 * A use of `decisions` that names no step and question cannot be checked, so it holds too. The
 * validator refuses such a condition at submit; this is the backstop for one that bypassed it.
 */
export function DecisionHoldReason(condition: string, decisions: GraphDecisions): string | null {
    const scan = DecisionReferencesIn(condition);
    if (scan.Malformed.length > 0) {
        return `the condition reads "decisions" without naming a step and a question (${scan.Malformed[0]})`;
    }
    for (const reference of scan.References) {
        if (hasOwn(decisions.Answers, reference.NodeId) && hasOwn(decisions.Answers[reference.NodeId], reference.QuestionKey)) continue;
        const unresolved = hasOwn(decisions.Unresolved, reference.NodeId) ? decisions.Unresolved[reference.NodeId] : undefined;
        return unresolved && hasOwn(unresolved, reference.QuestionKey)
            ? unresolved[reference.QuestionKey]
            : `no Decision step "${reference.NodeId}" has answered "${reference.QuestionKey}"`;
    }
    return null;
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
 * One Decision step's answers, split into those a condition may act on and, for the rest, why not.
 *
 * A step that has not completed contributes only reasons: one still running has not answered, one
 * that failed never will, and one that was skipped was not asked. A completed step's answer is used
 * only when it is there, in an answer's shape, and clears its question's `minConfidence`; where its
 * output holds a {@link HeldDecisionAnswer} instead, the reason given there is the reason.
 *
 * @param run       the step's name, status and error
 * @param questions the questions it asks, with their `minConfidence`
 * @param given     the answers it gave, by question; read only when it completed
 */
export function ResolveDecisionStepAnswers(
    run: DecisionStepRun,
    questions: Readonly<Record<string, TaskGraphDecisionQuestion>>,
    given: Readonly<Record<string, unknown>>,
): DecisionStepAnswers {
    const resolved: DecisionStepAnswers = { Answers: {}, Unresolved: {} };
    for (const [key, question] of Object.entries(questions)) {
        const answer = given[key];
        // A held entry already says why; the threshold is still applied to whatever answer is there,
        // so an output written any other way cannot bypass it.
        const reason = run.Status === 'Complete'
            ? heldReason(answer) ?? unusableAnswerReason(run.Name, key, answer, question)
            : notAnsweredReason(run);
        if (reason) {
            resolved.Unresolved[key] = reason;
        } else if (isDecisionAnswer(answer)) {
            resolved.Answers[key] = answer;
        }
    }
    return resolved;
}

/** A Decision step's default state: its whole payload. */
const WHOLE_PAYLOAD = 'payload';

/**
 * The state a Decision step's questions are about, resolved from its payload — or why it cannot be
 * asked.
 *
 * `payload` is the whole payload; `payload.<path>` is one value in it. A string or a non-empty
 * object is passed as-is; any other value (an array, a number) is passed as JSON text. Missing or
 * empty is refused, whitespace-only text and `{}` included: asking a model about nothing produces a
 * confident answer about nothing.
 *
 * Both engines apply it before the call, so a flow's Decision step asks, or refuses, the same state
 * whether it is dispatched or walked in-run. A refusal fails the step the way a failed call does.
 */
export function ResolveDecisionState(
    state: string | undefined,
    payload: unknown,
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
 * The runner's typed answers in the shape an edge condition reads them — the full distribution kept,
 * so a condition can route on more than the winner.
 */
export function SummarizeDecisionAnswers(answers: Readonly<Record<string, DecisionAnswer>>): Record<string, TaskGraphDecisionAnswer> {
    const summary: Record<string, TaskGraphDecisionAnswer> = {};
    for (const [key, answer] of Object.entries(answers)) summary[key] = summarizeAnswer(answer);
    return summary;
}

/** One answer, by kind. The fields match `DECISION_ANSWER_FIELDS`, which is what the validator allows. */
function summarizeAnswer(answer: DecisionAnswer): TaskGraphDecisionAnswer {
    switch (answer.Kind) {
        case 'Likelihood':
            return { probability: answer.Probability };
        case 'Choice':
            return { value: answer.Value, confidence: answer.Confidence, probabilities: { ...answer.Probabilities } };
        case 'Score':
            return { value: answer.Value, confidence: answer.Confidence, probabilities: { ...answer.Probabilities } };
    }
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

/** The reason a step's output gives for holding an answer, or `null` when it holds none there. */
function heldReason(entry: unknown): string | null {
    return isRecord(entry) && typeof entry.held === 'string' && entry.held ? entry.held : null;
}

/** Why a step that is not Complete has no usable answers. */
function notAnsweredReason(run: DecisionStepRun): string {
    if (run.Status === 'Failed') {
        return `the decision "${run.Name}" failed${run.ErrorMessage ? `: ${run.ErrorMessage}` : ''}`;
    }
    return `the decision "${run.Name}" has not answered (it is ${run.Status})`;
}

/** An answer in the shape a condition reads: a Likelihood's probability, or a Choice's or Score's value. */
function isDecisionAnswer(value: unknown): value is TaskGraphDecisionAnswer {
    if (!isRecord(value)) return false;
    return typeof value.probability === 'number' || typeof value.value === 'string' || typeof value.value === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Own-property lookup, so a question named like an `Object.prototype` member is not "found". */
function hasOwn(record: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}
