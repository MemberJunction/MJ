/**
 * @fileoverview Validation for the flow step types the Architect authors — specifically loops.
 *
 * **Why loops needed their own module.** The Architect's spec taught three step types
 * (`Action`, `Prompt`, `Sub-Agent`) while `AIAgentStep.StepType` has accepted five for releases —
 * `ForEach` and `While` were executable but unauthorable, so anything built through the Agent Manager
 * could not repeat itself. Closing that gap means teaching the prompt *and* checking what comes back,
 * because a loop is the one step type that saves perfectly well while doing nothing at all: a
 * `ForEach` with no `collectionPath` iterates over nothing, and at runtime that reads as the agent
 * declining to work rather than as a malformed step.
 *
 * Pure and dependency-free so the rules are unit-testable without an agent run.
 *
 * @module @memberjunction/ai-agent-manager
 */
import type { AgentStep } from '@memberjunction/ai-core-plus';

/** The step types that wrap a body and repeat it. */
export type LoopStepType = Extract<AgentStep['StepType'], 'ForEach' | 'While'>;

/** True when this step repeats a body rather than being one. */
export function IsLoopStep(step: Pick<AgentStep, 'StepType'>): boolean {
    return step.StepType === 'ForEach' || step.StepType === 'While';
}

/**
 * Which field carries the body's id, per body type.
 *
 * The body's id lives in the SAME field a plain step of that type would use — a `ForEach` whose body
 * is an Action still puts it in `ActionID`. Introducing a parallel `LoopBodyActionID` would have been
 * a second place an action id can live, and the two would drift.
 */
const BODY_ID_FIELD: Record<NonNullable<AgentStep['LoopBodyType']>, 'ActionID' | 'PromptID' | 'SubAgentID'> = {
    Action: 'ActionID',
    Prompt: 'PromptID',
    'Sub-Agent': 'SubAgentID',
};

/**
 * Checks one `ForEach` / `While` step, returning every problem rather than the first.
 *
 * Returns messages rather than throwing, matching how the Architect reports the rest of its
 * validation — one pass gives the model everything it has to fix, instead of a fix-and-retry loop
 * that surfaces one error per round trip.
 */
export function ValidateLoopStep(step: AgentStep, index: number): string[] {
    const errors: string[] = [];
    if (!IsLoopStep(step)) return errors;

    const where = `${step.StepType} step "${step.Name}" (index ${index})`;

    validateLoopBody(step, where, errors);
    const config = parseLoopConfiguration(step, where, errors);
    if (config) validateLoopBounds(step, config, where, errors);

    return errors;
}

/** The loop must name what it repeats, and that thing must exist. */
function validateLoopBody(step: AgentStep, where: string, errors: string[]): void {
    if (!step.LoopBodyType) {
        errors.push(
            `❌ ${where} must have LoopBodyType — one of "Action", "Prompt" or "Sub-Agent" — naming what runs on each pass`,
        );
        return;
    }

    const field = BODY_ID_FIELD[step.LoopBodyType];
    if (step[field]) return;

    // Two legitimate reasons the id is still empty:
    //  - a Sub-Agent body that AgentSpecSync will link by name once the sub-agent is created, exactly
    //    as it already does for a plain Sub-Agent step;
    //  - a Prompt body supplied inline as PromptText, which becomes an AIPrompt on save.
    const linkedLater = step.LoopBodyType === 'Sub-Agent';
    const inlinePrompt = step.LoopBodyType === 'Prompt' && !!step.PromptText?.trim();
    if (linkedLater || inlinePrompt) return;

    errors.push(`❌ ${where} has LoopBodyType "${step.LoopBodyType}" but no ${field} to run`);
}

/** ForEach needs something to iterate; While needs something to test; both need a name for the item. */
function validateLoopBounds(
    step: AgentStep,
    config: Record<string, unknown>,
    where: string,
    errors: string[],
): void {
    if (step.StepType === 'ForEach' && !config['collectionPath']) {
        errors.push(`❌ ${where} must set Configuration.collectionPath — the payload path holding the items to iterate`);
    }
    if (step.StepType === 'While' && !config['condition']) {
        errors.push(`❌ ${where} must set Configuration.condition — the expression checked before each pass`);
    }
    if (!config['itemVariable']) {
        errors.push(`❌ ${where} must set Configuration.itemVariable — the name the body refers to the current item by`);
    }
}

/**
 * Reads a loop's `Configuration`, reporting rather than throwing. Null when unusable.
 *
 * Accepts an object as well as a JSON string — the same latitude the action mappings already get,
 * because a model that has just been shown an object literal in the prompt will send one.
 */
function parseLoopConfiguration(step: AgentStep, where: string, errors: string[]): Record<string, unknown> | null {
    const raw: unknown = step.Configuration;
    if (raw == null || raw === '') {
        errors.push(`❌ ${where} must have a Configuration object describing the loop's bounds`);
        return null;
    }

    if (typeof raw === 'object') {
        if (Array.isArray(raw)) {
            errors.push(`❌ ${where} has a Configuration that is an array rather than an object`);
            return null;
        }
        return raw as Record<string, unknown>;
    }

    if (typeof raw !== 'string') {
        errors.push(`❌ ${where} has a Configuration that is neither an object nor JSON text`);
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            errors.push(`❌ ${where} has a Configuration that is not a JSON object`);
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch (e) {
        errors.push(`❌ ${where} has invalid Configuration JSON: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
