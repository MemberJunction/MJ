import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJAlertComponent, MJEmptyStateComponent, MJFilterChipComponent, MjSlidePanelComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';

import type { ListRefreshHistoryEntry } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';
import { BuildRecordCountChart, FilterHistory, ListRefreshHistoryComponent } from './list-refresh-history.component';

function entry(id: string, type: ListRefreshHistoryEntry['Type'], at: string, after: number | null, added: number | null = null, removed: number | null = null): ListRefreshHistoryEntry {
  return {
    ID: id, At: new Date(at), Type: type, UserName: 'Yuri Lee', Description: `event ${id}`,
    Mode: type === 'Refreshed' ? 'Sync' : null, Added: added, Removed: removed, Failed: type === 'Refreshed' ? 0 : null,
    RecordsBefore: after !== null ? after - (added ?? 0) + (removed ?? 0) : null, RecordsAfter: after,
    SourceKind: 'view', SourceName: 'Live CONF2026 registrants', SourceFingerprint: '3f9a0000000000c21',
  };
}

// Newest first, as the service returns them.
const ENTRIES = [
  entry('e3', 'Refreshed', '2026-11-12T20:31:00Z', 936, 4, 0),
  entry('e2', 'SourceApproved', '2026-11-11T10:00:00Z', null),
  entry('e1', 'Refreshed', '2026-11-10T20:30:00Z', 932, 7, 1),
];

async function render(entries: ListRefreshHistoryEntry[] = ENTRIES) {
  const service = { Provider: null as unknown, LoadHistoryAsync: vi.fn(async () => entries) };
  const f = renderComponentFixture(ListRefreshHistoryComponent, {
    imports: [CommonModule, SharedGenericModule, MJAlertComponent, MJEmptyStateComponent, MJFilterChipComponent, MjSlidePanelComponent],
    declarations: [ListRefreshHistoryComponent],
    providers: [{ provide: ListRefreshService, useValue: service }],
    inputs: { ListID: 'list-1' },
  });
  await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
  return { f, service };
}

describe('history helpers', () => {
  it('filters to refreshes or to source events', () => {
    expect(FilterHistory(ENTRIES, 'refreshes').map((e) => e.ID)).toEqual(['e3', 'e1']);
    expect(FilterHistory(ENTRIES, 'source').map((e) => e.ID)).toEqual(['e2']);
    expect(FilterHistory(ENTRIES, 'all')).toHaveLength(3);
  });

  it('charts refresh counts oldest to newest, and needs two points', () => {
    const chart = BuildRecordCountChart(ENTRIES);
    expect(chart).toMatchObject({ Min: 932, Max: 936 });
    expect(chart?.FirstAt.toISOString()).toBe('2026-11-10T20:30:00.000Z');
    expect(BuildRecordCountChart([ENTRIES[0]])).toBeNull();
  });

  it('draws a step: the count holds level until the next refresh, then jumps', () => {
    // 932 at the bottom (y 76), 936 at the top (y 4); the middle point is the corner of the step.
    expect(BuildRecordCountChart(ENTRIES)?.Points).toBe('4.0,76.0 296.0,76.0 296.0,4.0');
  });
});

describe('ListRefreshHistoryComponent (DOM)', () => {
  it('renders a row per history entry, with changes and the record count after', async () => {
    const { f } = await render();
    const rows = queryAll(f, '.history-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('+4');
    expect(rows[0].textContent).toContain('936');
    expect(rows[1].textContent).toContain('Source approved');
    expect(query(f, '.history-chart__line')).not.toBeNull();
  });

  it('the filter chips narrow the table', async () => {
    const { f } = await render();
    f.componentInstance.OnFilter('source');
    f.detectChanges();
    expect(queryAll(f, '.history-row')).toHaveLength(1);
    f.componentInstance.OnFilter('refreshes');
    f.detectChanges();
    expect(queryAll(f, '.history-row')).toHaveLength(2);
  });

  it('opens a detail panel for a row', async () => {
    const { f } = await render();
    (queryAll(f, '.history-row')[0] as HTMLElement).click();
    f.detectChanges();
    expect(query(f, '.history-detail')).not.toBeNull();
    expect(text(f, '.history-detail__facts')).toContain('Sync');
    expect(text(f, '.history-detail__note')).toContain("Per-record detail isn't kept");
  });

  it('shows the empty state with no history', async () => {
    const { f } = await render([]);
    expect(query(f, '.history-empty')).not.toBeNull();
    expect(query(f, '.history-chart')).toBeNull();
  });

  it('reloads when ReloadToken changes', async () => {
    const { f, service } = await render();
    f.componentRef.setInput('ReloadToken', 1);
    await new Promise((r) => setTimeout(r, 0));
    expect(service.LoadHistoryAsync).toHaveBeenCalledTimes(2);
  });
});
