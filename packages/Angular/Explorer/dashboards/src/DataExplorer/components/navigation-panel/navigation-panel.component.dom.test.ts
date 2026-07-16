import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MJAccordionPanelComponent, MJAccordionTitleDirective,
  MJEmptyStateComponent, MJButtonDirective,
} from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { NavigationPanelComponent } from './navigation-panel.component';
import type { FavoriteItem, RecentItem } from '../../models/explorer-state.interface';

/**
 * DOM coverage for <mj-explorer-navigation-panel> (module-declared). The favorites/recent sections
 * are pure functions of the `favorites`/`recentItems` @Inputs (via the favoriteEntities /
 * favoriteRecords / filteredRecentItems getters); the collapse toggle and section headers just emit.
 * The entity tree loads via provider-backed configs, so `mj-tree` is STUBBED (a lightweight
 * standalone with matching selector + inputs/outputs) — we don't exercise it. The accordion body
 * uses eager <ng-content>, so section content renders regardless of Expanded. Rendering a fav/recent
 * item calls the icon getters, which read `ProviderToUse.Entities`, so we pass a fake `Provider`
 * (empty entity set → getters fall back to their default icon). Click-driven emissions re-render
 * fine; collapse is toggled via the `collapsed` @Input.
 */

@Component({ standalone: true, selector: 'mj-tree', template: '<div class="tree-stub"></div>' })
class TreeStub {
  @Input() BranchConfig: unknown; @Input() LeafConfig: unknown; @Input() SelectionMode = '';
  @Input() SelectableTypes = ''; @Input() SelectedIDs: string[] = []; @Input() ShowIcons = false;
  @Input() ShowExpandCollapseAll = false; @Input() AnimateExpandCollapse = false;
  @Input() EmptyMessage = ''; @Input() EmptyIcon = '';
  @Output() SelectionChange = new EventEmitter<unknown>();
}

const fav = (over: Partial<FavoriteItem> = {}): FavoriteItem =>
  ({ type: 'entity', entityName: 'Accounts', displayName: 'Accounts', ...over }) as FavoriteItem;

const recent = (over: Partial<RecentItem> = {}): RecentItem =>
  ({ entityName: 'Accounts', compositeKeyString: 'ID|1', displayName: 'Acme', timestamp: new Date(), ...over }) as RecentItem;

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(NavigationPanelComponent, {
    imports: [FormsModule, MJAccordionPanelComponent, MJAccordionTitleDirective, MJEmptyStateComponent, MJButtonDirective, TreeStub],
    declarations: [NavigationPanelComponent],
    inputs: { entities: [], favorites: [], recentItems: [], collapsed: false, Provider: createFakeProvider({ entities: [] }), ...inputs },
  });

describe('NavigationPanelComponent (DOM)', () => {
  it('shows the expanded panel content (not collapsed icons) when not collapsed', () => {
    const fixture = render({ collapsed: false });
    expect(query(fixture, '.panel-content')).not.toBeNull();
    expect(query(fixture, '.collapsed-icons')).toBeNull();
  });

  it('shows only the collapsed icon rail when collapsed', () => {
    const fixture = render({ collapsed: true });
    expect(query(fixture, '.collapsed-icons')).not.toBeNull();
    expect(query(fixture, '.panel-content')).toBeNull();
  });

  it('renders empty-states for favorites and recent when both are empty', () => {
    const fixture = render({ favorites: [], recentItems: [] });
    // Both the favorites and recent sections fall back to an empty-state.
    expect(queryAll(fixture, 'mj-empty-state').length).toBeGreaterThanOrEqual(2);
    expect(queryAll(fixture, '.nav-item').length).toBe(0);
  });

  it('renders a nav item per favorite and per recent item with its display name', () => {
    const fixture = render({
      favorites: [fav({ displayName: 'Accounts' }), fav({ type: 'record', entityName: 'Contacts', compositeKeyString: 'ID|9', displayName: 'Jane Doe' })],
      recentItems: [recent({ displayName: 'Acme Corp' })],
    });
    const labels = queryAll(fixture, '.nav-item-label').map((e) => e.textContent?.trim());
    expect(labels).toContain('Accounts');
    expect(labels).toContain('Jane Doe');
    expect(labels).toContain('Acme Corp');
  });

  it('shows the entities count badge reflecting the entities input', () => {
    const fixture = render({ entities: [{ Name: 'A' }, { Name: 'B' }, { Name: 'C' }] as never });
    expect(fixture.nativeElement.textContent).toContain('3');
    expect(query(fixture, 'mj-tree')).not.toBeNull();
  });

  it('emits toggleCollapse when the collapse toggle is clicked', () => {
    const fixture = render({ collapsed: false });
    const emits = capture(fixture.componentInstance.toggleCollapse);
    (query(fixture, '.collapse-toggle') as HTMLButtonElement).click();
    expect(emits.length).toBe(1);
  });

  it('emits expandAndFocus with the section when a collapsed icon is clicked', () => {
    const fixture = render({ collapsed: true });
    const emits = capture<'favorites' | 'recent' | 'entities'>(fixture.componentInstance.expandAndFocus);
    (query(fixture, '.collapsed-icons .icon-btn') as HTMLButtonElement).click();
    expect(emits).toEqual(['favorites']);
  });

  it('emits selectRecord when a recent item is clicked', () => {
    const fixture = render({ recentItems: [recent({ entityName: 'Accounts', compositeKeyString: 'ID|42', displayName: 'Acme' })] });
    const emits = capture<{ entityName: string; recordId: string }>(fixture.componentInstance.selectRecord);
    (query(fixture, '.nav-item') as HTMLElement).click();
    expect(emits.length).toBe(1);
    expect(emits[0].entityName).toBe('Accounts');
  });
});
