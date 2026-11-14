import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { MJListEntity } from '@memberjunction/core-entities';
import type { ApplyResult, ListDelta } from '@memberjunction/lists-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJConfirmService } from '@memberjunction/ng-ui-components';

import { LIST_REFRESH_ATTENTION_STATUSES, ListRefreshSummary, ListSourceKind } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';
import { DescribeCron } from '../../utils/cron-description';

/** Short labels and explanations for each refresh mode. */
const MODE_HELP: Record<MJListEntity['RefreshMode'], string> = {
  Additive: 'Additive only adds records that newly match. Nothing is ever removed.',
  Sync: 'Sync adds new matches and removes records that no longer match.',
};

/**
 * The "Source & refresh" card of the List form (mockup board 3): which view or query the list
 * refreshes from and whether it still matches the approved version, the refresh mode, Refresh
 * automatically with the routine's schedule, and Refresh now (with a preview before anything
 * changes). Generic: it never navigates; the host handles the events that open other records.
 */
@Component({
  standalone: false,
  selector: 'mj-list-source-refresh-panel',
  templateUrl: './list-source-refresh-panel.component.html',
  styleUrls: ['./list-source-refresh-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSourceRefreshPanelComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly refresh = inject(ListRefreshService);
  private readonly confirm = inject(MJConfirmService);

  /** The list. Required. */
  @Input()
  get ListID(): string | null {
    return this._listID;
  }
  set ListID(value: string | null) {
    if (value !== this._listID) {
      this._listID = value;
      void this.LoadAsync();
    }
  }
  private _listID: string | null = null;

  /** Only the owner can link a source or turn on Refresh automatically (the server enforces it too). */
  @Input() IsOwner = false;

  /** Whether the current user can edit the list: change the mode, refresh now, turn auto refresh off. */
  @Input() CanEdit = false;

  /** Change it (for example increment it) to reload, after the host saved the list. */
  @Input()
  get ReloadToken(): number {
    return this._reloadToken;
  }
  set ReloadToken(value: number) {
    if (value !== this._reloadToken) {
      this._reloadToken = value;
      void this.LoadAsync();
    }
  }
  private _reloadToken = 0;

  /** Link a source, or change it. The host opens the link dialog. */
  @Output() ChangeSource = new EventEmitter<void>();
  /** The source changed since it was approved: the host shows the review screen. */
  @Output() ReviewSourceChange = new EventEmitter<void>();
  /** Open the list's refresh routine. Carries the routine ID. */
  @Output() OpenRoutine = new EventEmitter<string>();
  /** Open the source view or query. */
  @Output() OpenSource = new EventEmitter<{ Kind: ListSourceKind; ID: string }>();
  /** The list or its records changed here (a refresh, a setting, an unlink): the host reloads. */
  @Output() Changed = new EventEmitter<ApplyResult | null>();

  public Summary: ListRefreshSummary | null = null;
  public IsLoading = false;
  public IsBusy = false;
  public ErrorMessage: string | null = null;
  public ResultMessage: string | null = null;

  /** The preview shown before Refresh now applies anything. */
  public PreviewDelta: ListDelta | null = null;
  public PreviewVisible = false;

  public get HasSource(): boolean {
    return !!this.Summary?.SourceKind;
  }

  public get NeedsReview(): boolean {
    return !!this.Summary && LIST_REFRESH_ATTENTION_STATUSES.includes(this.Summary.Status) && this.Summary.Status !== 'Failed';
  }

  /** Linked but never filled: the fill on link didn't run or failed, so it isn't known to match yet. */
  public get NeverRefreshed(): boolean {
    return this.HasSource && !!this.Summary && !this.Summary.UseSnapshot && !this.Summary.LastRefreshedAt;
  }

  /** The routine's last scheduled run failed. */
  public get LastRunFailed(): boolean {
    return this.Summary?.Status === 'Failed';
  }

  public get SourceKindLabel(): string {
    return this.Summary?.SourceKind === 'query' ? 'Query' : 'View';
  }

  public get ModeHelp(): string {
    return this.Summary ? MODE_HELP[this.Summary.RefreshMode] : '';
  }

  public get ScheduleText(): string {
    const routine = this.Summary?.Routine;
    if (!routine) return 'Daily, on the Lists app default schedule';
    return `${DescribeCron(routine.CronExpression)} · ${routine.Timezone}`;
  }

  public get RoutineIsPaused(): boolean {
    return this.Summary?.Routine?.Status === 'Paused';
  }

  /** Turning auto refresh on is owner only; turning it off is open to anyone who can edit. */
  public get CanToggleAutoRefresh(): boolean {
    if (!this.Summary || !this.HasSource || this.IsBusy) return false;
    return this.Summary.AutoRefresh ? this.CanEdit || this.IsOwner : this.IsOwner;
  }

  public async LoadAsync(): Promise<void> {
    if (!this._listID) return;
    this.IsLoading = !this.Summary;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      this.refresh.Provider = this.ProviderToUse;
      this.Summary = await this.refresh.LoadSummaryAsync(this._listID);
    } catch (e) {
      this.ErrorMessage = errorText(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Previews a refresh; the preview dialog applies it on confirm. */
  public async OnRefreshNow(): Promise<void> {
    if (!this._listID || this.IsBusy) return;
    await this.runBusy(async () => {
      const preview = await this.refresh.PreviewRefreshAsync(this._listID!);
      if (preview.ResultCode === 'SOURCE_CHANGED') {
        await this.LoadAsync();
        this.ReviewSourceChange.emit();
        return;
      }
      if (!preview.Success || !preview.Delta) throw new Error(preview.Message);
      if (preview.Delta.Counts.Add === 0 && preview.Delta.Counts.Remove === 0) {
        this.ResultMessage = 'Already up to date: the source has no new or removed records.';
        return;
      }
      this.PreviewDelta = preview.Delta;
      this.PreviewVisible = true;
    });
  }

  public async OnPreviewConfirmed(): Promise<void> {
    const delta = this.PreviewDelta;
    this.PreviewVisible = false;
    if (!delta) return;
    await this.runBusy(async () => {
      const result = await this.refresh.ApplyRefreshAsync(delta, delta.Counts.Remove > 0);
      if (!result.Success) throw new Error(result.Message);
      this.ResultMessage = `Refreshed: +${result.Counts?.Added ?? 0} / −${result.Counts?.Removed ?? 0}.`;
      this.PreviewDelta = null;
      await this.LoadAsync();
      this.Changed.emit(result);
    });
  }

  public OnPreviewCancelled(): void {
    this.PreviewVisible = false;
    this.PreviewDelta = null;
    this.cdr.markForCheck();
  }

  public async OnModeChange(mode: MJListEntity['RefreshMode']): Promise<void> {
    if (!this._listID || !this.Summary || this.Summary.RefreshMode === mode || !this.CanEdit) return;
    await this.saveSetting({ RefreshMode: mode });
  }

  public async OnAutoRefreshChange(on: boolean): Promise<void> {
    if (!this._listID || !this.Summary || this.Summary.AutoRefresh === on) return;
    await this.saveSetting({ AutoRefresh: on });
  }

  public async OnUnlink(): Promise<void> {
    if (!this._listID || !this.IsOwner) return;
    const ok = await this.confirm.Confirm({
      title: 'Unlink source',
      message: `Unlink this list from its ${this.SourceKindLabel.toLowerCase()} "${this.Summary?.SourceName ?? ''}"?`,
      detail: 'The records stay in the list. It stops refreshing, and its refresh routine is turned off.',
      type: 'warning',
      confirmText: 'Unlink',
    });
    if (!ok) return;
    await this.runBusy(async () => {
      await this.refresh.UnlinkSourceAsync(this._listID!);
      await this.LoadAsync();
      this.Changed.emit(null);
    });
  }

  public OnOpenSource(): void {
    if (this.Summary?.SourceKind && this.Summary.SourceID) {
      this.OpenSource.emit({ Kind: this.Summary.SourceKind, ID: this.Summary.SourceID });
    }
  }

  public OnOpenRoutine(): void {
    if (this.Summary?.Routine) this.OpenRoutine.emit(this.Summary.Routine.ID);
  }

  private async saveSetting(change: Partial<Pick<MJListEntity, 'AutoRefresh' | 'RefreshMode'>>): Promise<void> {
    await this.runBusy(async () => {
      await this.refresh.UpdateListAsync(this._listID!, change);
      await this.LoadAsync();
      this.Changed.emit(null);
    });
  }

  private async runBusy(work: () => Promise<void>): Promise<void> {
    this.IsBusy = true;
    this.ErrorMessage = null;
    this.ResultMessage = null;
    this.cdr.markForCheck();
    try {
      this.refresh.Provider = this.ProviderToUse;
      await work();
    } catch (e) {
      this.ErrorMessage = errorText(e);
    } finally {
      this.IsBusy = false;
      this.cdr.markForCheck();
    }
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
