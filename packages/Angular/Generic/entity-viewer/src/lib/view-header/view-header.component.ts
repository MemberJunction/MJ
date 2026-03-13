import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';

/**
 * ViewHeaderComponent - Inline view name display with edit, modified badge, and save/revert actions
 *
 * Features:
 * - View name display (click to edit inline)
 * - "Modified" badge when view has unsaved changes
 * - Save / Save As New / Revert buttons when modified
 * - Shared indicator icon
 *
 * @example
 * ```html
 * <mj-view-header
 *   [ViewName]="currentView?.Name || 'All Records'"
 *   [IsModified]="viewModified"
 *   [IsSaving]="isSaving"
 *   [IsShared]="currentView?.IsShared"
 *   [CanEdit]="currentView?.UserCanEdit"
 *   (NameChanged)="onViewNameChanged($event)"
 *   (SaveRequested)="onSaveView()"
 *   (SaveAsNewRequested)="onSaveAsNew()"
 *   (RevertRequested)="onRevertView()">
 * </mj-view-header>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-view-header',
  templateUrl: './view-header.component.html',
  styleUrls: ['./view-header.component.css']
})
export class ViewHeaderComponent {
  /**
   * The view name to display
   */
  @Input() ViewName: string = '';

  /**
   * Whether the view has unsaved modifications
   */
  @Input() IsModified: boolean = false;

  /**
   * Whether a save operation is in progress
   */
  @Input() IsSaving: boolean = false;

  /**
   * Whether the view is shared with others
   */
  @Input() IsShared: boolean = false;

  /**
   * Whether the current user can edit this view
   */
  @Input() CanEdit: boolean = false;

  /**
   * Emitted when the user changes the view name inline
   */
  @Output() NameChanged = new EventEmitter<string>();

  /**
   * Emitted when the user clicks save
   */
  @Output() SaveRequested = new EventEmitter<void>();

  /**
   * Emitted when the user clicks save-as-new
   */
  @Output() SaveAsNewRequested = new EventEmitter<void>();

  /**
   * Emitted when the user clicks revert
   */
  @Output() RevertRequested = new EventEmitter<void>();

  // Inline edit state
  public IsEditing: boolean = false;
  public EditValue: string = '';

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Start inline editing
   */
  StartEdit(): void {
    if (!this.CanEdit) return;
    this.EditValue = this.ViewName;
    this.IsEditing = true;
    this.cdr.detectChanges();
  }

  /**
   * Confirm the inline edit (Enter key or blur)
   */
  ConfirmEdit(): void {
    const trimmed = this.EditValue.trim();
    if (trimmed && trimmed !== this.ViewName) {
      this.NameChanged.emit(trimmed);
    }
    this.IsEditing = false;
    this.cdr.detectChanges();
  }

  /**
   * Cancel the inline edit (Escape key)
   */
  CancelEdit(): void {
    this.IsEditing = false;
    this.cdr.detectChanges();
  }

  OnSave(): void {
    this.SaveRequested.emit();
  }

  OnSaveAsNew(): void {
    this.SaveAsNewRequested.emit();
  }

  OnRevert(): void {
    this.RevertRequested.emit();
  }
}
