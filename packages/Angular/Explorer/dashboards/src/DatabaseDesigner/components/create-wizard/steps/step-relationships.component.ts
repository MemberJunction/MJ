/**
 * @module step-relationships.component
 * @description Step 3 — optional foreign key relationship definitions.
 *
 * Presents one card per FK row. Each card has cascading dropdowns:
 *   Source Column → Target Schema → Target Table → Target Column → FK Type
 *
 * All FK target data comes from `Metadata.Entities` (already in-memory at login),
 * so every dropdown is synchronous — no async loading needed.
 *
 * Phase C: FK source columns are no longer restricted to UUID type — any column
 * may be used as a FK source.  When the user selects a target column, the
 * component reads its SQL type and auto-selects the first source column whose
 * type matches, improving UX and preventing silent type mismatches.
 */

import {
    Component, Input, Output, EventEmitter,
    ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { Metadata, EntityInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { ColumnSpec, ForeignKeySpec } from '../../../database-designer.types.js';

// `MJ: Schema Info` only surfaces MJ-registered schemas, so only __mj needs blocking here.
// Server-side RSM.GetAllProtectedSchemas() remains the authoritative gate.
const FRONTEND_BLOCKED_SCHEMAS = new Set(['__mj']);

/** Default referenced column name used when a FK relationship is first created or schema/table changes. */
const DEFAULT_PK_COLUMN = 'ID';

/** Target entity column with its SQL type — used for source-column auto-matching. */
export interface EntityColumnInfo {
    Name: string;
    /** SQL type string from EntityInfo.Fields (e.g. 'uniqueidentifier', 'int', 'nvarchar'). */
    SqlType: string;
}

/** Internal per-row state — carries the resolved entityId alongside the FK spec. */
interface FkRowState extends ForeignKeySpec {
    rowIndex: number;
    /** EntityInfo.ID of the selected target entity — used to look up columns. */
    selectedEntityId: string;
    /** SQL type of the selected target column — used for source-column auto-matching. */
    referencedColumnType?: string;
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

    /** All Step 2 columns are valid FK source candidates (not just UUID). */
    public get AllColumns(): ColumnSpec[] {
        return this.AvailableColumns;
    }

    // ─── Metadata-backed synchronous getters ──────────────────────────────────

    /**
     * Sorted schema names present in Metadata.Entities, excluding blocked schemas.
     * `MJ: Schema Info` only surfaces MJ-registered schemas, so __mj is the only
     * schema that needs filtering here.
     */
    public get AvailableSchemas(): string[] {
        return [...new Set(new Metadata().Entities.map(e => e.SchemaName))] // global-provider-ok: client-side Angular component, single provider
            .filter(s => !FRONTEND_BLOCKED_SCHEMAS.has(s))
            .sort();
    }

    /** Entities that belong to the given schema, sorted by BaseTable. */
    public EntitiesForSchema(schemaName: string): EntityInfo[] {
        if (!schemaName) return [];
        return new Metadata().Entities // global-provider-ok: client-side Angular component, single provider
            .filter(e => e.SchemaName === schemaName)
            .sort((a, b) => a.BaseTable.localeCompare(b.BaseTable));
    }

    /**
     * Physical columns for the entity identified by `entityId`, including SQL type info.
     * Returns `EntityColumnInfo[]` so the template can display `Name (SqlType)` and
     * the component can auto-match source columns by type.
     */
    public ColumnsForEntity(entityId: string): EntityColumnInfo[] {
        if (!entityId) return [];
        const entity = new Metadata().Entities.find(e => UUIDsEqual(e.ID, entityId)); // global-provider-ok: client-side Angular component, single provider
        if (!entity) return [{ Name: 'ID', SqlType: 'uniqueidentifier' }];
        return entity.Fields
            .filter(f => !f.IsVirtual)
            .map(f => ({ Name: f.Name, SqlType: f.Type ?? '' }));
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
                ? { ...r, ReferencedSchema: schema, ReferencedTable: '', ReferencedColumn: DEFAULT_PK_COLUMN, selectedEntityId: '', referencedColumnType: undefined }
                : r
        );
        this.emit();
    }

    public OnTableChange(rowIndex: number, entityId: string): void {
        if (!entityId) {
            this.rows = this.rows.map(r =>
                r.rowIndex === rowIndex
                    ? { ...r, ReferencedTable: '', ReferencedColumn: DEFAULT_PK_COLUMN, selectedEntityId: '', referencedColumnType: undefined }
                    : r
            );
            this.emit();
            return;
        }
        const entity = new Metadata().Entities.find(e => UUIDsEqual(e.ID, entityId)); // global-provider-ok: client-side Angular component, single provider
        this.rows = this.rows.map(r => {
            if (r.rowIndex !== rowIndex) return r;
            // Auto-name the source FK column if the user hasn't chosen one — the
            // wizard state service will materialize this as a real UUID column.
            const autoSourceName = !r.ColumnName && entity?.BaseTable
                ? this.defaultFkColumnName(entity.BaseTable)
                : r.ColumnName;
            return {
                ...r,
                ColumnName: autoSourceName,
                ReferencedTable: entity?.BaseTable ?? '',
                ReferencedColumn: DEFAULT_PK_COLUMN,
                selectedEntityId: entityId,
                referencedColumnType: undefined,
            };
        });
        this.emit();
    }

    /** "CustomerOrders" → "CustomerOrderID"; "People" → "PersonID". Best-effort singularizer. */
    private defaultFkColumnName(tableName: string): string {
        const base = tableName.endsWith('ies')
            ? tableName.slice(0, -3) + 'y'
            : tableName.endsWith('s') && !tableName.endsWith('ss')
                ? tableName.slice(0, -1)
                : tableName;
        return `${base}ID`;
    }

    /**
     * Handle target-column selection.  Reads the column's SQL type, stores it in row
     * state, then auto-selects the first source column whose (normalised) type matches.
     */
    public OnColumnChange(rowIndex: number, column: string, entityId: string): void {
        const colInfo = this.ColumnsForEntity(entityId).find(c => c.Name === column);
        const targetType = colInfo?.SqlType;

        const autoSourceColumn = targetType
            ? this.findMatchingSourceColumn(targetType)
            : undefined;

        this.rows = this.rows.map(r => {
            if (r.rowIndex !== rowIndex) return r;
            return {
                ...r,
                ReferencedColumn: column,
                referencedColumnType: targetType,
                // Only update source column if a better match was found
                ColumnName: autoSourceColumn ?? r.ColumnName,
            };
        });
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

        // Default the new row's source column to the first Step 2 column
        // that isn't already used by another FK row.  This honours the
        // "give the user a sensible default of any type" intent from
        // f842848683 while avoiding the multi-FK source-column collision
        // bug fixed in 8e52898ec6 — when every existing column is already
        // wired up, we fall through to OnTableChange's auto-naming
        // (mints a unique "<TargetTable>ID" once the user picks a table).
        const usedColumns = new Set(this.rows.map(r => r.ColumnName).filter(Boolean));
        const firstFreeColumn = this.AllColumns.find(c => !usedColumns.has(c.Name))?.Name ?? '';

        this.rows = [
            ...this.rows,
            {
                ColumnName: firstFreeColumn,
                ReferencedSchema: defaultSchema,
                ReferencedTable: '',
                ReferencedColumn: DEFAULT_PK_COLUMN,
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
        const entity = new Metadata().Entities.find( // global-provider-ok: client-side Angular component, single provider
            e => e.SchemaName === fk.ReferencedSchema && e.BaseTable === fk.ReferencedTable
        );
        return { ...fk, rowIndex: index, selectedEntityId: entity?.ID ?? '' };
    }

    public TrackByIndex(_: number, row: FkRowState): number { return row.rowIndex; }

    // ─── Source-column type matching ───────────────────────────────────────────

    /**
     * Find the first Step 2 source column whose SQL type matches `targetSqlType`.
     * Type comparison is case-insensitive and ignores length/precision qualifiers
     * (e.g. `NVARCHAR(255)` normalises to `NVARCHAR`).
     *
     * Returns `undefined` when no match is found so the caller can decide whether
     * to leave the existing selection untouched.
     */
    private findMatchingSourceColumn(targetSqlType: string): string | undefined {
        const normalise = (t: string) => t.toUpperCase().replace(/\s*\(.*\)$/, '').trim();
        const targetNorm = normalise(targetSqlType);
        const match = this.AllColumns.find(c => {
            const colType = c.RawSqlType ?? c.Type ?? '';
            return normalise(colType) === targetNorm;
        });
        return match?.Name;
    }

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
