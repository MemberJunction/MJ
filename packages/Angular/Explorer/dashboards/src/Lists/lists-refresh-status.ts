import { DescribeCron, LIST_REFRESH_ATTENTION_STATUSES } from '@memberjunction/ng-list-management';
import type { ListRefreshStatus, ListRefreshSummary } from '@memberjunction/ng-list-management';

/**
 * Pure helpers shared by the Lists browse page and the Refreshes page: how a list's refresh status
 * reads, which lists need attention, and what runs in the next 24 hours.
 */

/** The browse page's refresh filter. */
export type ListRefreshFilter = 'all' | 'self-updating' | 'static' | 'attention';

/** The visual tone of a status pill. */
export type ListRefreshTone = 'success' | 'neutral' | 'warning' | 'danger';

/** What a list's refresh status pill says. */
export function RefreshStatusLabel(status: ListRefreshStatus): string {
  switch (status) {
    case 'Scheduled': return 'Self-updating · Scheduled';
    case 'Manual': return 'Self-updating · Manual';
    case 'Paused': return 'Paused: source changed';
    case 'SourceChanged': return 'Source changed';
    case 'Failed': return 'Failed last run';
    case 'Static': return 'Static';
    default: return status;
  }
}

/** The tone of a list's refresh status pill. */
export function RefreshStatusTone(status: ListRefreshStatus): ListRefreshTone {
  switch (status) {
    case 'Scheduled': return 'success';
    case 'Paused':
    case 'SourceChanged': return 'warning';
    case 'Failed': return 'danger';
    default: return 'neutral';
  }
}

/** True when the list's owner needs to look at it: its source changed, or its last run failed. */
export function NeedsAttention(status: ListRefreshStatus): boolean {
  return LIST_REFRESH_ATTENTION_STATUSES.includes(status);
}

/** True when the list's source changed (whether or not its routine has paused yet). */
export function IsSourceChanged(status: ListRefreshStatus): boolean {
  return status === 'Paused' || status === 'SourceChanged';
}

/** Whether a list with this status (null = static, no summary) passes the browse filter. */
export function MatchesRefreshFilter(filter: ListRefreshFilter, status: ListRefreshStatus | null): boolean {
  const effective = status ?? 'Static';
  switch (filter) {
    case 'self-updating': return effective !== 'Static';
    case 'static': return effective === 'Static';
    case 'attention': return NeedsAttention(effective);
    default: return true;
  }
}

/** "View: Active members" / "Query: Lapsed donors", or '' for a static list. */
export function SourceLabel(summary: Pick<ListRefreshSummary, 'SourceKind' | 'SourceName'>): string {
  if (!summary.SourceKind) return '';
  const kind = summary.SourceKind === 'query' ? 'Query' : 'View';
  return `${kind}: ${summary.SourceName ?? '(unnamed)'}`;
}

/** The schedule a list refreshes on, in words, or "Manual only". */
export function ScheduleLabel(summary: Pick<ListRefreshSummary, 'AutoRefresh' | 'Routine'>): string {
  if (!summary.AutoRefresh || !summary.Routine || summary.Routine.Status === 'Disabled') return 'Manual only';
  const when = DescribeCron(summary.Routine.CronExpression);
  return summary.Routine.Timezone ? `${when} (${summary.Routine.Timezone})` : when;
}

/** One sentence on why a list needs attention, as the browse banner and the Refreshes cards say it. */
export function AttentionMessage(summary: Pick<ListRefreshSummary, 'Status' | 'SourceKind' | 'AutoRefresh'>): string {
  const kind = summary.SourceKind === 'query' ? 'query' : 'view';
  switch (summary.Status) {
    case 'Paused':
      return `Its source ${kind} changed. Scheduled refreshes are paused until you review the change.`;
    case 'SourceChanged':
      return summary.AutoRefresh
        ? `Its source ${kind} changed. The next scheduled refresh will pause until you review the change.`
        : `Its source ${kind} changed. Review the change before refreshing it again.`;
    case 'Failed':
      return 'Its last scheduled refresh failed. The list was not changed.';
    default:
      return '';
  }
}

/** Counts for the browse filter chips. */
export interface RefreshFilterCounts {
  All: number;
  SelfUpdating: number;
  Static: number;
  Attention: number;
}

/** Filter-chip counts over lists, given each list's status (null = static). */
export function CountRefreshFilters(statuses: Array<ListRefreshStatus | null>): RefreshFilterCounts {
  const counts: RefreshFilterCounts = { All: statuses.length, SelfUpdating: 0, Static: 0, Attention: 0 };
  for (const s of statuses) {
    if (MatchesRefreshFilter('self-updating', s)) counts.SelfUpdating++;
    else counts.Static++;
    if (MatchesRefreshFilter('attention', s)) counts.Attention++;
  }
  return counts;
}

/** One row of the Refreshes page's "Next 24 hours" list. */
export interface UpcomingRefresh {
  ListID: string;
  ListName: string;
  /** When it runs, or null for a paused routine. */
  RunsAt: Date | null;
  Paused: boolean;
}

/**
 * The scheduled refreshes due within `hours` of `now`, soonest first, followed by paused ones.
 * A list without an active scheduled routine is left out.
 */
export function SelectUpcomingRefreshes(summaries: ListRefreshSummary[], now: Date, hours = 24): UpcomingRefresh[] {
  const horizon = now.getTime() + hours * 3_600_000;
  const due: UpcomingRefresh[] = [];
  const paused: UpcomingRefresh[] = [];
  for (const s of summaries) {
    const routine = s.Routine;
    if (!routine || !s.AutoRefresh) continue;
    if (routine.Status === 'Paused') {
      paused.push({ ListID: s.ListID, ListName: s.ListName, RunsAt: null, Paused: true });
      continue;
    }
    const next = routine.NextRunAt?.getTime();
    if (routine.Status === 'Active' && next !== undefined && next >= now.getTime() && next <= horizon) {
      due.push({ ListID: s.ListID, ListName: s.ListName, RunsAt: routine.NextRunAt, Paused: false });
    }
  }
  due.sort((a, b) => (a.RunsAt?.getTime() ?? 0) - (b.RunsAt?.getTime() ?? 0));
  paused.sort((a, b) => a.ListName.localeCompare(b.ListName));
  return [...due, ...paused];
}

/** Stat tiles of the Refreshes page. */
export interface RefreshStats {
  SelfUpdating: number;
  Scheduled: number;
  ManualOnly: number;
  SourceChanged: number;
  Failed: number;
}

/** Counts the Refreshes page's stat tiles over self-updating lists. */
export function ComputeRefreshStats(summaries: ListRefreshSummary[]): RefreshStats {
  const linked = summaries.filter((s) => s.Status !== 'Static');
  const scheduled = linked.filter((s) => ScheduleLabel(s) !== 'Manual only').length;
  return {
    SelfUpdating: linked.length,
    Scheduled: scheduled,
    ManualOnly: linked.length - scheduled,
    SourceChanged: linked.filter((s) => IsSourceChanged(s.Status)).length,
    Failed: linked.filter((s) => s.Status === 'Failed').length,
  };
}
