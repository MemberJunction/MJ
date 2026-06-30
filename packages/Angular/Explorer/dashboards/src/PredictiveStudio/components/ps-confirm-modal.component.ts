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
  styleUrls: ['../predictive-studio.shared.scss'],
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
  @Input() title = 'Confirm';
  /** Header icon-tile Font Awesome class. */
  @Input() icon = 'fa-solid fa-circle-question';
  /** Confirm-button Font Awesome class (shown when not busy). */
  @Input() confirmIcon = 'fa-solid fa-check';
  /** Confirm-button label. */
  @Input() confirmLabel = 'Confirm';
  /** Visual variant (info / warn / danger). */
  @Input() variant: PSConfirmVariant = 'info';
  /** When true, render the reason textarea. */
  @Input() showReason = false;
  /** When true, the confirm button stays disabled until a non-empty reason is entered. */
  @Input() reasonRequired = false;
  /** Reason field label. */
  @Input() reasonLabel = 'Reason';
  /** Reason field placeholder. */
  @Input() reasonPlaceholder = 'Add an optional note…';
  /** In-flight flag — disables the buttons + shows the confirm spinner. */
  @Input() busy = false;

  /** The captured reason (two-way via the textarea). */
  public reason = '';

  /** Emitted with the trimmed reason when the user confirms. */
  @Output() confirmed = new EventEmitter<string>();
  /** Emitted when the user cancels (button or backdrop). */
  @Output() cancelled = new EventEmitter<void>();

  /** Backdrop click cancels — unless an operation is in flight. */
  public onBackdrop(): void {
    if (!this.busy) this.cancelled.emit();
  }
}
