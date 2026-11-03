import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone, TemplateRef } from '@angular/core';
import type { CellClassParams, ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import type { GridCellTemplateContext, GridColumnConfig, GridHeaderTemplateContext } from '../lib/entity-data-grid/models/grid-types';
import { HostColumnFormat } from '../lib/entity-data-grid/host-column-options';
import { GridTemplateCellRendererComponent, GridTemplateHeaderComponent } from '../lib/entity-data-grid/template-cell-renderer.component';

/**
 * The grid honors what the host declared on a column (`GridColumnConfig`): formatter, classes,
 * style, alignment, templates and `type` + `format` — and keeps them when a saved grid state
 * rebuilds the columns.
 */

function makeEntity(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000005-0000-0000-0000-000000000001',
    Name: 'MJ: Sample Ledgers',
    Status: 'Active',
    BaseTable: 'SampleLedger',
    BaseView: 'vwSampleLedgers',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true },
      { ID: 'F3', Name: 'TotalEntries', Type: 'int', AllowsNull: false, DefaultInView: true },
      { ID: 'F4', Name: 'TotalAmount', Type: 'decimal', AllowsNull: true, DefaultInView: true },
      { ID: 'F5', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, DefaultInView: true },
    ],
  });
}

function makeGrid(): EntityDataGridComponent {
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
  const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
  const grid = new EntityDataGridComponent(cdr, elementRef, {} as never, ngZone);
  grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
  (grid as unknown as { _entityInfo: EntityInfo })._entityInfo = makeEntity();
  return grid;
}

type GridInternals = {
  mapColumnConfigToColDef(col: GridColumnConfig): ColDef;
  buildAgColumnDefsFromGridState(settings: { Name: string; orderIndex: number; width?: number }[]): ColDef[];
  _columns: GridColumnConfig[];
};

function colDefFor(col: GridColumnConfig, grid = makeGrid()): ColDef {
  return (grid as unknown as GridInternals).mapColumnConfigToColDef(col);
}

/** Runs the column's function cell renderer the way AG Grid would and returns its HTML. */
function render(colDef: ColDef, value: unknown, data: Record<string, unknown> = {}): string {
  const renderer = colDef.cellRenderer as (p: ICellRendererParams) => string;
  return renderer({ value, data } as ICellRendererParams);
}

function formatted(colDef: ColDef, value: unknown, data: Record<string, unknown> = {}): string {
  const fmt = colDef.valueFormatter as (p: ValueFormatterParams) => string;
  return fmt({ value, data } as ValueFormatterParams);
}

function cellClassFor(colDef: ColDef, data: Record<string, unknown>): string {
  const cls = colDef.cellClass;
  if (typeof cls === 'function') return String(cls({ data } as CellClassParams) ?? '');
  return Array.isArray(cls) ? cls.join(' ') : String(cls ?? '');
}

const fakeTemplate = {} as TemplateRef<GridCellTemplateContext>;
const fakeHeaderTemplate = {} as TemplateRef<GridHeaderTemplateContext>;

describe('EntityDataGridComponent — host column options', () => {
  it('uses the host formatter as plain text, with row and column', () => {
    const col: GridColumnConfig = {
      field: 'Status',
      formatter: (value, row, column) => `${column.field}:${String(value)}:${String(row['Name'])}`,
    };
    const def = colDefFor(col);
    expect(def.cellRenderer).toBeUndefined();
    expect(formatted(def, 'Open', { Name: 'Row A' })).toBe('Status:Open:Row A');
  });

  it('adds a string cellClass to the alignment class the field set', () => {
    const def = colDefFor({ field: 'TotalEntries', type: 'number', cellClass: 'my-chip' });
    expect(cellClassFor(def, {})).toBe('cell-align-right my-chip');
  });

  it('calls a function cellClass with the row', () => {
    const def = colDefFor({
      field: 'Status',
      cellClass: (row) => (row['Status'] === 'Late' ? 'is-late' : ''),
    });
    expect(cellClassFor(def, { Status: 'Late' })).toBe('is-late');
    expect(cellClassFor(def, { Status: 'Open' })).toBe('');
  });

  it('applies cellStyle per row', () => {
    const def = colDefFor({ field: 'Status', cellStyle: (row) => ({ fontWeight: row['Status'] === 'Late' ? 'bold' : 'normal' }) });
    const style = def.cellStyle as (p: CellClassParams) => Record<string, string>;
    expect(style({ data: { Status: 'Late' } } as CellClassParams)).toEqual({ fontWeight: 'bold' });
  });

  it('replaces the field alignment with align / headerAlign and adds headerClass', () => {
    const def = colDefFor({ field: 'TotalEntries', type: 'number', align: 'center', headerClass: 'my-head' });
    expect(cellClassFor(def, {})).toBe('cell-align-center');
    expect(def.headerClass).toBe('header-align-center my-head');

    const split = colDefFor({ field: 'Name', align: 'right', headerAlign: 'left' });
    expect(split.headerClass).toBe('header-align-left');
  });

  it('renders a type:number #,##0 column named like a total as a number, not currency', () => {
    const def = colDefFor({ field: 'TotalEntries', type: 'number', format: '#,##0' });
    const html = render(def, 1);
    expect(html).toContain('>1<');
    expect(html).not.toContain('$');
    expect(render(def, 12345)).toContain('12,345');
  });

  it('stops the currency guess for a declared number with no format string', () => {
    const def = colDefFor({ field: 'TotalAmount', type: 'number' });
    expect(render(def, 1.5)).not.toContain('$');
  });

  it('still guesses currency from the name when the host declares no type', () => {
    const def = colDefFor({ field: 'TotalAmount' });
    expect(render(def, 1)).toContain('$1.00');
  });

  it('uses the template renderer for a cellTemplate column and a template header for headerTemplate', () => {
    const def = colDefFor({ field: 'Status', cellTemplate: fakeTemplate, headerTemplate: fakeHeaderTemplate });
    expect(def.cellRenderer).toBe(GridTemplateCellRendererComponent);
    expect((def.cellRendererParams as { mjTemplate: unknown }).mjTemplate).toBe(fakeTemplate);
    expect(def.headerComponent).toBe(GridTemplateHeaderComponent);
    expect((def.headerComponentParams as { mjTemplate: unknown }).mjTemplate).toBe(fakeHeaderTemplate);
  });

  it('keeps the host formatter and format when a saved grid state rebuilds the columns', () => {
    const grid = makeGrid();
    const internals = grid as unknown as GridInternals;
    internals._columns = [
      { field: 'Status', formatter: (v) => `[${String(v)}]` },
      { field: 'TotalEntries', type: 'number', format: '#,##0' },
    ];
    // What a resize writes: names, order and widths, no format.
    const defs = internals.buildAgColumnDefsFromGridState([
      { Name: 'Status', orderIndex: 0, width: 140 },
      { Name: 'TotalEntries', orderIndex: 1, width: 90 },
    ]);
    const status = defs.find(d => d.field === 'Status')!;
    const total = defs.find(d => d.field === 'TotalEntries')!;
    expect(formatted(status, 'Open')).toBe('[Open]');
    expect(render(total, 1)).not.toContain('$');
  });
});

describe('HostColumnFormat', () => {
  it('reads decimals and grouping from a number format', () => {
    expect(HostColumnFormat({ field: 'X', type: 'number', format: '#,##0.00' })).toEqual({ type: 'number', decimals: 2, thousandsSeparator: true });
    expect(HostColumnFormat({ field: 'X', type: 'currency', format: '0.0' })).toEqual({ type: 'currency', decimals: 1, thousandsSeparator: false });
    expect(HostColumnFormat({ field: 'X', type: 'percent', format: '0%' })).toEqual({ type: 'percent', decimals: 0, thousandsSeparator: false });
  });

  it('takes date presets and ignores other date patterns', () => {
    expect(HostColumnFormat({ field: 'X', type: 'date', format: 'long' })).toEqual({ type: 'date', dateFormat: 'long' });
    expect(HostColumnFormat({ field: 'X', type: 'date', format: 'yyyy-MM-dd' })).toBeUndefined();
  });

  it('returns nothing without a type or a format string', () => {
    expect(HostColumnFormat({ field: 'X', format: '#,##0' })).toBeUndefined();
    expect(HostColumnFormat({ field: 'X', type: 'number' })).toBeUndefined();
    expect(HostColumnFormat({ field: 'X', type: 'string', format: 'abc' })).toBeUndefined();
  });
});
