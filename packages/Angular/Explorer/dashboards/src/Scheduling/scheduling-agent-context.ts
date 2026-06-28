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
 * 🔒 SAFETY: the Scheduling surface exposes ONLY navigational / filter / search /
 * read-only tools to the agent. Job state mutation (pause/resume), job deletion,
 * and job creation are intentionally NOT exposed — see the SAFETY BOUNDARY comment
 * in the component. These helpers shape read-only context and validate tab input;
 * they perform no mutation.
 */

/** The three tabs the Scheduling dashboard supports. */
export const SCHEDULING_TABS = ['dashboard', 'jobs', 'activity'] as const;

/** A Scheduling tab id. */
export type SchedulingTab = (typeof SCHEDULING_TABS)[number];

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

/** A minimal, component-supplied view of a single scheduled job (read-only). */
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

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Scheduling dashboard state: the active tab,
 * the job list (so per-status counts and an overall success rate can be derived),
 * the alert count, and the current jobs-tab status filter.
 */
export interface SchedulingAgentContextInput {
    /** Active tab (dashboard / jobs / activity). */
    ActiveTab: string;
    /** Read-only snapshot of every scheduled job currently loaded. */
    Jobs: SchedulingJobSnapshot[];
    /** Count of active scheduling alerts (stale locks, high failure rate, etc.). */
    AlertCount: number;
    /** The status filter currently applied on the jobs tab ('' = no filter). */
    StatusFilter: string;
}

/**
 * Build the agent-visible context object for the Scheduling dashboard.
 *
 * Reports the active tab, total/active/paused/disabled job counts, the alert
 * count, the overall success rate across loaded jobs, and the jobs-tab status
 * filter. Counts are derived purely from the supplied job snapshots so this stays
 * unit-testable and decoupled from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildSchedulingAgentContext(input: SchedulingAgentContextInput): Record<string, unknown> {
    const total = input.Jobs.length;
    const active = input.Jobs.filter(j => j.Status === 'Active').length;
    const paused = input.Jobs.filter(j => j.Status === 'Paused').length;
    const disabled = input.Jobs.filter(j => j.Status === 'Disabled').length;

    const ratedJobs = input.Jobs.filter(j => j.TotalRuns > 0);
    const successRate = ratedJobs.length > 0
        ? ratedJobs.reduce((sum, j) => sum + j.SuccessRate, 0) / ratedJobs.length
        : 0;

    return {
        ActiveTab: input.ActiveTab,
        TotalJobs: total,
        ActiveJobCount: active,
        PausedJobCount: paused,
        DisabledJobCount: disabled,
        AlertCount: input.AlertCount,
        SuccessRate: Math.round(successRate * 1000) / 1000,
        StatusFilter: input.StatusFilter,
    };
}
