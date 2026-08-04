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
 * Upper bound on how many names (policy names, entity names, recent-run names)
 * any Archiving surface publishes in a name-list context field. Keeping the
 * streamed note bounded avoids flooding the co-agent with hundreds of names;
 * surfaces publish a companion total-count field when the list is truncated.
 */
export const ARCHIVE_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to {@link ARCHIVE_NAME_LIST_CAP} entries. Pure +
 * deterministic so the published context shape stays unit-testable. Never throws;
 * never mutates the input.
 *
 * @param names - the full list (caller owns de-duplication / ordering)
 * @returns the first N names, where N is the cap
 */
export function capArchiveNames(names: readonly string[]): string[] {
    return names.slice(0, ARCHIVE_NAME_LIST_CAP);
}

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

/**
 * An identifiable archive run, as the components see it (the inner run viewer's
 * `ArchiveRunSummary`): an `ID`, the configuration/policy name the run belongs to
 * (its user-facing "name"), and its `Status`. Used for the bounded recent-run
 * list and for id→name→contains resolution by the SelectRun / ViewArchiveRunDetail
 * tools.
 *
 * Note: there is intentionally NO `DryRun` field here — `MJ: Archive Runs` has no
 * dry-run column in the schema (the dry-run concept lives in the Record-Set-
 * Processing substrate, not archiving), so there is no honest data source for it.
 * See {@link buildArchiveRunsAgentContext}.
 */
export interface ArchiveRunSnapshot extends ArchiveRunStatusSnapshot {
    /** The run's primary key. */
    ID: string;
    /** The configuration/policy name the run belongs to (its display name). */
    ConfigurationName: string;
}

/** A bounded, agent-visible summary of one recent archive run. */
export interface ArchiveRunSummaryItem {
    ID: string;
    Name: string;
    Status: string;
}

/** Outcome of {@link resolveArchiveRun}: a matched run, or a tolerant error. */
export type ArchiveRunResolution =
    | { ok: true; run: ArchiveRunSnapshot }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied run reference (an ID or a configuration name) to one
 * of the loaded runs. Matches the way an agent names things, in order:
 *   1. exact ID (case-insensitive)
 *   2. exact configuration name (case-insensitive)
 *   3. first configuration-name *contains* match (case-insensitive)
 *
 * Pure + deterministic over the supplied run list, so it's unit-testable in
 * isolation. Returns a tolerant error listing the available run names on a miss.
 *
 * @param reference - whatever the agent passed (a run ID or a configuration name)
 * @param runs - the runs currently loaded in the viewer
 * @returns the matched run, or a clear error message
 */
export function resolveArchiveRun(
    reference: string,
    runs: readonly ArchiveRunSnapshot[],
): ArchiveRunResolution {
    const needle = reference.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'A run ID or configuration name is required.' };
    }
    if (runs.length === 0) {
        return { ok: false, error: 'No archive runs are currently loaded to select from.' };
    }
    const byId = runs.find((r) => r.ID.toLowerCase() === needle);
    if (byId) {
        return { ok: true, run: byId };
    }
    const byName = runs.find((r) => (r.ConfigurationName ?? '').toLowerCase() === needle);
    if (byName) {
        return { ok: true, run: byName };
    }
    const byContains = runs.find((r) => (r.ConfigurationName ?? '').toLowerCase().includes(needle));
    if (byContains) {
        return { ok: true, run: byContains };
    }
    const sample = capArchiveNames(
        runs.map((r) => r.ConfigurationName).filter((n) => !!n),
    ).join(', ');
    return {
        ok: false,
        error: `No archive run matches "${reference}". Available runs include: ${sample}.`,
    };
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
    /**
     * Names of the archive configuration policies (so the agent can refer to a
     * policy by name). The component supplies the full list; this helper bounds it
     * — see {@link ARCHIVE_NAME_LIST_CAP}.
     */
    PolicyNames: string[];
    /**
     * Names of the entities configured for archiving across all policies (so the
     * agent knows what's under archive). The component supplies the full list;
     * this helper bounds it. May contain duplicates from the caller — the caller
     * owns de-duplication.
     */
    ArchivedEntityNames: string[];
    /** Whether the configuration surface is currently loading. */
    IsLoading: boolean;
}

/**
 * Build the agent-visible context for the Archive Configuration surface.
 *
 * 🔒 Read-only: describes policy/entity counts + bounded policy/entity names and
 * load state only. The agent cannot create, edit, or delete policies through this
 * context.
 *
 * Note: `ScheduledJobCount` / `NextScheduledRun` are intentionally absent — the
 * archive schema has no scheduling concept (no Schedule/Cron/NextRun fields on
 * `MJ: Archive Configurations`), so there is no honest data source for them.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildArchiveConfigAgentContext(input: ArchiveConfigAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        Surface: 'ArchiveConfiguration',
        PolicyCount: input.PolicyCount,
        ActivePolicyCount: input.ActivePolicyCount,
        EntitiesUnderArchive: input.EntitiesUnderArchive,
        IsLoading: input.IsLoading,
    };

    if (input.PolicyNames.length > 0) {
        context['PolicyNames'] = capArchiveNames(input.PolicyNames);
        if (input.PolicyNames.length > ARCHIVE_NAME_LIST_CAP) {
            context['PolicyNameCount'] = input.PolicyNames.length;
        }
    }
    if (input.ArchivedEntityNames.length > 0) {
        context['ArchivedEntityNames'] = capArchiveNames(input.ArchivedEntityNames);
        if (input.ArchivedEntityNames.length > ARCHIVE_NAME_LIST_CAP) {
            context['ArchivedEntityNameCount'] = input.ArchivedEntityNames.length;
        }
    }
    return context;
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
    /** Configuration/policy name of the selected run, or null when none is open. */
    SelectedRunName: string | null;
    /** Status of the selected run, or null when none is open. */
    SelectedRunStatus: string | null;
    /**
     * The runs visible after the active status filter, most-recent first — so the
     * agent knows which runs are selectable (SelectRun / ViewArchiveRunDetail). The
     * component supplies the full filtered list; this helper bounds it — see
     * {@link ARCHIVE_NAME_LIST_CAP}.
     */
    RecentRuns: ArchiveRunSummaryItem[];
    /** Whether the run history surface is currently loading. */
    IsLoading: boolean;
}

/**
 * Build the agent-visible context for the Archive Run History surface.
 *
 * 🔒 Read-only: describes run outcome counts (by status), the active filter, a
 * bounded list of recent runs (id · name · status), and which run (if any) is
 * open for inspection. The agent cannot run, cancel, retry, or purge anything
 * through this context.
 *
 * Note: a per-run `DryRun` flag is intentionally absent — `MJ: Archive Runs` has
 * no dry-run column (the dry-run concept lives in the Record-Set-Processing
 * substrate, not archiving), so there is no honest data source for it.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildArchiveRunsAgentContext(input: ArchiveRunsAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        Surface: 'ArchiveRunHistory',
        TotalRuns: input.Counts.TotalRuns,
        SuccessfulRuns: input.Counts.SuccessfulRuns,
        FailedRuns: input.Counts.FailedRuns,
        RunningRuns: input.Counts.RunningRuns,
        StatusFilter: input.StatusFilter,
        FilteredRunCount: input.FilteredRunCount,
        SelectedRunId: input.SelectedRunId,
        SelectedRunName: input.SelectedRunName,
        SelectedRunStatus: input.SelectedRunStatus,
        IsLoading: input.IsLoading,
    };

    if (input.RecentRuns.length > 0) {
        context['RecentRuns'] = input.RecentRuns.slice(0, ARCHIVE_NAME_LIST_CAP);
        if (input.RecentRuns.length > ARCHIVE_NAME_LIST_CAP) {
            context['RecentRunCount'] = input.RecentRuns.length;
        }
    }
    return context;
}
