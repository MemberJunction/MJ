import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { SearchService } from '@memberjunction/ng-search';
import type { SearchResponse, SearchResultItem } from '@memberjunction/ng-search';
import { FileOpenService } from '@memberjunction/ng-file-storage';
import { RenderComponentFixture, Query, QueryAll, Capture, TypeInto } from '@memberjunction/ng-test-utils';
import { OmnibarPaletteComponent } from './omnibar-palette.component';
import { OMNIBAR_NAV_KEY, OmnibarNavPayload } from './omnibar-provider';
import { CommandPaletteService } from '../command-palette/command-palette.service';

/**
 * DOM coverage for <mj-omnibar-palette> — the unified Ctrl/Cmd+K command palette (added by the
 * omnibar feature). It's an OnPush, NgModule-declared modal whose entire surface is gated on
 * `IsOpen`, with a clean open/close/emit contract. There's no async lifecycle load; scopes/recents
 * load lazily inside Open() and are individually try/caught ("decorative — never block the palette").
 * Open() registers the built-in providers via the MJ ClassFactory (LoadOmnibarProviders) and Attaches
 * them to our fake service context, so the default mode resolves to the cross-source "Global Search"
 * provider. We fake the five injected services with the minimum surface Open()/Close() touch and
 * assert: closed renders nothing, Open() shows the overlay + emits Opened,
 * Close() tears it down + emits Closed, RequestSettings() closes then emits SettingsRequested, and
 * Execute() on a dashboard row opens that dashboard like any link (it replaces the preview tab; a
 * Shift-click opens a separate tab). The last group types a query and
 * reads the rows the real search provider returns: the group labels, their order, and the Enter default.
 * One render per test (TestBed single-use).
 */

// SearchService is the only service Open() actually calls into (LoadRecentSearches / RecentSearches$
// / LoadScopes). Everything else is only reached by Execute() or a typed query; those specs pass the
// members they need.
function fakeSearch(extra: Partial<Pick<SearchService, 'PreviewSearch' | 'Provider'>> = {}): SearchService {
  return {
    LoadRecentSearches: () => Promise.resolve(),
    RecentSearches$: new BehaviorSubject<Array<{ Query: string }>>([]),
    LoadScopes: () => Promise.resolve([]),
    RecordRecentSearch: () => {},
    ...extra,
  } as unknown as SearchService;
}

const PROVIDERS = (navigation: Partial<NavigationService> = {}, search: SearchService = fakeSearch()) => [
  { provide: NavigationService, useValue: navigation },
  { provide: ApplicationManager, useValue: { Applications: of([]) } },
  { provide: SearchService, useValue: search },
  { provide: CommandPaletteService, useValue: { TrackAppAccess: () => Promise.resolve() } },
  { provide: FileOpenService, useValue: {} },
];

const render = (navigation?: Partial<NavigationService>, search?: SearchService) =>
  RenderComponentFixture(OmnibarPaletteComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [OmnibarPaletteComponent],
    providers: PROVIDERS(navigation, search),
  });

describe('OmnibarPaletteComponent (DOM)', () => {
  it('renders nothing while closed (IsOpen defaults false)', () => {
    const fixture = render();
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(Query(fixture, '.omnibar-overlay')).toBeNull();
    expect(Query(fixture, '.omnibar-palette')).toBeNull();
  });

  it('opens the palette overlay and emits Opened', () => {
    const fixture = render();
    const opened = Capture(fixture.componentInstance.Opened);
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.IsOpen).toBe(true);
    expect(Query(fixture, '.omnibar-palette')).not.toBeNull();
    expect(opened.length).toBe(1);
  });

  it('resolves the default (global cross-source search) mode when no trigger char is typed', () => {
    const fixture = render();
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    // The ClassFactory-discovered default provider is the cross-source search mode (empty trigger char).
    expect(fixture.componentInstance.ActiveTriggerChar).toBe('');
    expect(fixture.componentInstance.ActiveModeLabel).toBe('Global Search');
    expect(fixture.componentInstance.ActivePlaceholder.length).toBeGreaterThan(0);
  });

  it('Close() tears the overlay down and emits Closed', () => {
    const fixture = render();
    const closed = Capture(fixture.componentInstance.Closed);
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    fixture.componentInstance.Close();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(Query(fixture, '.omnibar-palette')).toBeNull();
    expect(closed.length).toBe(1);
  });

  it('RequestSettings() closes the palette then emits SettingsRequested', () => {
    const fixture = render();
    const settings = Capture(fixture.componentInstance.SettingsRequested);
    const closed = Capture(fixture.componentInstance.Closed);
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    fixture.componentInstance.RequestSettings();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(settings.length).toBe(1);
    expect(closed.length).toBe(1);
  });

  it('Execute() on a dashboard row opens the dashboard without forcing a new tab, records the search and closes', () => {
    const navigation: Pick<NavigationService, 'OpenDashboard'> = { OpenDashboard: vi.fn(() => 'tab-1') };
    const search = fakeSearch();
    const recordRecentSearch = vi.spyOn(search, 'RecordRecentSearch');
    const fixture = render(navigation, search);
    const palette = fixture.componentInstance;
    palette.Open();
    palette.Query = 'pipe';
    const nav: OmnibarNavPayload = { kind: 'dashboard', dashboardId: 'd1', dashboardName: 'Sales pipeline' };

    palette.Execute({
      type: 'dashboard', id: 'dashboard:d1', name: 'Sales pipeline', displayName: 'Sales pipeline',
      data: { [OMNIBAR_NAV_KEY]: nav, group: 'Dashboards' },
    });

    expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith('d1', 'Sales pipeline');
    expect(recordRecentSearch).toHaveBeenCalledWith('pipe');
    expect(palette.IsOpen).toBe(false);
  });
});

describe('OmnibarPaletteComponent (DOM) — default search rows', () => {
  type EngineDashboard = ReturnType<DashboardEngine['GetAccessibleDashboards']>[number];
  type DashboardFields = Pick<EngineDashboard, 'ID' | 'Name' | 'Description' | 'Category' | 'User' | 'Type' | 'DriverClass'>;

  const WEEKLY_DIGEST: Partial<SearchResultItem> = {
    Title: 'Weekly Entity Digest',
    Snippet: '',
    EntityName: 'MJ: Actions',
    RecordID: 'r-digest',
    ResultType: 'entity-record',
    Score: 0.8,
  };

  const configDashboard = (ID: string, Name: string, Description: string | null = null): EngineDashboard => {
    const fields: DashboardFields = { ID, Name, Description, Category: null, User: 'Ana', Type: 'Config', DriverClass: null };
    return fields as unknown as EngineDashboard;
  };
  const revenueBoard = () => configDashboard('rb', 'Revenue Board', 'Weekly sales numbers by team');
  const weeklyKpis = () => configDashboard('wk', 'Weekly KPIs');

  /** The global DashboardEngine, loaded, returns `dashboards` for every user. */
  const stubEngine = (dashboards: EngineDashboard[]): void => {
    const engine: Pick<DashboardEngine, 'Loaded' | 'GetAccessibleDashboards'> = { Loaded: true, GetAccessibleDashboards: () => dashboards };
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  };

  const previewOf = (results: Array<Partial<SearchResultItem>>): SearchResponse => ({
    Success: true,
    Results: results as SearchResultItem[],
    Groups: [],
    Filters: [],
    TotalCount: results.length,
    ElapsedMs: 0,
    SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
    Providers: [],
  });

  /** A search service signed in as Ana whose preview returns `results`. */
  const searchReturning = (results: Array<Partial<SearchResultItem>>): SearchService =>
    fakeSearch({
      PreviewSearch: async () => previewOf(results),
      Provider: { CurrentUser: { ID: 'user-ana' } } satisfies { CurrentUser: Pick<UserInfo, 'ID'> } as unknown as IMetadataProvider,
    });

  /** Opens the palette, types `text` and waits for the debounced search to render. */
  const typeQuery = async (fixture: ComponentFixture<OmnibarPaletteComponent>, text: string): Promise<void> => {
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    TypeInto(fixture, 'input.ob-input', text);
    // Runs the search debounce; the faked search answers without timers.
    await vi.runOnlyPendingTimersAsync();
    fixture.detectChanges(false);
  };

  /** The empty group label that separates the ungrouped "see all" row from the last group, as `listing` shows it. */
  const SPACER = '[]';

  /** Group labels (in brackets) and row names, in the order they render. */
  const listing = (fixture: ComponentFixture<OmnibarPaletteComponent>): string[] =>
    QueryAll(fixture, '#ob-listbox > .ob-group-label, #ob-listbox > .ob-row').map((el) =>
      el.classList.contains('ob-group-label') ? `[${el.textContent?.trim()}]` : (el.querySelector('.ob-rname')?.textContent?.trim() ?? ''),
    );

  const selectedRowName = (fixture: ComponentFixture<OmnibarPaletteComponent>): string => Query(fixture, '.ob-row--sel .ob-rname')?.textContent?.trim() ?? '';

  const pressEnter = (fixture: ComponentFixture<OmnibarPaletteComponent>): void => {
    Query(fixture, 'input.ob-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('"weekly": the record whose name matches is the Enter default, and the description-only dashboard follows the records', async () => {
    stubEngine([revenueBoard()]);
    const fixture = render({}, searchReturning([WEEKLY_DIGEST]));
    const execute = vi.spyOn(fixture.componentInstance, 'Execute').mockImplementation(() => undefined);

    await typeQuery(fixture, 'weekly');

    expect(listing(fixture)).toEqual(['[Records]', 'Weekly Entity Digest', '[Dashboards]', 'Revenue Board', SPACER, 'See all results for “weekly”']);
    expect(selectedRowName(fixture)).toBe('Weekly Entity Digest');
    pressEnter(fixture);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ name: 'Weekly Entity Digest', type: 'records' }));
  });

  it('labels the description-only block "Dashboards" again when records sit between it and the name matches', async () => {
    stubEngine([revenueBoard(), weeklyKpis()]);
    const fixture = render({}, searchReturning([WEEKLY_DIGEST]));
    const execute = vi.spyOn(fixture.componentInstance, 'Execute').mockImplementation(() => undefined);

    await typeQuery(fixture, 'weekly');

    expect(listing(fixture)).toEqual([
      '[Dashboards]',
      'Weekly KPIs',
      '[Records]',
      'Weekly Entity Digest',
      '[Dashboards]',
      'Revenue Board',
      SPACER,
      'See all results for “weekly”',
    ]);
    expect(selectedRowName(fixture)).toBe('Weekly KPIs');
    pressEnter(fixture);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ name: 'Weekly KPIs', type: 'dashboard' }));
  });

  it('shows one Dashboards block, name matches first, when search finds no records', async () => {
    stubEngine([revenueBoard(), weeklyKpis()]);
    const fixture = render({}, searchReturning([]));

    await typeQuery(fixture, 'weekly');

    expect(listing(fixture)).toEqual(['[Dashboards]', 'Weekly KPIs', 'Revenue Board', SPACER, 'See all results for “weekly”']);
  });

  it('adds no spacer when "see all" is the only row', async () => {
    stubEngine([]);
    const fixture = render({}, searchReturning([]));

    await typeQuery(fixture, 'zzz');

    expect(listing(fixture)).toEqual(['See all results for “zzz”']);
  });
});
