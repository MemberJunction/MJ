import { describe, it, expect, vi } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import type { ColumnState, GridApi, SortChangedEvent } from 'ag-grid-community';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ViewGridState } from '@memberjunction/core-entities';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import type { DataGridSortState } from '../lib/entity-data-grid/models/grid-types';

/**
 * #5818 — only a sort the user made changes the grid's sort and saved state; AG Grid's own
 * `sortChanged` events (after a reload, a state restore, an option change) do not. A view's sort
 * key with no rendered column survives a captured state.
 * #5819 — a view's custom column headers survive a resize or sort.
 */

function makeEntity(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000006-0000-0000-0000-000000000001',
    Name: 'MJ: Sample Tasks',
    Status: 'Active',
    BaseTable: 'SampleTask',
    BaseView: 'vwSampleTasks',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
      { ID: 'F2', Name: 'Name', DisplayName: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true },
      { ID: 'F3', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, DefaultInView: true },
      { ID: 'F4', Name: 'DueDate', Type: 'date', AllowsNull: true, DefaultInView: false },
    ],
  });
}

type GridInternals = {
  gridApi: GridApi | null;
  _entityInfo: EntityInfo;
  _gridState: ViewGridState | null;
  _sortState: DataGridSortState[];
  _serverSideSorting: boolean;
  buildCurrentGridState(): ViewGridState;
};

function makeGrid(columnState: ColumnState[]): { grid: EntityDataGridComponent; internals: GridInternals; api: GridApi } {
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
  const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
  const grid = new EntityDataGridComponent(cdr, elementRef, {} as never, ngZone);
  grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
  grid.AutoPersistState = false;
  const api = { getColumnState: () => columnState, isDestroyed: () => false } as unknown as GridApi;
  const internals = grid as unknown as GridInternals;
  internals._entityInfo = makeEntity();
  internals.gridApi = api;
  internals._serverSideSorting = false;
  return { grid, internals, api };
}

function sortEvent(api: GridApi, source: string): SortChangedEvent {
  return { api, source, type: 'sortChanged' } as unknown as SortChangedEvent;
}

const SORTED_BY_STATUS: ColumnState[] = [
  { colId: 'Name', width: 200, hide: false, sort: null },
  { colId: 'Status', width: 120, hide: false, sort: 'desc', sortIndex: 0 },
];

describe('EntityDataGridComponent — sort events by source (#5818)', () => {
  for (const source of ['api', 'gridOptionsChanged', 'rowDataUpdated']) {
    it(`ignores a sortChanged with source "${source}"`, () => {
      const { grid, internals, api } = makeGrid(SORTED_BY_STATUS);
      const emitted = vi.spyOn(grid.GridStateChanged, 'emit');
      internals._sortState = [{ field: 'DueDate', direction: 'asc', index: 0 }];

      grid.OnAgSortChanged(sortEvent(api, source));

      expect(internals._sortState).toEqual([{ field: 'DueDate', direction: 'asc', index: 0 }]);
      expect(emitted).not.toHaveBeenCalled();
    });
  }

  it('takes a header-click sort (uiColumnSorted) and emits the state change', () => {
    const { grid, internals, api } = makeGrid(SORTED_BY_STATUS);
    const emitted = vi.spyOn(grid.GridStateChanged, 'emit');

    grid.OnAgSortChanged(sortEvent(api, 'uiColumnSorted'));

    expect(internals._sortState).toEqual([{ field: 'Status', direction: 'desc', index: 0 }]);
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ changeType: 'sort' }));
  });
});

describe('EntityDataGridComponent — captured grid state (#5818, #5819)', () => {
  const UNSORTED: ColumnState[] = [
    { colId: 'Name', width: 260, hide: false, sort: null },
    { colId: 'Status', width: 120, hide: false, sort: null },
  ];

  it('keeps a view\'s custom header after a width change', () => {
    const { internals } = makeGrid(UNSORTED);
    internals._gridState = {
      columnSettings: [
        { ID: 'F2', Name: 'Name', DisplayName: 'Task', hidden: false, width: 200, orderIndex: 0 },
        { ID: 'F3', Name: 'Status', DisplayName: 'Stage', hidden: false, width: 120, orderIndex: 1 },
      ],
    };

    const state = internals.buildCurrentGridState();

    expect(state.columnSettings?.map(c => c.DisplayName)).toEqual(['Task', 'Stage']);
    expect(state.columnSettings?.[0].width).toBe(260);
  });

  it('falls back to the field name when the view had no header of its own', () => {
    const { internals } = makeGrid(UNSORTED);
    const state = internals.buildCurrentGridState();
    expect(state.columnSettings?.map(c => c.DisplayName)).toEqual(['Name', 'Status']);
  });

  it('keeps a sort key the grid has no column for', () => {
    const { internals } = makeGrid(UNSORTED);
    internals._sortState = [{ field: 'DueDate', direction: 'desc', index: 0 }];

    const state = internals.buildCurrentGridState();

    expect(state.sortSettings).toEqual([{ field: 'DueDate', dir: 'desc' }]);
  });

  it('uses the grid sort model when it has one', () => {
    const { internals } = makeGrid(SORTED_BY_STATUS);
    internals._sortState = [{ field: 'DueDate', direction: 'desc', index: 0 }];

    const state = internals.buildCurrentGridState();

    expect(state.sortSettings).toEqual([{ field: 'Status', dir: 'desc' }]);
  });
});
