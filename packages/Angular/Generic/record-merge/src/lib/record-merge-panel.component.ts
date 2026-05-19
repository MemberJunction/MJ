/**
 * @fileoverview Record Merge Panel Component
 *
 * Side-by-side field comparison panel for entity records.
 * Highlights conflicting values and allows field-by-field selection
 * of which value to keep in the merge result.
 */

import {
    Component,
    EventEmitter,
    Input,
    Output,
    OnInit,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import {
    FieldComparison,
    MergeConfig,
    MergeComparisonResult,
    MergeConfirmedEvent,
    FieldSelectionEvent
} from './record-merge-types';

@Component({
    standalone: false,
    selector: 'mj-record-merge-panel',
    templateUrl: './record-merge-panel.component.html',
    styleUrls: ['./record-merge-panel.component.css']
})
export class RecordMergePanelComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    // --- Inputs ---

    /** Field comparisons to display */
    @Input() Fields: FieldComparison[] = [];

    /** Merge configuration */
    @Input() Config: MergeConfig | null = null;

    /** Whether to show only conflicting fields initially */
    @Input() ShowConflictsOnly = false;

    /** Whether the merge action is enabled */
    @Input() MergeEnabled = true;

    /** Whether a merge is in progress */
    @Input() IsMerging = false;

    // --- Outputs ---

    @Output() MergeConfirmed = new EventEmitter<MergeConfirmedEvent>();
    @Output() MergeCancelled = new EventEmitter<void>();
    @Output() FieldSelected = new EventEmitter<FieldSelectionEvent>();

    // --- Component State ---

    public ShowAllFields = true;
    public Comparison: MergeComparisonResult | null = null;
    public ConfirmDialogVisible = false;

    ngOnInit(): void {
        this.ShowAllFields = !this.ShowConflictsOnly;
        this.buildComparison();
    }

    /** Toggle between showing all fields and conflicts only */
    public ToggleShowAll(): void {
        this.ShowAllFields = !this.ShowAllFields;
        this.cdr.detectChanges();
    }

    /** Select the left value for a field */
    public SelectLeft(field: FieldComparison): void {
        if (field.IsReadOnly) return;
        field.SelectedSide = 'left';
        this.emitFieldSelection(field);
    }

    /** Select the right value for a field */
    public SelectRight(field: FieldComparison): void {
        if (field.IsReadOnly) return;
        field.SelectedSide = 'right';
        this.emitFieldSelection(field);
    }

    /** Select all fields from the left side */
    public SelectAllLeft(): void {
        for (const field of this.Fields) {
            if (!field.IsReadOnly) {
                field.SelectedSide = 'left';
            }
        }
        this.cdr.detectChanges();
    }

    /** Select all fields from the right side */
    public SelectAllRight(): void {
        for (const field of this.Fields) {
            if (!field.IsReadOnly) {
                field.SelectedSide = 'right';
            }
        }
        this.cdr.detectChanges();
    }

    /** Get fields to display based on current filter */
    public GetVisibleFields(): FieldComparison[] {
        if (this.ShowAllFields) {
            return this.Fields;
        }
        return this.Fields.filter(f => f.HasConflict);
    }

    /** Show the merge confirmation dialog */
    public ShowConfirmDialog(): void {
        this.ConfirmDialogVisible = true;
        this.cdr.detectChanges();
    }

    /** Confirm the merge */
    public ConfirmMerge(): void {
        if (!this.Config) return;
        this.ConfirmDialogVisible = false;
        this.MergeConfirmed.emit({
            Config: this.Config,
            ResolvedFields: this.Fields
        });
    }

    /** Cancel the merge */
    public CancelMerge(): void {
        this.ConfirmDialogVisible = false;
        this.MergeCancelled.emit();
    }

    /** Get the display value for a field value */
    public FormatValue(value: unknown): string {
        if (value === null || value === undefined) {
            return '(empty)';
        }
        if (value instanceof Date) {
            return value.toLocaleString();
        }
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }
        return String(value);
    }

    /** Check if all conflict fields have been resolved */
    public AllConflictsResolved(): boolean {
        if (!this.Comparison) return true;
        return this.Comparison.ConflictFields.every(f => f.SelectedSide === 'left' || f.SelectedSide === 'right');
    }

    // --- Private Methods ---

    private buildComparison(): void {
        const conflictFields = this.Fields.filter(f => f.HasConflict);
        const matchingFields = this.Fields.filter(f => !f.HasConflict);
        this.Comparison = {
            Fields: this.Fields,
            ConflictFields: conflictFields,
            MatchingFields: matchingFields,
            TotalFieldCount: this.Fields.length,
            ConflictCount: conflictFields.length
        };
    }

    private emitFieldSelection(field: FieldComparison): void {
        const value = field.SelectedSide === 'left' ? field.LeftValue :
                      field.SelectedSide === 'right' ? field.RightValue :
                      field.CustomValue;
        this.FieldSelected.emit({
            FieldName: field.FieldName,
            SelectedSide: field.SelectedSide,
            Value: value
        });
        this.cdr.detectChanges();
    }
}
