import { Component, Input, Output, EventEmitter } from '@angular/core';

/**
 * Result of the shared view warning dialog
 */
export type SharedViewAction = 'update-shared' | 'save-as-copy' | 'cancel';

/**
 * SharedViewWarningDialogComponent - Warning dialog when saving changes to a shared view
 *
 * Shows when a user attempts to save changes to a view that is shared with other users.
 * Presents three options:
 * - Update Shared View: save changes affecting all users
 * - Save As My Copy: create a personal copy with the changes
 * - Cancel: abort the save
 *
 * @example
 * ```html
 * <mj-shared-view-warning-dialog
 *   [IsOpen]="showSharedWarning"
 *   [ViewName]="currentView.Name"
 *   (Action)="onSharedViewAction($event)"
 *   (Cancel)="showSharedWarning = false">
 * </mj-shared-view-warning-dialog>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-shared-view-warning-dialog',
  templateUrl: './shared-view-warning-dialog.component.html',
  styleUrls: ['./shared-view-warning-dialog.component.css']
})
export class SharedViewWarningDialogComponent {
  @Input() IsOpen: boolean = false;
  @Input() ViewName: string = '';

  @Output() Action = new EventEmitter<SharedViewAction>();
  @Output() Cancel = new EventEmitter<void>();

  OnUpdateShared(): void {
    this.Action.emit('update-shared');
  }

  OnSaveAsCopy(): void {
    this.Action.emit('save-as-copy');
  }

  OnCancel(): void {
    this.Cancel.emit();
  }
}
