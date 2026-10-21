import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import type { DashboardUserPermissions, MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { MJConfirmService, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import type { MJConfirmOptions } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, Capture, Click, Query, QueryAll, Text, TypeInto } from '@memberjunction/ng-test-utils';
import { DashboardBrowserComponent, DashboardOpenEvent } from './dashboard-browser.component';
import { DashboardBreadcrumbComponent } from '../breadcrumb/dashboard-breadcrumb.component';
import { DashboardCardComponent } from '../dashboard-card/dashboard-card.component';
import { DashboardLayoutPreviewComponent } from '../layout-preview/dashboard-layout-preview.component';
import { DashboardLayoutPreviewNodeComponent } from '../layout-preview/dashboard-layout-preview-node.component';

/**
 * DOM coverage for <mj-dashboard-browser> folder scoping, the FlatMode input, the dashboard cards,
 * dashboard clicks and delete. By default the browser shows the selected folder: its sub-folder cards
 * and the dashboards filed directly in it. With FlatMode on it shows every Config dashboard it is
 * given in one list, with no folder cards, whatever category is selected. Each dashboard is an
 * <mj-dashboard-card>, filled with the star, Shared marker and owner the host gives. Outside
 * selection mode a click opens the dashboard (a Shift, Ctrl or Cmd click asks for a separate tab);
 * in selection mode those clicks select. Delete asks the user through MJConfirmService (a double
 * here) and emits DashboardDelete only after the user confirms.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() text = '';
}

const SALES_ID = 'C0000000-0000-4000-8000-000000000001';
const PIPELINE_ID = 'C0000000-0000-4000-8000-000000000002';
const OTHER_OWNER_CATEGORY_ID = 'C0000000-0000-4000-8000-0000000000ff';

const category = (ID: string, Name: string, ParentID: string | null): MJDashboardCategoryEntity =>
  ({ ID, Name, ParentID, Description: null }) as unknown as MJDashboardCategoryEntity;

const dashboard = (ID: string, Name: string, CategoryID: string | null, Type = 'Config'): MJDashboardEntity =>
  ({ ID, Name, CategoryID, Type, Description: null, __mj_UpdatedAt: new Date('2026-09-01') }) as unknown as MJDashboardEntity;

const CATEGORIES = [category(SALES_ID, 'Sales', null), category(PIPELINE_ID, 'Pipeline', SALES_ID)];

const REVENUE = dashboard('D0000000-0000-4000-8000-000000000001', 'Revenue', null);
const QUOTA = dashboard('D0000000-0000-4000-8000-000000000002', 'Quota', SALES_ID);
const FUNNEL = dashboard('D0000000-0000-4000-8000-000000000003', 'Funnel', PIPELINE_ID);
const CUSTOM_CODE = dashboard('D0000000-0000-4000-8000-000000000004', 'Custom Code', null, 'Code');
/** Shared with the viewer; the viewer filed it under Sales, so the effective map points there. */
const PARTNER_KPIS = dashboard('D0000000-0000-4000-8000-000000000005', 'Partner KPIs', OTHER_OWNER_CATEGORY_ID);

const ALL_DASHBOARDS = [REVENUE, QUOTA, FUNNEL, CUSTOM_CODE, PARTNER_KPIS];
const EFFECTIVE_CATEGORIES = new Map<string, string | null>([[PARTNER_KPIS.ID, SALES_ID]]);

/** An MJConfirmService double. ConfirmDelete answers `answer`, or waits for the test when `answer` is a promise. */
function fakeConfirm(answer: boolean | Promise<boolean> = true) {
  return { ConfirmDelete: vi.fn(async (_options: Omit<MJConfirmOptions, 'type'>) => answer) };
}

function render(inputs: Record<string, unknown> = {}, confirm = fakeConfirm()): ComponentFixture<DashboardBrowserComponent> {
  return RenderComponentFixture(DashboardBrowserComponent, {
    imports: [FormsModule, MJEmptyStateComponent, LoadingStub],
    declarations: [
      DashboardBrowserComponent,
      DashboardBreadcrumbComponent,
      DashboardCardComponent,
      DashboardLayoutPreviewComponent,
      DashboardLayoutPreviewNodeComponent,
    ],
    providers: [{ provide: MJConfirmService, useValue: confirm }],
    inputs: {
      Dashboards: ALL_DASHBOARDS,
      Categories: CATEGORIES,
      EffectiveCategoryMap: EFFECTIVE_CATEGORIES,
      ...inputs,
    },
  });
}

/** Titles of the dashboard cards (folder cards excluded), in display order. */
const dashboardCardTitles = (fixture: ComponentFixture<DashboardBrowserComponent>): string[] =>
  QueryAll(fixture, 'mj-dashboard-card .dc-name').map(el => el.textContent?.trim() ?? '');

const folderCardTitles = (fixture: ComponentFixture<DashboardBrowserComponent>): string[] =>
  QueryAll(fixture, '.category-card .card-title').map(el => el.textContent?.trim() ?? '');

/** The dashboard card (the <mj-dashboard-card> element) with the title. */
function card(fixture: ComponentFixture<DashboardBrowserComponent>, title: string): HTMLElement {
  const found = QueryAll(fixture, 'mj-dashboard-card').find(el => el.querySelector('.dc-name')?.textContent?.trim() === title);
  if (!found) throw new Error(`no card titled ${title}`);
  return found as HTMLElement;
}

/** The element matching the selector inside the card with the title. */
function inCard(fixture: ComponentFixture<DashboardBrowserComponent>, title: string, selector: string): HTMLElement {
  const found = card(fixture, title).querySelector(selector);
  if (!found) throw new Error(`no ${selector} on the card titled ${title}`);
  return found as HTMLElement;
}

/** Clicks the dashboard card with the title, outside its buttons, with the given modifier keys. */
function clickCard(fixture: ComponentFixture<DashboardBrowserComponent>, title: string, keys: MouseEventInit = {}): void {
  inCard(fixture, title, '.dc-card').dispatchEvent(new MouseEvent('click', { bubbles: true, ...keys }));
  fixture.detectChanges();
}

describe('DashboardBrowserComponent (DOM)', () => {
  describe('folder scoping (default)', () => {
    it('at the root shows the top-level folders and the uncategorized Config dashboards', () => {
      const f = render();
      expect(folderCardTitles(f)).toEqual(['Sales']);
      expect(dashboardCardTitles(f)).toEqual(['Revenue']);
    });

    it('in a folder shows its sub-folders and the dashboards whose effective category it is', () => {
      const f = render({ SelectedCategoryId: SALES_ID });
      expect(folderCardTitles(f)).toEqual(['Pipeline']);
      expect(dashboardCardTitles(f)).toEqual(['Quota', 'Partner KPIs']);
    });

    it('shows the first-run welcome when it is given no dashboards and no folders', () => {
      const f = render({ Dashboards: [], Categories: [] });
      expect(Text(f, '.mj-empty-state__title')).toBe('Welcome to Dashboards');
    });
  });

  describe('FlatMode', () => {
    it('is off by default', () => {
      expect(render().componentInstance.FlatMode).toBe(false);
    });

    it('shows every Config dashboard it is given, in the given order, with no folder cards', () => {
      const f = render({ FlatMode: true });
      expect(dashboardCardTitles(f)).toEqual(['Revenue', 'Quota', 'Funnel', 'Partner KPIs']);
      expect(Query(f, '.category-card')).toBeNull();
    });

    it('ignores the selected category and keeps the breadcrumb at the root', () => {
      const f = render({ FlatMode: true, SelectedCategoryId: PIPELINE_ID });
      expect(dashboardCardTitles(f)).toEqual(['Revenue', 'Quota', 'Funnel', 'Partner KPIs']);
      expect(Query(f, '.breadcrumb-separator')).toBeNull();
    });

    it('shows the same dashboards in the list view, with no folder rows', () => {
      const f = render({ FlatMode: true, ViewMode: 'list' });
      const names = QueryAll(f, '.list-row:not(.category-row) .dashboard-name').map(el => el.textContent?.trim());
      expect(names).toEqual(['Revenue', 'Quota', 'Funnel', 'Partner KPIs']);
      expect(Query(f, '.category-row')).toBeNull();
    });

    it('still narrows the list with the search box', () => {
      const f = render({ FlatMode: true });
      TypeInto(f, '.search-box input', 'quota');
      f.detectChanges();
      expect(dashboardCardTitles(f)).toEqual(['Quota']);
    });

    it('shows a neutral empty state, not the first-run welcome, when there is nothing to show', () => {
      const f = render({ FlatMode: true, Dashboards: [CUSTOM_CODE] });
      expect(Text(f, '.mj-empty-state__title')).toBe('No dashboards to show');
      expect(QueryAll(f, 'mj-empty-state')).toHaveLength(1);
    });

    it('shows only the no-results state when a search matches nothing', () => {
      const f = render({ FlatMode: true });
      TypeInto(f, '.search-box input', 'zzz');
      f.detectChanges();
      expect(QueryAll(f, '.mj-empty-state__title').map(el => el.textContent?.trim())).toEqual(['No results found']);
    });

    it('creates new dashboards and categories at the root, not in the ignored category', () => {
      const f = render({ FlatMode: true, SelectedCategoryId: SALES_ID });
      const created = Capture(f.componentInstance.DashboardCreate);
      const createdCategories = Capture(f.componentInstance.CategoryCreate);

      f.componentInstance.OnCreateDashboard();
      f.componentInstance.NewCategoryName = 'Board';
      f.componentInstance.ConfirmCreateCategory();

      expect(created).toEqual([{ CategoryId: null }]);
      expect(createdCategories).toEqual([{ ParentCategoryId: null, Name: 'Board', Description: null }]);
    });

    it('can be switched on and off after the first render', () => {
      const f = render({ SelectedCategoryId: SALES_ID });
      f.componentRef.setInput('FlatMode', true);
      f.detectChanges();
      expect(dashboardCardTitles(f)).toEqual(['Revenue', 'Quota', 'Funnel', 'Partner KPIs']);

      f.componentRef.setInput('FlatMode', false);
      f.detectChanges();
      expect(dashboardCardTitles(f)).toEqual(['Quota', 'Partner KPIs']);
      expect(folderCardTitles(f)).toEqual(['Pipeline']);
    });
  });

  describe('dashboard clicks', () => {
    /** The names of the opened dashboards, each with its OpenInNewTab flag. */
    const opened = (events: DashboardOpenEvent[]): Array<[string, boolean]> => events.map(e => [e.Dashboard.Name, e.OpenInNewTab]);

    it('opens the dashboard in place for a plain click', () => {
      const f = render({ FlatMode: true });
      const opens = Capture(f.componentInstance.DashboardOpen);

      clickCard(f, 'Revenue');

      expect(opened(opens)).toEqual([['Revenue', false]]);
    });

    it('outside selection mode, opens the dashboard in a separate tab for a Shift, Ctrl or Cmd click, also after an earlier click', () => {
      const f = render({ FlatMode: true });
      const opens = Capture(f.componentInstance.DashboardOpen);

      clickCard(f, 'Revenue');
      clickCard(f, 'Quota', { shiftKey: true });
      clickCard(f, 'Funnel', { ctrlKey: true });
      clickCard(f, 'Partner KPIs', { metaKey: true });

      expect(opened(opens)).toEqual([['Revenue', false], ['Quota', true], ['Funnel', true], ['Partner KPIs', true]]);
      expect(f.componentInstance.SelectedCount).toBe(0);
    });

    it('in selection mode, toggles the dashboard for a Ctrl or Cmd click and opens nothing', () => {
      const f = render({ FlatMode: true });
      const opens = Capture(f.componentInstance.DashboardOpen);
      f.componentInstance.EnterSelectionMode();
      f.detectChanges();

      clickCard(f, 'Revenue', { ctrlKey: true });
      clickCard(f, 'Quota', { metaKey: true });
      expect(f.componentInstance.GetSelectedDashboards().map(d => d.Name)).toEqual(['Revenue', 'Quota']);

      clickCard(f, 'Revenue', { ctrlKey: true });
      expect(f.componentInstance.GetSelectedDashboards().map(d => d.Name)).toEqual(['Quota']);
      expect(opens).toEqual([]);
    });

    it('in selection mode, selects the range from the last clicked dashboard for a Shift-click and opens nothing', () => {
      const f = render({ FlatMode: true });
      const opens = Capture(f.componentInstance.DashboardOpen);
      f.componentInstance.EnterSelectionMode();
      f.detectChanges();

      clickCard(f, 'Revenue', { ctrlKey: true });
      clickCard(f, 'Funnel', { shiftKey: true });

      expect(f.componentInstance.GetSelectedDashboards().map(d => d.Name)).toEqual(['Revenue', 'Quota', 'Funnel']);
      expect(opens).toEqual([]);
    });

    it('in selection mode, starts a Shift range only from a click made in selection mode: a first Shift-click selects just that dashboard', () => {
      const f = render({ FlatMode: true });
      const opens = Capture(f.componentInstance.DashboardOpen);
      clickCard(f, 'Revenue');
      f.componentInstance.EnterSelectionMode();
      f.detectChanges();

      clickCard(f, 'Funnel', { shiftKey: true });

      expect(f.componentInstance.GetSelectedDashboards().map(d => d.Name)).toEqual(['Funnel']);
      expect(opened(opens)).toEqual([['Revenue', false]]);
    });
  });

  describe('delete', () => {
    const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
    const PERMS = (id: string, canDelete: boolean): DashboardUserPermissions =>
      ({ DashboardID: id, CanRead: true, CanEdit: canDelete, CanDelete: canDelete, CanShare: canDelete, IsOwner: canDelete, PermissionSource: canDelete ? 'owner' : 'direct' });

    /** The Delete button on the dashboard card with the title. */
    const deleteButton = (f: ComponentFixture<DashboardBrowserComponent>, title: string): HTMLElement => inCard(f, title, '.dc-delete');

    it('asks before deleting one dashboard, then emits DashboardDelete with it', async () => {
      const confirm = fakeConfirm(true);
      const f = render({ FlatMode: true }, confirm);
      const deletes = Capture(f.componentInstance.DashboardDelete);
      const opens = Capture(f.componentInstance.DashboardOpen);
      deleteButton(f, 'Revenue').click();
      await settle();
      expect(confirm.ConfirmDelete).toHaveBeenCalledExactlyOnceWith({ title: 'Delete dashboard', message: 'Delete "Revenue"?', detail: 'This action cannot be undone.' });
      expect(deletes.map(e => e.Dashboards.map(d => d.Name))).toEqual([['Revenue']]);
      expect(opens).toEqual([]);
    });

    it('emits nothing when the user cancels', async () => {
      const confirm = fakeConfirm(false);
      const f = render({ FlatMode: true }, confirm);
      const deletes = Capture(f.componentInstance.DashboardDelete);
      deleteButton(f, 'Revenue').click();
      await settle();
      expect(confirm.ConfirmDelete).toHaveBeenCalledTimes(1);
      expect(deletes).toEqual([]);
    });

    it('deletes only the selected dashboards the user may delete, counts them, and leaves selection mode', async () => {
      const confirm = fakeConfirm(true);
      const f = render({ FlatMode: true, DashboardPermissions: new Map([[QUOTA.ID, PERMS(QUOTA.ID, false)]]) }, confirm);
      const deletes = Capture(f.componentInstance.DashboardDelete);
      f.componentInstance.EnterSelectionMode();
      [REVENUE, QUOTA, FUNNEL].forEach(d => f.componentInstance.ToggleSelection(d.ID));
      f.detectChanges();
      Click(f, '.selection-toolbar .action-btn.danger');
      await settle();
      expect(confirm.ConfirmDelete).toHaveBeenCalledExactlyOnceWith({ title: 'Delete 2 dashboards', message: 'Delete 2 dashboards?', detail: 'This action cannot be undone.' });
      expect(deletes).toHaveLength(1);
      expect(deletes[0].Dashboards.map(d => d.Name)).toEqual(['Revenue', 'Funnel']);
      expect(f.componentInstance.IsSelectionMode).toBe(false);
      expect(f.componentInstance.SelectedCount).toBe(0);
    });

    it('stays in selection mode when the user cancels a bulk delete', async () => {
      const confirm = fakeConfirm(false);
      const f = render({ FlatMode: true }, confirm);
      const deletes = Capture(f.componentInstance.DashboardDelete);
      f.componentInstance.EnterSelectionMode();
      [REVENUE, QUOTA, FUNNEL].forEach(d => f.componentInstance.ToggleSelection(d.ID));
      f.detectChanges();
      Click(f, '.selection-toolbar .action-btn.danger');
      await settle();
      expect(confirm.ConfirmDelete).toHaveBeenCalledTimes(1);
      expect(deletes).toEqual([]);
      expect(f.componentInstance.IsSelectionMode).toBe(true);
      expect(f.componentInstance.SelectedCount).toBe(3);
    });
  });

  describe('dashboard cards', () => {
    const OWNER_PERMS = { CanRead: true, CanEdit: true, CanDelete: true, CanShare: true, IsOwner: true, PermissionSource: 'owner' } as const;
    const SHARED_PERMS = { CanRead: true, CanEdit: false, CanDelete: false, CanShare: false, IsOwner: false, PermissionSource: 'direct' } as const;
    const permissions = new Map<string, DashboardUserPermissions>([
      [REVENUE.ID, { DashboardID: REVENUE.ID, ...OWNER_PERMS }],
      [PARTNER_KPIS.ID, { DashboardID: PARTNER_KPIS.ID, ...SHARED_PERMS }],
    ]);

    it('shows each dashboard as an mj-dashboard-card', () => {
      const f = render({ FlatMode: true });
      expect(QueryAll(f, 'mj-dashboard-card')).toHaveLength(4);
      expect(Query(f, '.dashboard-card:not(.category-card)')).toBeNull();
    });

    it('fills each card with the star, the Shared marker and the owner the host gives', () => {
      const f = render({
        FlatMode: true,
        ShowFavorites: true,
        FavoriteIds: [QUOTA.ID.toLowerCase()],
        DashboardPermissions: permissions,
        OwnerLabels: new Map([[REVENUE.ID, 'You'], [PARTNER_KPIS.ID.toLowerCase(), 'Ana Ruiz']]),
      });
      expect(card(f, 'Quota').querySelector('.dc-star.on')).not.toBeNull();
      expect(card(f, 'Revenue').querySelector('.dc-star.on')).toBeNull();
      expect(card(f, 'Partner KPIs').querySelector('.dc-shared')).not.toBeNull();
      expect(card(f, 'Revenue').querySelector('.dc-shared')).toBeNull();
      expect(card(f, 'Revenue').querySelector('.dc-owner')?.textContent?.trim()).toBe('You');
      expect(card(f, 'Partner KPIs').querySelector('.dc-owner')?.textContent?.trim()).toBe('Ana Ruiz');
      expect(card(f, 'Quota').querySelector('.dc-owner')).toBeNull();
      expect(card(f, 'Revenue').querySelector('.dc-delete')).not.toBeNull();
      expect(card(f, 'Partner KPIs').querySelector('.dc-delete')).toBeNull();
      expect(card(f, 'Partner KPIs').querySelector('.dc-edit')).toBeNull();
    });

    it('hides the stars unless the host turns them on', () => {
      expect(Query(render({ FlatMode: true }), '.dc-star')).toBeNull();
    });

    it('emits DashboardFavoriteToggle for a star click and opens nothing', () => {
      const f = render({ FlatMode: true, ShowFavorites: true });
      const toggles = Capture(f.componentInstance.DashboardFavoriteToggle);
      const opens = Capture(f.componentInstance.DashboardOpen);
      inCard(f, 'Quota', '.dc-star').click();
      expect(toggles.map(t => t.Dashboard.Name)).toEqual(['Quota']);
      expect(opens).toEqual([]);
    });

    it('shows the category path on cards in a flat list only', () => {
      const f = render({ FlatMode: true });
      expect(card(f, 'Funnel').querySelector('.dc-category')?.textContent?.trim()).toBe('Sales › Pipeline');
      expect(card(f, 'Partner KPIs').querySelector('.dc-category')?.textContent?.trim()).toBe('Sales');
      expect(card(f, 'Revenue').querySelector('.dc-category')).toBeNull();

      f.componentRef.setInput('FlatMode', false);
      f.componentRef.setInput('SelectedCategoryId', PIPELINE_ID);
      f.detectChanges();
      expect(dashboardCardTitles(f)).toEqual(['Funnel']);
      expect(Query(f, '.dc-category')).toBeNull();
    });

    it("shows the host's empty state for an empty flat list, or the welcome when asked", () => {
      const f = render({
        FlatMode: true,
        Dashboards: [],
        FlatEmptyIcon: 'fa-solid fa-star',
        FlatEmptyTitle: 'No favorites yet',
        FlatEmptyMessage: 'Star a dashboard to keep it here.',
      });
      expect(Text(f, '.mj-empty-state__title')).toBe('No favorites yet');
      expect(Text(f, '.mj-empty-state__message')).toBe('Star a dashboard to keep it here.');
      expect(Query(f, '.mj-empty-state__icon.fa-star')).not.toBeNull();

      f.componentRef.setInput('FlatEmptyWelcome', true);
      f.detectChanges();
      expect(QueryAll(f, '.mj-empty-state__title').map(el => el.textContent?.trim())).toEqual(['Welcome to Dashboards']);
    });

    it('shows only the no-results state when a search in a welcome list matches nothing', () => {
      const f = render({ FlatMode: true, FlatEmptyWelcome: true });
      TypeInto(f, '.search-box input', 'zzz');
      f.detectChanges();
      expect(QueryAll(f, '.mj-empty-state__title').map(el => el.textContent?.trim())).toEqual(['No results found']);
    });

    it('asks to edit a dashboard from its Edit button or a double-click, and opens nothing', () => {
      const f = render({ FlatMode: true });
      const edits = Capture(f.componentInstance.DashboardEdit);
      const opens = Capture(f.componentInstance.DashboardOpen);
      inCard(f, 'Revenue', '.dc-edit').click();
      inCard(f, 'Quota', '.dc-card').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(edits.map(e => e.Dashboard.Name)).toEqual(['Revenue', 'Quota']);
      expect(opens).toEqual([]);
    });

    it('toggles the selection from the card checkbox in selection mode and opens nothing', () => {
      const f = render({ FlatMode: true });
      const opens = Capture(f.componentInstance.DashboardOpen);
      expect(Query(f, '.dc-select')).toBeNull();
      f.componentInstance.EnterSelectionMode();
      f.detectChanges();

      (inCard(f, 'Quota', '.dc-select input') as HTMLInputElement).click();
      f.detectChanges();

      expect(f.componentInstance.GetSelectedDashboards().map(d => d.Name)).toEqual(['Quota']);
      expect(card(f, 'Quota').querySelector('.dc-card.selected')).not.toBeNull();
      expect(opens).toEqual([]);
    });

    it('lets the cards be dragged only when AllowDragDrop is on, and dims the dragged card', () => {
      const f = render({ FlatMode: true, AllowDragDrop: false });
      expect(card(f, 'Revenue').draggable).toBe(false);

      f.componentRef.setInput('AllowDragDrop', true);
      f.detectChanges();
      expect(card(f, 'Revenue').draggable).toBe(true);
      f.componentInstance.OnDragStart(REVENUE, { dataTransfer: { setData: () => undefined, effectAllowed: 'none' } } as unknown as DragEvent);
      f.detectChanges();

      expect(card(f, 'Revenue').classList.contains('dragging')).toBe(true);
      expect(card(f, 'Quota').classList.contains('dragging')).toBe(false);
    });

    it('marks the search text on the cards', () => {
      const f = render({ FlatMode: true });
      TypeInto(f, '.search-box input', 'quo');
      f.detectChanges();
      expect(inCard(f, 'Quota', '.dc-name mark').textContent).toBe('Quo');
    });
  });
});
