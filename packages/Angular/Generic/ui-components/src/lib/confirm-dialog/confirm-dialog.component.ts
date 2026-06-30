import { Component, EventEmitter, Input, Output, booleanAttribute } from '@angular/core';
import { MJDialogComponent, MJDialogActionsComponent } from '../dialog/dialog.component';
import { MJButtonDirective } from '../button/button.directive';

/**
 * Visual intent of an `<mj-confirm-dialog>`. Drives the header icon and the
 * confirm button's color, so callers rarely restate either.
 *
 * - `default` — a neutral question (e.g. "Discard unsaved changes?"). Blue confirm button.
 * - `danger`  — a destructive / irreversible action (delete). Red confirm button.
 * - `warning` — a non-destructive but consequential action. Blue confirm button, caution icon.
 * - `info`    — an informational confirmation. Blue confirm button, info icon.
 */
export type MJConfirmDialogType = 'default' | 'danger' | 'warning' | 'info';

const DEFAULT_ICONS: Record<MJConfirmDialogType, string> = {
  default: 'fa-solid fa-circle-question',
  danger: 'fa-solid fa-triangle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
};

/**
 * mj-confirm-dialog — Canonical confirmation prompt. The shared replacement for
 * native `window.confirm()` and the many hand-rolled "Are you sure?" modals
 * (`@if (showDeleteConfirm) { … backdrop + centered dialog }`) scattered across
 * the app, plus the duplicate local `mj-confirm-dialog` / `mj-ev-confirm-dialog`
 * components.
 *
 * Built on `<mj-dialog>` (so it inherits the backdrop, animations, mobile
 * full-screen behavior, and Esc/backdrop handling) and uses `role="alertdialog"`
 * for screen readers. Buttons follow the MJ convention: the affirmative action
 * is **leftmost**, Cancel on the right.
 *
 * Visibility is two-way bindable. Cancelling (Cancel button, backdrop, Esc, or
 * the ✕) auto-closes and emits `Cancelled`. Confirming emits `Confirmed` and
 * **leaves the dialog open** so the handler can run async work — set `Visible`
 * to `false` (or update your bound property) when done. Bind `[Processing]` to a
 * loading flag during that async work to show a spinner, disable both buttons,
 * and block dismissal until it completes.
 *
 * Usage:
 * ```html
 * <!-- Simple destructive confirm -->
 * <mj-confirm-dialog
 *   [(Visible)]="showDeleteConfirm"
 *   Type="danger"
 *   Title="Delete view"
 *   Message="Are you sure you want to delete this view?"
 *   DetailMessage="This action cannot be undone."
 *   ConfirmText="Delete"
 *   (Confirmed)="onDeleteConfirmed()">
 * </mj-confirm-dialog>
 *
 * <!-- Async confirm with a spinner while the work runs -->
 * <mj-confirm-dialog
 *   [(Visible)]="confirmOpen"
 *   [Processing]="isDeleting"
 *   Type="danger" Title="Delete user" Message="Remove this user permanently?"
 *   ConfirmText="Delete" (Confirmed)="deleteUser()">
 * </mj-confirm-dialog>
 * ```
 */
@Component({
  selector: 'mj-confirm-dialog',
  standalone: true,
  imports: [MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
  template: `
    <mj-dialog
      [Visible]="Visible"
      [Title]="Title"
      Size="sm"
      Role="alertdialog"
      [Closeable]="!Processing"
      (Close)="onDismiss()">

      <div class="mj-confirm">
        @if (ResolvedIcon) {
          <i class="mj-confirm__icon mj-confirm__icon--{{ Type }} {{ ResolvedIcon }}" aria-hidden="true"></i>
        }
        <div class="mj-confirm__body">
          @if (Message) {
            <p class="mj-confirm__message">{{ Message }}</p>
          }
          @if (DetailMessage) {
            <p class="mj-confirm__detail">{{ DetailMessage }}</p>
          }
          <ng-content></ng-content>
        </div>
      </div>

      <mj-dialog-actions>
        <button
          mjButton
          [variant]="ConfirmVariant"
          [disabled]="Processing"
          (click)="onConfirm()">
          @if (Processing) {
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          }
          {{ ConfirmText }}
        </button>
        <button
          mjButton
          variant="secondary"
          [disabled]="Processing"
          (click)="onCancel()">
          {{ CancelText }}
        </button>
      </mj-dialog-actions>
    </mj-dialog>
  `,
  styles: [`
    .mj-confirm {
      display: flex;
      align-items: flex-start;
      gap: var(--mj-space-3);
    }
    .mj-confirm__icon {
      flex-shrink: 0;
      font-size: 1.5rem;
      margin-top: 0.05em;
      color: var(--mj-text-muted);
    }
    .mj-confirm__icon--danger { color: var(--mj-status-error); }
    .mj-confirm__icon--warning { color: var(--mj-status-warning); }
    .mj-confirm__icon--info { color: var(--mj-status-info); }

    .mj-confirm__body { flex: 1; min-width: 0; }
    .mj-confirm__message {
      margin: 0;
      color: var(--mj-text-primary);
      line-height: 1.5;
    }
    .mj-confirm__detail {
      margin: var(--mj-space-2) 0 0;
      font-size: var(--mj-text-sm);
      color: var(--mj-text-secondary);
      line-height: 1.45;
    }
  `]
})
export class MJConfirmDialogComponent {
  /** Whether the dialog is shown. Two-way bindable: `[(Visible)]`. */
  @Input() Visible = false;
  /** Two-way `Visible` change channel — fires when the dialog auto-closes on cancel. */
  @Output() VisibleChange = new EventEmitter<boolean>();

  /** Heading shown in the dialog title bar. */
  @Input() Title = 'Confirm';

  /** Primary prompt text. For rich content, project default `<ng-content>` instead. */
  @Input() Message = 'Are you sure?';

  /** Optional secondary line, rendered smaller/muted beneath the message. */
  @Input() DetailMessage = '';

  /** Visual intent — drives the header icon + confirm button color. Defaults to 'default'. */
  @Input() Type: MJConfirmDialogType = 'default';

  /** Affirmative button label. */
  @Input() ConfirmText = 'Confirm';

  /** Dismiss button label. */
  @Input() CancelText = 'Cancel';

  /**
   * Font Awesome icon class (e.g. "fa-solid fa-trash") for the header. When
   * omitted, a sensible default is chosen from `Type`. Set to `''` for no icon.
   */
  @Input() Icon: string | null = null;

  /**
   * When true, shows a spinner on the confirm button, disables both buttons, and
   * blocks dismissal (Esc / backdrop / ✕) — bind this to your loading flag while
   * the `Confirmed` handler runs async work.
   */
  @Input({ transform: booleanAttribute }) Processing = false;

  /** Fired when the user confirms. The dialog stays open; close it when ready. */
  @Output() Confirmed = new EventEmitter<void>();

  /** Fired when the user cancels (button, backdrop, Esc, or ✕). The dialog auto-closes. */
  @Output() Cancelled = new EventEmitter<void>();

  /** mjButton variant for the confirm button — red for `danger`, blue otherwise. */
  get ConfirmVariant(): 'primary' | 'danger' {
    return this.Type === 'danger' ? 'danger' : 'primary';
  }

  /**
   * Icon actually rendered: the explicit `Icon` when provided (including `""`
   * to suppress it), otherwise the per-type default.
   */
  get ResolvedIcon(): string {
    if (this.Icon != null) {
      return this.Icon;
    }
    return DEFAULT_ICONS[this.Type] ?? DEFAULT_ICONS.default;
  }

  onConfirm(): void {
    this.Confirmed.emit();
  }

  onCancel(): void {
    this.close();
    this.Cancelled.emit();
  }

  /** Backdrop / Esc / ✕ from the underlying dialog — ignored while Processing. */
  onDismiss(): void {
    if (this.Processing) {
      return;
    }
    this.onCancel();
  }

  private close(): void {
    this.Visible = false;
    this.VisibleChange.emit(false);
  }
}
