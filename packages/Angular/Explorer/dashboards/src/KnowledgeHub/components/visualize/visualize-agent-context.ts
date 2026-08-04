/**
 * @fileoverview Pure, framework-agnostic helpers for the Knowledge Hub
 * "Visualize" host surface's AI-agent integration.
 *
 * These functions are free of Angular / component dependencies so they can be
 * unit-tested in isolation. The host component
 * ({@link VisualizeResourceComponent}) supplies a plain snapshot of its current
 * state (active visualization mode plus the shared record-drilldown state) and
 * these helpers shape it into the key-value `AgentContext` object that flows to
 * the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`. They also resolve agent-supplied
 * references (a drilldown record by id/title) the way a user refers to them.
 *
 * 🚨 SAFETY: these helpers only SHAPE read-only state and RESOLVE references —
 * no mutation, no side effects. Nothing here lists tagged record bodies beyond
 * the salient title/subtitle the surface already shows on screen.
 */

/** Visualization modes hosted by the Visualize surface. */
export const VISUALIZATION_MODES = ['clusters', 'tagcloud'] as const;

/** A Visualize-surface mode id. */
export type VisualizationModeId = (typeof VISUALIZATION_MODES)[number];

/** Type-guard for a visualization mode id; keeps the switch tool tolerant. */
export function isValidVisualizationMode(mode: unknown): mode is VisualizationModeId {
    return typeof mode === 'string' && (VISUALIZATION_MODES as readonly string[]).includes(mode);
}

/** Upper bound on how many drilldown record summaries we publish. */
export const VISUALIZE_CONTEXT_LIST_CAP = 25;

/** Cap an array to {@link VISUALIZE_CONTEXT_LIST_CAP} entries. Pure; never mutates input. */
export function capVisualizeList<T>(items: readonly T[]): T[] {
    return items.slice(0, VISUALIZE_CONTEXT_LIST_CAP);
}

/**
 * A minimal id+title descriptor for a record currently listed in the shared
 * drilldown panel, supplied by the component so the pure resolver can match
 * agent input against what the user sees.
 */
export interface DrilldownRecordCandidate {
    RecordID: string;
    Title: string;
}

/**
 * Resolve an agent-supplied drilldown-record reference (id or title) to one of
 * the records currently listed in the panel. Tries, in order:
 *   1. exact record id (case-insensitive — SQL-Server-uppercase vs PG-lowercase UUIDs)
 *   2. exact title (case-insensitive)
 *   3. first case-insensitive *contains* match on the title
 *
 * Pure + deterministic; returns the matched candidate, or null on a miss.
 */
export function resolveDrilldownRecord<T extends DrilldownRecordCandidate>(
    input: string,
    candidates: readonly T[],
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find(c => c.RecordID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byTitle = candidates.find(c => c.Title.toLowerCase() === needle);
    if (byTitle) {
        return byTitle;
    }
    return candidates.find(c => c.Title.toLowerCase().includes(needle)) ?? null;
}

/**
 * A drilldown record summary the component derives from its loaded rows (id,
 * title, subtitle) so the agent knows what's openable without re-querying.
 */
export interface DrilldownRecordSummary {
    RecordID: string;
    Title: string;
    Subtitle: string;
}

/**
 * The plain, component-supplied snapshot used to build the Visualize agent context.
 * Mirrors the salient slice of the host's state: the active mode, the available
 * modes, and the shared drilldown panel (open/loading state, what it's showing,
 * and the records it currently lists).
 */
export interface VisualizeAgentContextInput {
    /** The active visualization mode ('clusters' | 'tagcloud'). */
    ActiveMode: VisualizationModeId;
    /** The mode ids the surface offers. */
    AvailableModes: VisualizationModeId[];
    /** Whether the shared drilldown panel is open. */
    DrilldownVisible: boolean;
    /** Whether the drilldown panel is loading records. */
    DrilldownLoading: boolean;
    /** The drilldown panel title (e.g. the selected tag), or empty. */
    DrilldownTitle: string;
    /** The drilldown panel subtitle (e.g. "12 tagged records"), or empty. */
    DrilldownSubtitle: string;
    /** Records currently listed in the drilldown. Component supplies all; helper bounds. */
    DrilldownRecords: DrilldownRecordSummary[];
}

/**
 * Build the agent-visible context object for the Visualize host surface.
 * Pure function (no `this`) so the context shape is unit-testable.
 *
 * @param input - the host's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildVisualizeAgentContext(input: VisualizeAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        // Surfaced under the tool's parameter name so the agent can correlate
        // context with the SwitchVisualizationMode tool.
        ActiveVisualizationMode: input.ActiveMode,
        AvailableVisualizationModes: input.AvailableModes,
        DrilldownVisible: input.DrilldownVisible,
        DrilldownLoading: input.DrilldownLoading,
    };

    if (input.DrilldownVisible) {
        context['DrilldownTitle'] = input.DrilldownTitle || null;
        context['DrilldownSubtitle'] = input.DrilldownSubtitle || null;
        if (input.DrilldownRecords.length > 0) {
            context['DrilldownRecords'] = capVisualizeList(input.DrilldownRecords);
            context['DrilldownRecordCount'] = input.DrilldownRecords.length;
        }
    }

    return context;
}
