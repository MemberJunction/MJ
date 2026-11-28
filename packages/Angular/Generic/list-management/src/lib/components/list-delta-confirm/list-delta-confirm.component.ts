import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';

import { CompositeKey, LogError } from '@memberjunction/core';
import type { ListDelta } from '@memberjunction/lists-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Confirmation dialog for any list operation that produced a `ListDelta`
 * preview. This is the **only** UI path that emits a valid `DeltaToken`
 * onward to `applyListDelta` — every mutating list flow funnels through
 * here.
 *
 * Two visual states:
 *
 * - **Safe** (`Delta.Counts.Remove === 0`): green confirmation banner; the
 *   primary button is enabled immediately.
 * - **Drop-warning** (`Delta.Counts.Remove > 0`): red header + warning
 *   banner; the primary button stays disabled until the user checks the
 *   acknowledgement box. The server still rejects with `DROP_NOT_CONFIRMED`
 *   if `ConfirmDrops` is false — this UI gate is a convenience, not the
 *   source of truth.
 *
 * The preview rows show each record's name (the entity's name field), looked up for the
 * previewed records only. A row shows its ID until the name arrives, and keeps the ID when the
 * record has no name or the lookup fails.
 */
@Component({
  standalone: false,
  selector: 'mj-list-delta-confirm',
  templateUrl: './list-delta-confirm.component.html',
  styleUrls: ['./list-delta-confirm.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDeltaConfirmComponent extends BaseAngularComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Names of the previewed records, keyed by record ID. */
  private recordNames = new Map<string, string>();

  /** Bumped on each lookup so a slow, older lookup can't overwrite a newer one. */
  private nameLookup = 0;

  /**
   * Whether the dialog is rendered. Bound via the same getter/setter
   * pattern used by the sibling share dialog so consumers can drive
   * visibility from a parent state machine.
   */
  @Input()
  get Visible(): boolean {
    return this._visible;
  }
  set Visible(value: boolean) {
    if (this._visible !== value) {
      this._visible = value;
      // Reset the acknowledgement when re-opening so a previous session's
      // confirmation doesn't carry over to a new delta.
      if (value) this.DropAcknowledged = false;
    }
  }
  private _visible = false;

  /** The delta to confirm. Required — the component renders nothing useful without it. */
  @Input() Delta: ListDelta | null = null;

  /**
   * Human-readable name of the target list. Optional; the dialog falls
   * back to "this list" if not provided.
   */
  @Input() TargetListName: string | null = null;

  /**
   * Optional descriptor of the source for display ("Q4 Donor View", etc.).
   * Has no functional effect — purely for the warning copy.
   */
  @Input() SourceLabel: string | null = null;

  /**
   * How many preview records to render in the "first N of …" lists.
   * Larger deltas could otherwise blow up the DOM.
   */
  @Input() PreviewLimit = 5;

  /** Fires when the user confirms — payload is the validated delta token. */
  @Output() Confirm = new EventEmitter<string>();

  /** Fires when the user cancels (close button, ESC, or Cancel button). */
  @Output() Cancel = new EventEmitter<void>();

  /** Local UI state for the acknowledgement checkbox in drop-warning mode. */
  public DropAcknowledged = false;

  /** @deprecated Use {@link DropAcknowledged}. */
  public get dropAcknowledged() {
    return this.DropAcknowledged;
  }
  /** @deprecated Use {@link DropAcknowledged}. */
  public set dropAcknowledged(value) {
    this.DropAcknowledged = value;
  }

  public get HasDrops(): boolean {
    return (this.Delta?.Counts.Remove ?? 0) > 0;
  }

  /** @deprecated Use {@link HasDrops}. */
  public get hasDrops(): boolean {
    return this.HasDrops;
  }

  public get CanConfirm(): boolean {
    if (!this.Delta) return false;
    if (!this.HasDrops) return true;
    return this.DropAcknowledged;
  }

  /** @deprecated Use {@link CanConfirm}. */
  public get canConfirm(): boolean {
    return this.CanConfirm;
  }

  public get PreviewAdds(): string[] {
    return this.Delta?.ToAdd.slice(0, this.PreviewLimit) ?? [];
  }

  /** @deprecated Use {@link PreviewAdds}. */
  public get previewAdds(): string[] {
    return this.PreviewAdds;
  }

  public get PreviewRemoves(): string[] {
    return this.Delta?.ToRemove.slice(0, this.PreviewLimit) ?? [];
  }

  /** @deprecated Use {@link PreviewRemoves}. */
  public get previewRemoves(): string[] {
    return this.PreviewRemoves;
  }

  public get ConfirmButtonLabel(): string {
    if (!this.Delta) return 'Confirm';
    if (this.HasDrops) return `Confirm Removal & Update`;
    return `Confirm (Add ${this.Delta.Counts.Add})`;
  }

  /** @deprecated Use {@link ConfirmButtonLabel}. */
  public get confirmButtonLabel(): string {
    return this.ConfirmButtonLabel;
  }

  public get TargetDisplayName(): string {
    return this.TargetListName ?? 'this list';
  }

  /** @deprecated Use {@link TargetDisplayName}. */
  public get targetDisplayName(): string {
    return this.TargetDisplayName;
  }

  /** The record's name, or null while it's loading or when it has none. */
  public RecordName(id: string): string | null {
    return this.recordNames.get(id) ?? null;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['Delta'] || changes['PreviewLimit'] || changes['Provider']) {
      void this.loadRecordNamesAsync();
    }
  }

  /** Looks up names for the previewed records. Never throws; on failure the rows keep their IDs. */
  private async loadRecordNamesAsync(): Promise<void> {
    const lookup = ++this.nameLookup;
    this.recordNames = new Map();
    const delta = this.Delta;
    const ids = [...new Set([...this.PreviewAdds, ...this.PreviewRemoves])];
    if (!delta || ids.length === 0) return;
    try {
      const provider = this.ProviderToUse;
      const entity = provider?.EntityByName(delta.EntityName);
      if (!entity) return;
      const results = await provider.GetEntityRecordNames(
        ids.map((id) => ({ EntityName: delta.EntityName, CompositeKey: CompositeKey.FromURLSegment(entity, id) })),
      );
      if (lookup !== this.nameLookup) return;
      const names = new Map<string, string>();
      (results ?? []).forEach((result, i) => {
        const name = result?.Success ? result.RecordName?.trim() : undefined;
        if (name) names.set(ids[i], name);
      });
      this.recordNames = names;
      this.cdr.markForCheck();
    } catch (e) {
      LogError(`ListDeltaConfirm: couldn't look up record names for ${delta.EntityName}: ${e}`);
    }
  }

  public OnConfirm(): void {
    if (!this.CanConfirm || !this.Delta) return;
    this.Confirm.emit(this.Delta.DeltaToken);
  }

  public OnCancel(): void {
    this.Cancel.emit();
  }

  public OnAcknowledgementToggle(value: boolean): void {
    this.DropAcknowledged = value;
  }
}
