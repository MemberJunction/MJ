/**
 * @module database-preview-pane.component
 * @description Live preview of the current wizard `TableDefinition`.
 *
 * Two tabs:
 *   - **Diagram** — renders an `mj-erd-diagram` with the in-progress entity
 *     as the focus node and any FK-referenced entities as satellite nodes.
 *   - **SQL** — renders the CREATE TABLE / ALTER TABLE DDL in a read-only
 *     `mj-code-editor` with SQL syntax highlighting.
 *
 * The component is a pure function of `TableDefinition`: set the input, the
 * preview re-renders.  No side effects, no service subscriptions — the wizard
 * host owns the subscription to `EntityWizardStateService.tableDefinition$`
 * and pushes values down.
 */

import {
    Component, Input, ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { Metadata } from '@memberjunction/core';
import type { ERDNode, ERDField } from '@memberjunction/ng-entity-relationship-diagram';
import type { ColumnSpec, EntityTableSpec, ForeignKeySpec } from '../../database-designer.types.js';

/** Which tab is currently active. */
export type PreviewTab = 'diagram' | 'sql';

@Component({
    standalone: false,
    selector: 'mj-database-preview-pane',
    templateUrl: './database-preview-pane.component.html',
    styleUrls: ['./database-preview-pane.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabasePreviewPaneComponent {

    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Inputs ────────────────────────────────────────────────────────────

    /**
     * Current wizard draft.  Accepts a partial spec so the preview can
     * render meaningfully even on Step 1 (name only).
     */
    @Input()
    public set TableDefinition(value: Partial<EntityTableSpec> | null | undefined) {
        this._tableDefinition = value ?? {};
        this.recompute();
    }
    public get TableDefinition(): Partial<EntityTableSpec> { return this._tableDefinition; }
    private _tableDefinition: Partial<EntityTableSpec> = {};

    /**
     * True when this preview is showing an edit of an existing entity
     * (modify flow).  Switches the SQL header to `ALTER` wording and draws
     * a "current vs proposed" indicator in the diagram.
     *
     * Defaults to false (create flow).
     */
    @Input()
    public set IsAlter(value: boolean) {
        this._isAlter = value;
        this.recompute();
    }
    public get IsAlter(): boolean { return this._isAlter; }
    private _isAlter = false;

    // ─── View state ────────────────────────────────────────────────────────

    public ActiveTab: PreviewTab = 'diagram';

    public ErdNodes: ERDNode[] = [];

    public SqlText = '';

    /** Focus node ID — lets `mj-erd-diagram` highlight the in-progress entity. */
    public FocusNodeId: string | null = null;

    /**
     * Stable config reference — bound to `mj-erd-diagram` via `[config]`.
     * Must be a class property, not an inline object literal in the template,
     * or every CD cycle produces a new reference and the ERD re-runs its
     * layout / fit-to-view on every tick.
     */
    public readonly ErdConfig = { showAllFields: true, maxNodeHeight: 520 } as const;

    // ─── Tab handler ───────────────────────────────────────────────────────

    public SelectTab(tab: PreviewTab): void {
        this.ActiveTab = tab;
        this.cdr.markForCheck();
    }

    // ─── Derivation ────────────────────────────────────────────────────────

    private recompute(): void {
        const enrichments = this.resolveSatelliteFields(this._tableDefinition.ForeignKeys ?? []);
        this.ErdNodes = DatabasePreviewPaneComponent.BuildErdNodes(this._tableDefinition, enrichments);
        this.SqlText = DatabasePreviewPaneComponent.BuildSqlText(this._tableDefinition, this._isAlter);
        this.FocusNodeId = DatabasePreviewPaneComponent.BuildFocusId(this._tableDefinition);
        this.cdr.markForCheck();
    }

    /**
     * Look up each FK target in MJ metadata and return PK + name-field rows per
     * satellite node.  Falls back to a minimal single-column stub when the
     * referenced table isn't a known MJ entity.
     */
    private resolveSatelliteFields(foreignKeys: ForeignKeySpec[]): Map<string, ERDField[]> {
        const md = new Metadata(); // global-provider-ok: client-side Angular component, single provider
        const result = new Map<string, ERDField[]>();
        const seen = new Set<string>();

        for (const fk of foreignKeys) {
            const satId = DatabasePreviewPaneComponent.MakeSatelliteId(fk);
            if (seen.has(satId)) continue;
            seen.add(satId);

            const entity = md.Entities.find(e =>
                e.SchemaName === fk.ReferencedSchema && e.BaseTable === fk.ReferencedTable);
            if (!entity) continue;

            const fields: ERDField[] = [];
            const refField = entity.Fields.find(f => f.Name === fk.ReferencedColumn);
            if (refField) {
                fields.push({
                    id: `${satId}:${refField.Name}`,
                    name: refField.Name,
                    type: refField.SQLFullType,
                    isPrimaryKey: refField.IsPrimaryKey,
                });
            }

            const nameField = entity.Fields.find(f => f.IsNameField && f.Name !== fk.ReferencedColumn);
            if (nameField) {
                fields.push({
                    id: `${satId}:${nameField.Name}`,
                    name: nameField.Name,
                    type: nameField.SQLFullType,
                    isPrimaryKey: false,
                });
            }

            if (fields.length > 0) result.set(satId, fields);
        }

        return result;
    }

    // ─── Pure builders (exposed for unit testing) ──────────────────────────

    /** DOM id for the focus node, used by `mj-erd-diagram` to highlight. */
    public static BuildFocusId(spec: Partial<EntityTableSpec>): string | null {
        const name = spec.TableName || spec.EntityName;
        return name ? `focus:${name}` : null;
    }

    /**
     * ERD node list: one focus node + one satellite per distinct FK target.
     * `satelliteEnrichments` — optional PK + name-field rows per satellite,
     * keyed by `MakeSatelliteId(fk)`.  When absent, satellites render a
     * minimal single-column stub.
     */
    public static BuildErdNodes(
        spec: Partial<EntityTableSpec>,
        satelliteEnrichments?: Map<string, ERDField[]>,
    ): ERDNode[] {
        const tableName = spec.TableName || spec.EntityName || 'NewEntity';
        const schemaName = spec.SchemaName || '__mj_UDT';
        const focusId = `focus:${tableName}`;

        const focusFields = this.BuildFocusFields(focusId, spec);
        this.AnnotateFkLinks(focusFields, spec.ForeignKeys ?? []);

        const focusNode: ERDNode = {
            id: focusId,
            name: spec.EntityName || tableName,
            schemaName,
            baseTable: tableName,
            description: spec.Description,
            fields: focusFields,
        };

        return [focusNode, ...this.BuildSatelliteNodes(spec.ForeignKeys ?? [], satelliteEnrichments)];
    }

    /**
     * Field list for the focus node: PK + user columns + synthetic FK columns + system audit.
     * Pure — no link annotation.  `AnnotateFkLinks` runs after to mark FK sources.
     */
    public static BuildFocusFields(focusId: string, spec: Partial<EntityTableSpec>): ERDField[] {
        const columns = spec.Columns ?? [];
        const foreignKeys = spec.ForeignKeys ?? [];
        const columnNames = new Set(columns.map(c => c.Name));

        const fields: ERDField[] = [];

        fields.push({
            id: `${focusId}:ID`,
            name: 'ID',
            type: 'uniqueidentifier',
            isPrimaryKey: true,
            description: 'Primary key — always present',
        });

        for (const col of columns) {
            fields.push({
                id: `${focusId}:${col.Name}`,
                name: col.Name,
                type: this.FormatFieldType(col),
                isPrimaryKey: false,
                allowsNull: col.IsNullable,
                length: col.MaxLength,
                precision: col.Precision,
                scale: col.Scale,
                defaultValue: col.DefaultValue,
                description: col.Description,
            });
        }

        // Synthetic field for any FK whose source column isn't declared in Columns yet.
        for (const fk of foreignKeys) {
            if (!fk.ColumnName || columnNames.has(fk.ColumnName)) continue;
            fields.push({
                id: `${focusId}:${fk.ColumnName}`,
                name: fk.ColumnName,
                type: 'uniqueidentifier',
                isPrimaryKey: false,
                allowsNull: true,
                relatedNodeId: this.MakeSatelliteId(fk),
                relatedNodeName: fk.ReferencedTable,
                relatedFieldName: fk.ReferencedColumn,
            });
        }

        fields.push(
            {
                id: `${focusId}:__mj_CreatedAt`,
                name: '__mj_CreatedAt',
                type: 'datetimeoffset',
                isPrimaryKey: false,
                defaultValue: 'GETUTCDATE()',
                description: 'Record creation timestamp',
            },
            {
                id: `${focusId}:__mj_UpdatedAt`,
                name: '__mj_UpdatedAt',
                type: 'datetimeoffset',
                isPrimaryKey: false,
                defaultValue: 'GETUTCDATE()',
                description: 'Last update timestamp',
            },
        );

        return fields;
    }

    /** Stamp FK metadata onto any existing fields that match an FK source column. */
    public static AnnotateFkLinks(fields: ERDField[], foreignKeys: ForeignKeySpec[]): void {
        for (const fk of foreignKeys) {
            if (!fk.ColumnName) continue;
            const fld = fields.find(f => f.name === fk.ColumnName);
            if (fld && !fld.relatedNodeId) {
                fld.relatedNodeId = this.MakeSatelliteId(fk);
                fld.relatedNodeName = fk.ReferencedTable;
                fld.relatedFieldName = fk.ReferencedColumn;
            }
        }
    }

    /**
     * One satellite node per distinct FK target (dedupes on schema+table).
     * When `enrichments` provides rows for a satellite id, those rows (PK +
     * name field, resolved from MJ metadata) are used instead of the minimal
     * single-column stub.
     */
    public static BuildSatelliteNodes(
        foreignKeys: ForeignKeySpec[],
        enrichments?: Map<string, ERDField[]>,
    ): ERDNode[] {
        const seen = new Set<string>();
        const satelliteNodes: ERDNode[] = [];
        for (const fk of foreignKeys) {
            // Skip in-progress rows where the target hasn't been picked yet.
            if (!fk.ReferencedSchema || !fk.ReferencedTable) continue;
            const satId = this.MakeSatelliteId(fk);
            if (seen.has(satId)) continue;
            seen.add(satId);

            const enriched = enrichments?.get(satId);
            const fields: ERDField[] = enriched && enriched.length > 0 ? enriched : [
                {
                    id: `${satId}:${fk.ReferencedColumn}`,
                    name: fk.ReferencedColumn,
                    type: 'uniqueidentifier',
                    isPrimaryKey: true,
                },
            ];

            satelliteNodes.push({
                id: satId,
                name: fk.ReferencedTable,
                schemaName: fk.ReferencedSchema,
                baseTable: fk.ReferencedTable,
                fields,
            });
        }
        return satelliteNodes;
    }

    public static MakeSatelliteId(fk: ForeignKeySpec): string {
        return `ref:${fk.ReferencedSchema}.${fk.ReferencedTable}`;
    }

    /** Preview DDL for the given TableDefinition.  `isAlter` only affects the lead comment. */
    public static BuildSqlText(spec: Partial<EntityTableSpec>, isAlter = false): string {
        const table = spec.TableName || spec.EntityName || 'NewEntity';
        const schema = spec.SchemaName || '__mj_UDT';
        const qualified = `[${schema}].[${table}]`;
        const leadComment = isAlter
            ? `-- Generated by Database Designer · preview (ALTER)`
            : `-- Generated by Database Designer · preview`;

        // Column lines, padded for alignment
        const colLines: string[] = [];
        colLines.push(`  [ID]              UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),`);

        for (const col of spec.Columns ?? []) {
            if (!col.Name) continue;
            colLines.push(`  ${this.FormatColumnLine(col)},`);
        }

        // FK columns that aren't already in Columns
        for (const fk of spec.ForeignKeys ?? []) {
            const inColumns = (spec.Columns ?? []).some(c => c.Name === fk.ColumnName);
            if (inColumns) continue;
            const name = `[${fk.ColumnName}]`.padEnd(18);
            colLines.push(`  ${name} UNIQUEIDENTIFIER  NULL, -- auto-generated FK`);
        }

        colLines.push(`  [__mj_CreatedAt]  DATETIMEOFFSET    NOT NULL DEFAULT GETUTCDATE(),`);
        colLines.push(`  [__mj_UpdatedAt]  DATETIMEOFFSET    NOT NULL DEFAULT GETUTCDATE(),`);
        colLines.push(`  CONSTRAINT [PK_${table}] PRIMARY KEY ([ID])`);

        const lines: string[] = [
            leadComment,
            `CREATE TABLE ${qualified} (`,
            ...colLines,
            `);`,
        ];

        // FK constraints
        for (const fk of spec.ForeignKeys ?? []) {
            lines.push('');
            lines.push(`ALTER TABLE ${qualified}`);
            lines.push(`  ADD CONSTRAINT [FK_${table}_${fk.ColumnName}]`);
            lines.push(`  FOREIGN KEY ([${fk.ColumnName}]) REFERENCES [${fk.ReferencedSchema}].[${fk.ReferencedTable}]([${fk.ReferencedColumn}]);`);
        }

        return lines.join('\n');
    }

    public static FormatColumnLine(col: ColumnSpec): string {
        const name = `[${col.Name}]`.padEnd(18);
        const type = col.RawSqlType || this.FormatFieldType(col);
        const nullability = col.IsNullable ? 'NULL' : 'NOT NULL';
        const dflt = col.DefaultValue ? ` DEFAULT ${col.DefaultValue}` : '';
        return `${name} ${type.padEnd(16)} ${nullability}${dflt}`;
    }

    public static FormatFieldType(col: ColumnSpec): string {
        if (col.RawSqlType) return col.RawSqlType;
        switch (col.Type) {
            case 'string':   return `NVARCHAR(${col.MaxLength ?? 200})`;
            case 'text':     return 'NVARCHAR(MAX)';
            case 'integer':  return 'INT';
            case 'bigint':   return 'BIGINT';
            case 'float':    return 'FLOAT';
            case 'decimal':  return `DECIMAL(${col.Precision ?? 18},${col.Scale ?? 2})`;
            case 'boolean':  return 'BIT';
            case 'date':     return 'DATE';
            case 'datetime': return 'DATETIMEOFFSET';
            case 'time':     return 'TIME';
            case 'uuid':     return 'UNIQUEIDENTIFIER';
            case 'json':     return 'NVARCHAR(MAX)';
            default:         return 'NVARCHAR(200)';
        }
    }
}
