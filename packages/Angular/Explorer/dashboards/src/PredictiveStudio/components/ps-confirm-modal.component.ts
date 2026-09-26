import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** Visual variant of the confirm modal — drives the header icon-tile color. */
export type PSConfirmVariant = 'info' | 'warn' | 'danger';

/**
 * Small, reusable confirmation modal for Predictive Studio's real mutations (model promote/archive,
 * experiment pause/cancel). Renders a token-styled backdrop + card with a title, a rich message
 * (projected via `<ng-content>`), an optional reason textarea, and a left-aligned primary confirm
 * button followed by Cancel (MJ button-placement convention). The host owns visibility and the
 * confirm/cancel handlers; this component is purely presentational + emits the captured reason.
 *
 * While `busy` is true the confirm button shows a spinner and both buttons disable, giving the
 * in-flight Remote Op a clear, non-dismissable feel.
 */
@Component({
  standalone: true,
  selector: 'ps-confirm-modal',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css'],
  template: `
    <div class="ps-modal-backdrop" data-testid="ps-confirm-modal" (click)="onBackdrop()">
      <div class="ps-modal" (click)="$event.stopPropagation()">
        <div class="ps-modal-head" [class.warn]="variant === 'warn'" [class.danger]="variant === 'danger'">
          <span class="ico"><i [class]="icon"></i></span>
          <h3>{{ title }}</h3>
        </div>
        <div class="ps-modal-body">
          <ng-content></ng-content>
          @if (showReason) {
            <div class="ps-field">
              <label>{{ reasonLabel }}{{ reasonRequired ? ' *' : '' }}</label>
              <textarea
                class="ps-input"
                rows="3"
                data-testid="ps-confirm-reason"
                [placeholder]="reasonPlaceholder"
                [(ngModel)]="reason"
                [disabled]="busy"></textarea>
            </div>
          }
        </div>
        <div class="ps-modal-foot">
          <button
            mjButton
            [variant]="variant === 'danger' ? 'danger' : 'primary'"
            size="sm"
            data-testid="ps-confirm-ok"
            [disabled]="busy || (reasonRequired && !reason.trim())"
            (click)="confirmed.emit(reason.trim())">
            @if (busy) { <i class="fa-solid fa-circle-notch fa-spin"></i> } @else { <i [class]="confirmIcon"></i> }
            {{ confirmLabel }}
          </button>
          <span class="ps-spacer"></span>
          <button mjButton variant="secondary" size="sm" data-testid="ps-confirm-cancel" [disabled]="busy" (click)="cancelled.emit()">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PSConfirmModalComponent {
  /** Modal heading. */
  @Input() Title = 'Confirm';

  /** @deprecated Use {@link Title}. */
  @Input() set title(value: PSConfirmModalComponent['Title']) {
    this.Title = value;
  }
  /** @deprecated Use {@link Title}. */
  get title(): PSConfirmModalComponent['Title'] {
    return this.Title;
  }
  /** Header icon-tile Font Awesome class. */
  @Input() Icon = 'fa-solid fa-circle-question';

  /** @deprecated Use {@link Icon}. */
  @Input() set icon(value: PSConfirmModalComponent['Icon']) {
    this.Icon = value;
  }
  /** @deprecated Use {@link Icon}. */
  get icon(): PSConfirmModalComponent['Icon'] {
    return this.Icon;
  }
  /** Confirm-button Font Awesome class (shown when not busy). */
  @Input() ConfirmIcon = 'fa-solid fa-check';

  /** @deprecated Use {@link ConfirmIcon}. */
  @Input() set confirmIcon(value: PSConfirmModalComponent['ConfirmIcon']) {
    this.ConfirmIcon = value;
  }
  /** @deprecated Use {@link ConfirmIcon}. */
  get confirmIcon(): PSConfirmModalComponent['ConfirmIcon'] {
    return this.ConfirmIcon;
  }
  /** Confirm-button label. */
  @Input() ConfirmLabel = 'Confirm';

  /** @deprecated Use {@link ConfirmLabel}. */
  @Input() set confirmLabel(value: PSConfirmModalComponent['ConfirmLabel']) {
    this.ConfirmLabel = value;
  }
  /** @deprecated Use {@link ConfirmLabel}. */
  get confirmLabel(): PSConfirmModalComponent['ConfirmLabel'] {
    return this.ConfirmLabel;
  }
  /** Visual variant (info / warn / danger). */
  @Input() Variant: PSConfirmVariant = 'info';

  /** @deprecated Use {@link Variant}. */
  @Input() set variant(value: PSConfirmVariant) {
    this.Variant = value;
  }
  /** @deprecated Use {@link Variant}. */
  get variant(): PSConfirmVariant {
    return this.Variant;
  }
  /** When true, render the reason textarea. */
  @Input() ShowReason = false;

  /** @deprecated Use {@link ShowReason}. */
  @Input() set showReason(value: PSConfirmModalComponent['ShowReason']) {
    this.ShowReason = value;
  }
  /** @deprecated Use {@link ShowReason}. */
  get showReason(): PSConfirmModalComponent['ShowReason'] {
    return this.ShowReason;
  }
  /** When true, the confirm button stays disabled until a non-empty reason is entered. */
  @Input() ReasonRequired = false;

  /** @deprecated Use {@link ReasonRequired}. */
  @Input() set reasonRequired(value: PSConfirmModalComponent['ReasonRequired']) {
    this.ReasonRequired = value;
  }
  /** @deprecated Use {@link ReasonRequired}. */
  get reasonRequired(): PSConfirmModalComponent['ReasonRequired'] {
    return this.ReasonRequired;
  }
  /** Reason field label. */
  @Input() ReasonLabel = 'Reason';

  /** @deprecated Use {@link ReasonLabel}. */
  @Input() set reasonLabel(value: PSConfirmModalComponent['ReasonLabel']) {
    this.ReasonLabel = value;
  }
  /** @deprecated Use {@link ReasonLabel}. */
  get reasonLabel(): PSConfirmModalComponent['ReasonLabel'] {
    return this.ReasonLabel;
  }
  /** Reason field placeholder. */
  @Input() ReasonPlaceholder = 'Add an optional note…';

  /** @deprecated Use {@link ReasonPlaceholder}. */
  @Input() set reasonPlaceholder(value: PSConfirmModalComponent['ReasonPlaceholder']) {
    this.ReasonPlaceholder = value;
  }
  /** @deprecated Use {@link ReasonPlaceholder}. */
  get reasonPlaceholder(): PSConfirmModalComponent['ReasonPlaceholder'] {
    return this.ReasonPlaceholder;
  }
  /** In-flight flag — disables the buttons + shows the confirm spinner. */
  @Input() Busy = false;

  /** @deprecated Use {@link Busy}. */
  @Input() set busy(value: PSConfirmModalComponent['Busy']) {
    this.Busy = value;
  }
  /** @deprecated Use {@link Busy}. */
  get busy(): PSConfirmModalComponent['Busy'] {
    return this.Busy;
  }

  /** The captured reason (two-way via the textarea). */
  public Reason = '';

  /** @deprecated Use {@link Reason}. */
  public get reason() {
    return this.Reason;
  }
  /** @deprecated Use {@link Reason}. */
  public set reason(value) {
    this.Reason = value;
  }

  /** Emitted with the trimmed reason when the user confirms. */
  @Output() Confirmed = new EventEmitter<string>();

  /**
   * @deprecated Use {@link Confirmed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (confirmed) keeps working. Must stay AFTER Confirmed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() confirmed = this.Confirmed;
  /** Emitted when the user cancels (button or backdrop). */
  @Output() Cancelled = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Cancelled}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (cancelled) keeps working. Must stay AFTER Cancelled: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() cancelled = this.Cancelled;

  /** Backdrop click cancels — unless an operation is in flight. */
  public OnBackdrop(): void {
    if (!this.Busy) this.Cancelled.emit();
  }

  /** @deprecated Use {@link OnBackdrop}. */
  public onBackdrop(): void {
    return this.OnBackdrop();
  }
}
