/**
 * @module entity-fields-grid.component
 * @description Inline field editor for the Database Designer wizard (Step 2) and
 * the Modify view (Fields tab).
 *
 * Each row represents one column definition.  Cells are directly editable —
 * click any cell to edit it in-place.  No separate dialog needed.
 *
 * ### Modes
 *  - `create`: all rows are new columns being defined. Any row can be deleted.
 *  - `modify`: rows loaded from an existing entity. Existing rows can be hidden
 *    from new records (soft-removal preserving data) but not deleted. New rows
 *    added by the user can be deleted outright.
 *
 * ### Validation
 * Reserved column names (`ID`, `__mj_CreatedAt`, `__mj_UpdatedAt`) are detected
 * and shown with an inline error badge. The parent step component reads
 * `HasErrors` to gate the "Next" button.
 */

import {
    Component, Input, Output, EventEmitter,
    ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import type { ColumnSpec, FieldTypeOption } from '../../database-designer.types.js';
import { FIELD_TYPE_OPTIONS } from '../../database-designer.types.js';

/** Auto-managed columns that users must never add manually. */
const RESERVED_NAMES = new Set(['id', '__mj_createdat', '__mj_updatedat']);

/** Extends ColumnSpec with grid-specific display state. */
interface FieldRow extends ColumnSpec {
    /** True when the column already exists in the DB (modify mode). */
    isExisting: boolean;
    /** True when the user has soft-toggled this existing column to hidden. */
    isHidden: boolean;
    /** 0-based index for stable tracking. */
    rowIndex: number;
}

@Component({
    standalone: false,
    selector: 'mj-database-fields-grid',
    templateUrl: './entity-fields-grid.component.html',
    styleUrls: ['./entity-fields-grid.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityFieldsGridComponent {

    // ─── Injected ──────────────────────────────────────────────────────────

    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Inputs ────────────────────────────────────────────────────────────

    @Input() public set Columns(v: ColumnSpec[]) {
        this.rows = v.map((c, i) => ({
            ...c,
            isExisting: false,
            isHidden: false,
            rowIndex: i,
        }));
        this.cdr.markForCheck();
    }

    @Input() public Mode: 'create' | 'modify' = 'create';

    // ─── Outputs ───────────────────────────────────────────────────────────

    /** Emitted on every change so the parent/state service can stay in sync. */
    @Output() public readonly ColumnsChanged = new EventEmitter<ColumnSpec[]>();

    // ─── View state ────────────────────────────────────────────────────────

    public rows: FieldRow[] = [];

    /** Index of the row currently being actively edited (-1 = none). */
    public ActiveRowIndex = -1;

    /** Available type options — drives the dropdown. */
    public readonly FieldTypeOptions: readonly FieldTypeOption[] = FIELD_TYPE_OPTIONS;

    // ─── Computed ──────────────────────────────────────────────────────────

    /** True when any row has a reserved-name validation error. */
    public get HasErrors(): boolean {
        return this.rows.some(r => this.isReservedName(r.Name));
    }

    /** True when any row has an error (exposed for parent template). */
    public get HasReservedNameError(): boolean {
        return this.HasErrors;
    }

    public TrackByIndex(_: number, row: FieldRow): number {
        return row.rowIndex;
    }

    // ─── Template helpers ──────────────────────────────────────────────────

    public IsReservedName(name: string): boolean {
        return this.isReservedName(name);
    }

    public TypeLabel(type: ColumnSpec['Type']): string {
        return FIELD_TYPE_OPTIONS.find(o => o.value === type)?.label ?? (type ?? 'String (NVARCHAR)');
    }

    /** True when the selected type supports a Max Length field. */
    public ShowMaxLength(type: ColumnSpec['Type']): boolean {
        return type === 'string';
    }

    /** True when the selected type supports precision/scale fields. */
    public ShowPrecisionScale(type: ColumnSpec['Type']): boolean {
        return type === 'decimal';
    }

    // ─── Row operations ────────────────────────────────────────────────────

    /** Append an empty row and make it active for editing. */
    public AddField(): void {
        const newRow: FieldRow = {
            Name: '',
            Type: 'string',
            IsNullable: true,
            isExisting: false,
            isHidden: false,
            rowIndex: this.rows.length,
        };
        this.rows = [...this.rows, newRow];
        this.ActiveRowIndex = newRow.rowIndex;
        this.emit();
    }

    /** Remove a new (non-existing) row outright. */
    public DeleteRow(index: number): void {
        this.rows = this.rows
            .filter(r => r.rowIndex !== index)
            .map((r, i) => ({ ...r, rowIndex: i }));
        this.ActiveRowIndex = -1;
        this.emit();
    }

    /**
     * Toggle the "hidden" state of an existing row in modify mode.
     * Hidden = soft-remove: `IncludeInAPI` will be set to false server-side;
     * data in the column is preserved.
     */
    public ToggleHide(index: number): void {
        this.rows = this.rows.map(r =>
            r.rowIndex === index ? { ...r, isHidden: !r.isHidden } : r
        );
        this.emit();
    }

    /** Update a field's Name. */
    public OnNameChange(index: number, value: string): void {
        this.updateRow(index, { Name: value });
    }

    /** Update a field's Type. */
    public OnTypeChange(index: number, value: ColumnSpec['Type']): void {
        // Clear max-length / precision when switching away from types that use them
        const extra: Partial<FieldRow> = {};
        if (value !== 'string')  extra.MaxLength = undefined;
        if (value !== 'decimal') { extra.Precision = undefined; extra.Scale = undefined; }
        this.updateRow(index, { Type: value, ...extra });
    }

    /** Toggle the "Required" (not-nullable) flag. */
    public OnRequiredToggle(index: number): void {
        const row = this.rows.find(r => r.rowIndex === index);
        if (row) this.updateRow(index, { IsNullable: !row.IsNullable });
    }

    /** Update MaxLength for string columns. */
    public OnMaxLengthChange(index: number, value: string): void {
        const n = parseInt(value, 10);
        this.updateRow(index, { MaxLength: isNaN(n) ? undefined : n });
    }

    /** Update the Default Value string. */
    public OnDefaultValueChange(index: number, value: string): void {
        this.updateRow(index, { DefaultValue: value || undefined });
    }

    /** Update the Description string. */
    public OnDescriptionChange(index: number, value: string): void {
        this.updateRow(index, { Description: value || undefined });
    }

    // ─── Public & private helpers ──────────────────────────────────────────

    private isReservedName(name: string): boolean {
        return RESERVED_NAMES.has(name.toLowerCase());
    }

    /** Called directly from the template for precision/scale inline updates. */
    public updateRow(index: number, patch: Partial<FieldRow>): void {
        this.rows = this.rows.map(r =>
            r.rowIndex === index ? { ...r, ...patch } : r
        );
        this.emit();
    }

    /** Emit the current non-hidden rows as `ColumnSpec[]` to the parent. */
    private emit(): void {
        const cols: ColumnSpec[] = this.rows
            .filter(r => !r.isHidden)
            .map(({ isExisting: _e, isHidden: _h, rowIndex: _i, ...col }) => col);
        this.ColumnsChanged.emit(cols);
        this.cdr.markForCheck();
    }
}
