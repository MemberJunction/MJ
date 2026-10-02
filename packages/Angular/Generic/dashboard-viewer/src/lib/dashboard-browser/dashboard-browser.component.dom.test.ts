import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, Capture, Query, QueryAll, Text, TypeInto } from '@memberjunction/ng-test-utils';
import { DashboardBrowserComponent, DashboardOpenEvent } from './dashboard-browser.component';
import { DashboardBreadcrumbComponent } from '../breadcrumb/dashboard-breadcrumb.component';
import { ConfirmDialogComponent } from '../config-dialogs/confirm-dialog.component';

/**
 * DOM coverage for <mj-dashboard-browser> folder scoping, the FlatMode input and dashboard clicks.
 * By default the browser shows the selected folder: its sub-folder cards and the dashboards filed
 * directly in it. With FlatMode on it shows every Config dashboard it is given in one list, with no
 * folder cards, whatever category is selected. Outside selection mode a click opens the dashboard
 * (a Shift, Ctrl or Cmd click asks for a separate tab); in selection mode those clicks select.
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

function render(inputs: Record<string, unknown> = {}): ComponentFixture<DashboardBrowserComponent> {
  return RenderComponentFixture(DashboardBrowserComponent, {
    imports: [FormsModule, MJEmptyStateComponent, LoadingStub],
    declarations: [DashboardBrowserComponent, DashboardBreadcrumbComponent, ConfirmDialogComponent],
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
  QueryAll(fixture, '.dashboard-card:not(.category-card) .card-title').map(el => el.textContent?.trim() ?? '');

const folderCardTitles = (fixture: ComponentFixture<DashboardBrowserComponent>): string[] =>
  QueryAll(fixture, '.category-card .card-title').map(el => el.textContent?.trim() ?? '');

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
    /** Clicks the dashboard card with the title, with the given modifier keys. */
    function clickCard(f: ComponentFixture<DashboardBrowserComponent>, title: string, keys: MouseEventInit = {}): void {
      const card = QueryAll(f, '.dashboard-card:not(.category-card)').find(el => el.querySelector('.card-title')?.textContent?.trim() === title);
      if (!card) throw new Error(`no card titled ${title}`);
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, ...keys }));
      f.detectChanges();
    }

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
});
