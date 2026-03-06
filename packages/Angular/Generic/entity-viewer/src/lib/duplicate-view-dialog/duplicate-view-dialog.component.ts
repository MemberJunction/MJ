import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { ViewConfigSummary } from '../types';

/**
 * Event emitted when user confirms the duplicate action
 */
export interface DuplicateViewEvent {
  /** The user-chosen name for the copy */
  Name: string;
}

/**
 * DuplicateViewDialogComponent - Modal for duplicating a view with a custom name
 *
 * Shows the source view name, allows renaming the copy, and displays
 * a metadata summary (filters, columns, sorts) of what will be duplicated.
 *
 * @example
 * ```html
 * <mj-duplicate-view-dialog
 *   [IsOpen]="showDuplicateDialog"
 *   [SourceViewName]="viewToDuplicate?.Name"
 *   [Summary]="duplicateSummary"
 *   (Duplicate)="onDuplicateConfirmed($event)"
 *   (Cancel)="showDuplicateDialog = false">
 * </mj-duplicate-view-dialog>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-duplicate-view-dialog',
  templateUrl: './duplicate-view-dialog.component.html',
  styleUrls: ['./duplicate-view-dialog.component.css']
})
export class DuplicateViewDialogComponent implements OnChanges {
  @Input() IsOpen: boolean = false;
  @Input() SourceViewName: string = '';
  @Input() Summary: ViewConfigSummary | null = null;

  @Output() Duplicate = new EventEmitter<DuplicateViewEvent>();
  @Output() Cancel = new EventEmitter<void>();

  public NewName: string = '';
  public NameTouched: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.NewName = this.SourceViewName ? `${this.SourceViewName} (Copy)` : '';
      this.NameTouched = false;
      this.cdr.detectChanges();
    }
  }

  OnDuplicate(): void {
    if (!this.NewName.trim()) return;
    this.Duplicate.emit({ Name: this.NewName.trim() });
  }

  OnCancel(): void {
    this.Cancel.emit();
  }
}
