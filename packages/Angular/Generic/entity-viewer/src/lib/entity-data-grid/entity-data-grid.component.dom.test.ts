import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { EntityDataGridComponent } from './entity-data-grid.component';
import { ExportService } from '@memberjunction/ng-export-service';

/**
 * DOM coverage for <mj-entity-data-grid> — the AG-Grid-backed entity grid (~10×, the largest Generic
 * component). The grid body (AG-Grid) is out of scope for a DOM unit, so the specs cover the toolbar
 * chrome: visibility, the row count, and the New / Refresh actions with their outputs. All 7 heavy
 * children (AG-Grid, pagination, export-dialog, recycle-bin-chip, entity-action-ux-host, empty-state,
 * loading) are stubbed; ExportService is faked and Refresh() (a data reload) is stubbed.
 */

@Component({ standalone: true, selector: 'ag-grid-angular', template: '' })
class AgGridStub {
  @Input() cacheBlockSize: unknown; @Input() cacheOverflowSize: unknown; @Input() columnDefs: unknown; @Input() defaultColDef: unknown;
  @Input() getRowId: unknown; @Input() headerHeight: unknown; @Input() infiniteInitialRowCount: unknown; @Input() maxBlocksInCache: unknown;
  @Input() rowData: unknown; @Input() rowHeight: unknown; @Input() rowModelType: unknown; @Input() rowSelection: unknown;
  @Input() suppressCellFocus: unknown; @Input() theme: unknown;
}
@Component({ standalone: true, selector: 'mj-pagination', template: '<div class="pagination-stub"></div>' })
class PaginationStub { @Input() IsLoading = false; @Input() PageNumber = 1; @Input() PageSize = 100; @Input() TotalRowCount = 0; }
@Component({ standalone: true, selector: 'mj-export-dialog', template: '' })
class ExportDialogStub { @Input() config: unknown; @Input() visible = false; }
@Component({ standalone: true, selector: 'mj-recycle-bin-chip', template: '<div class="recycle-stub"></div>' })
class RecycleChipStub { @Input() EntityName: string | null = null; }
@Component({ standalone: true, selector: 'mj-entity-action-ux-host', template: '' })
class ActionHostStub { @Input() Context: unknown; @Input() DriverClass = ''; }

const CHILDREN = [AgGridStub, PaginationStub, ExportDialogStub, RecycleChipStub, ActionHostStub, StubEmptyStateComponent, StubLoadingComponent];
type RefreshProto = { Refresh: () => Promise<void> };

function render(inputs: Record<string, unknown> = {}, rowCount = 0) {
  vi.spyOn(EntityDataGridComponent.prototype as unknown as RefreshProto, 'Refresh').mockResolvedValue(undefined);
  return renderComponentFixture(EntityDataGridComponent, {
    imports: CHILDREN,
    declarations: [EntityDataGridComponent],
    providers: [{ provide: ExportService, useValue: {} }],
    inputs: { ShowToolbar: true, ...inputs },
    setup: (c) => { (c as unknown as { totalRowCount: number }).totalRowCount = rowCount; },
  });
}
type Fx = ReturnType<typeof render>;

afterEach(() => vi.restoreAllMocks());

describe('EntityDataGridComponent (DOM)', () => {
  it('renders the toolbar when ShowToolbar is true', () => {
    expect(query(render({ ShowToolbar: true }), '.mj-grid-toolbar')).not.toBeNull();
  });

  it('hides the toolbar when ShowToolbar is false', () => {
    expect(query(render({ ShowToolbar: false }), '.mj-grid-toolbar')).toBeNull();
  });

  it('shows the row count in the toolbar', () => {
    expect(query(render({ ShowToolbar: true }, 5), '.row-count')?.textContent).toContain('5');
  });

  it('emits NewButtonClick when the New button is clicked', () => {
    const f = render({ ShowToolbar: true, ShowNewButton: true });
    const out = capture(f.componentInstance.NewButtonClick);
    (query(f, '.mj-grid-toolbar .toolbar-right .toolbar-button') as HTMLElement).click();
    expect(out.length).toBe(1);
  });

  it('emits RefreshButtonClick when the Refresh button is clicked', () => {
    const f = render({ ShowToolbar: true, ShowNewButton: false, ShowRefreshButton: true });
    const out = capture(f.componentInstance.RefreshButtonClick);
    const btns = Array.from(f.nativeElement.querySelectorAll('.toolbar-right .toolbar-button')) as HTMLElement[];
    btns[0].click(); // refresh is the first right-side button when New is hidden
    expect(out.length).toBe(1);
  });

  it('renders the recycle-bin chip when ShowRecycleBin is enabled', () => {
    expect(query(render({ ShowToolbar: true, ShowRecycleBin: true }), '.recycle-stub')).not.toBeNull();
  });
});
