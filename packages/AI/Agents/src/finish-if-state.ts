/**
 * @fileoverview The finishIf gate's pure parts: the state it shows the decision model, the questions
 * it asks, the rule that judges the answers, and the check that a finishIf is well formed.
 *
 * BaseAgent runs the gate with these, and the finishIf replay eval applies them to recorded runs, so
 * the eval measures exactly what production does. They take no agent, run or database.
 *
 * @module @memberjunction/ai-agents
 */

import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import type { ActionParam } from '@memberjunction/actions-base';
import type { AgentFinishIf, BaseAgentNextStep, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/** The most text of a step's results the finishIf gate sends to the decision model. */
export const FINISH_IF_STATE_MAX = 16000;

/** How much of the finishIf state the `Finish check` step records. */
export const FINISH_IF_STATE_EXCERPT = 2000;

/** The most characters of an action's message the state carries. */
export const FINISH_IF_ACTION_MESSAGE_MAX = 1000;

/** The most characters of one output param the state carries. */
export const FINISH_IF_ACTION_PARAM_MAX = 2000;

/** The most characters of a sub-agent's final message, and of its payload, the state carries. */
export const FINISH_IF_SUB_AGENT_PART_MAX = 4000;

/** The fewest and most questions a finishIf may carry. */
export const FINISH_IF_MIN_QUESTIONS = 1;
export const FINISH_IF_MAX_QUESTIONS = 3;

/**
 * What the formatter reads of one action's result. BaseAgent's own action summary has this shape,
 * so its members keep that summary's casing.
 */
export interface FinishIfActionResult {
    /** The action's name. */
    actionName: string;  // case-violation-ok-legacy-back-compat: mirrors BaseAgent's action summary, which is passed in as it is
    /** The action's result message. */
    message: string;  // case-violation-ok-legacy-back-compat: mirrors BaseAgent's action summary, which is passed in as it is
    /** The action's output params, already filtered to Output and Both. */
    params?: ActionParam[];  // case-violation-ok-legacy-back-compat: mirrors BaseAgent's action summary, which is passed in as it is
}

/**
 * A Sub-Agent step's result. The child and related paths spread the sub-agent's own
 * `ExecuteAgentResult` into it, so its final message and returned payload are there too.
 */
export type SubAgentStepResult<P> = BaseAgentNextStep<P> & Partial<Pick<ExecuteAgentResult, 'agentRun' | 'payload'>>;

/** The outcome of a finishIf gate. */
export interface FinishIfOutcome {
    /** Whether every question reached the threshold. */
    Passed: boolean;
    /** Each answered question's probability, by key. */
    Probabilities: Record<string, number>;
    /** Why the gate passed or did not. */
    Reason: string;
}

/** Cuts the state to {@link FINISH_IF_STATE_MAX} characters. */
export function CapFinishIfState(text: string): string {
    return text.length > FINISH_IF_STATE_MAX ? text.slice(0, FINISH_IF_STATE_MAX) : text;
}

/** A value as text, cut to `max` characters: a string as it is, anything else as JSON. */
function jsonExcerpt(value: unknown, max: number): string {
    let text: string;
    try {
        text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    } catch {
        text = String(value);
    }
    return text.slice(0, max);
}

/** One action's result as finishIf text: its name, outcome, message and sanitized output params. */
export function FormatActionForFinishIf(summary: FinishIfActionResult): string {
    const lines = [`Action: ${summary.actionName}`, `Message: ${String(summary.message ?? '').slice(0, FINISH_IF_ACTION_MESSAGE_MAX)}`];
    for (const param of summary.params ?? []) {
        lines.push(`Output ${param.Name}: ${jsonExcerpt(param.Value, FINISH_IF_ACTION_PARAM_MAX)}`);
    }
    return lines.join('\n');
}

/** A sub-agent's result as finishIf text: its final message and the payload it returned. */
export function FormatSubAgentForFinishIf<P>(result: SubAgentStepResult<P>): string {
    const message = result.agentRun?.Message ?? result.message ?? '';
    const payload = result.payload ?? result.newPayload;
    const lines = [`Final message: ${String(message).slice(0, FINISH_IF_SUB_AGENT_PART_MAX)}`];
    if (payload !== undefined && payload !== null) {
        lines.push(`Payload: ${jsonExcerpt(payload, FINISH_IF_SUB_AGENT_PART_MAX)}`);
    }
    return CapFinishIfState(lines.join('\n\n'));
}

/** The finishIf questions as Likelihood questions, keyed `q1`, `q2`, … in order. */
export function BuildFinishIfQuestions(finishIf: Pick<AgentFinishIf, 'questions'>): Record<string, DecisionQuestion> {
    const questions: Record<string, DecisionQuestion> = {};
    finishIf.questions.forEach((question, i) => {
        questions[`q${i + 1}`] = { Kind: 'Likelihood', Instructions: question };
    });
    return questions;
}

/**
 * The gate's rule: it passes only when every question has a Likelihood answer whose probability
 * reaches the threshold. A missing answer, an answer of another kind, and a probability that is not
 * a number all fail it, and so does an empty question set: the gate fails closed.
 *
 * @param answers The decision's answers, by question key.
 * @param questions The questions asked, from {@link BuildFinishIfQuestions}.
 * @param threshold The probability each answer must reach.
 */
export function JudgeFinishIf(
    answers: Record<string, DecisionAnswer>,
    questions: Record<string, DecisionQuestion>,
    threshold: number
): FinishIfOutcome {
    const probabilities: Record<string, number> = {};
    const keys = Object.keys(questions);
    if (keys.length === 0) {
        return { Passed: false, Probabilities: probabilities, Reason: 'No question was asked' };
    }
    const failures: string[] = [];
    for (const key of keys) {
        const answer = answers[key];
        if (answer?.Kind !== 'Likelihood') {
            failures.push(`${key} has no answer`);
            continue;
        }
        probabilities[key] = answer.Probability;
        // Written so that a non-numeric probability fails too.
        if (!(answer.Probability >= threshold)) {
            failures.push(`${key} is ${answer.Probability}`);
        }
    }
    return failures.length === 0
        ? { Passed: true, Probabilities: probabilities, Reason: `Every question reached ${threshold}` }
        : { Passed: false, Probabilities: probabilities, Reason: `Below the threshold of ${threshold}: ${failures.join('; ')}` };
}

/** A valid finishIf has one to three non-empty string questions and a non-empty string message. */
export function IsValidFinishIf(candidate: unknown): candidate is AgentFinishIf {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    const { questions, message } = candidate as Partial<AgentFinishIf>;
    return Array.isArray(questions)
        && questions.length >= FINISH_IF_MIN_QUESTIONS
        && questions.length <= FINISH_IF_MAX_QUESTIONS
        && questions.every(q => typeof q === 'string' && q.trim().length > 0)
        && typeof message === 'string'
        && message.trim().length > 0;
}
