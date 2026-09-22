import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
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

/**
 * Issue #4244, at the seam that decides what the user sees: the `columnDefs` handed to AG Grid.
 *
 * Driven through the component's real input pipeline rather than by calling the builder — `[Params]`
 * resolves the entity from the provider and generates the column model from its metadata — because
 * the reported failure is a SEQUENCE: a `[GridState]` describing the previously-viewed entity is
 * still bound when the new entity resolves.
 */
function entity(id: string, name: string, fieldNames: string[]): EntityInfo {
  const table = name.replace(/\W/g, '');
  return new EntityInfo({
    ID: id,
    Name: name,
    Status: 'Active',
    BaseTable: table,
    BaseView: `vw${table}`,
    Fields: fieldNames.map((Name, i) => ({
      ID: `${id}-F${i}`, Name, Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true,
    })),
  });
}

/** Two entities sharing no field name — the measured `MJ: Animals` -> `MJ: Care Logs` pair. */
const ANIMALS = entity('E0000005-0000-0000-0000-000000000001', 'MJ: Animals', ['Name', 'Species', 'Breed']);
const CARE_LOGS = entity('E0000005-0000-0000-0000-000000000002', 'MJ: Care Logs', ['CareDate', 'CareType', 'PerformedBy']);

/**
 * Input order mirrors `grid-view-renderer`'s template exactly — `[Data]`, `[Params]`, `[GridState]` —
 * and that order is load-bearing. `onParamsChanged()` resets `_gridState`, so a state bound BEFORE
 * `[Params]` is discarded; the renderer binds it AFTER, which is how the previous entity's settings
 * reach the new entity's grid at all. Swapping those two lines hides the bug.
 */
function renderWithGridState(columnNames: string[]) {
  const f = render({
    ShowToolbar: true,
    AllowLoad: false,
    AutoRefreshOnParamsChange: false,
    Provider: { Entities: [ANIMALS, CARE_LOGS], CurrentUser: null } as unknown as IMetadataProvider,
    Data: [
      { CareDate: '2026-09-01', CareType: 'Checkup', PerformedBy: 'A. Vet' },
      { CareDate: '2026-09-02', CareType: 'Feeding', PerformedBy: 'B. Keeper' },
    ],
    Params: { EntityName: CARE_LOGS.Name },
    GridState: { columnSettings: columnNames.map((Name, orderIndex) => ({ Name, orderIndex })) },
  });
  f.detectChanges();
  const defs = (f.componentInstance as unknown as { agColumnDefs: { field?: string }[] }).agColumnDefs;
  return {
    agGridRendered: f.nativeElement.querySelectorAll('ag-grid-angular').length > 0,
    stateWasApplied: !!(f.componentInstance as unknown as { _gridState: unknown })._gridState,
    fields: defs.map(d => d.field ?? '').filter(Boolean),
  };
}

describe('EntityDataGridComponent (DOM) — stale cross-entity grid state (#4244)', () => {
  it("hands AG Grid the new entity's columns, not an empty list", () => {
    const r = renderWithGridState(['Name', 'Species', 'Breed']);
    // Guard the setup: if the stale state never reached the grid the assertion below proves nothing.
    expect(r.stateWasApplied).toBe(true);
    expect(r.agGridRendered).toBe(true);
    expect(r.fields.length).toBeGreaterThan(0);
    expect(r.fields).toEqual(['CareDate', 'CareType', 'PerformedBy']);
  });

  it('still hands AG Grid the saved columns when the state matches the entity', () => {
    const r = renderWithGridState(['CareType', 'CareDate']);
    expect(r.agGridRendered).toBe(true);
    expect(r.fields).toEqual(['CareType', 'CareDate']);
  });
});
