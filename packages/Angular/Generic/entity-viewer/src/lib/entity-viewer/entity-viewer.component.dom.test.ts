import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, text, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { EntityViewerComponent } from './entity-viewer.component';

/**
 * DOM coverage for <mj-entity-viewer> — the container that renders an entity's records through a
 * pluggable view type, with a header (filter / view-type switcher / record count) + recycle bin (~7×).
 * The plug-in view rendering + data loading run in ngOnInit (stubbed) and via ViewTypeEngine/provider;
 * these cover the container's own chrome by driving public state: the no-entity empty state, the header
 * + record count, the view-type switcher, the recycle-bin chip, the loading state, and the no-records
 * empty state. The switcher / recycle-chip children are stubbed.
 */

@Component({ standalone: true, selector: 'mj-view-type-switcher', template: '<div class="switcher-stub"></div>' })
class SwitcherStub { @Input() ActiveViewTypeID: string | null = null; @Input() Entity: EntityInfo | null = null; @Input() Provider: unknown;
  @Output() ViewTypeSelected = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'mj-recycle-bin-chip', template: '<div class="recycle-stub"></div>' })
class RecycleChipStub { @Input() EntityName: string | null = null; }

const CHILDREN = [SwitcherStub, RecycleChipStub, StubEmptyStateComponent, StubLoadingComponent];
const ENTITY = { Name: 'Accounts' } as unknown as EntityInfo;
type OnInitProto = { ngOnInit: () => void };

interface State { entity?: EntityInfo | null; IsLoading?: boolean; ShowRecycleBin?: boolean; records?: Record<string, unknown>[]; filteredCount?: number; totalCount?: number }
function render(state: State = {}) {
  vi.spyOn(EntityViewerComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockImplementation(() => undefined);
  return renderComponentFixture(EntityViewerComponent, {
    imports: CHILDREN,
    declarations: [EntityViewerComponent],
    inputs: { Records: state.records ?? [] },
    setup: (c) => {
      const priv = c as unknown as { _entity: EntityInfo | null; IsLoading: boolean; ShowRecycleBin: boolean; FilteredRecordCount: number; TotalRecordCount: number };
      priv._entity = state.entity ?? null;
      priv.IsLoading = state.IsLoading ?? false;
      priv.ShowRecycleBin = state.ShowRecycleBin ?? false;
      priv.FilteredRecordCount = state.filteredCount ?? 0;
      priv.TotalRecordCount = state.totalCount ?? 0;
    },
  });
}
type Fx = ReturnType<typeof render>;

afterEach(() => vi.restoreAllMocks());

describe('EntityViewerComponent (DOM)', () => {
  it('shows the "select an entity" empty state when no entity is set', () => {
    expect(query(render({ entity: null }), 'mj-empty-state')).not.toBeNull();
  });

  it('renders the header when an entity is set', () => {
    expect(query(render({ entity: ENTITY }), '.viewer-header')).not.toBeNull();
  });

  it('renders the view-type switcher in the header for an entity', () => {
    expect(query(render({ entity: ENTITY }), '.switcher-stub')).not.toBeNull();
  });

  it('renders the recycle-bin chip when ShowRecycleBin is enabled', () => {
    expect(query(render({ entity: ENTITY, ShowRecycleBin: true }), '.recycle-stub')).not.toBeNull();
  });

  it('shows the loading indicator when loading with no records yet', () => {
    const f = render({ entity: ENTITY, IsLoading: true, records: [] });
    expect(query(f, '.loading-container mj-loading')).not.toBeNull();
  });

  it('shows the no-records empty state when the entity has zero records and is not loading', () => {
    const f = render({ entity: ENTITY, IsLoading: false, records: [] });
    // both the entity header AND the no-records empty state render (the "select an entity" one does not)
    expect(query(f, '.empty-state-fill')).not.toBeNull();
  });
});
