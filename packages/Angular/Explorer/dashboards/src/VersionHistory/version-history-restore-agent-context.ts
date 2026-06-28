/**
 * @fileoverview Pure helpers for the Version History Restore surface's AI-agent
 * integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link ./components/restore-resource.component.ts VersionHistoryRestoreResourceComponent})
 * supplies a plain snapshot of its current state and these helpers shape it into
 * the key-value `AgentContext` object that flows to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY: the Restore surface exposes ONLY read-only / filter / refresh tools
 * to the agent. The actual restore/rollback operation is DESTRUCTIVE and is
 * intentionally NOT exposed — see the SAFETY BOUNDARY comment in the component.
 * These helpers shape read-only context and validate status input; they perform
 * no mutation.
 */

/**
 * The restore status values the surface filters on (the empty string means
 * "no filter / all statuses"). Used to keep the FilterRestoresByStatus client
 * tool tolerant of arbitrary agent input.
 */
export const RESTORE_STATUS_FILTERS = ['', 'Complete', 'Error', 'Partial', 'In Progress', 'Pending'] as const;

/** A restore status filter value. */
export type RestoreStatusFilter = (typeof RESTORE_STATUS_FILTERS)[number];

/**
 * Type-guard / validator for a restore status string. Keeps the
 * `FilterRestoresByStatus` client tool tolerant of arbitrary agent input — only
 * the known status values (plus '' = clear filter) are accepted.
 *
 * @param status - candidate status string (may be anything the agent passes)
 * @returns true when `status` is a known restore status or the empty string
 */
export function isValidRestoreStatusFilter(status: unknown): status is RestoreStatusFilter {
    return typeof status === 'string' && (RESTORE_STATUS_FILTERS as readonly string[]).includes(status);
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Restore surface state: the precomputed
 * restore-status counts, the active status filter, and the filtered restore
 * count.
 */
export interface VersionHistoryRestoreAgentContextInput {
    /** Total number of restore records loaded. */
    TotalRestores: number;
    /** Number of restores that completed successfully. */
    SuccessfulRestores: number;
    /** Number of restores that ended in error. */
    FailedRestores: number;
    /** Number of restores that completed partially. */
    PartialRestores: number;
    /** The status filter currently applied ('' = no filter). */
    StatusFilter: string;
    /** Number of restores visible after the current filter is applied. */
    FilteredRestoreCount: number;
}

/**
 * Build the agent-visible context object for the Version History Restore surface.
 *
 * Reports the total/successful/failed/partial restore counts, the active status
 * filter, and the filtered restore count. All values are supplied by the
 * component (already derived from its loaded data), so this stays a pure mapping
 * and decoupled from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildVersionHistoryRestoreAgentContext(
    input: VersionHistoryRestoreAgentContextInput,
): Record<string, unknown> {
    return {
        TotalRestores: input.TotalRestores,
        SuccessfulRestores: input.SuccessfulRestores,
        FailedRestores: input.FailedRestores,
        PartialRestores: input.PartialRestores,
        StatusFilter: input.StatusFilter,
        FilteredRestoreCount: input.FilteredRestoreCount,
    };
}
