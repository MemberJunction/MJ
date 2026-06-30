/**
 * @fileoverview Pure helpers for the Scheduling dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link ../Scheduling/scheduling-dashboard.component.ts SchedulingDashboardComponent})
 * supplies a plain snapshot of its current state and these helpers shape it into
 * the key-value `AgentContext` object that flows to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * The shape follows the "hardcore" / Data-Explorer-depth pattern: the active tab
 * decides which deep slice is published (mode-scoped context), every list is
 * bounded (cap 25) with a companion total-count when truncated, and the selected
 * job is reported by id AND name so the co-agent can refer to it the way a user
 * does.
 *
 * 🔒 SAFETY: the Scheduling surface exposes ONLY navigational / filter / search /
 * read-only / select tools to the agent. Job state mutation (pause/resume via
 * updateJobStatus), job deletion, job creation, and lock release are intentionally
 * NOT exposed — see the SAFETY BOUNDARY comment in the component. These helpers
 * shape read-only context and validate/resolve input; they perform no mutation and
 * surface no secrets (no lock tokens, no raw configuration blobs).
 */

/** The three tabs the Scheduling dashboard supports. */
export const SCHEDULING_TABS = ['dashboard', 'jobs', 'activity'] as const;

/** A Scheduling tab id. */
export type SchedulingTab = (typeof SCHEDULING_TABS)[number];

/** Human-readable label for each tab, in {@link SCHEDULING_TABS} order. */
export const SCHEDULING_TAB_LABELS: Record<SchedulingTab, string> = {
    dashboard: 'Dashboard',
    jobs: 'Jobs',
    activity: 'Activity',
};

/**
 * The job status values the agent may filter by on the Jobs tab. `''` clears the
 * filter (all statuses). Mirrors the StatusOptions the jobs resource renders.
 */
export const SCHEDULING_JOB_STATUSES = ['', 'Active', 'Paused', 'Disabled', 'Pending', 'Expired'] as const;

/** A Scheduling job-status filter value (empty string = no filter). */
export type SchedulingJobStatus = (typeof SCHEDULING_JOB_STATUSES)[number];

/**
 * The execution status values the agent may filter by on the Activity tab. `''`
 * clears the filter (all statuses). Mirrors the StatusOptions the activity
 * resource renders.
 */
export const SCHEDULING_ACTIVITY_STATUSES = ['', 'Running', 'Completed', 'Failed', 'Cancelled', 'Timeout'] as const;

/** A Scheduling activity (execution) status filter value (empty string = no filter). */
export type SchedulingActivityStatus = (typeof SCHEDULING_ACTIVITY_STATUSES)[number];

/**
 * Upper bound on how many display names / row summaries we publish in any one
 * context list field (visible jobs, visible executions, unique job names). Bounded
 * so the streamed note stays small even when a surface holds hundreds of rows; a
 * companion total-count field reports the true number when the list is truncated.
 */
export const SCHEDULING_CONTEXT_LIST_CAP = 25;

/**
 * Cap an array of names/summaries to {@link SCHEDULING_CONTEXT_LIST_CAP} entries.
 * Pure + deterministic; returns a new array and never mutates the input.
 *
 * @param items - the full list (caller owns ordering / de-duplication)
 * @returns the first N entries, where N is the cap
 */
export function capSchedulingList<T>(items: readonly T[]): T[] {
    return items.slice(0, SCHEDULING_CONTEXT_LIST_CAP);
}

/**
 * Type-guard / validator for a Scheduling tab string. Keeps the
 * `SwitchSchedulingTab` client tool tolerant of arbitrary agent input — only the
 * three known tabs are accepted.
 *
 * @param tab - candidate tab string (may be anything the agent passes)
 * @returns true when `tab` is one of dashboard | jobs | activity
 */
export function isValidSchedulingTab(tab: unknown): tab is SchedulingTab {
    return typeof tab === 'string' && (SCHEDULING_TABS as readonly string[]).includes(tab);
}

/** Resolve a tab id to its human-readable label, falling back to a default. */
export function schedulingTabLabel(tab: string): string {
    return isValidSchedulingTab(tab) ? SCHEDULING_TAB_LABELS[tab] : 'Scheduling';
}

/** A minimal, component-supplied view of a single scheduled job (read-only, no secrets). */
export interface SchedulingJobSnapshot {
    JobId: string;
    JobName: string;
    JobType: string;
    Status: string;
    SuccessRate: number;
    TotalRuns: number;
    CronExpression: string;
    Timezone: string;
}

/** A minimal, component-supplied view of a single execution / activity row (read-only). */
export interface SchedulingExecutionSnapshot {
    ExecutionId: string;
    JobId: string;
    JobName: string;
    Status: string;
}

/** A minimal id+name descriptor for a selectable item (a job). */
export interface SchedulingItemCandidate {
    ID: string;
    Name: string;
}

/**
 * Resolve an agent-supplied job reference (by id or display name) to one of the
 * available jobs. Tries, in order:
 *   1. exact id (case-insensitive — handles SQL-Server-uppercase vs PG-lowercase UUIDs)
 *   2. exact display name (case-insensitive)
 *   3. first case-insensitive *contains* match on the display name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in
 * isolation. Returns the matched candidate, or null on a miss.
 *
 * @param input - whatever the agent passed (an id or the on-screen name)
 * @param candidates - the items currently available on the surface
 */
export function resolveSchedulingItem<T extends SchedulingItemCandidate>(
    input: string,
    candidates: readonly T[],
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
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
 * Build a tolerant "not found" error message for a failed name/id resolution. Lists
 * the available names (bounded) so the co-agent can correct itself, with a companion
 * "(N total)" hint when the candidate list is truncated.
 *
 * @param input - the reference the agent passed
 * @param candidates - the candidates that were searched
 * @param noun - what the candidates are ("job"), for the message
 */
export function buildSchedulingNotFoundError(
    input: string,
    candidates: readonly SchedulingItemCandidate[],
    noun: string = 'job',
): string {
    const names = capSchedulingList(candidates.map(c => c.Name));
    const truncated = candidates.length > names.length ? ` (${candidates.length} total)` : '';
    const available = names.length > 0 ? ` Available ${noun}s${truncated}: ${names.join(', ')}.` : '';
    return `No ${noun} found matching "${String(input)}".${available}`;
}

// ────────────────────────────────────────────────────────────────────────────
//  Per-surface context shapers
// ────────────────────────────────────────────────────────────────────────────

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Scheduling dashboard state. The always-on KPI
 * slice (job counts by status, alerts, success rate) is published on every tab;
 * the ACTIVE tab additionally publishes its detailed surface slice.
 */
export interface SchedulingAgentContextInput {
    /** Active tab (dashboard / jobs / activity). */
    ActiveTab: string;
    /** Read-only snapshot of every scheduled job currently loaded. */
    Jobs: SchedulingJobSnapshot[];
    /** Count of active scheduling alerts (stale locks, high failure rate, etc.). */
    AlertCount: number;
    /** Count of jobs with a (stale or live) lock held. */
    LockedJobCount: number;
    /** Count of executions currently running (live). */
    RunningCount: number;
    /** Per-job-type breakdown (name + active count + total runs). */
    JobTypeBreakdown: { TypeName: string; ActiveJobsCount: number; TotalRuns: number }[];

    // ── Jobs-tab slice ──
    /** The search term currently applied on the jobs tab. */
    JobsSearchTerm: string;
    /** The status filter currently applied on the jobs tab ('' = no filter). */
    StatusFilter: string;
    /** The job-type filter currently applied on the jobs tab ('' = no filter). */
    TypeFilter: string;
    /** The jobs visible after search + filters, in display order. */
    VisibleJobs: SchedulingJobSnapshot[];
    /** The selected job (open in the editor slideout), or null. */
    SelectedJob: SchedulingJobSnapshot | null;

    // ── Activity-tab slice ──
    /** The search term currently applied on the activity tab. */
    ActivitySearchTerm: string;
    /** The execution status filter currently applied on the activity tab ('' = no filter). */
    ActivityStatusFilter: string;
    /** The job-name filter currently applied on the activity tab ('' = no filter). */
    ActivityJobNameFilter: string;
    /** The activity time range currently selected (24h / 7d / 30d / 90d). */
    ActivityTimeRange: string;
    /** The executions visible after search + filters, in display order. */
    VisibleExecutions: SchedulingExecutionSnapshot[];
    /** Distinct job names present in the loaded executions (unfiltered). */
    ActivityJobNames: string[];
}

/** Compute the always-on KPI slice shared across every tab. */
function buildKpiSlice(input: SchedulingAgentContextInput): Record<string, unknown> {
    const total = input.Jobs.length;
    const active = input.Jobs.filter(j => j.Status === 'Active').length;
    const paused = input.Jobs.filter(j => j.Status === 'Paused').length;
    const disabled = input.Jobs.filter(j => j.Status === 'Disabled').length;
    const pending = input.Jobs.filter(j => j.Status === 'Pending').length;
    const expired = input.Jobs.filter(j => j.Status === 'Expired').length;

    const ratedJobs = input.Jobs.filter(j => j.TotalRuns > 0);
    const successRate = ratedJobs.length > 0
        ? ratedJobs.reduce((sum, j) => sum + j.SuccessRate, 0) / ratedJobs.length
        : 0;

    const typeNames = capSchedulingList(input.JobTypeBreakdown.map(t => t.TypeName));

    return {
        TotalJobs: total,
        ActiveJobCount: active,
        PausedJobCount: paused,
        DisabledJobCount: disabled,
        PendingJobCount: pending,
        ExpiredJobCount: expired,
        AlertCount: input.AlertCount,
        LockedJobCount: input.LockedJobCount,
        RunningCount: input.RunningCount,
        SuccessRate: Math.round(successRate * 1000) / 1000,
        JobTypeCount: input.JobTypeBreakdown.length,
        JobTypeNames: typeNames,
    };
}

/** Shape the Jobs-tab detailed slice (search/filters, visible names, selection). */
function buildJobsSlice(input: SchedulingAgentContextInput): Record<string, unknown> {
    const visibleNames = capSchedulingList(input.VisibleJobs.map(j => j.JobName));
    const slice: Record<string, unknown> = {
        JobsSearchTerm: input.JobsSearchTerm,
        StatusFilter: input.StatusFilter,
        TypeFilter: input.TypeFilter,
        VisibleJobCount: input.VisibleJobs.length,
        VisibleJobNames: visibleNames,
        VisibleJobNamesTruncated: input.VisibleJobs.length > visibleNames.length,
    };
    if (input.SelectedJob) {
        slice['SelectedJobId'] = input.SelectedJob.JobId;
        slice['SelectedJobName'] = input.SelectedJob.JobName;
    }
    return slice;
}

/** Shape the Activity-tab detailed slice (search/filters, visible executions, job names). */
function buildActivitySlice(input: SchedulingAgentContextInput): Record<string, unknown> {
    const visibleNames = capSchedulingList(input.VisibleExecutions.map(e => e.JobName));
    const jobNames = capSchedulingList(input.ActivityJobNames);
    return {
        ActivitySearchTerm: input.ActivitySearchTerm,
        ActivityStatusFilter: input.ActivityStatusFilter,
        ActivityJobNameFilter: input.ActivityJobNameFilter,
        ActivityTimeRange: input.ActivityTimeRange,
        VisibleExecutionCount: input.VisibleExecutions.length,
        VisibleExecutionJobNames: visibleNames,
        VisibleExecutionJobNamesTruncated: input.VisibleExecutions.length > visibleNames.length,
        ActivityJobNameCount: input.ActivityJobNames.length,
        ActivityJobNames: jobNames,
    };
}

/**
 * Build the agent-visible context object for the Scheduling dashboard.
 *
 * The always-on KPI slice (per-status job counts, alerts, locked/running counts,
 * overall success rate, job-type breakdown) is published on every tab. The ACTIVE
 * tab additionally publishes its detailed surface slice (Jobs: search/filters,
 * visible job names, selected job; Activity: search/filters, time range, visible
 * executions, distinct job names). All counts are derived purely from the supplied
 * snapshots so this stays unit-testable and decoupled from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildSchedulingAgentContext(input: SchedulingAgentContextInput): Record<string, unknown> {
    const activeTab: SchedulingTab = isValidSchedulingTab(input.ActiveTab) ? input.ActiveTab : 'dashboard';

    const context: Record<string, unknown> = {
        ActiveTab: activeTab,
        ActiveTabLabel: schedulingTabLabel(activeTab),
        ...buildKpiSlice(input),
    };

    switch (activeTab) {
        case 'jobs':
            Object.assign(context, buildJobsSlice(input));
            break;
        case 'activity':
            Object.assign(context, buildActivitySlice(input));
            break;
        case 'dashboard':
        default:
            // Dashboard tab: KPI slice only — no per-row detail surface.
            break;
    }

    return context;
}
