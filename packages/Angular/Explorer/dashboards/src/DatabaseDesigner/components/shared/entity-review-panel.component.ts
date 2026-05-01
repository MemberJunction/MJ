/**
 * @module entity-review-panel.component
 * @description Read-only schema review table — mirrors the prototype table the
 * Database Designer agent produces in chat.  Used in wizard Step 4 (Review) and
 * in the Modify view's "Review Changes" tab.
 *
 * In `alter` mode, new or changed columns are highlighted in green and
 * existing-but-hidden columns are dimmed to show the diff.
 */

import {
    Component, Input, ChangeDetectionStrategy,
} from '@angular/core';
import type { EntityTableSpec, ColumnSpec, ForeignKeySpec } from '../../database-designer.types.js';

/** Internal view model for a row in the review table. */
interface ReviewRow {
    column: ColumnSpec;
    /** 'existing' | 'new' | 'hidden' — only populated in alter mode. */
    diffState: 'existing' | 'new' | 'hidden' | 'unchanged';
    sqlType: string;
}

@Component({
    standalone: false,
    selector: 'mj-database-review-panel',
    templateUrl: './entity-review-panel.component.html',
    styleUrls: ['./entity-review-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityReviewPanelComponent {

    /** The table / entity definition being reviewed. */
    @Input() public set TableDefinition(v: EntityTableSpec | null) {
        this._tableDefinition = v;
        this.rebuildRows();
    }
    public get TableDefinition(): EntityTableSpec | null { return this._tableDefinition; }
    private _tableDefinition: EntityTableSpec | null = null;

    /** 'create' (all rows are new) vs 'alter' (diff against existingColumns). */
    @Input() public set ModificationType(v: 'create' | 'alter') {
        this._modificationType = v;
        this.rebuildRows();
    }
    public get ModificationType(): 'create' | 'alter' { return this._modificationType; }
    private _modificationType: 'create' | 'alter' = 'create';

    /** Columns already in the DB — used in alter mode to compute the diff. */
    @Input() public set ExistingColumns(v: ColumnSpec[]) {
        this._existingColumns = v;
        this.rebuildRows();
    }
    public get ExistingColumns(): ColumnSpec[] { return this._existingColumns; }
    private _existingColumns: ColumnSpec[] = [];

    /** Prepared rows ready for the template. */
    public Rows: ReviewRow[] = [];

    /** Convenient accessor for the template. */
    public get ForeignKeys(): ForeignKeySpec[] {
        return this._tableDefinition?.ForeignKeys ?? [];
    }

    public TrackByName(_: number, row: ReviewRow): string {
        return row.column.Name;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private rebuildRows(): void {
        if (!this._tableDefinition) {
            this.Rows = [];
            return;
        }

        const existingNames = new Set(
            this._existingColumns.map(c => c.Name.toLowerCase())
        );

        this.Rows = this._tableDefinition.Columns.map(col => ({
            column: col,
            diffState: this.diffState(col, existingNames),
            sqlType: this.resolveSqlType(col),
        }));
    }

    private diffState(
        col: ColumnSpec,
        existingNames: Set<string>,
    ): ReviewRow['diffState'] {
        if (this._modificationType === 'create') return 'unchanged';
        return existingNames.has(col.Name.toLowerCase()) ? 'existing' : 'new';
    }

    /** Resolve a human-readable SQL type from the ColumnSpec. */
    private resolveSqlType(col: ColumnSpec): string {
        if (col.RawSqlType) return col.RawSqlType;
        switch (col.Type) {
            case 'string':   return col.MaxLength ? `NVARCHAR(${col.MaxLength})` : 'NVARCHAR(200)';
            case 'text':
            case 'json':     return 'NVARCHAR(MAX)';
            case 'integer':  return 'INT';
            case 'bigint':   return 'BIGINT';
            case 'decimal':  return `DECIMAL(${col.Precision ?? 18},${col.Scale ?? 2})`;
            case 'boolean':  return 'BIT';
            case 'datetime': return 'DATETIMEOFFSET';
            case 'date':     return 'DATE';
            case 'time':     return 'TIME';
            case 'uuid':     return 'UNIQUEIDENTIFIER';
            case 'float':    return 'FLOAT';
            default:         return col.Type ?? 'NVARCHAR(200)';
        }
    }
}
