import { describe, it, expect, vi } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo, RunView } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { CompositeFilterDescriptor } from '@memberjunction/ng-filter-builder';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import { BuildFilterFields, CollectFilterFieldNames } from '../lib/utils/filter-fields.util';
import {
  BuildUserFilterWhereClause,
  ComposeExtraFilter,
  RemoveTopLevelCondition,
  SanitizeUserFilter,
  UserFilterChips
} from '../lib/utils/user-filter.util';

/**
 * #3998 — a user filter on the entity data grid, always inside the host's scope.
 */

function makeEntity(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000007-0000-0000-0000-000000000001',
    Name: 'MJ: Sample Orders',
    Status: 'Active',
    BaseTable: 'SampleOrder',
    BaseView: 'vwSampleOrders',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'F2', Name: 'CustomerName', DisplayName: 'Customer', Type: 'nvarchar', Length: 100, AllowsNull: false },
      { ID: 'F3', Name: 'Quantity', Type: 'int', AllowsNull: false },
      { ID: 'F4', Name: 'IsRush', Type: 'bit', AllowsNull: false },
      { ID: 'F5', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, ValueListType: 'List',
        EntityFieldValues: [{ ID: 'V1', EntityFieldID: 'F5', Value: 'Open', Sequence: 1 }, { ID: 'V2', EntityFieldID: 'F5', Value: 'Closed', Sequence: 2 }] },
      { ID: 'F6', Name: 'AccountID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: true, RelatedEntity: 'MJ: Sample Accounts' },
      { ID: 'F7', Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false },
    ],
  });
}

const STATUS_OPEN: CompositeFilterDescriptor = { logic: 'and', filters: [{ field: 'Status', operator: 'eq', value: 'Open' }] };

describe('BuildFilterFields (shared with the view config panel)', () => {
  it('offers typed fields, pick-lists and lookups, and hides system fields in standard mode', () => {
    const fields = BuildFilterFields(makeEntity(), new Set());
    expect(fields.map(f => [f.name, f.type])).toEqual([
      ['ID', 'string'],
      ['CustomerName', 'string'],
      ['Quantity', 'number'],
      ['IsRush', 'boolean'],
      ['Status', 'string'],
      ['AccountID', 'lookup'],
    ]);
    expect(fields.find(f => f.name === 'Status')?.valueList).toEqual([{ value: 'Open', label: 'Open' }, { value: 'Closed', label: 'Closed' }]);
    expect(fields.find(f => f.name === 'CustomerName')?.displayName).toBe('Customer');
    expect(fields.every(f => f.sqlType === undefined)).toBe(true);
  });

  it('shows a system field the filter already uses, and every field with SQL types in advanced mode', () => {
    const used = CollectFilterFieldNames({ logic: 'and', filters: [{ logic: 'or', filters: [{ field: '__mj_CreatedAt', operator: 'gt', value: '2026-01-01' }] }] });
    expect(BuildFilterFields(makeEntity(), used).some(f => f.name === '__mj_CreatedAt')).toBe(true);
    const advanced = BuildFilterFields(makeEntity(), new Set(), true);
    expect(advanced.find(f => f.name === '__mj_CreatedAt')?.type).toBe('date');
    expect(advanced.find(f => f.name === 'Quantity')?.sqlType).toBe('int');
  });
});

describe('user filter compilation', () => {
  it('composes host and user filters, never replacing the host', () => {
    expect(ComposeExtraFilter('AccountID = \'A1\'', '[Status] = \'Open\'')).toBe('(AccountID = \'A1\') AND ([Status] = \'Open\')');
    expect(ComposeExtraFilter(undefined, '[Status] = \'Open\'')).toBe('[Status] = \'Open\'');
    expect(ComposeExtraFilter('AccountID = \'A1\'', '')).toBe('AccountID = \'A1\'');
    expect(ComposeExtraFilter('  ', null)).toBeUndefined();
  });

  it('compiles with the saved-view compiler and escapes quotes in values', () => {
    const where = BuildUserFilterWhereClause(
      { logic: 'and', filters: [{ field: 'CustomerName', operator: 'contains', value: "O'Neil" }] },
      makeEntity()
    );
    expect(where).toBe("([CustomerName] LIKE '%O''Neil%')");
  });

  it('drops unknown fields, empty values and non-numeric values for numeric fields', () => {
    const safe = SanitizeUserFilter({
      logic: 'and',
      filters: [
        { field: 'Nope', operator: 'eq', value: 'x' },
        { field: 'CustomerName', operator: 'eq', value: '' },
        { field: 'Quantity', operator: 'gt', value: '5; DROP TABLE x' },
        { field: 'Quantity', operator: 'gte', value: '3' },
        { field: 'Status', operator: 'isnull', value: null },
      ],
    }, makeEntity());
    expect(safe).toEqual({
      logic: 'and',
      filters: [
        { field: 'Quantity', operator: 'gte', value: 3 },
        { field: 'Status', operator: 'isnull', value: null },
      ],
    });
    expect(SanitizeUserFilter({ logic: 'and', filters: [{ field: 'Nope', operator: 'eq', value: 'x' }] }, makeEntity())).toBeNull();
  });

  it('builds one chip per top-level condition and removes by index', () => {
    const filter: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'Status', operator: 'eq', value: 'Open' },
        { logic: 'or', filters: [{ field: 'IsRush', operator: 'eq', value: true }, { field: 'Quantity', operator: 'gt', value: 10 }] },
      ],
    };
    const chips = UserFilterChips(filter, BuildFilterFields(makeEntity(), new Set()));
    expect(chips).toEqual([
      { key: '0', label: 'Status', value: 'equals Open' },
      { key: '1', label: 'Group', value: '2 conditions (OR)' },
    ]);
    expect(RemoveTopLevelCondition(filter, 0)?.filters.length).toBe(1);
    expect(RemoveTopLevelCondition(STATUS_OPEN, 0)).toBeNull();
  });
});

type GridInternals = {
  _entityInfo: EntityInfo;
  _params: RunViewParams | null;
  _allowLoad: boolean;
  buildRunViewParams(): RunViewParams;
  loadData(isAutoRefresh?: boolean): Promise<void>;
};

function makeGrid(params: RunViewParams): { grid: EntityDataGridComponent; internals: GridInternals; loads: ReturnType<typeof vi.fn> } {
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
  const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
  const grid = new EntityDataGridComponent(cdr, elementRef, {} as never, ngZone);
  grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
  const internals = grid as unknown as GridInternals;
  internals._entityInfo = makeEntity();
  internals._params = params;
  const loads = vi.fn(async () => {});
  internals.loadData = loads;
  return { grid, internals, loads };
}

describe('EntityDataGridComponent — user filter within the host scope', () => {
  const HOST: RunViewParams = { EntityName: 'MJ: Sample Orders', ExtraFilter: "AccountID = 'A1'" };

  it('keeps the host filter alone when there is no user filter', () => {
    const { internals } = makeGrid(HOST);
    expect(internals.buildRunViewParams().ExtraFilter).toBe("AccountID = 'A1'");
  });

  it('runs (host) AND (user) and reloads when the user filter is set', async () => {
    const { grid, internals, loads } = makeGrid(HOST);
    grid.UserFilter = STATUS_OPEN;
    await Promise.resolve();
    expect(internals.buildRunViewParams().ExtraFilter).toBe("(AccountID = 'A1') AND (([Status] = 'Open'))");
    expect(grid.EffectiveExtraFilter).toBe("(AccountID = 'A1') AND (([Status] = 'Open'))");
    expect(loads).toHaveBeenCalled();
  });

  it('uses the user filter alone when the host has none', () => {
    const { grid, internals } = makeGrid({ EntityName: 'MJ: Sample Orders' });
    grid.UserFilter = STATUS_OPEN;
    expect(internals.buildRunViewParams().ExtraFilter).toBe("([Status] = 'Open')");
  });

  it('returns to the host scope when the user clears the filter, and emits the change', () => {
    const { grid, internals } = makeGrid(HOST);
    const changes: (CompositeFilterDescriptor | null)[] = [];
    grid.UserFilterChange.subscribe(v => changes.push(v));
    grid.OnUserFilterApply(STATUS_OPEN);
    grid.OnUserFilterClear();
    expect(changes).toEqual([STATUS_OPEN, null]);
    expect(internals.buildRunViewParams().ExtraFilter).toBe("AccountID = 'A1'");
  });

  it('removes one condition from a chip', () => {
    const { grid } = makeGrid(HOST);
    grid.OnUserFilterApply({ logic: 'and', filters: [{ field: 'Status', operator: 'eq', value: 'Open' }, { field: 'Quantity', operator: 'gt', value: 2 }] });
    expect(grid.UserFilterChips.map(c => c.label)).toEqual(['Status', 'Quantity']);
    grid.OnUserFilterChipRemove(grid.UserFilterChips[0]);
    expect(grid.UserFilter?.filters).toEqual([{ field: 'Quantity', operator: 'gt', value: 2 }]);
  });

  it('runs the aggregates read with the same composed filter', async () => {
    const { grid } = makeGrid(HOST);
    grid.UserFilter = STATUS_OPEN;
    grid.AggregatesConfig = { expressions: [{ id: 'count', label: 'Count', expression: 'COUNT(*)', enabled: true }] } as unknown as EntityDataGridComponent['AggregatesConfig'];
    const runView = vi.fn(async () => ({ Success: true, Results: [], AggregateResults: [], AggregateExecutionTime: 0 }));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);

    await grid.RefreshAggregates();

    expect(runView).toHaveBeenCalledWith(expect.objectContaining({ ExtraFilter: "(AccountID = 'A1') AND (([Status] = 'Open'))" }));
  });
});
