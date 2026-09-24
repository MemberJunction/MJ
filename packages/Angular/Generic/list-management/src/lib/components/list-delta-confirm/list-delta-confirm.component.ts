import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import type { ListDelta } from '@memberjunction/lists-base';

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
 */
@Component({
  standalone: false,
  selector: 'mj-list-delta-confirm',
  templateUrl: './list-delta-confirm.component.html',
  styleUrls: ['./list-delta-confirm.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDeltaConfirmComponent {
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
