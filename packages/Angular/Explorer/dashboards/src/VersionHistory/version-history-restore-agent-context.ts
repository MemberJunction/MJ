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
 * Upper bound on how many recent-restore summaries the Restore surface publishes
 * in its bounded list. Keeping the streamed note bounded avoids flooding the
 * co-agent; a companion total-count is surfaced when the list is truncated.
 */
export const RESTORE_LIST_CAP = 25;

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

/** A bounded, agent-visible summary of one recent restore. */
export interface RestoreSummaryItem {
    /** The restore record's primary key. */
    ID: string;
    /** The restore's display name (the operation/label name). */
    Name: string;
    /** The restore's status, e.g. 'Complete', 'Error', 'Partial'. */
    Status: string;
}

/** Minimal slice of a single restore needed for id→name→contains resolution. */
export interface RestoreSnapshot {
    ID: string;
    Name: string;
    Status: string;
}

/** Outcome of {@link resolveRestore}: a matched restore, or a tolerant error. */
export type RestoreResolution =
    | { ok: true; restore: RestoreSnapshot }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied restore reference (an ID or a name) to one of the
 * loaded restores, in order: exact ID (case-insensitive) → exact name
 * (case-insensitive) → first name-contains match. Pure + deterministic over the
 * supplied list, so it's unit-testable in isolation. Returns a tolerant error
 * listing the available restore names on a miss.
 *
 * @param reference - whatever the agent passed (a restore ID or name)
 * @param restores - the restores currently loaded
 * @returns the matched restore, or a clear error message
 */
export function resolveRestore(
    reference: string,
    restores: readonly RestoreSnapshot[],
): RestoreResolution {
    const needle = reference.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'A restore ID or name is required.' };
    }
    if (restores.length === 0) {
        return { ok: false, error: 'No restores are currently loaded to select from.' };
    }
    const byId = restores.find((r) => r.ID.toLowerCase() === needle);
    if (byId) {
        return { ok: true, restore: byId };
    }
    const byName = restores.find((r) => (r.Name ?? '').toLowerCase() === needle);
    if (byName) {
        return { ok: true, restore: byName };
    }
    const byContains = restores.find((r) => (r.Name ?? '').toLowerCase().includes(needle));
    if (byContains) {
        return { ok: true, restore: byContains };
    }
    const sample = restores
        .map((r) => r.Name)
        .filter((n) => !!n)
        .slice(0, RESTORE_LIST_CAP)
        .join(', ');
    return { ok: false, error: `No restore matches "${reference}". Available restores include: ${sample}.` };
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Restore surface state: the precomputed
 * restore-status counts, the active status filter, the filtered restore count,
 * a bounded list of recent restores, and the selected restore (if any).
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
    /**
     * The restores visible after the active filter, most-recent first — so the
     * agent knows what's selectable. The component supplies the full filtered
     * list; this helper bounds it — see {@link RESTORE_LIST_CAP}.
     */
    RecentRestores: RestoreSummaryItem[];
    /** ID of the restore whose detail row is expanded, or null. */
    SelectedRestoreId: string | null;
    /** Display name of the selected restore, or null when none is expanded. */
    SelectedRestoreName: string | null;
}

/**
 * Build the agent-visible context object for the Version History Restore surface.
 *
 * Reports the total/successful/failed/partial restore counts, the active status
 * filter, the filtered restore count, a bounded list of recent restores
 * (id · name · status), and the selected restore (by id + name). All values are
 * supplied by the component (already derived from its loaded data), so this stays
 * a pure mapping and decoupled from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildVersionHistoryRestoreAgentContext(
    input: VersionHistoryRestoreAgentContextInput,
): Record<string, unknown> {
    const context: Record<string, unknown> = {
        TotalRestores: input.TotalRestores,
        SuccessfulRestores: input.SuccessfulRestores,
        FailedRestores: input.FailedRestores,
        PartialRestores: input.PartialRestores,
        StatusFilter: input.StatusFilter,
        FilteredRestoreCount: input.FilteredRestoreCount,
        SelectedRestoreId: input.SelectedRestoreId,
        SelectedRestoreName: input.SelectedRestoreName,
    };
    if (input.RecentRestores.length > 0) {
        context['RecentRestores'] = input.RecentRestores.slice(0, RESTORE_LIST_CAP);
        if (input.RecentRestores.length > RESTORE_LIST_CAP) {
            context['RecentRestoreCount'] = input.RecentRestores.length;
        }
    }
    return context;
}
