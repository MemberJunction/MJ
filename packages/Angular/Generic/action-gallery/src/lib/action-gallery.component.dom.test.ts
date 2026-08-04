import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, text, attr, hasClass, click, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { ActionGalleryComponent, ActionGalleryConfig } from './action-gallery.component';
import type { RunViewParams } from '@memberjunction/core';

/**
 * DOM spec for <mj-action-gallery>.
 *
 * Two surfaces are covered:
 *  - config-driven chrome (theme/selection-mode classes, search-header gate, category-sidebar
 *    gate, view-toggle) — renders purely from the `config` @Input.
 *  - the DATA path (action cards, the count stat, the category tree). The component loads via a
 *    bare `new RunView()`, which resolves the process-global `RunView.Provider`. We do NOT touch
 *    the component — instead the data-path block installs a fake `RunView.Provider` for its
 *    duration (and restores the prior one afterward), so loadData()'s `new RunView()` picks up
 *    canned actions/categories with no backend. This is a TEST-ONLY seam; production code is
 *    unchanged. (The cleaner fix would be to route the component through `[Provider]`/
 *    `ProviderToUse`, but that is a deliberate production refactor we are not doing here.)
 */

const MOD = {
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective, MJEmptyStateComponent, SharedGenericModule],
  declarations: [ActionGalleryComponent],
};

const cfg = (over: Partial<ActionGalleryConfig> = {}): ActionGalleryConfig => ({
  selectionMode: false,
  multiSelect: false,
  showCategories: true,
  showSearch: true,
  defaultView: 'grid',
  gridColumns: 3,
  enableQuickTest: true,
  theme: 'light',
  ...over,
});

describe('ActionGalleryComponent (DOM — config-driven chrome)', () => {
  describe('container classes', () => {
    it('does not apply the dark-theme class for a light theme', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ theme: 'light' }) } });
      expect(hasClass(f, '.action-gallery', 'dark-theme')).toBe(false);
    });

    it('applies the dark-theme class for a dark theme', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ theme: 'dark' }) } });
      expect(hasClass(f, '.action-gallery', 'dark-theme')).toBe(true);
    });

    it('applies the selection-mode class when selectionMode is on', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ selectionMode: true }) } });
      expect(hasClass(f, '.action-gallery', 'selection-mode')).toBe(true);
    });
  });

  describe('search header gate', () => {
    it('renders the search header with its input when showSearch is true', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ showSearch: true }) } });
      expect(query(f, '.gallery-header')).not.toBeNull();
      expect(attr(f, '.search-input', 'placeholder')).toBe('Search actions by name, description, or category...');
    });

    it('hides the search header when showSearch is false', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ showSearch: false }) } });
      expect(query(f, '.gallery-header')).toBeNull();
    });
  });

  describe('category sidebar gate', () => {
    it('renders the category sidebar when showCategories is true', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ showCategories: true }) } });
      expect(query(f, '.category-sidebar')).not.toBeNull();
      expect(hasClass(f, '.gallery-content', 'no-categories')).toBe(false);
    });

    it('hides the category sidebar and flags the content no-categories when showCategories is false', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ showCategories: false }) } });
      expect(query(f, '.category-sidebar')).toBeNull();
      expect(hasClass(f, '.gallery-content', 'no-categories')).toBe(true);
    });
  });

  describe('view toggle', () => {
    it('renders the view-toggle button showing the grid icon by default', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ defaultView: 'grid' }) } });
      const btn = query(f, '.view-toggle button');
      expect(btn).not.toBeNull();
      expect(btn!.querySelector('.fa-th')).not.toBeNull();
    });

    it('switches the icon from grid to list when toggled', () => {
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config: cfg({ defaultView: 'grid' }) } });
      click(f, '.view-toggle button'); // toggleViewMode()
      f.detectChanges();
      const btn = query(f, '.view-toggle button')!;
      expect(btn.querySelector('.fa-list')).not.toBeNull();
      expect(btn.querySelector('.fa-th')).toBeNull();
    });
  });

  describe('data path (fed via a test-only global provider)', () => {
    const ACTIONS = [
      { ID: 'a1', Name: 'Send Email', Category: 'Communication', Description: 'Sends an email' },
      { ID: 'a2', Name: 'Create Invoice', Category: 'Finance', Description: 'Creates an invoice' },
    ];
    const CATEGORIES = [
      { ID: 'c1', Name: 'Communication', ParentID: null },
      { ID: 'c2', Name: 'Finance', ParentID: null },
    ];

    // loadData() runs RunViews([Actions, Action Categories]) in ngOnInit; return the right rows
    // per EntityName.
    const byEntity = (p: RunViewParams) => (p.EntityName === 'MJ: Actions' ? ACTIONS : p.EntityName === 'MJ: Action Categories' ? CATEGORIES : []);

    // The component uses a bare `new RunView()`, which reads the global RunView.Provider — not an
    // @Input. useFakeGlobalProvider() registers the save/restore (scoped to this describe, so the
    // chrome tests above still run against the unset-data world) and returns an installer.
    const installProvider = useFakeGlobalProvider();

    async function renderLoaded(rows: (p: RunViewParams) => unknown[] = byEntity, config = cfg()) {
      installProvider({ runViewResults: rows });
      const f = renderComponentFixture(ActionGalleryComponent, { ...MOD, inputs: { config } });
      await new Promise((r) => setTimeout(r, 0)); // let loadData's RunViews promise resolve
      f.detectChanges();
      return f;
    }

    it('renders one action card per loaded action, with name and category badge', async () => {
      const f = await renderLoaded();
      const cards = queryAll(f, '.action-card');
      expect(cards.length).toBe(2);
      expect(queryAll(f, '.action-name').map((e) => e.textContent?.trim())).toEqual(['Send Email', 'Create Invoice']);
      expect(queryAll(f, '.category-badge').map((e) => e.textContent?.trim())).toEqual(['Communication', 'Finance']);
    });

    it('shows the count stat reflecting the loaded actions', async () => {
      const f = await renderLoaded();
      expect(text(f, '.stat-item')).toContain('2 of 2 actions');
    });

    it('builds the category tree from the loaded categories', async () => {
      const f = await renderLoaded();
      const names = queryAll(f, '.category-sidebar .category-name').map((e) => e.textContent?.trim());
      expect(names).toContain('Communication');
      expect(names).toContain('Finance');
    });

    it('shows the empty state when the provider returns no actions', async () => {
      const f = await renderLoaded(() => []);
      expect(query(f, 'mj-empty-state')).not.toBeNull();
      expect(query(f, '.action-card')).toBeNull();
    });
  });
});
