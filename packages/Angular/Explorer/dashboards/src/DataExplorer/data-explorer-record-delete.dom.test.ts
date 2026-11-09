/**
 * The Data Explorer after a record is deleted: the preview (detail panel) closes when it shows the
 * deleted record, the grid reloads in place, and the `record=` key that is replayed when the
 * deleted record's tab returns here cannot reopen the preview.
 *
 * Same Object.create approach as data-explorer-entity-lookups.dom.test.ts: only the members these
 * paths touch are set.
 */
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { EntityInfo } from '@memberjunction/core';
import type { DataLoadedEvent } from '@memberjunction/ng-entity-viewer';
import type { DeletedRecordRef } from '@memberjunction/ng-shared';
import { DataExplorerDashboardComponent } from './data-explorer-dashboard.component';

const CATEGORY_ID = 'BDA9F479-32B1-4E67-9DC3-EAE54893FCFF';
const OTHER_ID = '11111111-2222-3333-4444-555555555555';

const listCategories = { Name: 'MJ: List Categories', PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo;
const row = (id: string) => ({ ID: id, Name: `Category ${id.slice(0, 4)}` });

function deleted(id: string, opts: { remote?: boolean; entity?: string } = {}): DeletedRecordRef {
  return { EntityName: opts.entity ?? 'MJ: List Categories', RecordId: `ID|${id}`, Remote: opts.remote ?? false };
}

function dashboard(opts: { panelRecordId?: string } = {}) {
  const d = Object.create(DataExplorerDashboardComponent.prototype) as DataExplorerDashboardComponent;
  const internals = d as unknown as Record<string, unknown>;
  const stateService = { closeDetailPanel: vi.fn(), selectRecord: vi.fn() };
  const gridRefreshes: number[] = [];
  const refresh$ = new Subject<void>();
  refresh$.subscribe(() => gridRefreshes.push(1));

  internals['StateService'] = stateService;
  internals['cdr'] = { detectChanges: vi.fn() };
  internals['deletedRecordKeys'] = new Set<string>();
  internals['gridRefreshOnDelete$'] = refresh$;
  internals['pendingRecordSelection'] = null;
  internals['State'] = { selectedRecordId: null, detailPanelOpen: false };
  d.SelectedEntity = listCategories;
  if (opts.panelRecordId) {
    d.SelectedRecord = row(opts.panelRecordId);
    d.DetailPanelEntity = listCategories;
  } else {
    d.SelectedRecord = null;
    d.DetailPanelEntity = null;
  }
  return { d, internals, stateService, gridRefreshes };
}

function loaded(...ids: string[]): DataLoadedEvent {
  const records = ids.map(row);
  return { records, totalRowCount: records.length, loadedRowCount: records.length } as unknown as DataLoadedEvent;
}

describe('Data Explorer: a record deleted in this session', () => {
  it('closes the preview showing it and reloads the grid', () => {
    const h = dashboard({ panelRecordId: CATEGORY_ID });

    h.d.OnRecordDeleted(deleted(CATEGORY_ID.toLowerCase()));

    expect(h.d.SelectedRecord).toBeNull();
    expect(h.d.DetailPanelEntity).toBeNull();
    expect(h.stateService.closeDetailPanel).toHaveBeenCalled();
    expect(h.gridRefreshes).toHaveLength(1);
  });

  it('keeps the preview of a different record, and still reloads the grid', () => {
    const h = dashboard({ panelRecordId: OTHER_ID });

    h.d.OnRecordDeleted(deleted(CATEGORY_ID));

    expect(h.d.SelectedRecord).toEqual(row(OTHER_ID));
    expect(h.stateService.closeDetailPanel).not.toHaveBeenCalled();
    expect(h.gridRefreshes).toHaveLength(1);
  });

  it('ignores a delete in another entity', () => {
    const h = dashboard({ panelRecordId: CATEGORY_ID });

    h.d.OnRecordDeleted(deleted(CATEGORY_ID, { entity: 'MJ: Lists' }));

    expect(h.d.SelectedRecord).not.toBeNull();
    expect(h.gridRefreshes).toHaveLength(0);
  });

  it('does not reselect it when its key is replayed after the grid loads (returning from its tab)', () => {
    const h = dashboard();
    h.d.OnRecordDeleted(deleted(CATEGORY_ID));
    h.internals['pendingRecordSelection'] = `ID|${CATEGORY_ID}`;

    // The page still holds the row: the in-place reload has not landed yet.
    h.d.OnDataLoaded(loaded(CATEGORY_ID, OTHER_ID));

    expect(h.d.SelectedRecord).toBeNull();
    expect(h.stateService.selectRecord).not.toHaveBeenCalled();
    expect(h.stateService.closeDetailPanel).toHaveBeenCalled();
  });

  it('does not restore a persisted selection of it', () => {
    const h = dashboard();
    h.d.OnRecordDeleted(deleted(CATEGORY_ID));
    h.internals['State'] = { selectedRecordId: `ID|${CATEGORY_ID}`, detailPanelOpen: true };

    h.d.OnDataLoaded(loaded(CATEGORY_ID));

    expect(h.d.SelectedRecord).toBeNull();
  });

  it('still selects a replayed key for a record that was not deleted', () => {
    const h = dashboard();
    h.d.OnRecordDeleted(deleted(CATEGORY_ID));
    h.internals['pendingRecordSelection'] = OTHER_ID;

    h.d.OnDataLoaded(loaded(CATEGORY_ID, OTHER_ID));

    expect(h.d.SelectedRecord).toEqual(row(OTHER_ID));
  });
});

describe('Data Explorer: a record deleted by another session', () => {
  it('leaves the preview open (the user may be reading it) but reloads the grid', () => {
    const h = dashboard({ panelRecordId: CATEGORY_ID });

    h.d.OnRecordDeleted(deleted(CATEGORY_ID, { remote: true }));

    expect(h.d.SelectedRecord).toEqual(row(CATEGORY_ID));
    expect(h.stateService.closeDetailPanel).not.toHaveBeenCalled();
    expect(h.gridRefreshes).toHaveLength(1);
  });
});
