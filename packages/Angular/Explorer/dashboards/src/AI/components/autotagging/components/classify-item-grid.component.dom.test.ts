import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import type { RunViewParams } from '@memberjunction/core';
import type { RowClickedEvent } from 'ag-grid-community';
import { ClassifyItemGridComponent } from './classify-item-grid.component';
import type { ClassifyItemGridRow } from '../shared/classify.types';

/**
 * DOM coverage for <classify-item-grid> — the read-only content-item AG Grid. Module-declared
 * (standalone:false), extends BaseAngularComponent. With no data it renders the mj-empty-state (stubbed);
 * setting `RunID` runs the scope + item + tag-count RunViews via ProviderToUse (fake provider keyed by
 * EntityName). ag-grid-angular / mj-loading / mj-empty-state are lightweight stubs; row selection bubbles
 * up via `(ItemSelected)`. Async load uses the non-strict re-render + microtask dance.
 */

@Component({ selector: 'ag-grid-angular', standalone: true, template: '' })
class StubAgGrid {
  @Input() theme: unknown;
  @Input() columnDefs: unknown;
  @Input() defaultColDef: unknown;
  @Input() gridOptions: unknown;
  @Input() rowData: unknown;
  @Output() gridReady = new EventEmitter<unknown>();
  @Output() rowClicked = new EventEmitter<unknown>();
}

const ITEM_ROWS = [
  { ID: 'i1', Name: 'Report A', ContentSource: 'Web', TaggingStatus: 'Complete', EmbeddingStatus: 'Done', __mj_UpdatedAt: '2026-01-01' },
  { ID: 'i2', Name: 'Report B', ContentSource: 'Web', TaggingStatus: 'Pending', EmbeddingStatus: '', __mj_UpdatedAt: '2026-01-02' },
];

const provider = () =>
  createFakeProvider({
    runViewResults: (params: RunViewParams): Record<string, unknown>[] => {
      if (params.EntityName === 'MJ: Content Process Runs') return [{ SourceID: 'src-1', StartTime: null, EndTime: null }];
      if (params.EntityName === 'MJ: Content Item Tags') return [{ ItemID: 'i1' }, { ItemID: 'i1' }];
      return ITEM_ROWS; // MJ: Content Items
    },
  });

const renderEmpty = () =>
  renderComponentFixture(ClassifyItemGridComponent, {
    declarations: [ClassifyItemGridComponent],
    imports: [StubEmptyStateComponent, StubLoadingComponent, StubAgGrid],
    inputs: { Provider: provider() },
  });

const renderLoaded = async () => {
  const fixture = renderComponentFixture(ClassifyItemGridComponent, {
    declarations: [ClassifyItemGridComponent],
    imports: [StubEmptyStateComponent, StubLoadingComponent, StubAgGrid],
    inputs: { Provider: provider() },
  });
  fixture.componentRef.setInput('RunID', 'run-1'); // triggers loadItems()
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
};

describe('ClassifyItemGridComponent (DOM)', () => {
  it('renders the empty state before any load', () => {
    const fixture = renderEmpty();
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(query(fixture, 'ag-grid-angular')).toBeNull();
  });

  it('renders the grid + footer count once items are loaded', async () => {
    const fixture = await renderLoaded();
    expect(query(fixture, 'ag-grid-angular')).not.toBeNull();
    expect(query(fixture, '.cig-footer')?.textContent).toContain('Showing 2 of 2 items');
  });

  it('projects the loaded rows into the grid rowData input', async () => {
    const fixture = await renderLoaded();
    expect(fixture.componentInstance.Rows.length).toBe(2);
    expect(fixture.componentInstance.Rows.map((r) => r.ID)).toEqual(['i1', 'i2']);
  });

  it('aggregates tag counts per item into the rows', async () => {
    const fixture = await renderLoaded();
    expect(fixture.componentInstance.Rows.find((r) => r.ID === 'i1')?.TagCount).toBe(2);
    expect(fixture.componentInstance.Rows.find((r) => r.ID === 'i2')?.TagCount).toBe(0);
  });

  it('hides the "Load more" button when everything is already shown', async () => {
    const fixture = await renderLoaded();
    expect(fixture.componentInstance.HasMore).toBe(false);
    expect(queryAll(fixture, 'button').some((b) => b.textContent?.includes('Load more'))).toBe(false);
  });

  it('emits ItemSelected with the row ID when a row is clicked', async () => {
    const fixture = await renderLoaded();
    const selected = capture(fixture.componentInstance.ItemSelected);
    // OnRowClicked only reads `event.data.ID`; type the double against the loaded row and the
    // real ag-grid event's `data` slot, then seam-cast once at the call site.
    const row = fixture.componentInstance.Rows.find((r) => r.ID === 'i2');
    const click = { data: row } satisfies Pick<RowClickedEvent<ClassifyItemGridRow>, 'data'>;
    fixture.componentInstance.OnRowClicked(click as unknown as RowClickedEvent<ClassifyItemGridRow>);
    expect(selected).toEqual(['i2']);
  });
});
