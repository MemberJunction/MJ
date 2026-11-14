import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, LOCALE_ID, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import type { MJListEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import type { ApplyResult, ListRefreshPreview } from '@memberjunction/lists-base';

import type {
  ListRefreshSummary,
  ListSourceDiff,
  ListSourceDiffLine,
  ListSourceKind,
  ListSourceParameterInfo,
} from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';

/** The list fields the review reads that the refresh summary doesn't carry. */
type ListReviewRow = Pick<MJListEntity, 'ID' | 'SourceFingerprint' | 'SourceQueryParameters'>;

/** Shortens a fingerprint for display: first 4 and last 3 characters. */
export function ShortFingerprint(fingerprint: string | null | undefined): string {
  if (!fingerprint) return '—';
  return fingerprint.length <= 10 ? fingerprint : `${fingerprint.slice(0, 4)}…${fingerprint.slice(-3)}`;
}

/**
 * Review a change to a list's source (mockup board 4): what changed (a SQL or filter diff against
 * the version the list last approved, from Record Changes), any new query parameter values, a
 * preview of what approving would do, and the owner's decision.
 *
 * Approving needs a current preview, so the owner sees the records it would add and remove first;
 * removals must be acknowledged, and the approval then passes `confirmDrops`.
 */
@Component({
  standalone: false,
  selector: 'mj-list-source-review',
  templateUrl: './list-source-review.component.html',
  styleUrls: ['./list-source-review.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSourceReviewComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly refreshService = inject(ListRefreshService);
  private readonly confirmService = inject(MJConfirmService);
  private readonly locale = inject(LOCALE_ID);

  /** The list whose source changed. Required. */
  @Input()
  set ListID(value: string | null) {
    if (value === this._listID) return;
    this._listID = value;
    if (value) void this.loadAsync(value);
  }
  get ListID(): string | null {
    return this._listID;
  }
  private _listID: string | null = null;

  /** Only the owner can approve, keep paused or unlink; anyone else sees the change read-only. */
  @Input()
  set IsOwner(value: boolean) {
    this._isOwner = value;
    if (value && this.ListID && !this.Loading && !this.Preview) void this.RunPreviewAsync();
  }
  get IsOwner(): boolean {
    return this._isOwner;
  }
  private _isOwner = false;

  /** The owner approved: refreshes resumed and the list refreshed. Carries the refresh result. */
  @Output() Approved = new EventEmitter<ApplyResult>();
  /** The owner chose to keep refreshes paused. */
  @Output() KeepPaused = new EventEmitter<void>();
  /** The owner unlinked the source, keeping the records. */
  @Output() Unlinked = new EventEmitter<void>();
  /** Open the source view or query. The host navigates. */
  @Output() OpenSource = new EventEmitter<{ Kind: ListSourceKind; ID: string }>();

  public Loading = false;
  public LoadError: string | null = null;
  public Summary: ListRefreshSummary | null = null;
  public Diff: ListSourceDiff | null = null;
  public LinkedFingerprint: string | null = null;
  public CurrentFingerprint: string | null = null;
  public Parameters: ListSourceParameterInfo[] = [];
  public ParameterValues: Record<string, string> = {};

  public Preview: ListRefreshPreview | null = null;
  public Previewing = false;
  public PreviewError: string | null = null;
  public RemovalsAcknowledged = false;

  public Acting = false;
  public ActionError: string | null = null;

  // --- derived view state -------------------------------------------------

  public get SourceKindLabel(): string {
    return this.Summary?.SourceKind === 'query' ? 'Query' : 'View';
  }

  public get SourceName(): string {
    return this.Diff?.SourceName ?? this.Summary?.SourceName ?? '';
  }

  public get DiffLines(): ListSourceDiffLine[] {
    return this.Diff?.Lines ?? [];
  }

  public get HasApprovedCopy(): boolean {
    return this.Diff?.Before !== null && this.Diff?.Before !== undefined;
  }

  public get ShortLinked(): string {
    return ShortFingerprint(this.LinkedFingerprint);
  }

  /** The linked fingerprint, with the date it was approved when Record Changes has it. */
  public get LinkedVersionLabel(): string {
    const at = this.Diff?.ApprovedAt;
    return at ? `${this.ShortLinked} (${formatDate(at, 'MMM d', this.locale)})` : this.ShortLinked;
  }

  /** Says the routine is paused only once it is; until then, that refreshes stop. */
  public get BannerTitle(): string {
    const kind = this.SourceKindLabel.toLowerCase();
    return this.Summary?.Routine?.Status === 'Paused'
      ? `This list's source ${kind} changed, so scheduled refreshes are paused.`
      : `This list's source ${kind} changed, so it won't refresh until the change is approved.`;
  }

  public get PreviewCaption(): string {
    const params = this.PreviewParameterSummary;
    return params ? `Previewed just now, ${params}.` : 'Previewed just now.';
  }

  public get ShortCurrent(): string {
    return ShortFingerprint(this.CurrentFingerprint);
  }

  public get PreviewAdd(): number {
    return this.Preview?.Delta?.Counts.Add ?? 0;
  }

  public get PreviewRemove(): number {
    return this.Preview?.Delta?.Counts.Remove ?? 0;
  }

  public get PreviewResultCount(): number {
    const counts = this.Preview?.Delta?.Counts;
    return counts ? counts.TargetTotal + counts.Add - counts.Remove : 0;
  }

  public get PreviewParameterSummary(): string {
    const parts = this.Parameters
      .filter((p) => this.ParameterValues[p.Name]?.trim())
      .map((p) => `${p.Name} = ${this.ParameterValues[p.Name].trim()}`);
    return parts.length ? `with ${parts.join(', ')}` : '';
  }

  public get MissingRequiredParameters(): string[] {
    return this.Parameters.filter((p) => p.IsRequired && !this.ParameterValues[p.Name]?.trim()).map((p) => p.Name);
  }

  public get NeedsAcknowledgement(): boolean {
    return this.PreviewRemove > 0;
  }

  public get CanApprove(): boolean {
    return this.IsOwner
      && !this.Acting
      && !this.Previewing
      && !!this.Preview?.Delta
      && this.MissingRequiredParameters.length === 0
      && (!this.NeedsAcknowledgement || this.RemovalsAcknowledged);
  }

  // --- user actions ---------------------------------------------------------

  public OnParameterChange(name: string, value: string): void {
    this.ParameterValues = { ...this.ParameterValues, [name]: value };
    // The preview no longer matches what approving would apply.
    this.Preview = null;
    this.RemovalsAcknowledged = false;
    this.cdr.markForCheck();
  }

  public OnAcknowledge(value: boolean): void {
    this.RemovalsAcknowledged = value;
    this.cdr.markForCheck();
  }

  public OnOpenSource(): void {
    if (this.Summary?.SourceKind && this.Summary.SourceID) {
      this.OpenSource.emit({ Kind: this.Summary.SourceKind, ID: this.Summary.SourceID });
    }
  }

  public OnKeepPaused(): void {
    this.KeepPaused.emit();
  }

  /** Previews what approving the source's current definition would apply. */
  public async RunPreviewAsync(): Promise<void> {
    const listID = this.ListID;
    if (!listID || !this.IsOwner || this.MissingRequiredParameters.length > 0) return;
    this.Previewing = true;
    this.PreviewError = null;
    this.RemovalsAcknowledged = false;
    this.cdr.markForCheck();
    try {
      this.refreshService.Provider = this.ProviderToUse;
      const preview = await this.refreshService.PreviewRefreshAsync(listID, {
        AcceptCurrentSource: true,
        Parameters: this.parameterPayload(),
      });
      this.Preview = preview.Success ? preview : null;
      this.PreviewError = preview.Success ? null : preview.Message;
    } catch (e) {
      this.Preview = null;
      this.PreviewError = errorText(e);
    } finally {
      this.Previewing = false;
      this.cdr.markForCheck();
    }
  }

  public async OnApproveAsync(): Promise<void> {
    const listID = this.ListID;
    if (!listID || !this.CanApprove) return;
    await this.runActionAsync(async () => {
      const result = await this.refreshService.ApproveSourceAsync(listID, this.NeedsAcknowledgement, this.parameterPayload());
      if (!result.Success) throw new Error(result.Message);
      this.Approved.emit(result);
    });
  }

  public async OnUnlinkAsync(): Promise<void> {
    const listID = this.ListID;
    if (!listID || !this.IsOwner) return;
    const confirmed = await this.confirmService.Confirm({
      title: 'Unlink source',
      message: `Unlink this list from ${this.SourceKindLabel.toLowerCase()} "${this.SourceName}"?`,
      detail: 'The records stay in the list. It stops refreshing, and its refresh routine is turned off.',
      confirmText: 'Unlink and keep records',
      type: 'warning',
    });
    if (!confirmed) return;
    await this.runActionAsync(async () => {
      await this.refreshService.UnlinkSourceAsync(listID);
      this.Unlinked.emit();
    });
  }

  public TrackLine(index: number, line: ListSourceDiffLine): string {
    return `${index}:${line.Kind}:${line.OldNumber ?? ''}:${line.NewNumber ?? ''}`;
  }

  // --- loading --------------------------------------------------------------

  private async loadAsync(listID: string): Promise<void> {
    this.resetState();
    this.Loading = true;
    this.cdr.markForCheck();
    try {
      this.refreshService.Provider = this.ProviderToUse;
      const [summary, diff, row] = await Promise.all([
        this.refreshService.LoadSummaryAsync(listID),
        this.refreshService.LoadSourceDiffAsync(listID),
        this.loadListRowAsync(listID),
      ]);
      if (listID !== this.ListID) return;
      this.Summary = summary;
      this.Diff = diff;
      this.LinkedFingerprint = row?.SourceFingerprint ?? null;
      await this.loadSourceDetailsAsync(summary, row);
    } catch (e) {
      this.LoadError = errorText(e);
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
    if (this.IsOwner && !this.LoadError) await this.RunPreviewAsync();
  }

  /** The source's current fingerprint and, for a query, its parameters with the list's values. */
  private async loadSourceDetailsAsync(summary: ListRefreshSummary | null, row: ListReviewRow | null): Promise<void> {
    if (!summary?.SourceKind || !summary.SourceID) return;
    const [fingerprint, parameters] = await Promise.all([
      this.loadSourceFingerprintAsync(summary.SourceKind, summary.SourceID),
      summary.SourceKind === 'query'
        ? this.refreshService.LoadSourceParametersAsync(summary.SourceID, row?.SourceQueryParameters ?? null)
        : Promise.resolve([] as ListSourceParameterInfo[]),
    ]);
    this.CurrentFingerprint = fingerprint;
    this.Parameters = parameters;
    this.ParameterValues = Object.fromEntries(parameters.map((p) => [p.Name, p.CurrentValue ?? '']));
  }

  private async loadListRowAsync(listID: string): Promise<ListReviewRow | null> {
    const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<ListReviewRow>({
      EntityName: 'MJ: Lists',
      ExtraFilter: `ID='${EscapeSQLString(listID)}'`,
      Fields: ['ID', 'SourceFingerprint', 'SourceQueryParameters'],
      ResultType: 'simple',
    });
    return result.Success ? result.Results?.[0] ?? null : null;
  }

  private async loadSourceFingerprintAsync(kind: ListSourceKind, sourceID: string): Promise<string | null> {
    const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{ DefinitionFingerprint: string | null }>({
      EntityName: kind === 'query' ? 'MJ: Queries' : 'MJ: User Views',
      ExtraFilter: `ID='${EscapeSQLString(sourceID)}'`,
      Fields: ['ID', 'DefinitionFingerprint'],
      ResultType: 'simple',
    });
    return result.Success ? result.Results?.[0]?.DefinitionFingerprint ?? null : null;
  }

  private resetState(): void {
    this.LoadError = null;
    this.Summary = null;
    this.Diff = null;
    this.LinkedFingerprint = null;
    this.CurrentFingerprint = null;
    this.Parameters = [];
    this.ParameterValues = {};
    this.Preview = null;
    this.PreviewError = null;
    this.RemovalsAcknowledged = false;
    this.ActionError = null;
  }

  /** The parameter values to preview or approve with, or undefined for a view or a query without parameters. */
  private parameterPayload(): Record<string, unknown> | undefined {
    if (this.Summary?.SourceKind !== 'query' || this.Parameters.length === 0) return undefined;
    const payload: Record<string, unknown> = {};
    for (const p of this.Parameters) {
      const value = this.ParameterValues[p.Name]?.trim();
      if (value) payload[p.Name] = value;
    }
    return payload;
  }

  private async runActionAsync(work: () => Promise<void>): Promise<void> {
    this.Acting = true;
    this.ActionError = null;
    this.cdr.markForCheck();
    try {
      this.refreshService.Provider = this.ProviderToUse;
      await work();
    } catch (e) {
      this.ActionError = errorText(e);
    } finally {
      this.Acting = false;
      this.cdr.markForCheck();
    }
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
