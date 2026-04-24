/**
 * Unit tests for DatabasePreviewPaneComponent's pure builders.
 *
 * Covers:
 *   - BuildFocusId — derives the ERD focus-node id from the current spec.
 *   - BuildErdNodes — emits one focus node + one satellite per distinct FK target,
 *     synthesizes UUID columns for FKs not yet declared in Columns, and annotates
 *     existing columns with FK link metadata.
 *   - BuildSqlText — deterministic CREATE TABLE DDL including FK constraints.
 *   - FormatColumnLine / FormatFieldType — SQL type mapping.
 *
 * These builders are static so we can test them without Angular DI / TestBed.
 * See database-preview-pane.component.ts for the component wrapper.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock Angular so importing the component file doesn't pull the runtime.
vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  Input: () => () => {},
  ChangeDetectionStrategy: { OnPush: 1 },
  ChangeDetectorRef: class { markForCheck() {} detectChanges() {} },
  inject: () => ({ markForCheck() {}, detectChanges() {} }),
}));

// Mock @memberjunction/core — the component imports Metadata for satellite
// enrichment, but the pure static builders tested here don't touch it.
vi.mock('@memberjunction/core', () => ({
  Metadata: class { Entities: unknown[] = []; },
}));

import { DatabasePreviewPaneComponent } from '../DatabaseDesigner/components/shared/database-preview-pane.component';
import type { EntityTableSpec, ColumnSpec, ForeignKeySpec } from '../DatabaseDesigner/database-designer.types';

describe('DatabasePreviewPaneComponent — pure builders', () => {

    // ─── BuildFocusId ──────────────────────────────────────────────────────

    describe('BuildFocusId', () => {
        it('returns null when neither TableName nor EntityName is set', () => {
            expect(DatabasePreviewPaneComponent.BuildFocusId({})).toBeNull();
        });

        it('prefers TableName over EntityName', () => {
            expect(DatabasePreviewPaneComponent.BuildFocusId({
                TableName: 'Customers',
                EntityName: 'Customer Accounts',
            } as Partial<EntityTableSpec>)).toBe('focus:Customers');
        });

        it('falls back to EntityName when TableName is missing', () => {
            expect(DatabasePreviewPaneComponent.BuildFocusId({
                EntityName: 'Customer Accounts',
            } as Partial<EntityTableSpec>)).toBe('focus:Customer Accounts');
        });
    });

    // ─── BuildErdNodes ─────────────────────────────────────────────────────

    describe('BuildErdNodes', () => {
        it('emits a single focus node with system PK + audit fields when no columns or FKs', () => {
            const nodes = DatabasePreviewPaneComponent.BuildErdNodes({
                TableName: 'Orders', EntityName: 'Orders', SchemaName: '__mj_UDT',
            });
            expect(nodes).toHaveLength(1);
            const focus = nodes[0];
            expect(focus.id).toBe('focus:Orders');
            expect(focus.schemaName).toBe('__mj_UDT');

            const fieldNames = focus.fields.map(f => f.name);
            expect(fieldNames).toContain('ID');
            expect(fieldNames).toContain('__mj_CreatedAt');
            expect(fieldNames).toContain('__mj_UpdatedAt');

            const pk = focus.fields.find(f => f.name === 'ID');
            expect(pk?.isPrimaryKey).toBe(true);
        });

        it('includes user columns in declaration order between PK and audit fields', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', EntityName: 'Orders', SchemaName: '__mj_UDT',
                Columns: [
                    { Name: 'OrderNumber', Type: 'string', IsNullable: false, MaxLength: 50 },
                    { Name: 'Total',       Type: 'decimal', IsNullable: false, Precision: 18, Scale: 2 },
                ],
            };
            const nodes = DatabasePreviewPaneComponent.BuildErdNodes(spec);
            const names = nodes[0].fields.map(f => f.name);
            expect(names).toEqual(['ID', 'OrderNumber', 'Total', '__mj_CreatedAt', '__mj_UpdatedAt']);

            const total = nodes[0].fields.find(f => f.name === 'Total');
            expect(total?.type).toBe('DECIMAL(18,2)');
        });

        it('emits one satellite node per distinct FK target and annotates source column', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', EntityName: 'Orders', SchemaName: '__mj_UDT',
                Columns: [
                    { Name: 'CustomerID', Type: 'uuid', IsNullable: true },
                ],
                ForeignKeys: [
                    { ColumnName: 'CustomerID', ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true },
                ],
            };
            const nodes = DatabasePreviewPaneComponent.BuildErdNodes(spec);

            expect(nodes).toHaveLength(2);
            expect(nodes[1].id).toBe('ref:crm.Customers');

            const source = nodes[0].fields.find(f => f.name === 'CustomerID');
            expect(source?.relatedNodeId).toBe('ref:crm.Customers');
            expect(source?.relatedNodeName).toBe('Customers');
            expect(source?.relatedFieldName).toBe('ID');
        });

        it('synthesizes a UUID source column when the FK references a column not in Columns', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', EntityName: 'Orders', SchemaName: '__mj_UDT',
                Columns: [],
                ForeignKeys: [
                    { ColumnName: 'CustomerID', ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true },
                ],
            };
            const nodes = DatabasePreviewPaneComponent.BuildErdNodes(spec);
            const synth = nodes[0].fields.find(f => f.name === 'CustomerID');
            expect(synth).toBeDefined();
            expect(synth?.type).toBe('uniqueidentifier');
            expect(synth?.relatedNodeId).toBe('ref:crm.Customers');
        });

        it('uses enriched satellite fields when the enrichment map has a match', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', EntityName: 'Orders', SchemaName: '__mj_UDT',
                ForeignKeys: [
                    { ColumnName: 'CustomerID', ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true },
                ],
            };
            const enrichments = new Map<string, ReturnType<typeof DatabasePreviewPaneComponent.BuildErdNodes>[number]['fields']>([
                ['ref:crm.Customers', [
                    { id: 'ref:crm.Customers:ID',   name: 'ID',   type: 'uniqueidentifier', isPrimaryKey: true },
                    { id: 'ref:crm.Customers:Name', name: 'Name', type: 'nvarchar(255)',    isPrimaryKey: false },
                ]],
            ]);

            const nodes = DatabasePreviewPaneComponent.BuildErdNodes(spec, enrichments);
            const satellite = nodes.find(n => n.id === 'ref:crm.Customers');
            expect(satellite).toBeDefined();
            expect(satellite?.fields).toHaveLength(2);
            expect(satellite?.fields.map(f => f.name)).toEqual(['ID', 'Name']);
            expect(satellite?.fields[1].type).toBe('nvarchar(255)');
        });

        it('dedupes satellite nodes for multiple FKs pointing at the same table', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', EntityName: 'Orders', SchemaName: '__mj_UDT',
                ForeignKeys: [
                    { ColumnName: 'PrimaryCustomerID',   ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true },
                    { ColumnName: 'SecondaryCustomerID', ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true },
                ],
            };
            const nodes = DatabasePreviewPaneComponent.BuildErdNodes(spec);
            const satellites = nodes.filter(n => n.id.startsWith('ref:'));
            expect(satellites).toHaveLength(1);
        });
    });

    // ─── BuildSqlText ──────────────────────────────────────────────────────

    describe('BuildSqlText', () => {
        it('emits CREATE TABLE with system columns when spec is empty', () => {
            const sql = DatabasePreviewPaneComponent.BuildSqlText({
                TableName: 'Orders', SchemaName: '__mj_UDT', EntityName: 'Orders',
            });
            expect(sql).toContain('CREATE TABLE [__mj_UDT].[Orders]');
            expect(sql).toContain('[ID]');
            expect(sql).toContain('UNIQUEIDENTIFIER');
            expect(sql).toContain('NEWSEQUENTIALID()');
            expect(sql).toContain('[__mj_CreatedAt]');
            expect(sql).toContain('[__mj_UpdatedAt]');
            expect(sql).toContain('CONSTRAINT [PK_Orders]');
        });

        it('includes user columns with their mapped SQL types', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', SchemaName: '__mj_UDT', EntityName: 'Orders',
                Columns: [
                    { Name: 'OrderNumber', Type: 'string',  IsNullable: false, MaxLength: 50 },
                    { Name: 'Total',       Type: 'decimal', IsNullable: false, Precision: 18, Scale: 2 },
                    { Name: 'PlacedAt',    Type: 'datetime', IsNullable: false, DefaultValue: 'GETUTCDATE()' },
                ],
            };
            const sql = DatabasePreviewPaneComponent.BuildSqlText(spec);
            expect(sql).toMatch(/\[OrderNumber\]\s+NVARCHAR\(50\)\s+NOT NULL/);
            expect(sql).toMatch(/\[Total\]\s+DECIMAL\(18,2\)\s+NOT NULL/);
            expect(sql).toMatch(/\[PlacedAt\]\s+DATETIMEOFFSET\s+NOT NULL DEFAULT GETUTCDATE\(\)/);
        });

        it('emits a FK constraint and synthesizes undeclared FK source columns', () => {
            const spec: Partial<EntityTableSpec> = {
                TableName: 'Orders', SchemaName: '__mj_UDT', EntityName: 'Orders',
                Columns: [],
                ForeignKeys: [
                    { ColumnName: 'CustomerID', ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true },
                ],
            };
            const sql = DatabasePreviewPaneComponent.BuildSqlText(spec);
            expect(sql).toContain('-- auto-generated FK');
            expect(sql).toContain('ALTER TABLE [__mj_UDT].[Orders]');
            expect(sql).toContain('ADD CONSTRAINT [FK_Orders_CustomerID]');
            expect(sql).toContain('REFERENCES [crm].[Customers]([ID])');
        });

        it('switches lead comment based on isAlter flag', () => {
            const spec: Partial<EntityTableSpec> = { TableName: 'Orders', SchemaName: '__mj_UDT', EntityName: 'Orders' };
            expect(DatabasePreviewPaneComponent.BuildSqlText(spec, false)).toContain('preview');
            expect(DatabasePreviewPaneComponent.BuildSqlText(spec, false)).not.toContain('(ALTER)');
            expect(DatabasePreviewPaneComponent.BuildSqlText(spec, true)).toContain('(ALTER)');
        });
    });

    // ─── FormatFieldType ───────────────────────────────────────────────────

    describe('FormatFieldType', () => {
        const cases: Array<[Partial<ColumnSpec>, string]> = [
            [{ Type: 'string' },                             'NVARCHAR(200)'],
            [{ Type: 'string', MaxLength: 50 },              'NVARCHAR(50)'],
            [{ Type: 'text' },                               'NVARCHAR(MAX)'],
            [{ Type: 'integer' },                            'INT'],
            [{ Type: 'bigint' },                             'BIGINT'],
            [{ Type: 'float' },                              'FLOAT'],
            [{ Type: 'decimal' },                            'DECIMAL(18,2)'],
            [{ Type: 'decimal', Precision: 10, Scale: 4 },   'DECIMAL(10,4)'],
            [{ Type: 'boolean' },                            'BIT'],
            [{ Type: 'date' },                               'DATE'],
            [{ Type: 'datetime' },                           'DATETIMEOFFSET'],
            [{ Type: 'time' },                               'TIME'],
            [{ Type: 'uuid' },                               'UNIQUEIDENTIFIER'],
            [{ Type: 'json' },                               'NVARCHAR(MAX)'],
        ];
        it.each(cases)('maps %o → %s', (col, expected) => {
            expect(DatabasePreviewPaneComponent.FormatFieldType({ ...col, Name: 'X', IsNullable: false } as ColumnSpec))
                .toBe(expected);
        });

        it('respects RawSqlType override', () => {
            const col: ColumnSpec = { Name: 'X', IsNullable: false, Type: 'string', RawSqlType: 'NCHAR(10)' };
            expect(DatabasePreviewPaneComponent.FormatFieldType(col)).toBe('NCHAR(10)');
        });
    });

    // ─── MakeSatelliteId ───────────────────────────────────────────────────

    describe('MakeSatelliteId', () => {
        it('generates a stable id from schema + table', () => {
            const fk: ForeignKeySpec = {
                ColumnName: 'X', ReferencedSchema: 'crm', ReferencedTable: 'Customers', ReferencedColumn: 'ID', IsSoft: true,
            };
            expect(DatabasePreviewPaneComponent.MakeSatelliteId(fk)).toBe('ref:crm.Customers');
        });
    });
});
