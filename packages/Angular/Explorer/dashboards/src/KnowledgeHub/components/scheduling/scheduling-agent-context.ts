/**
 * @fileoverview Pure, framework-agnostic helpers for the Knowledge Hub
 * **Scheduling** resource component's AI-agent integration.
 *
 * Free of Angular / component dependencies so they can be unit-tested in
 * isolation. The component supplies plain snapshots of its job + run state and
 * these helpers shape the deep agent context + resolve agent-supplied job
 * references (by id → name → contains).
 *
 * 🔒 SAFETY: these helpers only PROJECT state and RESOLVE references — no
 * mutation, no side effects.
 */

import { boundNameList, AGENT_CONTEXT_NAME_LIST_CAP } from '../../../shared/agent-tool-validation';

/** The status values a scheduled job can hold (the FilterSchedulesByStatus tool's domain). */
export const VALID_SCHEDULE_STATUSES = ['Active', 'Paused', 'Disabled'] as const;
export type ScheduleStatus = (typeof VALID_SCHEDULE_STATUSES)[number];

/**
 * The salient slice of a scheduled job the agent reasons over. Structurally a
 * subset of `MJScheduledJobEntity` so the component can pass its jobs in.
 */
export interface ScheduledJobCandidate {
    ID: string;
    Name: string;
    Description?: string | null;
    Status: string;
    CronExpression?: string | null;
    NextRunAt?: Date | string | null;
    LastRunAt?: Date | string | null;
    RunCount?: number;
    SuccessCount?: number;
}

/**
 * Resolve a job reference the way the agent expresses it — by id (exact,
 * case-insensitive) → name (exact, case-insensitive) → name *contains*
 * (case-insensitive). Pure + deterministic.
 *
 * @returns the matched job, or null on a miss.
 */
export function resolveScheduledJob<T extends { ID: string; Name: string }>(
    input: string,
    jobs: readonly T[],
): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) return null;
    const byID = jobs.find(j => j.ID.toLowerCase() === needle);
    if (byID) return byID;
    const byName = jobs.find(j => j.Name.toLowerCase() === needle);
    if (byName) return byName;
    return jobs.find(j => j.Name.toLowerCase().includes(needle)) ?? null;
}

/** Build a tolerant "no schedule matches" error listing a bounded sample of names. */
export function buildScheduleNotFoundError(input: string, available: readonly string[]): string {
    const sample = boundNameList(available, 10).join(', ');
    const more = available.length > 10 ? ` (+${available.length - 10} more)` : '';
    return `No scheduled job matches "${input}". Available jobs: ${sample}${more}.`;
}

/** Component-supplied snapshot for the Scheduling agent context. */
export interface SchedulingAgentContextInput {
    /** Every scheduled job (unfiltered). */
    AllJobs: ScheduledJobCandidate[];
    /** Jobs after the status + search filters — what the cards render. */
    FilteredJobs: ScheduledJobCandidate[];
    /** The active status filter ('' = All). */
    StatusFilter: string;
    /** The active search query. */
    SearchQuery: string;
    /** Recent run rows (newest first) — drives RecentRunCount + the next-due rollup. */
    RecentRunCount: number;
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
}

/** Count jobs in a particular status (case-sensitive on the stored value). */
function countByStatus(jobs: readonly ScheduledJobCandidate[], status: string): number {
    return jobs.filter(j => j.Status === status).length;
}

/**
 * Find the name of the job that is due next, scanning `NextRunAt` for the
 * smallest future-or-now timestamp. Returns null when no job has a NextRunAt.
 * Pure + deterministic.
 */
export function nextDueJobName(jobs: readonly ScheduledJobCandidate[]): string | null {
    let best: ScheduledJobCandidate | null = null;
    let bestTime = Infinity;
    for (const j of jobs) {
        if (!j.NextRunAt) continue;
        const t = new Date(j.NextRunAt).getTime();
        if (Number.isFinite(t) && t < bestTime) {
            bestTime = t;
            best = j;
        }
    }
    return best?.Name ?? null;
}

/**
 * Build the agent-visible context for the Scheduling surface. Publishes deep
 * counts (by lifecycle status), the active status filter + search, the next-due
 * job, and a **bounded** structured list of the filtered jobs (name · status ·
 * cron · success rate) so the agent can pick one to edit/open. A companion
 * truncation flag tells it when the list is capped.
 */
export function buildSchedulingAgentContext(
    input: SchedulingAgentContextInput,
): Record<string, unknown> {
    const all = input.AllJobs;
    const filtered = input.FilteredJobs;

    const ctx: Record<string, unknown> = {
        IsLoading: input.IsLoading,
        TotalJobs: all.length,
        VisibleJobs: filtered.length,
        ActiveCount: countByStatus(all, 'Active'),
        PausedCount: countByStatus(all, 'Paused'),
        DisabledCount: countByStatus(all, 'Disabled'),
        StatusFilter: input.StatusFilter || 'All',
        SearchQuery: input.SearchQuery,
        RecentRunCount: input.RecentRunCount,
        NextDueJobName: nextDueJobName(all),

        VisibleJobNames: boundNameList(filtered.map(j => j.Name)),
        Jobs: filtered.slice(0, AGENT_CONTEXT_NAME_LIST_CAP).map(j => ({
            Name: j.Name,
            Status: j.Status,
            Cron: j.CronExpression ?? null,
            SuccessRate:
                j.RunCount && j.RunCount > 0
                    ? Math.round(((j.SuccessCount ?? 0) / j.RunCount) * 100)
                    : null,
        })),
    };

    if (filtered.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        ctx['JobsTruncated'] = true;
    }

    return ctx;
}
