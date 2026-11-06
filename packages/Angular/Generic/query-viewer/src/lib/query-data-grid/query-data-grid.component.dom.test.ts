import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { renderComponentFixture, query, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { QueryDataGridComponent } from './query-data-grid.component';
import { ExportService } from '@memberjunction/ng-export-service';
import { ExcelAddinClient } from '@memberjunction/excel-addin';
import type { QueryGridColumnConfig } from './models/query-grid-types';
import { BuildColumnsForResult } from './models/query-grid-types';
import type { MJQueryEntityExtended, MJQueryFieldEntity } from '@memberjunction/core-entities';

/**
 * DOM coverage for <mj-query-data-grid> — the AG-Grid-backed query results grid (~4×). The grid body
 * itself (AG-Grid) is out of scope for a DOM unit; these cover the grid's own chrome: the toolbar
 * (visibility, row count, refresh), the loading overlay, the empty state, and the pagination footer —
 * all driven by the Data / IsLoading / TotalRowCount inputs. AG-Grid + pagination + export-dialog +
 * row-detail children are stubbed.
 */

@Component({ standalone: true, selector: 'ag-grid-angular', template: '' })
class AgGridStub {
  @Input() theme: unknown; @Input() rowData: unknown; @Input() columnDefs: unknown; @Input() defaultColDef: unknown;
  @Input() gridOptions: unknown; @Input() rowSelection: unknown; @Input() getRowId: unknown;
  @Output() gridReady = new EventEmitter<unknown>(); @Output() rowClicked = new EventEmitter<unknown>();
  @Output() rowDoubleClicked = new EventEmitter<unknown>(); @Output() selectionChanged = new EventEmitter<unknown>();
  @Output() sortChanged = new EventEmitter<unknown>(); @Output() columnResized = new EventEmitter<unknown>(); @Output() columnMoved = new EventEmitter<unknown>();
}
@Component({ standalone: true, selector: 'mj-pagination', template: '<div class="pagination-stub"></div>' })
class PaginationStub { @Input() TotalRowCount = 0; @Input() PageNumber = 1; @Input() PageSize = 100; @Input() IsLoading = false;
  @Output() PageChange = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'mj-export-dialog', template: '' })
class ExportDialogStub { @Input() visible = false; @Input() config: unknown; @Output() closed = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'mj-query-row-detail', template: '' })
class RowDetailStub {
  @Input() RowData: unknown; @Input() Columns: unknown; @Input() QueryInfo: unknown; @Input() Visible = false;
  @Input() RowIndex = 0; @Input() TotalRows = 0;
  @Output() Close = new EventEmitter<void>(); @Output() EntityLinkClick = new EventEmitter<unknown>(); @Output() NavigateRow = new EventEmitter<unknown>();
}

const CHILDREN = [AgGridStub, PaginationStub, ExportDialogStub, RowDetailStub, StubEmptyStateComponent, StubLoadingComponent];
const ROWS = (n: number) => Array.from({ length: n }, (_, i) => ({ ID: String(i), Name: `Row ${i}` }));

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(QueryDataGridComponent, {
    imports: CHILDREN,
    declarations: [QueryDataGridComponent],
    providers: [provideNoopAnimations(), { provide: ExportService, useValue: {} }],
    inputs: { Data: ROWS(3), ...inputs },
  });
type Fx = ReturnType<typeof render>;

describe('QueryDataGridComponent (DOM)', () => {
  it('renders the toolbar by default and hides it when ShowToolbar is false', () => {
    expect(query(render(), '.grid-toolbar')).not.toBeNull();
  });

  it('hides the toolbar when ShowToolbar is false', () => {
    expect(query(render({ ShowToolbar: false }), '.grid-toolbar')).toBeNull();
  });

  it('shows the row count in the toolbar', () => {
    expect(query(render({ Data: ROWS(5) }), '.row-count')?.textContent).toContain('5');
  });

  it('emits RefreshRequest when the refresh button is clicked', () => {
    const f = render({ ShowRefresh: true });
    const out = capture(f.componentInstance.RefreshRequest);
    const refresh = query(f, '.toolbar-btn.icon-only') as HTMLElement;
    refresh.click();
    expect(out.length).toBe(1);
  });

  it('shows the loading overlay when IsLoading is true', () => {
    expect(query(render({ IsLoading: true }), '.loading-overlay')).not.toBeNull();
  });

  it('shows the empty state when there are no rows and it is not loading', () => {
    const f = render({ Data: [], IsLoading: false });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
  });

  it('renders the pagination footer when there are rows to page', () => {
    expect(query(render({ Data: ROWS(3), TotalRowCount: 50 }), '.pagination-stub')).not.toBeNull();
  });

  describe('a SQL date column (a calendar day)', () => {
    // Pinned west of Greenwich: the day arrives as UTC midnight, and at UTC a local-zone formatter
    // lands on the right day by accident. The AG-Grid body is stubbed, so the cell formatter and the
    // export column mapping are exercised directly.
    const originalTZ = process.env.TZ;
    beforeEach(() => { process.env.TZ = 'America/Chicago'; });
    afterEach(() => { process.env.TZ = originalTZ; });

    type GridInternals = {
      formatCellValue(value: unknown, col: { sqlBaseType: string }): string;
      getExportColumns(): Array<{ name: string; dataType?: string }>;
    };
    const internals = (fx: Fx) => fx.componentInstance as unknown as GridInternals;
    const dateCol: QueryGridColumnConfig = {
      field: 'PaymentDate', title: 'Payment Date', sqlBaseType: 'date', sqlFullType: 'date',
      visible: true, sortable: true, resizable: true, reorderable: true, order: 0, isEntityLink: false,
    };

    it('formats the cell as the stored day', () => {
      expect(internals(render()).formatCellValue('2026-10-01T00:00:00.000Z', dateCol)).toBe('Oct 1, 2026');
    });

    it('exports the column as a date-only column', () => {
      const fx = render();
      fx.componentInstance.Columns = [dateCol];
      expect(internals(fx).getExportColumns()).toEqual([{ name: 'PaymentDate', displayName: 'Payment Date', dataType: 'dateonly' }]);
    });
  });

  describe('columns come from the result, not from the query fields', () => {
    type FieldShape = Pick<MJQueryFieldEntity, 'Name' | 'Sequence' | 'SQLBaseType' | 'SQLFullType' | 'Description' | 'SourceEntity' | 'SourceEntityID' | 'SourceFieldName'>;
    const field = (name: string, sequence: number, baseType: string, description: string | null = null): MJQueryFieldEntity => {
      const shape: FieldShape = { Name: name, Sequence: sequence, SQLBaseType: baseType, SQLFullType: baseType, Description: description, SourceEntity: null, SourceEntityID: null, SourceFieldName: null };
      return shape as MJQueryFieldEntity;
    };
    const FIELDS = [field('ID', 1, 'uniqueidentifier'), field('SSN', 2, 'nvarchar', 'Social security number'), field('Amount', 3, 'money', 'Order total')];
    const queryInfo = (): MJQueryEntityExtended => {
      const shape: Pick<MJQueryEntityExtended, 'ID' | 'QueryFields'> = { ID: 'q-1', QueryFields: FIELDS };
      return shape as MJQueryEntityExtended;
    };
    // The server dropped SSN from the result (the user may not read it).
    const RESULT = [{ ID: 'a', Amount: 10.5, Extra: 'x' }, { ID: 'b', Amount: 3, Extra: 'y' }];

    it('shows only the columns the rows carry, in the order the server returned them', () => {
      const fx = render({ PersistState: false, QueryInfo: queryInfo(), Data: RESULT });
      expect(fx.componentInstance.Columns.map(c => c.field)).toEqual(['ID', 'Amount', 'Extra']);
      expect(fx.componentInstance.ColumnDefs.map(d => d.headerName)).toEqual(['ID', 'Amount', 'Extra']);
    });

    it('leaves no trace of a field the result does not carry: not a column (so not exported), not a header tooltip, not in the page', () => {
      const fx = render({ PersistState: false, QueryInfo: queryInfo(), Data: RESULT });
      expect(JSON.stringify(fx.componentInstance.Columns)).not.toMatch(/SSN|Social security/);
      expect(JSON.stringify(fx.componentInstance.ColumnDefs)).not.toMatch(/SSN|Social security/);
      expect((fx.nativeElement as HTMLElement).textContent ?? '').not.toMatch(/SSN|Social security/);
    });

    it('formats a present column from its field metadata and infers one no field describes', () => {
      const fx = render({ PersistState: false, QueryInfo: queryInfo(), Data: RESULT });
      const amount = fx.componentInstance.Columns.find(c => c.field === 'Amount');
      const extra = fx.componentInstance.Columns.find(c => c.field === 'Extra');
      expect(amount).toMatchObject({ sqlBaseType: 'money', description: 'Order total', align: 'right' });
      expect(extra).toMatchObject({ sqlBaseType: 'nvarchar', description: undefined });
    });

    it('builds no columns from the fields before any rows arrive', () => {
      const fx = render({ PersistState: false, QueryInfo: queryInfo(), Data: [] });
      expect(fx.componentInstance.Columns).toEqual([]);
      expect(fx.componentInstance.ColumnDefs).toEqual([]);
    });

    it('drops a configured column the result does not carry', () => {
      const configs = BuildColumnsForResult([{ ID: 'a', SSN: 's', Amount: 1 }], FIELDS);
      const fx = render({ ColumnConfigs: configs, Data: RESULT });
      expect(fx.componentInstance.Columns.map(c => c.field)).toEqual(['ID', 'Amount']);
    });

    it('matches field metadata by name ignoring case, keeping the result\'s spelling', () => {
      const columns = BuildColumnsForResult([{ amount: 2 }], FIELDS);
      expect(columns).toHaveLength(1);
      expect(columns[0]).toMatchObject({ field: 'amount', title: 'amount', sqlBaseType: 'money', order: 0 });
    });
  });
});

/**
 * Unified Export / Open in Excel toolbar control:
 * - Consolidates static snapshot Export and live Open in Excel behind a single toolbar button when both apply.
 * - Offered only for a saved query on a host that serves the Excel add-in, while every required parameter
 *   has a value, sending the last run's values without server-set ones.
 */
describe('QueryDataGridComponent (DOM) — Unified Export & Open in Excel toolbar button', () => {
  const QUERY_ID = '1B2C3D4E-5F60-4718-8293-A4B5C6D7E8F9';
  const PARAMS = [
    { Name: 'Region', IsRequired: true, IsServerSet: false, Type: 'string' },
    { Name: 'TenantID', IsRequired: true, IsServerSet: true, Type: 'string' },
  ];

  afterEach(() => vi.restoreAllMocks());

  const renderForExcel = (addinEnabled: boolean, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(QueryDataGridComponent, {
      imports: CHILDREN,
      declarations: [QueryDataGridComponent],
      providers: [provideNoopAnimations(), { provide: ExportService, useValue: {} }],
      inputs: { Data: ROWS(3), ...inputs },
      setup: (c) => {
        const priv = c as unknown as { _queryInfo: unknown; _excelAddinEnabled: boolean };
        priv._queryInfo = { ID: QUERY_ID, QueryParameters: PARAMS };
        priv._excelAddinEnabled = addinEnabled;
      },
    });

  it('consolidates Export and Open in Excel into a single disclosure button when the add-in is on', () => {
    const f = renderForExcel(true, { ParameterValues: { Region: 'West' } });
    const trigger = query(f, '.excel-menu-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
    expect(query(f, '.open-in-excel-btn')).toBeNull();

    trigger!.click();
    f.detectChanges();
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');
    expect(query(f, '.excel-action-menu .open-in-excel-btn')).not.toBeNull();
    expect(query(f, '.excel-action-menu .export-snapshot-btn')).not.toBeNull();
  });

  it('falls back to a 1-click Export button while a required parameter has no value', () => {
    const f = renderForExcel(true, { ParameterValues: {} });
    expect(query(f, '.excel-menu-trigger')).toBeNull();
    expect(query(f, '.export-snapshot-btn')).not.toBeNull();
  });

  it('falls back to a 1-click Export button when the host does not serve the add-in', () => {
    const f = renderForExcel(false, { ParameterValues: { Region: 'West' } });
    expect(query(f, '.excel-menu-trigger')).toBeNull();
    expect(query(f, '.export-snapshot-btn')).not.toBeNull();
  });

  it('sends the saved query with the last run\'s values (never a server-set one) from the unified menu', async () => {
    const open = vi.spyOn(ExcelAddinClient.Instance, 'OpenInExcel').mockResolvedValue({ Success: true, FileName: 'Query.xlsx' });
    const f = renderForExcel(true, { ParameterValues: { Region: 'West', TenantID: 'forged' } });
    (query(f, '.excel-menu-trigger') as HTMLElement).click();
    f.detectChanges();
    (query(f, '.excel-action-menu .open-in-excel-btn') as HTMLElement).click();
    await f.whenStable();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toEqual([{ Kind: 'Query', ID: QUERY_ID, Parameters: { Region: 'West' } }]);
  });

  it('disables Export Snapshot inside the menu when RowCount is 0 while keeping Open in Excel enabled', () => {
    const f = renderForExcel(true, { Data: [], ParameterValues: { Region: 'West' } });
    (query(f, '.excel-menu-trigger') as HTMLElement).click();
    f.detectChanges();
    const openBtn = query(f, '.excel-action-menu .open-in-excel-btn') as HTMLButtonElement;
    const snapBtn = query(f, '.excel-action-menu .export-snapshot-btn') as HTMLButtonElement;
    expect(openBtn.disabled).toBe(false);
    expect(snapBtn.disabled).toBe(true);
  });

  it('dismisses the unified menu on Escape', () => {
    const f = renderForExcel(true, { ParameterValues: { Region: 'West' } });
    (query(f, '.excel-menu-trigger') as HTMLElement).click();
    f.detectChanges();
    expect(query(f, '.excel-action-menu')).not.toBeNull();

    const wrapper = query(f, '.toolbar-excel-dropdown') as HTMLElement;
    wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    f.detectChanges();
    expect(query(f, '.excel-action-menu')).toBeNull();
  });

  it('renders a direct Open in Excel button when ShowExport is explicitly false', () => {
    const f = renderForExcel(true, { ShowExport: false, ParameterValues: { Region: 'West' } });
    expect(query(f, '.excel-menu-trigger')).toBeNull();
    expect(query(f, '.open-in-excel-btn')).not.toBeNull();
  });
});
