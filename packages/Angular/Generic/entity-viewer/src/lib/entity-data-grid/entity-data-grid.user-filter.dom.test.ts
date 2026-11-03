import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { EntityInfo } from '@memberjunction/core';
import type { CompositeFilterDescriptor, FilterFieldInfo } from '@memberjunction/ng-filter-builder';
import { EntityDataGridComponent } from './entity-data-grid.component';
import { ExportService } from '@memberjunction/ng-export-service';
import type { AppliedFilter } from '@memberjunction/ng-ui-components';

vi.mock('@memberjunction/communication-types', () => ({
  CommunicationEngineBase: {
    GetProviderInstance: () => ({ Config: async () => {}, Metadata: { EntityCommunicationMessageTypes: [] } }),
  },
}));

/**
 * DOM coverage for the grid's opt-in Filter button (#3998): hidden unless the host turns it on,
 * and the applied-filter chips remove a condition and reload. The popover, builder and chip row
 * are stubbed to their bound surface; AG Grid and the other heavy children are stubbed too.
 */

@Component({ standalone: true, selector: 'ag-grid-angular', template: '' })
class AgGridStub {
  @Input() cacheBlockSize: unknown; @Input() cacheOverflowSize: unknown; @Input() columnDefs: unknown; @Input() defaultColDef: unknown;
  @Input() getRowId: unknown; @Input() headerHeight: unknown; @Input() infiniteInitialRowCount: unknown; @Input() maxBlocksInCache: unknown;
  @Input() rowData: unknown; @Input() rowHeight: unknown; @Input() rowModelType: unknown; @Input() rowSelection: unknown;
  @Input() suppressCellFocus: unknown; @Input() theme: unknown;
}
@Component({ standalone: true, selector: 'mj-pagination', template: '' })
class PaginationStub { @Input() IsLoading = false; @Input() PageNumber = 1; @Input() PageSize = 100; @Input() TotalRowCount = 0; }
@Component({ standalone: true, selector: 'mj-export-dialog', template: '' })
class ExportDialogStub { @Input() config: unknown; @Input() visible = false; }
@Component({ standalone: true, selector: 'mj-recycle-bin-chip', template: '' })
class RecycleChipStub { @Input() Provider: unknown; @Input() EntityName: string | null = null; }
@Component({ standalone: true, selector: 'mj-entity-action-ux-host', template: '' })
class ActionHostStub { @Input() Context: unknown; @Input() DriverClass = ''; }
@Component({ standalone: true, selector: 'mj-filter-popover', template: '<div class="popover-stub"><ng-content></ng-content></div>' })
class FilterPopoverStub { @Input() Label = ''; @Input() ActiveCount = 0; Close = vi.fn(); }
@Component({ standalone: true, selector: 'mj-filter-builder', template: '' })
class FilterBuilderStub {
  @Input() fields: FilterFieldInfo[] = [];
  @Input() filter: CompositeFilterDescriptor | null = null;
  @Input() config: unknown;
  @Output() apply = new EventEmitter<CompositeFilterDescriptor>();
  @Output() clear = new EventEmitter<void>();
}
@Component({ standalone: true, selector: 'mj-applied-filters', template: '<div class="chips-stub"></div>' })
class AppliedFiltersStub {
  @Input() Filters: AppliedFilter[] = [];
  @Output() Remove = new EventEmitter<AppliedFilter>();
  @Output() ClearAll = new EventEmitter<void>();
}

const CHILDREN = [
  AgGridStub, PaginationStub, ExportDialogStub, RecycleChipStub, ActionHostStub,
  StubEmptyStateComponent, StubLoadingComponent, FilterPopoverStub, FilterBuilderStub, AppliedFiltersStub
];

const ENTITY = new EntityInfo({
  ID: 'E0000008-0000-0000-0000-000000000001',
  Name: 'MJ: Sample Tickets',
  Status: 'Active',
  BaseTable: 'SampleTicket',
  BaseView: 'vwSampleTickets',
  Fields: [
    { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { ID: 'F2', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false },
    { ID: 'F3', Name: 'Priority', Type: 'int', AllowsNull: false },
  ],
});

type LoadProto = { Refresh: () => Promise<void>; loadData: (auto?: boolean) => Promise<void>; RefreshAggregates: () => Promise<void> };

function render(inputs: Record<string, unknown> = {}) {
  vi.spyOn(EntityDataGridComponent.prototype as unknown as LoadProto, 'Refresh').mockResolvedValue(undefined);
  const loads = vi.spyOn(EntityDataGridComponent.prototype as unknown as LoadProto, 'loadData').mockResolvedValue(undefined);
  vi.spyOn(EntityDataGridComponent.prototype as unknown as LoadProto, 'RefreshAggregates').mockResolvedValue(undefined);
  const f = renderComponentFixture(EntityDataGridComponent, {
    imports: CHILDREN,
    declarations: [EntityDataGridComponent],
    providers: [{ provide: ExportService, useValue: {} }],
    inputs: { ShowToolbar: true, ...inputs },
    setup: (c) => {
      (c as unknown as { _entityInfo: EntityInfo | null })._entityInfo = ENTITY;
    },
  });
  return { f, loads };
}

afterEach(() => vi.restoreAllMocks());

describe('EntityDataGridComponent user filter (DOM)', () => {
  it('hides the Filter button by default', () => {
    const { f } = render();
    expect(f.debugElement.query(By.directive(FilterPopoverStub))).toBeNull();
  });

  it('shows the Filter button with the entity fields when ShowFilterButton is on', () => {
    const { f } = render({ ShowFilterButton: true });
    expect(f.debugElement.query(By.directive(FilterPopoverStub))).not.toBeNull();
    const builder = f.debugElement.query(By.directive(FilterBuilderStub)).componentInstance as FilterBuilderStub;
    expect(builder.fields.map(x => x.name)).toEqual(['ID', 'Status', 'Priority']);
  });

  it('applies from the builder, shows a chip per condition, and removing a chip reloads', async () => {
    const { f, loads } = render({ ShowFilterButton: true });
    const builder = f.debugElement.query(By.directive(FilterBuilderStub)).componentInstance as FilterBuilderStub;
    builder.apply.emit({
      logic: 'and',
      filters: [{ field: 'Status', operator: 'eq', value: 'Open' }, { field: 'Priority', operator: 'gt', value: 2 }],
    });
    await f.whenStable();
    f.detectChanges();

    const chips = f.debugElement.query(By.directive(AppliedFiltersStub)).componentInstance as AppliedFiltersStub;
    expect(chips.Filters.map(c => c.label)).toEqual(['Status', 'Priority']);
    const loadsAfterApply = loads.mock.calls.length;
    expect(loadsAfterApply).toBeGreaterThan(0);

    chips.Remove.emit(chips.Filters[0]);
    await f.whenStable();
    f.detectChanges();

    expect(f.componentInstance.UserFilter?.filters).toEqual([{ field: 'Priority', operator: 'gt', value: 2 }]);
    expect(loads.mock.calls.length).toBeGreaterThan(loadsAfterApply);
    expect(query(f, '.chips-stub')).not.toBeNull();
  });
});
