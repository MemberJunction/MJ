import { Component, Input, Output, EventEmitter } from '@angular/core';

/**
 * Style variants for the confirm button
 */
export type ConfirmButtonStyle = 'primary' | 'danger';

/**
 * ConfirmDialogComponent - Generic reusable confirmation dialog
 *
 * Used for:
 * - Delete view confirmation
 * - Filter mode switch warning (data loss)
 * - Revert unsaved changes
 * - Any action requiring user confirmation
 *
 * Follows the same @if backdrop + .dialog-panel.open pattern as AggregateSetupDialogComponent.
 *
 * @example
 * ```html
 * <mj-ev-confirm-dialog
 *   [IsOpen]="showDeleteConfirm"
 *   Title="Delete View"
 *   Message="Are you sure you want to delete this view?"
 *   DetailMessage="This action cannot be undone."
 *   ConfirmText="Delete"
 *   ConfirmStyle="danger"
 *   Icon="fa-solid fa-trash"
 *   (Confirmed)="onDeleteConfirmed()"
 *   (Cancelled)="showDeleteConfirm = false">
 * </mj-ev-confirm-dialog>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-ev-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent {
  /**
   * Whether the dialog is open
   */
  @Input() IsOpen: boolean = false;

  /**
   * Dialog title
   */
  @Input() Title: string = 'Confirm';

  /**
   * Primary message to display
   */
  @Input() Message: string = 'Are you sure?';

  /**
   * Optional secondary detail message (shown smaller, below primary)
   */
  @Input() DetailMessage: string = '';

  /**
   * Text for the confirm button
   * @default 'Confirm'
   */
  @Input() ConfirmText: string = 'Confirm';

  /**
   * Text for the cancel button
   * @default 'Cancel'
   */
  @Input() CancelText: string = 'Cancel';

  /**
   * Style variant for the confirm button
   * 'primary' = blue, 'danger' = red
   * @default 'primary'
   */
  @Input() ConfirmStyle: ConfirmButtonStyle = 'primary';

  /**
   * Font Awesome icon class for the dialog header
   * @default 'fa-solid fa-circle-question'
   */
  @Input() Icon: string = 'fa-solid fa-circle-question';

  /**
   * Emitted when user clicks the confirm button
   */
  @Output() Confirmed = new EventEmitter<void>();

  /**
   * Emitted when user clicks cancel or backdrop
   */
  @Output() Cancelled = new EventEmitter<void>();

  OnConfirm(): void {
    this.Confirmed.emit();
  }

  OnCancel(): void {
    this.Cancelled.emit();
  }
}
