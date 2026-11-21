/**
 * @fileoverview The guard that ends a run when the model keeps re-issuing the same failing step (#4832).
 *
 * The run loop alternates prompt → decision → executed step → prompt. A step that fails without
 * ending the run (a While whose condition cannot be evaluated, an action call the circuit breaker
 * blocks) is answered by another prompt, and that prompt's decision is a non-Failed step, so the
 * consecutive-failed-steps counter resets every turn and never trips. This guard instead keys on
 * the executed decision itself: the same decision failing {@link MAX_REPEATED_FAILING_STEP} times
 * in a row ends the run `Failed`. A different decision, or one that succeeds, starts the count over.
 *
 * Pure: takes no agent, run or database.
 *
 * @module @memberjunction/ai-agents
 */

import type { BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { ActionResultSummary } from './base-agent';

/** How many times in a row the same decision may fail before the run ends. */
export const MAX_REPEATED_FAILING_STEP = 3;

/**
 * Steps the loop answers with a prompt rather than by running something: a retry, a non-terminal
 * failure and a non-terminal success all go back to the model. They are not decisions the guard
 * counts; a failure among them is the existing consecutive-failed-steps counter's job.
 */
const PROMPT_TURN_STEPS: ReadonlySet<BaseAgentNextStep['step']> = new Set<BaseAgentNextStep['step']>(['Retry', 'Failed', 'Success']);

/** Whether executing `step` runs a prompt turn instead of the step's own work. */
export function IsPromptTurnStep(step: BaseAgentNextStep): boolean {
    return PROMPT_TURN_STEPS.has(step.step);
}

/** The parts of an action result summary the guard reads. */
type BreakerSummary = Pick<ActionResultSummary, 'breakerReason' | 'message'>;

/**
 * Serializes a value with object keys sorted at every level, so two decisions that differ only in
 * key order produce the same signature. Arrays keep their order.
 */
function stableStringify(value: unknown): string {
    if (value === undefined) {
        return 'null';
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
}

/**
 * The identity of a decision: its step type plus the inputs that say what it does. Tool-call IDs,
 * payloads, reasoning and messages to the user are left out: they change from turn to turn without
 * changing what the step runs.
 */
export function FailingStepSignature(decision: BaseAgentNextStep): string {
    const inputs = {
        actions: decision.actions?.map((a) => ({ name: a.name, params: a.params })),
        subAgent: decision.subAgent
            ? { name: decision.subAgent.name, message: decision.subAgent.message, templateParameters: decision.subAgent.templateParameters, presetName: decision.subAgent.presetName }
            : undefined,
        subAgents: decision.subAgents?.map((s) => ({ name: s.name, message: s.message, templateParameters: s.templateParameters, presetName: s.presetName })),
        forEach: decision.forEach,
        while: decision.while,
        artifactToolCalls: decision.artifactToolCalls,
        conversationToolCalls: decision.conversationToolCalls,
        decisions: decision.decisions,
        messageIndex: decision.messageIndex,
    };
    return `${decision.step}|${stableStringify(inputs)}`;
}

/** The action summaries an executed Actions step returned, when every one was blocked by the circuit breaker. */
function allBreakerBlocked(outcome: BaseAgentNextStep): BreakerSummary[] | null {
    const summaries: unknown = outcome.priorStepResult;
    if (!Array.isArray(summaries) || summaries.length === 0) {
        return null;
    }
    const typed = summaries as BreakerSummary[];
    return typed.every((s) => !!s && typeof s === 'object' && !!s.breakerReason) ? typed : null;
}

/**
 * Whether executing `decision` failed: the step came back `Failed`, or it was an Actions step whose
 * calls the circuit breaker all blocked (those come back as a non-Failed step carrying the results).
 */
export function IsFailingStepOutcome(decision: BaseAgentNextStep, outcome: BaseAgentNextStep): boolean {
    if (outcome.step === 'Failed') {
        return true;
    }
    return decision.step === 'Actions' && allBreakerBlocked(outcome) !== null;
}

/** The error a failing outcome carries: its own, or the breaker's messages for a blocked Actions step. */
export function FailingStepError(outcome: BaseAgentNextStep): string {
    if (outcome.errorMessage) {
        return outcome.errorMessage;
    }
    const blocked = allBreakerBlocked(outcome);
    if (blocked) {
        return blocked.map((s) => s.message).filter((m) => !!m).join('; ');
    }
    return outcome.message || 'Unknown';
}

/**
 * Counts how many times in a row the same decision has failed. Feed it every executed decision
 * (not prompt turns) with its outcome; it returns the current count.
 */
export class RepeatedFailingStepTracker {
    private _signature: string | null = null;
    private _count = 0;

    /** The current run of identical failures. */
    public get Count(): number {
        return this._count;
    }

    /**
     * Records one executed decision. A failure of the same decision as the last failure increments
     * the count; a failure of a different decision starts it at 1; a success resets it to 0.
     *
     * @returns The count after this decision.
     */
    public Observe(decision: BaseAgentNextStep, outcome: BaseAgentNextStep): number {
        if (!IsFailingStepOutcome(decision, outcome)) {
            this._signature = null;
            this._count = 0;
            return 0;
        }
        const signature = FailingStepSignature(decision);
        this._count = signature === this._signature ? this._count + 1 : 1;
        this._signature = signature;
        return this._count;
    }
}
