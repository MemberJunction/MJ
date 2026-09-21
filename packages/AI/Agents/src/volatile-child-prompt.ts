/**
 * @fileoverview Decides whether an agent's child prompt (specialization) must be relocated out of
 * the system prompt for prompt-cache stability.
 *
 * The agent OS doesn't control what a designer writes in a child prompt. If that template
 * references a placeholder that changes per iteration or per minute — the current date/time, the
 * Payload, the Scratchpad — then the rendered specialization mutates on every call from a position
 * INSIDE the system prompt, ahead of the catalogs and the entire message history, and the provider's
 * prefix cache breaks there no matter where the runtime-state tail is placed. Nine active Loop agents
 * do this today (Agent Manager, Query Builder, ActionSmith, Database Designer, Data Scout, Goal
 * Analyst, Experiment Designer, Model Development Agent, Planning Designer Agent).
 *
 * The check is a static scan of the child template's TEXT, decided once per run, so the layout
 * never flips mid-run (a flip would itself break the prefix). See {@link SpecializationPlacement}.
 *
 * @module @memberjunction/ai-agents
 */
import { DEFAULT_SYSTEM_PLACEHOLDERS } from '@memberjunction/ai-core-plus';
import { SpecializationPlacement } from './agent-types/loop-agent-prompt-params';

/** Where the specialization ends up for a run: one of the two concrete placements (never `'auto'`). */
export type ResolvedSpecializationPlacement = Exclude<SpecializationPlacement, 'auto'>;

/**
 * Temporal system placeholders that are stable for a run and therefore NOT volatile.
 * `_CURRENT_TIMEZONE` is in the "Date & Time" category but does not change between iterations.
 */
const STABLE_TEMPORAL_PLACEHOLDERS: ReadonlySet<string> = new Set(['_CURRENT_TIMEZONE']);

/** Agent-level template variables (not system placeholders) that change every iteration. */
const VOLATILE_AGENT_VARIABLES: readonly string[] = [
    '_CURRENT_PAYLOAD',
    '_SCRATCHPAD_NOTES',
    '_SCRATCHPAD_TASKS',
    '_SCRATCHPAD_TASK_SUMMARY',
];

/**
 * Every template variable whose presence in a child prompt makes the rendered specialization
 * change between iterations. Derived from the system-placeholder registry's "Date & Time"
 * category (minus the stable timezone) plus the loop agent's own per-iteration variables, so a
 * new temporal placeholder is picked up automatically.
 */
export const VOLATILE_PLACEHOLDER_NAMES: readonly string[] = [
    ...DEFAULT_SYSTEM_PLACEHOLDERS
        .filter(p => p.category === 'Date & Time' && !STABLE_TEMPORAL_PLACEHOLDERS.has(p.name))
        .map(p => p.name),
    ...VOLATILE_AGENT_VARIABLES,
];

/**
 * Returns the volatile placeholder names referenced by a template's text, in registry order.
 * Matches whole identifiers only, so `_CURRENT_DATE` does not match inside `_CURRENT_DATE_AND_TIME`
 * (both are volatile, but each is reported for itself). Empty array for empty/null text.
 */
export function DetectVolatilePlaceholders(templateText: string | null | undefined): string[] {
    if (!templateText) {
        return [];
    }
    return VOLATILE_PLACEHOLDER_NAMES.filter(name => {
        const pattern = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
        return pattern.test(templateText);
    });
}

/** True when the template references at least one volatile placeholder. */
export function IsVolatileChildPrompt(templateText: string | null | undefined): boolean {
    return DetectVolatilePlaceholders(templateText).length > 0;
}

/** Normalizes the raw `specializationPlacement` param; anything unrecognized is `'auto'`. */
export function ResolveSpecializationPlacementParam(
    promptParams: Record<string, unknown> | null | undefined
): SpecializationPlacement {
    const raw = promptParams?.specializationPlacement;
    return raw === 'systemPrompt' || raw === 'trailingMessage' ? raw : 'auto';
}

/**
 * Decides where the specialization goes for this run.
 *
 * The runtime-state fragment is always the final message of the request, so relocation is always
 * possible. An explicit `specializationPlacement` wins; `'auto'` relocates exactly when the child
 * template is volatile.
 *
 * @param promptParams The merged `__agentTypePromptParams` for the agent.
 * @param childTemplateText The child prompt's UNRENDERED template text (placeholders intact).
 *   Pass `null` when the agent has no child prompt; the result is then `'systemPrompt'`.
 */
export function ResolveSpecializationPlacement(
    promptParams: Record<string, unknown> | null | undefined,
    childTemplateText: string | null | undefined
): ResolvedSpecializationPlacement {
    if (!childTemplateText) {
        return 'systemPrompt';
    }
    const explicit = ResolveSpecializationPlacementParam(promptParams);
    if (explicit !== 'auto') {
        return explicit;
    }
    return IsVolatileChildPrompt(childTemplateText) ? 'trailingMessage' : 'systemPrompt';
}
