/**
 * @module step-relationships.component
 * @description Step 3 — optional foreign key relationship definitions.
 *
 * Presents one card per FK row. Each card has cascading dropdowns:
 *   Source Column → Target Schema → Target Table → Target Column → FK Type
 *
 * All FK target data comes from `Metadata.Entities` (already in-memory at login),
 * so every dropdown is synchronous — no async loading needed.
 */

import {
    Component, Input, Output, EventEmitter,
    ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { Metadata, EntityInfo } from '@memberjunction/core';
import type { ColumnSpec, ForeignKeySpec } from '../../../entity-designer.types.js';

/** Internal per-row state — carries the resolved entityId alongside the FK spec. */
interface FkRowState extends ForeignKeySpec {
    rowIndex: number;
    /** EntityInfo.ID of the selected target entity — used to look up columns. */
    selectedEntityId: string;
}

@Component({
    standalone: false,
    selector: 'mj-entity-step-relationships',
    templateUrl: './step-relationships.component.html',
    styleUrls: ['./step-relationships.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepRelationshipsComponent {

    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public InitialForeignKeys: ForeignKeySpec[] = [];
    @Input() public AvailableColumns: ColumnSpec[] = [];
    @Output() public readonly ForeignKeysChanged = new EventEmitter<ForeignKeySpec[]>();

    /** Only UUID columns are valid FK sources. */
    public get UuidColumns(): ColumnSpec[] {
        return this.AvailableColumns.filter(c => c.Type === 'uuid');
    }

    // ─── Metadata-backed synchronous getters ──────────────────────────────────

    /** Sorted list of all schema names present in Metadata.Entities. */
    public get AvailableSchemas(): string[] {
        return [...new Set(new Metadata().Entities.map(e => e.SchemaName))].sort();
    }

    /** Entities that belong to the given schema, sorted by BaseTable. */
    public EntitiesForSchema(schemaName: string): EntityInfo[] {
        if (!schemaName) return [];
        return new Metadata().Entities
            .filter(e => e.SchemaName === schemaName)
            .sort((a, b) => a.BaseTable.localeCompare(b.BaseTable));
    }

    /** Physical column names for the entity identified by `entityId`. */
    public ColumnsForEntity(entityId: string): string[] {
        if (!entityId) return [];
        const entity = new Metadata().Entities.find(e => e.ID === entityId);
        if (!entity) return ['ID'];
        return entity.Fields.filter(f => !f.IsVirtual).map(f => f.Name);
    }

    // ─── Placeholder helpers ───────────────────────────────────────────────────

    public TablePlaceholder(row: FkRowState): string {
        if (!row.ReferencedSchema) return '— select schema first —';
        if (this.EntitiesForSchema(row.ReferencedSchema).length === 0) return '— no entities in this schema —';
        return '— select table —';
    }

    public ColumnPlaceholder(row: FkRowState): string {
        if (!row.selectedEntityId) return '— select table first —';
        return '— select column —';
    }

    // ─── Row state ─────────────────────────────────────────────────────────────

    public rows: FkRowState[] = [];

    // ─── Cascade handlers ──────────────────────────────────────────────────────

    public OnSchemaChange(rowIndex: number, schema: string): void {
        this.rows = this.rows.map(r =>
            r.rowIndex === rowIndex
                ? { ...r, ReferencedSchema: schema, ReferencedTable: '', ReferencedColumn: 'ID', selectedEntityId: '' }
                : r
        );
        this.emit();
    }

    public OnTableChange(rowIndex: number, entityId: string): void {
        if (!entityId) {
            this.rows = this.rows.map(r =>
                r.rowIndex === rowIndex
                    ? { ...r, ReferencedTable: '', ReferencedColumn: 'ID', selectedEntityId: '' }
                    : r
            );
            this.emit();
            return;
        }
        const entity = new Metadata().Entities.find(e => e.ID === entityId);
        this.rows = this.rows.map(r =>
            r.rowIndex === rowIndex
                ? {
                    ...r,
                    ReferencedTable: entity?.BaseTable ?? '',
                    ReferencedColumn: 'ID',
                    selectedEntityId: entityId,
                }
                : r
        );
        this.emit();
    }

    public OnColumnChange(rowIndex: number, column: string): void {
        this.rows = this.rows.map(r =>
            r.rowIndex === rowIndex ? { ...r, ReferencedColumn: column } : r
        );
        this.emit();
    }

    public OnSourceColumnChange(rowIndex: number, column: string): void {
        this.rows = this.rows.map(r =>
            r.rowIndex === rowIndex ? { ...r, ColumnName: column } : r
        );
        this.emit();
    }

    public OnFkTypeChange(rowIndex: number, isSoft: boolean): void {
        this.rows = this.rows.map(r =>
            r.rowIndex === rowIndex ? { ...r, IsSoft: isSoft } : r
        );
        this.emit();
    }

    // ─── Add / Delete ──────────────────────────────────────────────────────────

    public AddRelationship(): void {
        const schemas = this.AvailableSchemas;
        const defaultSchema = schemas.includes('__mj_UDT') ? '__mj_UDT' : (schemas[0] ?? '');
        const firstUuid = this.UuidColumns[0]?.Name ?? '';

        this.rows = [
            ...this.rows,
            {
                ColumnName: firstUuid,
                ReferencedSchema: defaultSchema,
                ReferencedTable: '',
                ReferencedColumn: 'ID',
                IsSoft: true,
                rowIndex: this.rows.length,
                selectedEntityId: '',
            },
        ];
        this.emit();
    }

    public DeleteRow(index: number): void {
        this.rows = this.rows
            .filter(r => r.rowIndex !== index)
            .map((r, i) => ({ ...r, rowIndex: i }));
        this.emit();
    }

    // ─── Restore from InitialForeignKeys (when navigating back) ───────────────

    public InitFromForeignKeys(fks: ForeignKeySpec[]): void {
        this.rows = fks.map((fk, index) => this.buildRowState(fk, index));
        this.cdr.markForCheck();
    }

    private buildRowState(fk: ForeignKeySpec, index: number): FkRowState {
        const entity = new Metadata().Entities.find(
            e => e.SchemaName === fk.ReferencedSchema && e.BaseTable === fk.ReferencedTable
        );
        return { ...fk, rowIndex: index, selectedEntityId: entity?.ID ?? '' };
    }

    public TrackByIndex(_: number, row: FkRowState): number { return row.rowIndex; }

    // ─── Emit ──────────────────────────────────────────────────────────────────

    private emit(): void {
        const fks: ForeignKeySpec[] = this.rows.map(row => ({
            ColumnName: row.ColumnName,
            ReferencedSchema: row.ReferencedSchema,
            ReferencedTable: row.ReferencedTable,
            ReferencedColumn: row.ReferencedColumn,
            IsSoft: row.IsSoft,
        }));
        this.ForeignKeysChanged.emit(fks);
        this.cdr.markForCheck();
    }
}
