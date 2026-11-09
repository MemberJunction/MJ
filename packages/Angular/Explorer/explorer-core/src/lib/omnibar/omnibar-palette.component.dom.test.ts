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
import { MentionSuggestion } from '@memberjunction/ng-composer';
import { RenderComponentFixture, Query, QueryAll, Text, Capture, TypeInto } from '@memberjunction/ng-test-utils';
import { OmnibarPaletteComponent } from './omnibar-palette.component';
import { OMNIBAR_NAV_KEY, OmnibarNavPayload, OmnibarProvider } from './omnibar-provider';
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

/** Two installed apps, enough for the '/' (Go to App) provider to produce rows. */
const APPS = [
  { ID: 'app-home', Name: 'Home', Description: 'Your home screen', Icon: '', Color: '', GetNavItems: () => Promise.resolve([]) },
  { ID: 'app-admin', Name: 'Admin', Description: 'MemberJunction Administration', Icon: '', Color: '', GetNavItems: () => Promise.resolve([]) },
];

/** Records navigation calls so we can assert exactly what a given activation reached. */
function fakeNavigation(): { svc: NavigationService; switched: string[]; searched: string[] } {
  const switched: string[] = [];
  const searched: string[] = [];
  const svc = {
    SwitchToApp: (appId: string) => { switched.push(appId); return Promise.resolve(); },
    OpenSearch: (query: string) => { searched.push(query); },
  } as unknown as NavigationService;
  return { svc, switched, searched };
}

const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A default-mode provider whose every fetch rejects (backend down / RunView error). */
class FailingProvider extends OmnibarProvider {
  public readonly TriggerChar = '';
  public readonly Key = 'test-failing';
  public readonly ModeLabel = 'Global Search';
  public async GetSuggestions(): Promise<MentionSuggestion[]> {
    throw new Error('backend down');
  }
  public override async EmptyStateSuggestions(): Promise<MentionSuggestion[]> {
    throw new Error('backend down');
  }
}

/** Typed access to the one private the failure spec has to reach. */
const withPrivates = (c: OmnibarPaletteComponent) =>
  c as unknown as { defaultProvider: OmnibarProvider | null };

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

/** Fixture with real installed apps, so the '/' (Go to App) provider produces rows. */
const renderWithApps = (nav: NavigationService) =>
  RenderComponentFixture(OmnibarPaletteComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [OmnibarPaletteComponent],
    providers: [
      { provide: NavigationService, useValue: nav },
      { provide: ApplicationManager, useValue: { Applications: of(APPS) } },
      { provide: SearchService, useValue: fakeSearch() },
      { provide: CommandPaletteService, useValue: { TrackAppAccess: () => Promise.resolve(), GetRecentApps: () => Promise.resolve([]) } },
      { provide: FileOpenService, useValue: {} },
    ],
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

  /**
   * Regression: the query/result race that made T153 fail in the browser regression
   * suite. Ctrl+/ seeds '/' (Go to App) and its app list lands in `Rows`; typing an
   * app name over the '/' switches to Global Search, but `Rows` was left holding the
   * PREVIOUS mode's list. The palette then showed an unfiltered app list as though it
   * answered the new query, and Enter executed row 0 of it — navigating somewhere the
   * user never asked for (observed: an `MJ: Applications` record page instead of the
   * Admin app).
   *
   * Two invariants keep that shut: a mode change clears `Rows`, and keyboard selection
   * only ever targets RENDERED rows (recents are selectable exclusively in the
   * empty-query state, which is the only state that renders them).
   */
  describe('stale result invalidation', () => {
    it("settles once the seeded '/' mode's app suggestions arrive", async () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      fixture.detectChanges(false);
      expect(fixture.componentInstance.Rows.length).toBe(APPS.length);
      expect(fixture.componentInstance.IsLoading).toBe(false);
    });

    it('clears the previous mode\'s rows the moment the query switches modes', async () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      expect(fixture.componentInstance.Rows.length).toBeGreaterThan(0);

      // Select-all + type 'Admin' — exactly what the regression agent did.
      fixture.componentInstance.OnQueryChange('Admin');
      fixture.detectChanges(false);

      // The Go-to-App list must NOT survive into Global Search mode.
      expect(fixture.componentInstance.ActiveTriggerChar).toBe('');
      expect(fixture.componentInstance.Rows.length).toBe(0);
    });

    /**
     * The actual T153 mechanism: with `Rows` empty mid-query, `selectableRows` used to
     * fall back to `RecentRows` — which render ONLY in the empty-query state, so Enter
     * executed a row that was nowhere on screen.
     */
    it('never offers recent rows for keyboard selection once a query is typed', async () => {
      const { svc, switched, searched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      // Recents are populated from the '/' provider's empty state.
      expect(fixture.componentInstance.RecentRows.length).toBeGreaterThan(0);

      fixture.componentInstance.OnQueryChange('Admin');
      expect(fixture.componentInstance.Rows.length).toBe(0);
      expect(fixture.componentInstance.HasOptions).toBe(false);

      // Enter falls through to the full-search escape hatch, NOT to an off-screen recent.
      fixture.componentInstance.OnInputKeydown(
        new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
      );
      expect(switched).toEqual([]);
      expect(searched).toEqual(['Admin']);
    });

    it('recents ARE selectable in the empty-query state that renders them', async () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      await settle(250);
      fixture.detectChanges(false);
      expect(fixture.componentInstance.Query).toBe('');
      expect(fixture.componentInstance.RecentRows.length).toBeGreaterThan(0);
      expect(fixture.componentInstance.HasOptions).toBe(true);
    });

    /**
     * C2 regression: the old `ResultsArePending` guard in `Execute` refused a click on a
     * row the user could see for the full debounce window after every keystroke, because
     * same-mode typing deliberately keeps the previous rows on screen.
     */
    it('executes a visible row immediately, without awaiting the debounce', async () => {
      const { svc, switched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      const row = fixture.componentInstance.Rows[0];
      expect(row).toBeDefined();

      // Same-mode extension: rows stay rendered while the next fetch is in flight.
      fixture.componentInstance.OnQueryChange('/Ad');
      expect(fixture.componentInstance.Rows.length).toBeGreaterThan(0);

      fixture.componentInstance.Execute(row.Suggestion);
      expect(switched.length).toBe(1);
      expect(fixture.componentInstance.IsOpen).toBe(false);
    });

    it('executes normally once the current query has settled', async () => {
      const { svc, switched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      const row = fixture.componentInstance.Rows[0];
      fixture.componentInstance.Execute(row.Suggestion);
      expect(switched.length).toBe(1);
    });

    /**
     * M4: a rejected provider call must still settle the generation. It used to leave
     * `IsLoading` true for the rest of the session and surface as an unhandled rejection.
     */
    it('settles and clears the spinner when the provider rejects', async () => {
      const fixture = render();
      fixture.componentInstance.Open();
      // Swap in the failing provider, then drive a real query through it.
      withPrivates(fixture.componentInstance).defaultProvider = new FailingProvider();
      fixture.componentInstance.OnQueryChange('anything');
      await settle(400);
      fixture.detectChanges(false);

      expect(fixture.componentInstance.IsLoading).toBe(false);
      expect(fixture.componentInstance.Rows).toEqual([]);
    });
    /**
     * The regression agent reported that "'/Admin' matched records instead of
     * applications", which would mean the '/' trigger wasn't claiming the query. It
     * does: the char maps to the Go-to-App provider and only the matching app comes
     * back. Pinned so a future provider-registration change can't silently
     * reintroduce the misread.
     */
    it("'/Admin' stays in Go-to-App mode and narrows to the matching app", async () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);

      fixture.componentInstance.OnQueryChange('/Admin');
      await settle(250);
      fixture.detectChanges(false);

      expect(fixture.componentInstance.ActiveTriggerChar).toBe('/');
      expect(fixture.componentInstance.ActiveModeLabel).toBe('Go to App');
      expect(fixture.componentInstance.EffectiveQuery).toBe('Admin');
      expect(fixture.componentInstance.Rows.map((r) => r.Suggestion.displayName)).toEqual(['Admin']);
      expect(fixture.componentInstance.Rows.every((r) => r.Suggestion.type === 'app')).toBe(true);
    });
  });

  /**
   * The empty state is the only thing on screen when nothing matched, and it makes a
   * PROMISE: "press ↵ to search everything". Two ways that promise used to be false.
   *
   * 1. `IsLoading` was assigned only in the default-mode branch of `runQuery`, so a
   *    trigger-mode fetch showed no spinner — and because a mode change now clears
   *    `Rows`, the palette asserted "No matches" for the whole debounce, before it had
   *    looked at anything.
   * 2. The Enter fallback was gated on `ActiveTriggerChar === ''`, so in a trigger mode
   *    the promise was never kept at all. Before the selectableRows fix Enter ran an
   *    off-screen recent; after it, Enter did nothing.
   *
   * `CanEscapeToFullSearch` now drives BOTH the wording and the handler, so they cannot
   * disagree. It is deliberately asymmetric — see its doc comment.
   */
  describe('empty state ↔ escape hatch agreement', () => {
    const enter = () => new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    it('shows the spinner, not "No matches", while a trigger-mode fetch is outstanding', () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      fixture.componentInstance.OnQueryChange('/zz');
      fixture.detectChanges(false);

      // Trigger modes used to skip the IsLoading assignment entirely.
      expect(fixture.componentInstance.IsLoading).toBe(true);
      expect(Query(fixture, '.ob-loading')).not.toBeNull();
      expect(Query(fixture, '.ob-empty')).toBeNull();
    });

    it('renders the settled no-match state, promising the escape hatch, once the fetch lands', async () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      fixture.componentInstance.OnQueryChange('/zz');
      await settle(250);
      fixture.detectChanges(false);

      expect(fixture.componentInstance.IsLoading).toBe(false);
      expect(fixture.componentInstance.Rows).toEqual([]);
      expect(fixture.componentInstance.CanEscapeToFullSearch).toBe(true);
      expect(Text(fixture, '.ob-empty')).toContain('search everything');
    });

    it('escapes to full search from a settled trigger mode, with the trigger char stripped', async () => {
      const { svc, switched, searched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      fixture.componentInstance.OnQueryChange('/zz');
      await settle(250);

      fixture.componentInstance.OnInputKeydown(enter());

      // 'zz', NOT '/zz' — the trigger char is a mode selector, not part of the query.
      expect(searched).toEqual(['zz']);
      expect(switched).toEqual([]);
    });

    /**
     * The hazard the settled-state gate exists for: escaping early would substitute a
     * global search for the app the user was three keystrokes into naming.
     */
    it('refuses to escape while a trigger-mode fetch is still outstanding', async () => {
      const { svc, switched, searched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      fixture.componentInstance.OnQueryChange('/Adm');

      expect(fixture.componentInstance.Rows).toEqual([]);
      fixture.componentInstance.OnInputKeydown(enter());
      expect(searched).toEqual([]);
      expect(switched).toEqual([]);

      // Waiting is what the user wanted: the app they were naming shows up.
      await settle(250);
      expect(fixture.componentInstance.Rows.map((r) => r.Suggestion.displayName)).toEqual(['Admin']);
    });

    /**
     * DEFAULT mode keeps submitting immediately, and that asymmetry is intentional: full
     * search IS this mode's action (the See-All row navigates to the same place), so early
     * and late submits can't diverge — whereas a search box that ignores Enter for 300 ms
     * reads as broken.
     */
    it('still submits immediately in default mode, where full search is the mode\'s own action', () => {
      const { svc, searched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      fixture.componentInstance.OnQueryChange('Admin');

      expect(fixture.componentInstance.IsLoading).toBe(true);
      fixture.componentInstance.OnInputKeydown(enter());
      expect(searched).toEqual(['Admin']);
    });

    /**
     * A one-character query can't reach full search (pre-existing `length > 1` floor), so
     * the empty state must not offer it. This is the coupling under test: one getter, so a
     * future change to either side moves both.
     */
    it('never promises an escape hatch it would refuse to take', async () => {
      const { svc, searched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open();
      fixture.componentInstance.OnQueryChange('/z');
      await settle(250);
      fixture.detectChanges(false);

      expect(fixture.componentInstance.Rows).toEqual([]);
      expect(fixture.componentInstance.CanEscapeToFullSearch).toBe(false);
      expect(Text(fixture, '.ob-empty')).not.toContain('search everything');

      fixture.componentInstance.OnInputKeydown(enter());
      expect(searched).toEqual([]);
    });
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
