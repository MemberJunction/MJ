import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { BaseEntity, BaseEntityEvent, EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';

function makeEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000002-0000-0000-0000-000000000099',
    Name: 'Contracts',
    Status: 'Active',
    BaseTable: 'Contract',
    BaseView: 'vwContracts',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: true },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true },
      { ID: 'F3', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, DefaultInView: true },
    ],
  });
}

function makeLiveGrid(entity: EntityInfo): {
  grid: EntityDataGridComponent;
  applyTransactionSpy: ReturnType<typeof vi.fn>;
} {
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
  const elementRef = {
    nativeElement: {
      querySelector: () => null,
      style: { setProperty: () => {}, removeProperty: () => {} },
    },
  } as unknown as ElementRef;
  const exportService = {} as never;
  const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;

  const grid = new EntityDataGridComponent(cdr, elementRef, exportService, ngZone);
  grid.Provider = {} as unknown as IMetadataProvider;

  const applyTransactionSpy = vi.fn();
  const internals = grid as unknown as {
    _entityInfo: EntityInfo;
    _useExternalData: boolean;
    _data: Record<string, unknown>[];
    processData: () => void;
    gridApi: {
      isDestroyed: () => boolean;
      applyTransaction: ReturnType<typeof vi.fn>;
      setGridOption: ReturnType<typeof vi.fn>;
    };
  };
  internals._entityInfo = entity;
  internals._useExternalData = true;
  internals._data = [
    { ID: 'C-101', Name: 'Alpha Agreement', Status: 'Draft' },
    { ID: 'C-102', Name: 'Beta MSA', Status: 'Active' },
  ];
  internals.gridApi = {
    isDestroyed: () => false,
    applyTransaction: applyTransactionSpy,
    setGridOption: vi.fn(),
  };
  internals.processData();
  void grid.ngOnInit();

  return { grid, applyTransactionSpy };
}

describe('EntityDataGridComponent — live row patching & pending changes pill', () => {
  let entity: EntityInfo;
  let currentGrid: EntityDataGridComponent | null = null;

  beforeEach(() => {
    entity = makeEntityInfo();
  });

  afterEach(() => {
    currentGrid?.ngOnDestroy();
    currentGrid = null;
    vi.restoreAllMocks();
  });

  it('patches an existing visible row in place via gridApi.applyTransaction when saved', () => {
    const { grid, applyTransactionSpy } = makeLiveGrid(entity);
    currentGrid = grid;

    const savedEntity = {
      EntityInfo: { Name: 'Contracts' },
      GetAll: () => ({ ID: 'C-101', Name: 'Alpha Agreement (Amended)', Status: 'Executed' }),
    } as unknown as BaseEntity;

    const evt = new BaseEntityEvent();
    evt.type = 'save';
    evt.baseEntity = savedEntity;
    MJGlobal.Instance.RaiseEvent({
      component: savedEntity,
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: evt,
    });

    expect(applyTransactionSpy).toHaveBeenCalledTimes(1);
    expect(applyTransactionSpy).toHaveBeenCalledWith({
      update: [
        {
          __pk: 'ID|C-101',
          ID: 'C-101',
          Name: 'Alpha Agreement (Amended)',
          Status: 'Executed',
        },
      ],
    });
    expect(grid.RowData[0]['Name']).toBe('Alpha Agreement (Amended)');
    expect(grid.RowData[0]['Status']).toBe('Executed');
    expect(grid.LastPatchedRowKey).toBe('ID|C-101');
    expect(grid.LivePendingChangesCount).toBe(0);
  });

  it('increments LivePendingChangesCount when a new record is created or a record is deleted, and clears on dismiss', () => {
    const { grid, applyTransactionSpy } = makeLiveGrid(entity);
    currentGrid = grid;

    const remoteCreateEvt = new BaseEntityEvent();
    remoteCreateEvt.type = 'remote-invalidate';
    remoteCreateEvt.payload = { entityName: 'Contracts', key: 'ID|C-999', action: 'save' };
    MJGlobal.Instance.RaiseEvent({
      component: grid,
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: remoteCreateEvt,
    });

    expect(applyTransactionSpy).not.toHaveBeenCalled();
    expect(grid.LivePendingChangesCount).toBe(1);

    const remoteDeleteEvt = new BaseEntityEvent();
    remoteDeleteEvt.type = 'remote-invalidate';
    remoteDeleteEvt.payload = { entityName: 'Contracts', key: 'ID|C-102', action: 'delete' };
    MJGlobal.Instance.RaiseEvent({
      component: grid,
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: remoteDeleteEvt,
    });

    expect(grid.LivePendingChangesCount).toBe(2);

    grid.OnDismissLiveGridPill({ stopPropagation: () => {} } as unknown as MouseEvent);
    expect(grid.LivePendingChangesCount).toBe(0);
  });
});
