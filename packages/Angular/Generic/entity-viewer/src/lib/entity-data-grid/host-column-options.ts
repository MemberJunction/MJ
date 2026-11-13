import type { CellClassParams, CellStyle, ColDef, ValueFormatterParams } from 'ag-grid-community';
import type { MJUserViewEntity_IColumnFormat as ColumnFormat } from '@memberjunction/core-entities';
import type { GridColumnConfig } from './models/grid-types';
import { GridTemplateCellRendererComponent, GridTemplateHeaderComponent } from './template-cell-renderer.component';
import type { GridTemplateCellRendererParams, GridTemplateHeaderParams } from './template-cell-renderer.component';

/** Date presets `formatCustomDate` understands; anything else falls back to the default date rendering. */
const DATE_FORMAT_PRESET = /^(short|medium|long)(-weekday)?$/;

type CellClassValue = ColDef['cellClass'];
type HeaderClassValue = ColDef['headerClass'];

/**
 * Translates a host column's `type` + `format` string into the view `ColumnFormat` the grid already
 * renders with. Returns `undefined` when the host gave no format string (the field's default
 * rendering applies, steered only by the declared type) or a type that has no custom formatter.
 *
 * Number-family formats use the spreadsheet notation `#,##0.00`: the digits after `.` set the
 * decimals and a `,` turns grouping on. Date-family formats take the presets `short`, `medium`
 * and `long`, optionally with `-weekday`.
 */
export function HostColumnFormat(col: GridColumnConfig): ColumnFormat | undefined {
  const format = col.format?.trim();
  if (!format || !col.type) return undefined;

  switch (col.type) {
    case 'number':
    case 'currency':
    case 'percent':
      return { type: col.type, ...parseNumberFormat(format) };
    case 'date':
    case 'datetime':
      return DATE_FORMAT_PRESET.test(format) ? { type: col.type, dateFormat: format } : undefined;
    default:
      return undefined;
  }
}

function parseNumberFormat(format: string): Pick<ColumnFormat, 'decimals' | 'thousandsSeparator'> {
  const dot = format.indexOf('.');
  const fraction = dot >= 0 ? format.slice(dot + 1) : '';
  const decimals = (fraction.match(/[0#]/g) ?? []).length;
  return { decimals, thousandsSeparator: format.includes(',') };
}

/**
 * Applies what the host declared on a column on top of the field-driven defaults
 * (`applyFieldFormatter`), so the host wins: formatter, cell/header classes, cell style, alignment
 * and cell/header templates. A host `formatter` or `cellTemplate` replaces the field's renderer,
 * including foreign-key links and search highlighting.
 */
export function ApplyHostColumnOptions(colDef: ColDef, col: GridColumnConfig): void {
  applyFormatter(colDef, col);
  applyAlignment(colDef, col);
  applyCellClass(colDef, col);
  applyHeaderClass(colDef, col);
  applyCellStyle(colDef, col);
  applyTemplates(colDef, col);
}

function applyFormatter(colDef: ColDef, col: GridColumnConfig): void {
  const formatter = col.formatter;
  if (!formatter) return;
  colDef.valueFormatter = (params: ValueFormatterParams) => formatter(params.value, rowOf(params.data), col);
  // Without a cell renderer AG Grid shows the formatted value as plain text.
  colDef.cellRenderer = undefined;
}

function applyAlignment(colDef: ColDef, col: GridColumnConfig): void {
  const headerAlign = col.headerAlign ?? col.align;
  if (col.align) {
    colDef.cellClass = joinClasses(stripClass(colDef.cellClass, 'cell-align-'), `cell-align-${col.align}`);
  }
  if (headerAlign) {
    colDef.headerClass = joinClasses(stripClass(colDef.headerClass, 'header-align-'), `header-align-${headerAlign}`);
  }
}

function applyCellClass(colDef: ColDef, col: GridColumnConfig): void {
  const hostClass = col.cellClass;
  if (!hostClass) return;
  const base = classText(colDef.cellClass);
  if (typeof hostClass === 'string') {
    colDef.cellClass = joinClasses(base, hostClass);
    return;
  }
  colDef.cellClass = (params: CellClassParams) => joinClasses(base, hostClass(rowOf(params.data), col)) ?? '';
}

function applyHeaderClass(colDef: ColDef, col: GridColumnConfig): void {
  if (!col.headerClass) return;
  colDef.headerClass = joinClasses(classText(colDef.headerClass), col.headerClass);
}

function applyCellStyle(colDef: ColDef, col: GridColumnConfig): void {
  const hostStyle = col.cellStyle;
  if (!hostStyle) return;
  colDef.cellStyle = (params: CellClassParams): CellStyle => hostStyle(rowOf(params.data), col);
}

function applyTemplates(colDef: ColDef, col: GridColumnConfig): void {
  if (col.cellTemplate) {
    const params: GridTemplateCellRendererParams = { mjTemplate: col.cellTemplate, mjColumn: col };
    colDef.cellRenderer = GridTemplateCellRendererComponent;
    colDef.cellRendererParams = params;
  }
  if (col.headerTemplate) {
    const params: GridTemplateHeaderParams = { mjTemplate: col.headerTemplate, mjColumn: col };
    colDef.headerComponent = GridTemplateHeaderComponent;
    colDef.headerComponentParams = params;
  }
}

function rowOf(data: unknown): Record<string, unknown> {
  return (data && typeof data === 'object') ? data as Record<string, unknown> : {};
}

/** The static class text of a cell/header class; a function form set earlier has none to keep. */
function classText(value: CellClassValue | HeaderClassValue): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(' ');
  return undefined;
}

function stripClass(value: CellClassValue | HeaderClassValue, prefix: string): string | undefined {
  const text = classText(value);
  if (!text) return undefined;
  return text.split(/\s+/).filter(c => c && !c.startsWith(prefix)).join(' ') || undefined;
}

function joinClasses(...parts: (string | undefined)[]): string | undefined {
  const joined = parts.filter((p): p is string => !!p && !!p.trim()).map(p => p.trim()).join(' ');
  return joined || undefined;
}
