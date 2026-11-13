import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import type { ListRefreshEventType, ListRefreshHistoryEntry } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';

/** Which history rows the table shows. */
export type ListRefreshHistoryFilter = 'all' | 'refreshes' | 'source';

/** The record-count line drawn over the history: SVG points plus its axis labels. */
export interface RecordCountChart {
  Points: string;
  Min: number;
  Max: number;
  FirstAt: Date;
  LastAt: Date;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 80;
const CHART_PAD = 4;

const RESULT_LABELS: Record<ListRefreshEventType, string> = {
  Refreshed: 'Refreshed',
  SourceChanged: 'Source changed',
  SourceApproved: 'Source approved',
};

/** Rows matching a filter chip. */
export function FilterHistory(entries: ListRefreshHistoryEntry[], filter: ListRefreshHistoryFilter): ListRefreshHistoryEntry[] {
  if (filter === 'refreshes') return entries.filter((e) => e.Type === 'Refreshed');
  if (filter === 'source') return entries.filter((e) => e.Type !== 'Refreshed');
  return entries;
}

/**
 * The record count after each refresh, oldest to newest, as a polyline in a 300×80 box. Null when
 * there are fewer than two refreshes with a count.
 */
export function BuildRecordCountChart(entries: ListRefreshHistoryEntry[]): RecordCountChart | null {
  const points = entries
    .filter((e): e is ListRefreshHistoryEntry & { RecordsAfter: number } => e.Type === 'Refreshed' && e.RecordsAfter !== null)
    .sort((a, b) => a.At.getTime() - b.At.getTime());
  if (points.length < 2) return null;
  const counts = points.map((p) => p.RecordsAfter);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const span = max - min || 1;
  const step = (CHART_WIDTH - CHART_PAD * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = CHART_PAD + i * step;
    const y = CHART_HEIGHT - CHART_PAD - ((p.RecordsAfter - min) / span) * (CHART_HEIGHT - CHART_PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { Points: coords.join(' '), Min: min, Max: max, FirstAt: points[0].At, LastAt: points[points.length - 1].At };
}

/**
 * A list's refresh history (mockup board 6): record count over time, and one row per refresh that
 * changed the list plus source-changed and source-approved events, with a detail panel. Counts only;
 * per-record detail isn't kept.
 */
@Component({
  standalone: false,
  selector: 'mj-list-refresh-history',
  templateUrl: './list-refresh-history.component.html',
  styleUrls: ['./list-refresh-history.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRefreshHistoryComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly refreshService = inject(ListRefreshService);

  /** The list. Required. */
  @Input()
  set ListID(value: string | null) {
    if (value === this._listID) return;
    this._listID = value;
    void this.loadAsync();
  }
  get ListID(): string | null {
    return this._listID;
  }
  private _listID: string | null = null;

  /** Change it (for example increment it) to reload, after a refresh. */
  @Input()
  set ReloadToken(value: number) {
    if (value === this._reloadToken) return;
    this._reloadToken = value;
    void this.loadAsync();
  }
  get ReloadToken(): number {
    return this._reloadToken;
  }
  private _reloadToken = 0;

  public Loading = false;
  public ErrorMessage: string | null = null;
  public Entries: ListRefreshHistoryEntry[] = [];
  public Filter: ListRefreshHistoryFilter = 'all';
  public Chart: RecordCountChart | null = null;
  public SelectedEntry: ListRefreshHistoryEntry | null = null;

  public get VisibleEntries(): ListRefreshHistoryEntry[] {
    return FilterHistory(this.Entries, this.Filter);
  }

  public get RefreshCount(): number {
    return FilterHistory(this.Entries, 'refreshes').length;
  }

  public get SourceEventCount(): number {
    return FilterHistory(this.Entries, 'source').length;
  }

  public ResultLabel(entry: ListRefreshHistoryEntry): string {
    return RESULT_LABELS[entry.Type];
  }

  public SourceLabel(entry: ListRefreshHistoryEntry): string {
    if (!entry.SourceName) return '—';
    return `${entry.SourceKind === 'query' ? 'Query' : 'View'}: ${entry.SourceName}`;
  }

  public ShortFingerprint(fingerprint: string | null): string {
    if (!fingerprint) return '—';
    return fingerprint.length <= 10 ? fingerprint : `${fingerprint.slice(0, 4)}…${fingerprint.slice(-3)}`;
  }

  public OnFilter(filter: ListRefreshHistoryFilter): void {
    this.Filter = filter;
    this.cdr.markForCheck();
  }

  public OnSelect(entry: ListRefreshHistoryEntry): void {
    this.SelectedEntry = entry;
    this.cdr.markForCheck();
  }

  public OnCloseDetail(): void {
    this.SelectedEntry = null;
    this.cdr.markForCheck();
  }

  private async loadAsync(): Promise<void> {
    const listID = this.ListID;
    if (!listID) {
      this.Entries = [];
      this.Chart = null;
      this.cdr.markForCheck();
      return;
    }
    this.Loading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      this.refreshService.Provider = this.ProviderToUse;
      const entries = await this.refreshService.LoadHistoryAsync(listID);
      if (listID !== this.ListID) return;
      this.Entries = entries;
      this.Chart = BuildRecordCountChart(entries);
    } catch (e) {
      this.ErrorMessage = e instanceof Error ? e.message : String(e);
      this.Entries = [];
      this.Chart = null;
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }
}
