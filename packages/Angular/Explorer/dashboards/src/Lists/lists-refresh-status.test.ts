import { describe, expect, it, vi } from 'vitest';

// The Angular library is not loaded in node specs; only its two pure exports are used here.
vi.mock('@memberjunction/ng-list-management', () => ({
  LIST_REFRESH_ATTENTION_STATUSES: ['SourceChanged', 'Paused', 'Failed'],
  DescribeCron: (cron: string | null) => (cron === '0 2 * * *' ? 'Daily at 2:00 am' : cron ?? 'No schedule'),
}));

import type { ListRefreshStatus, ListRefreshSummary } from '@memberjunction/ng-list-management';
import {
  AttentionMessage,
  ComputeRefreshStats,
  CountRefreshFilters,
  MatchesRefreshFilter,
  NeedsAttention,
  RefreshStatusLabel,
  RefreshStatusTone,
  ScheduleLabel,
  SelectUpcomingRefreshes,
  SourceLabel,
} from './lists-refresh-status';

function summary(fields: Partial<ListRefreshSummary> = {}): ListRefreshSummary {
  return {
    ListID: 'list-1', ListName: 'Members', EntityName: 'Contacts', OwnerID: 'u-1', OwnerName: 'Owner',
    SourceKind: 'view', SourceID: 'v-1', SourceName: 'Active members', RefreshMode: 'Sync',
    AutoRefresh: true, UseSnapshot: false, LastRefreshedAt: null, LastRefreshedBy: null,
    Routine: {
      ID: 'r-1', Name: 'Refresh list: Members', Status: 'Active', CronExpression: '0 2 * * *',
      Timezone: 'America/New_York', NextRunAt: null, LastRunAt: null, LastRunStatus: null,
    },
    Status: 'Scheduled',
    ...fields,
  };
}

describe('status labels and tones', () => {
  it.each<[ListRefreshStatus, string, string]>([
    ['Scheduled', 'Self-updating · Scheduled', 'success'],
    ['Manual', 'Self-updating · Manual', 'neutral'],
    ['Paused', 'Paused: source changed', 'warning'],
    ['SourceChanged', 'Source changed', 'warning'],
    ['Failed', 'Failed last run', 'danger'],
    ['Static', 'Static', 'neutral'],
  ])('%s reads "%s" in a %s pill', (status, label, tone) => {
    expect(RefreshStatusLabel(status)).toBe(label);
    expect(RefreshStatusTone(status)).toBe(tone);
  });

  it('only a changed source or a failed run needs attention', () => {
    expect(['Paused', 'SourceChanged', 'Failed'].every((s) => NeedsAttention(s as ListRefreshStatus))).toBe(true);
    expect(['Scheduled', 'Manual', 'Static'].some((s) => NeedsAttention(s as ListRefreshStatus))).toBe(false);
  });
});

describe('browse filter', () => {
  it('treats a list with no summary as static', () => {
    expect(MatchesRefreshFilter('static', null)).toBe(true);
    expect(MatchesRefreshFilter('self-updating', null)).toBe(false);
  });

  it('counts each chip', () => {
    expect(CountRefreshFilters([null, 'Static', 'Scheduled', 'Paused', 'Failed'])).toEqual({
      All: 5, SelfUpdating: 3, Static: 2, Attention: 2,
    });
  });
});

describe('labels', () => {
  it('names the source kind', () => {
    expect(SourceLabel(summary())).toBe('View: Active members');
    expect(SourceLabel(summary({ SourceKind: 'query', SourceName: 'Lapsed donors' }))).toBe('Query: Lapsed donors');
    expect(SourceLabel(summary({ SourceKind: null }))).toBe('');
  });

  it('describes the schedule, or says manual only', () => {
    expect(ScheduleLabel(summary())).toBe('Daily at 2:00 am (America/New_York)');
    expect(ScheduleLabel(summary({ AutoRefresh: false }))).toBe('Manual only');
    expect(ScheduleLabel(summary({ Routine: null }))).toBe('Manual only');
  });

  it('explains why a list needs attention', () => {
    expect(AttentionMessage(summary({ Status: 'Paused', SourceKind: 'query' }))).toMatch(/source query changed.*paused/);
    expect(AttentionMessage(summary({ Status: 'Failed' }))).toMatch(/failed/);
    expect(AttentionMessage(summary({ Status: 'Scheduled' }))).toBe('');
  });
});

describe('SelectUpcomingRefreshes', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  const at = (iso: string) => new Date(iso);
  const routine = summary().Routine!;

  it('lists active routines due in the next 24 hours, soonest first, then paused ones', () => {
    const result = SelectUpcomingRefreshes([
      summary({ ListID: 'late', ListName: 'Late', Routine: { ...routine, NextRunAt: at('2026-11-13T02:00:00Z') } }),
      summary({ ListID: 'soon', ListName: 'Soon', Routine: { ...routine, NextRunAt: at('2026-11-12T20:30:00Z') } }),
      summary({ ListID: 'far', ListName: 'Far', Routine: { ...routine, NextRunAt: at('2026-11-14T02:00:00Z') } }),
      summary({ ListID: 'paused', ListName: 'Paused', Routine: { ...routine, Status: 'Paused' } }),
      summary({ ListID: 'manual', ListName: 'Manual', AutoRefresh: false, Routine: { ...routine, NextRunAt: at('2026-11-12T13:00:00Z') } }),
    ], now);
    expect(result.map((r) => r.ListID)).toEqual(['soon', 'late', 'paused']);
    expect(result[2]).toMatchObject({ Paused: true, RunsAt: null });
  });
});

describe('ComputeRefreshStats', () => {
  it('counts self-updating, scheduled, manual-only, source-changed and failed lists', () => {
    const stats = ComputeRefreshStats([
      summary(),
      summary({ AutoRefresh: false, Status: 'Manual' }),
      summary({ Status: 'Paused', Routine: { ...summary().Routine!, Status: 'Paused' } }),
      summary({ Status: 'Failed' }),
      summary({ Status: 'Static', SourceKind: null }),
    ]);
    expect(stats).toEqual({ SelfUpdating: 4, Scheduled: 3, ManualOnly: 1, SourceChanged: 1, Failed: 1 });
  });
});
