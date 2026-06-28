/**
 * @fileoverview Pure helpers for the Archiving app's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The two Archiving resource components
 * supply a plain snapshot of their current state and these helpers shape it into
 * the key-value `AgentContext` object that flows to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY BOUNDARY: the Archiving surfaces are wired READ-ONLY. These helpers
 * only describe and bucket state — they perform no archiving, purging, policy
 * mutation, or run execution. See the SAFETY BOUNDARY comments in the resource
 * components for the full list of intentionally-excluded operations.
 */

/**
 * The set of run-status filter values the Run History surface accepts. `'all'`
 * means no status filter is applied (the default). The remaining values mirror
 * the typed `MJ: Archive Runs.Status` union (Cancelled | Complete | Failed |
 * PartialSuccess | Running).
 */
export const ARCHIVE_RUN_STATUS_FILTERS = [
    'all',
    'Complete',
    'PartialSuccess',
    'Failed',
    'Running',
    'Cancelled',
] as const;

/** A single run-status filter value. */
export type ArchiveRunStatusFilter = (typeof ARCHIVE_RUN_STATUS_FILTERS)[number];

/**
 * Type-guard / validator for a run-status filter string. Keeps the
 * `FilterArchiveRunsByStatus` client tool tolerant of arbitrary agent input —
 * only the known status values (plus `'all'`) are accepted.
 *
 * @param status - candidate status string (may be anything the agent passes)
 * @returns true when `status` is one of {@link ARCHIVE_RUN_STATUS_FILTERS}
 */
export function isValidArchiveRunStatusFilter(status: unknown): status is ArchiveRunStatusFilter {
    return typeof status === 'string' && (ARCHIVE_RUN_STATUS_FILTERS as readonly string[]).includes(status);
}

/**
 * Minimal slice of a single archive run needed for status bucketing. Mirrors the
 * `Status` field of `MJ: Archive Runs`.
 */
export interface ArchiveRunStatusSnapshot {
    /** The run's status, e.g. 'Complete', 'Failed', 'Running'. */
    Status: string;
}

/** Counts of runs bucketed by outcome. */
export interface ArchiveRunStatusCounts {
    /** Total number of runs (regardless of status). */
    TotalRuns: number;
    /** Runs that finished successfully (Complete or PartialSuccess). */
    SuccessfulRuns: number;
    /** Runs that ended in Failed status. */
    FailedRuns: number;
    /** Runs currently Running. */
    RunningRuns: number;
}

/**
 * Bucket a list of runs into Total / Successful / Failed / Running counts.
 *
 * `Complete` and `PartialSuccess` both count as successful (the run produced
 * output even if some records were skipped/failed within it). Comparison is
 * case-insensitive so the helper is tolerant of casing drift from the data layer.
 *
 * @param runs - the runs to bucket (only their Status is read)
 * @returns the four outcome counts
 */
export function computeArchiveRunStatusCounts(runs: readonly ArchiveRunStatusSnapshot[]): ArchiveRunStatusCounts {
    let successful = 0;
    let failed = 0;
    let running = 0;
    for (const run of runs) {
        const status = (run.Status ?? '').toLowerCase();
        if (status === 'complete' || status === 'partialsuccess') {
            successful++;
        } else if (status === 'failed') {
            failed++;
        } else if (status === 'running') {
            running++;
        }
    }
    return {
        TotalRuns: runs.length,
        SuccessfulRuns: successful,
        FailedRuns: failed,
        RunningRuns: running,
    };
}

/**
 * Filter a list of runs by a status filter. `'all'` returns the runs unchanged;
 * any other value keeps only runs whose status matches (case-insensitive).
 *
 * @param runs - the runs to filter
 * @param filter - the active status filter
 * @returns the filtered subset (a new array)
 */
export function filterArchiveRunsByStatus<T extends ArchiveRunStatusSnapshot>(
    runs: readonly T[],
    filter: ArchiveRunStatusFilter,
): T[] {
    if (filter === 'all') {
        return [...runs];
    }
    const wanted = filter.toLowerCase();
    return runs.filter((r) => (r.Status ?? '').toLowerCase() === wanted);
}

/** Component-supplied snapshot for the Archive Configuration surface. */
export interface ArchiveConfigAgentContextInput {
    /** Number of archive configuration policies loaded. */
    PolicyCount: number;
    /** Number of policies that are not Disabled (Idle/Running/Error). */
    ActivePolicyCount: number;
    /** Total number of entities configured for archiving across all policies. */
    EntitiesUnderArchive: number;
    /** Whether the configuration surface is currently loading. */
    IsLoading: boolean;
}

/**
 * Build the agent-visible context for the Archive Configuration surface.
 *
 * 🔒 Read-only: describes policy/entity counts and load state only. The agent
 * cannot create, edit, or delete policies through this context.
 *
 * Note: `ScheduledJobCount` / `NextScheduledRun` are intentionally absent — the
 * archive schema has no scheduling concept (no Schedule/Cron/NextRun fields on
 * `MJ: Archive Configurations`), so there is no honest data source for them.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildArchiveConfigAgentContext(input: ArchiveConfigAgentContextInput): Record<string, unknown> {
    return {
        Surface: 'ArchiveConfiguration',
        PolicyCount: input.PolicyCount,
        ActivePolicyCount: input.ActivePolicyCount,
        EntitiesUnderArchive: input.EntitiesUnderArchive,
        IsLoading: input.IsLoading,
    };
}

/** Component-supplied snapshot for the Archive Run History surface. */
export interface ArchiveRunsAgentContextInput {
    /** Outcome counts for the (unfiltered) set of runs. */
    Counts: ArchiveRunStatusCounts;
    /** The active status filter (`'all'` when none). */
    StatusFilter: ArchiveRunStatusFilter;
    /** Number of runs visible after the status filter is applied. */
    FilteredRunCount: number;
    /** ID of the run whose detail drawer is open, or null. */
    SelectedRunId: string | null;
    /** Whether the run history surface is currently loading. */
    IsLoading: boolean;
}

/**
 * Build the agent-visible context for the Archive Run History surface.
 *
 * 🔒 Read-only: describes run outcome counts, the active filter, and which run
 * (if any) is open for inspection. The agent cannot run, cancel, retry, or purge
 * anything through this context.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildArchiveRunsAgentContext(input: ArchiveRunsAgentContextInput): Record<string, unknown> {
    return {
        Surface: 'ArchiveRunHistory',
        TotalRuns: input.Counts.TotalRuns,
        SuccessfulRuns: input.Counts.SuccessfulRuns,
        FailedRuns: input.Counts.FailedRuns,
        RunningRuns: input.Counts.RunningRuns,
        StatusFilter: input.StatusFilter,
        FilteredRunCount: input.FilteredRunCount,
        SelectedRunId: input.SelectedRunId,
        IsLoading: input.IsLoading,
    };
}
