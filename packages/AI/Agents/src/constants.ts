/**
 * @fileoverview The one source of truth for the string literals the agent runtime and its prompt
 * templates agree on: template placeholder names, the trailing runtime-state fragment's tag
 * literals and section headings, and the markers that identify a template still rendering volatile
 * state itself.
 *
 * Why a standalone module: `base-agent.ts` imports the modules that need these
 * (`volatile-child-prompt.ts`, `runtime-state-fragment.ts`, the agent types), so hanging them on
 * `BaseAgent` would make every one of those imports circular. This file imports nothing, so anything
 * in the package can depend on it.
 *
 * @module @memberjunction/ai-agents
 */

// ── Template placeholders ───────────────────────────────────────────────────────────────────────

/** Template variable the loop agent fills with the current payload (`{{ _CURRENT_PAYLOAD | dump }}`). */
export const CURRENT_PAYLOAD_PLACEHOLDER = '_CURRENT_PAYLOAD';

/** Template variable holding the rendered scratchpad notes. */
export const SCRATCHPAD_NOTES_PLACEHOLDER = '_SCRATCHPAD_NOTES';

/** Template variable holding the rendered scratchpad task list. */
export const SCRATCHPAD_TASKS_PLACEHOLDER = '_SCRATCHPAD_TASKS';

/** Template variable holding the scratchpad task summary, e.g. "1 of 2 tasks complete". */
export const SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER = '_SCRATCHPAD_TASK_SUMMARY';

/** System placeholder (see `SystemPlaceholderManager`) for today's date. */
export const CURRENT_DATE_PLACEHOLDER = '_CURRENT_DATE';

/** System placeholder for the current day of the week. */
export const CURRENT_DAY_OF_WEEK_PLACEHOLDER = '_CURRENT_DAY_OF_WEEK';

/** System placeholder for the current time. */
export const CURRENT_TIME_PLACEHOLDER = '_CURRENT_TIME';

/**
 * Agent-level template variables (not system placeholders) that change every iteration. A child
 * prompt referencing any of these mutates the system prompt per iteration, which is what
 * `IsVolatileChildPrompt` detects.
 */
export const VOLATILE_AGENT_VARIABLES: readonly string[] = [
    CURRENT_PAYLOAD_PLACEHOLDER,
    SCRATCHPAD_NOTES_PLACEHOLDER,
    SCRATCHPAD_TASKS_PLACEHOLDER,
    SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER,
];

/**
 * Temporal system placeholders that are stable for a run and therefore NOT volatile.
 * `_CURRENT_TIMEZONE` is in the "Date & Time" category but does not change between iterations.
 */
export const STABLE_TEMPORAL_PLACEHOLDERS: ReadonlySet<string> = new Set(['_CURRENT_TIMEZONE']);

// ── Trailing runtime-state fragment ─────────────────────────────────────────────────────────────

/** Tag wrapping the runtime-state blocks in the trailing fragment. */
export const RUNTIME_STATE_TAG = 'mj-runtime-state';

/** Tag wrapping a relocated agent specialization (child prompt) in the trailing fragment. */
export const AGENT_SPECIALIZATION_TAG = 'mj-agent-specialization';

/** Heading of the date/time block, in the fragment and in the legacy system-prompt layout alike. */
export const RUNTIME_STATE_DATETIME_HEADING = '## Current Date/Time';

/** Heading of the scratchpad block. */
export const RUNTIME_STATE_SCRATCHPAD_HEADING = '## Scratchpad State';

/** Heading of the payload block. */
export const RUNTIME_STATE_PAYLOAD_HEADING = '## Current State';

/**
 * Strings whose presence in a system prompt's UNRENDERED template text means that template still
 * renders the volatile state itself — the legacy Loop layout on a database whose template has not
 * synced, or any custom template that embeds the payload. `BaseAgent` suppresses the trailing
 * fragment for such a template so the model never receives the state twice. Overridable per agent
 * through `BaseAgent.VolatileTemplateMarkers`.
 */
export const VOLATILE_TEMPLATE_MARKERS: readonly string[] = [
    RUNTIME_STATE_DATETIME_HEADING,
    RUNTIME_STATE_SCRATCHPAD_HEADING,
    RUNTIME_STATE_PAYLOAD_HEADING,
    CURRENT_DATE_PLACEHOLDER,
    CURRENT_PAYLOAD_PLACEHOLDER,
];
