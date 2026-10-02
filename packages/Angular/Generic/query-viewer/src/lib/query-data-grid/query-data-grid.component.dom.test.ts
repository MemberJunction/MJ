import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { renderComponentFixture, query, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { QueryDataGridComponent } from './query-data-grid.component';
import { ExportService } from '@memberjunction/ng-export-service';

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
    const dateCol = { field: 'PaymentDate', title: 'Payment Date', sqlBaseType: 'date', sqlFullType: 'date', visible: true };

    it('formats the cell as the stored day', () => {
      expect(internals(render()).formatCellValue('2026-10-01T00:00:00.000Z', dateCol)).toBe('Oct 1, 2026');
    });

    it('exports the column as a date-only column', () => {
      const fx = render();
      fx.componentInstance.Columns = [dateCol as never];
      expect(internals(fx).getExportColumns()).toEqual([{ name: 'PaymentDate', displayName: 'Payment Date', dataType: 'dateonly' }]);
    });
  });
});

