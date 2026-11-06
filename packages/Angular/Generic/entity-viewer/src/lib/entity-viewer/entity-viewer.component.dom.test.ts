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
class RecycleChipStub { @Input() Provider: unknown; @Input() EntityName: string | null = null; }

const CHILDREN = [SwitcherStub, RecycleChipStub, StubEmptyStateComponent, StubLoadingComponent];
const ENTITY = { Name: 'Accounts' } as unknown as EntityInfo;
type OnInitProto = { ngOnInit: () => void };

interface State { entity?: EntityInfo | null; IsLoading?: boolean; ShowRecycleBin?: boolean; records?: Record<string, unknown>[]; filteredCount?: number; totalCount?: number; config?: Record<string, unknown>;
  view?: { PropertiesObject: unknown[] | null }; properties?: Record<string, unknown> | null; runError?: string | null }
function render(state: State = {}) {
  vi.spyOn(EntityViewerComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockImplementation(() => undefined);
  return renderComponentFixture(EntityViewerComponent, {
    imports: CHILDREN,
    declarations: [EntityViewerComponent],
    inputs: { Records: state.records ?? [] },
    setup: (c) => {
      const priv = c as unknown as { _entity: EntityInfo | null; IsLoading: boolean; ShowRecycleBin: boolean; FilteredRecordCount: number; TotalRecordCount: number; Config: Record<string, unknown> };
      priv._entity = state.entity ?? null;
      priv.IsLoading = state.IsLoading ?? false;
      priv.ShowRecycleBin = state.ShowRecycleBin ?? false;
      priv.FilteredRecordCount = state.filteredCount ?? 0;
      priv.TotalRecordCount = state.totalCount ?? 0;
      if (state.config) {
        priv.Config = state.config;
      }
      const viewPriv = c as unknown as { _viewEntity: unknown; _properties: unknown; ViewRunError: string | null };
      viewPriv._viewEntity = state.view ?? null;
      viewPriv._properties = state.properties ?? null;
      viewPriv.ViewRunError = state.runError ?? null;
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

  it('hides the header when chrome is embedded', () => {
    const f = render({ entity: ENTITY, config: { chrome: 'embedded' } });
    expect(query(f, '.viewer-header')).toBeNull();
    expect(query(f, '.filter-input')).toBeNull();
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

  it('keeps the page for an in-place refresh that waits on a load, but not once another reload also waits', () => {
    const f = render({ entity: ENTITY, IsLoading: true });
    const c = f.componentInstance as unknown as {
      Records: unknown; _pendingReload: boolean; _pendingReloadKeepsPage: boolean; RefreshInPlace(): void; LoadData(): Promise<void>;
    };
    c.Records = null;

    c.RefreshInPlace();
    expect([c._pendingReload, c._pendingReloadKeepsPage]).toEqual([true, true]);

    void c.LoadData(); // a sort/filter/entity change while still loading: that one starts at page 1
    expect([c._pendingReload, c._pendingReloadKeepsPage]).toEqual([true, false]);

    c.RefreshInPlace();
    expect(c._pendingReloadKeepsPage).toBe(false);
  });
});

describe('EntityViewerComponent (DOM) — view property chips', () => {
  const view = { PropertiesObject: [
    { Name: 'Chapter', Type: 'uuid', AllowOverride: false, Target: { Field: 'ChapterID', Operator: '=' } },
    { Name: 'Region', Type: 'string', Target: { Field: 'Region', Operator: '=' } },
  ] };

  it('lists each property read-only above the content; a server-set one reads "set by server"', () => {
    const f = render({ entity: ENTITY, view, properties: { Region: 'East' } });
    const chips = f.nativeElement.querySelectorAll('.view-property-chip');
    expect(chips.length).toBe(2);
    expect(text(f, '.view-property-chip.server-set')).toContain('set by server');
    expect(chips[1].textContent).toContain('East');
    expect(f.nativeElement.querySelector('.view-properties-row input, .view-properties-row button')).toBeNull();
  });

  it('shows the server refusal in the row', () => {
    const f = render({ entity: ENTITY, view, runError: 'View property "Chapter" is set by the server' });
    expect(text(f, '.view-properties-error')).toContain('is set by the server');
  });

  it('renders no row for a view without properties', () => {
    expect(query(render({ entity: ENTITY, view: { PropertiesObject: null } }), '.view-properties-row')).toBeNull();
  });

  it('renders no row without a view', () => {
    expect(query(render({ entity: ENTITY }), '.view-properties-row')).toBeNull();
  });
});

describe('EntityViewerComponent.NoRecordsTitle', () => {
  // The title speaks the entity's own plural ("No Contacts to display") and only falls back to the
  // generic "records" wording when no entity is in scope. Pinned because the interpolation
  // is easy to lose silently — a broken template literal still type-checks.
  const CONTACT = { Name: 'Contact', DisplayNamePlural: 'Contacts' } as unknown as EntityInfo;

  it('uses the entity display-name plural when an entity is in scope and no filter is active', () => {
    expect(render({ entity: CONTACT }).componentInstance.NoRecordsTitle).toBe('No Contacts to display');
  });

  it('falls back to the generic wording when no entity is in scope', () => {
    expect(render({ entity: null }).componentInstance.NoRecordsTitle).toBe('No records found');
  });

  it('reports "No matching records" while a filter is active, regardless of entity', () => {
    const f = render({ entity: CONTACT });
    (f.componentInstance as unknown as { DebouncedFilterText: string }).DebouncedFilterText = 'zz';
    expect(f.componentInstance.NoRecordsTitle).toBe('No matching records');
  });
});

describe('EntityViewerComponent — view persistence target', () => {
  type PersistenceAccessor = {
    _viewEntity: { ID: string; UserCanEdit: boolean } | null;
    persistenceTarget(): 'record' | 'user-settings' | 'none';
  };

  it('targets the UserView record when the loaded view has an ID and UserCanEdit is true', () => {
    const f = render({ entity: ENTITY });
    const c = f.componentInstance as unknown as PersistenceAccessor;
    c._viewEntity = { ID: 'V-1', UserCanEdit: true };
    expect(c.persistenceTarget()).toBe('record');
  });

  it('falls back to user-settings when the loaded view is read-only (UserCanEdit is false)', () => {
    const f = render({ entity: ENTITY });
    const c = f.componentInstance as unknown as PersistenceAccessor;
    c._viewEntity = { ID: 'V-1', UserCanEdit: false };
    expect(c.persistenceTarget()).toBe('user-settings');
  });
});

describe('EntityViewerComponent — EffectiveSavedViewID', () => {
  type SavedViewAccessor = {
    _viewEntity: { ID: string; IsSaved?: boolean } | null;
    EffectiveSavedViewID: string | null;
  };

  it('exposes the saved view ID only when a persisted UserView record is loaded', () => {
    const f = render({ entity: ENTITY });
    const c = f.componentInstance as unknown as SavedViewAccessor;
    expect(c.EffectiveSavedViewID).toBeNull();

    c._viewEntity = { ID: '9CB0CCEC-6A37-EF11-86D4-000D3A4E707E', IsSaved: true };
    expect(c.EffectiveSavedViewID).toBe('9CB0CCEC-6A37-EF11-86D4-000D3A4E707E');

    c._viewEntity = { ID: '9CB0CCEC-6A37-EF11-86D4-000D3A4E707E', IsSaved: false };
    expect(c.EffectiveSavedViewID).toBeNull();
  });
});

