/**
 * @fileoverview Pure, framework-agnostic helpers for the Knowledge Hub
 * "Clusters" resource's AI-agent integration.
 *
 * These functions are free of Angular / component dependencies so they can be
 * unit-tested in isolation. The component
 * ({@link ClusterVisualizationResourceComponent}) supplies a plain snapshot of
 * its current clustering state and these helpers shape it into the key-value
 * `AgentContext` object that flows to the async chat agent and the realtime
 * co-agent via `NavigationService.SetAgentContext`. They also resolve
 * agent-supplied references (a cluster by id/label, a saved visualization by
 * id/name) the way a user refers to them.
 *
 * 🚨 SAFETY: these helpers only SHAPE read-only state and RESOLVE references —
 * no mutation, no side effects. Nothing here deletes a saved visualization or
 * underlying data. The clustering re-run / reset operations the agent CAN
 * invoke are idempotent recomputes documented in the component's SAFETY
 * BOUNDARY comment.
 */

/** Upper bound on how many list entries (cluster labels, saved names) we publish. */
export const CLUSTER_CONTEXT_LIST_CAP = 25;

/** Cap an array to {@link CLUSTER_CONTEXT_LIST_CAP} entries. Pure; never mutates input. */
export function capClusterList<T>(items: readonly T[]): T[] {
    return items.slice(0, CLUSTER_CONTEXT_LIST_CAP);
}

/**
 * A minimal id+name descriptor for a selectable saved visualization, supplied by
 * the component so the pure resolver can match agent input against what the user
 * sees in the left sidebar.
 */
export interface SavedVisualizationCandidate {
    Id: string;
    Name: string;
}

/**
 * Resolve an agent-supplied saved-visualization reference (id or display name) to
 * one of the available saved visualizations. Tries, in order:
 *   1. exact id (case-insensitive — handles SQL-Server-uppercase vs PG-lowercase UUIDs)
 *   2. exact display name (case-insensitive)
 *   3. first case-insensitive *contains* match on the display name
 *
 * Pure + deterministic over the supplied list, so it's unit-testable in isolation.
 * Returns the matched candidate, or null on a miss.
 *
 * @param input - whatever the agent passed (an id or the on-screen name)
 * @param candidates - the saved visualizations currently in the sidebar
 */
export function resolveSavedVisualization<T extends SavedVisualizationCandidate>(
    input: string,
    candidates: readonly T[],
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find(c => c.Id.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byName = candidates.find(c => c.Name.toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    return candidates.find(c => c.Name.toLowerCase().includes(needle)) ?? null;
}

/**
 * A "no match" error result for an id/name lookup. Lists the available names
 * (bounded) so the agent can retry with a valid one. Tolerant — never throws.
 *
 * @param input - the reference the agent supplied that didn't resolve
 * @param availableNames - the display names the agent could have chosen
 * @param noun - what kind of item was being looked up (for the message)
 */
export function buildClusterNotFoundError(
    input: string,
    availableNames: readonly string[],
    noun: string,
): { Success: false; ErrorMessage: string } {
    const sample = capClusterList(availableNames);
    const listed = sample.length > 0 ? sample.join(', ') : '(none available)';
    const more = availableNames.length > sample.length ? `, … (${availableNames.length} total)` : '';
    return {
        Success: false,
        ErrorMessage: `No ${noun} matches "${input}". Available ${noun}s: ${listed}${more}.`,
    };
}

/**
 * A cluster summary the component derives from its result (id, resolved label,
 * and point count) so the agent can see what's plotted and refer to a cluster
 * by name.
 */
export interface ClusterSummary {
    ClusterId: number;
    Label: string;
    PointCount: number;
}

/**
 * The plain, component-supplied snapshot used to build the Clusters agent context.
 * Mirrors the salient slice of the component's state: whether a visualization is
 * loaded, its title, the active source/algorithm config, the cluster + point
 * counts, the per-cluster summaries, run status/error, and the saved-visualization
 * landscape.
 */
export interface ClusterAgentContextInput {
    /** Whether a visualization is currently rendered (has points). */
    IsVisualizationLoaded: boolean;
    /** The top-bar title of the current visualization, or null. */
    VisualizationTitle: string | null;
    /** Whether a clustering run is in progress. */
    IsRunning: boolean;
    /** User-facing error from the last run, or null. */
    RunError: string | null;
    /** The entity the active config sources vectors from (may be blank for multi-source). */
    ConfigEntityName: string;
    /** The clustering algorithm in the active config ('kmeans' | 'dbscan'). */
    ConfigAlgorithm: string;
    /** Projection dimensionality of the active config (2 or 3). */
    ConfigDimensions: number;
    /** Number of clusters in the current result. */
    ClusterCount: number;
    /** Total number of plotted points in the current result. */
    TotalPoints: number;
    /** Per-cluster summaries (id, label, point count). Component supplies all; helper bounds. */
    Clusters: ClusterSummary[];
    /** Silhouette score of the current result, or null when unavailable. */
    SilhouetteScore: number | null;
    /** Names of the entities available as cluster sources (config dropdown). Bounded. */
    AvailableEntityNames: string[];
    /** Number of saved visualizations in the sidebar. */
    SavedVisualizationCount: number;
    /** Display names of the saved visualizations. Component supplies all; helper bounds. */
    SavedVisualizationNames: string[];
    /** Id of the currently active saved visualization, or null. */
    ActiveSavedId: string | null;
    /** Name of the currently active saved visualization, or null. */
    ActiveSavedName: string | null;
}

/**
 * Build the agent-visible context object for the Clusters surface.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildClusterAgentContext(input: ClusterAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        IsVisualizationLoaded: input.IsVisualizationLoaded,
        VisualizationTitle: input.VisualizationTitle,
        IsRunning: input.IsRunning,
        ClusterCount: input.ClusterCount,
        TotalPoints: input.TotalPoints,
        ConfigEntityName: input.ConfigEntityName || null,
        ConfigAlgorithm: input.ConfigAlgorithm,
        ConfigDimensions: input.ConfigDimensions,
        SavedVisualizationCount: input.SavedVisualizationCount,
        ActiveSavedId: input.ActiveSavedId,
        ActiveSavedName: input.ActiveSavedName,
    };

    if (input.RunError) {
        context['RunError'] = input.RunError;
    }

    if (input.SilhouetteScore != null) {
        context['SilhouetteScore'] = Math.round(input.SilhouetteScore * 100) / 100;
    }

    // Per-cluster summaries — so the agent knows what groups are plotted and can
    // refer to a cluster by its (LLM-generated or user-edited) label.
    if (input.Clusters.length > 0) {
        context['Clusters'] = capClusterList(input.Clusters);
        if (input.Clusters.length > CLUSTER_CONTEXT_LIST_CAP) {
            context['ClusterSummaryCount'] = input.Clusters.length;
        }
    }

    // The source entities the agent could request a fresh analysis against.
    if (input.AvailableEntityNames.length > 0) {
        context['AvailableEntities'] = capClusterList(input.AvailableEntityNames);
        if (input.AvailableEntityNames.length > CLUSTER_CONTEXT_LIST_CAP) {
            context['AvailableEntityCount'] = input.AvailableEntityNames.length;
        }
    }

    // The saved visualizations the agent can open via OpenSavedVisualization.
    if (input.SavedVisualizationNames.length > 0) {
        context['SavedVisualizations'] = capClusterList(input.SavedVisualizationNames);
        if (input.SavedVisualizationNames.length > CLUSTER_CONTEXT_LIST_CAP) {
            context['SavedVisualizationListCount'] = input.SavedVisualizationNames.length;
        }
    }

    return context;
}
