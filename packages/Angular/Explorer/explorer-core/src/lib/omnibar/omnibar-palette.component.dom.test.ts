import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { SearchService } from '@memberjunction/ng-search';
import { FileOpenService } from '@memberjunction/ng-file-storage';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { OmnibarPaletteComponent } from './omnibar-palette.component';
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
 * Close() tears it down + emits Closed, and RequestSettings() closes then emits SettingsRequested.
 * One render per test (TestBed single-use).
 */

// SearchService is the only service Open() actually calls into (LoadRecentSearches / RecentSearches$
// / LoadScopes). Everything else is only reached by Execute(), which these specs don't exercise.
function fakeSearch(): SearchService {
  return {
    LoadRecentSearches: () => Promise.resolve(),
    RecentSearches$: new BehaviorSubject<Array<{ Query: string }>>([]),
    LoadScopes: () => Promise.resolve([]),
    RecordRecentSearch: () => {},
  } as unknown as SearchService;
}

/** Two installed apps, enough for the '/' (Go to App) provider to produce rows. */
const APPS = [
  { ID: 'app-home', Name: 'Home', Description: 'Your home screen', Icon: '', Color: '', GetNavItems: () => Promise.resolve([]) },
  { ID: 'app-admin', Name: 'Admin', Description: 'MemberJunction Administration', Icon: '', Color: '', GetNavItems: () => Promise.resolve([]) },
];

/** Records SwitchToApp calls so we can assert a stale row never navigates. */
function fakeNavigation(): { svc: NavigationService; switched: string[] } {
  const switched: string[] = [];
  const svc = { SwitchToApp: (appId: string) => { switched.push(appId); return Promise.resolve(); } } as unknown as NavigationService;
  return { svc, switched };
}

const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PROVIDERS = () => [
  { provide: NavigationService, useValue: {} },
  { provide: ApplicationManager, useValue: { Applications: of([]) } },
  { provide: SearchService, useValue: fakeSearch() },
  { provide: CommandPaletteService, useValue: { TrackAppAccess: () => Promise.resolve() } },
  { provide: FileOpenService, useValue: {} },
];

const render = () =>
  renderComponentFixture(OmnibarPaletteComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [OmnibarPaletteComponent],
    providers: PROVIDERS(),
  });

describe('OmnibarPaletteComponent (DOM)', () => {
  it('renders nothing while closed (IsOpen defaults false)', () => {
    const fixture = render();
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(query(fixture, '.omnibar-overlay')).toBeNull();
    expect(query(fixture, '.omnibar-palette')).toBeNull();
  });

  it('opens the palette overlay and emits Opened', () => {
    const fixture = render();
    const opened = capture(fixture.componentInstance.Opened);
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.IsOpen).toBe(true);
    expect(query(fixture, '.omnibar-palette')).not.toBeNull();
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
    const closed = capture(fixture.componentInstance.Closed);
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    fixture.componentInstance.Close();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(query(fixture, '.omnibar-palette')).toBeNull();
    expect(closed.length).toBe(1);
  });

  it('RequestSettings() closes the palette then emits SettingsRequested', () => {
    const fixture = render();
    const settings = capture(fixture.componentInstance.SettingsRequested);
    const closed = capture(fixture.componentInstance.Closed);
    fixture.componentInstance.Open();
    fixture.detectChanges(false);
    fixture.componentInstance.RequestSettings();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(settings.length).toBe(1);
    expect(closed.length).toBe(1);
  });
  /**
   * Regression: the query/result race that made T153 fail in the browser regression
   * suite. Ctrl+/ seeds '/' (Go to App) and its app list lands in `Rows`; typing an
   * app name over the '/' switches to Global Search, but `Rows` was left holding the
   * PREVIOUS mode's list. The palette then showed an unfiltered app list as though it
   * answered the new query, and Enter executed row 0 of it — navigating somewhere the
   * user never asked for (observed: an `MJ: Applications` record page instead of the
   * Admin app).
   */
  describe('stale result invalidation', () => {
    const renderWithApps = (nav: NavigationService) =>
      renderComponentFixture(OmnibarPaletteComponent, {
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

    it('a freshly opened palette is not pending (first Enter must not be refused)', () => {
      const fixture = render();
      fixture.componentInstance.Open();
      fixture.detectChanges(false);
      expect(fixture.componentInstance.ResultsArePending).toBe(false);
    });

    it("settles once the seeded '/' mode's app suggestions arrive", async () => {
      const { svc } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      fixture.detectChanges(false);
      expect(fixture.componentInstance.Rows.length).toBe(APPS.length);
      expect(fixture.componentInstance.ResultsArePending).toBe(false);
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
      expect(fixture.componentInstance.ResultsArePending).toBe(true);
    });

    it('refuses to execute a row that belongs to a superseded query', async () => {
      const { svc, switched } = fakeNavigation();
      const fixture = renderWithApps(svc);
      fixture.componentInstance.Open('/');
      await settle(250);
      const staleRow = fixture.componentInstance.Rows[0];
      expect(staleRow).toBeDefined();

      fixture.componentInstance.OnQueryChange('Admin');
      fixture.componentInstance.Execute(staleRow.Suggestion);

      // Nothing navigated: the row answered '/' , not 'Admin'.
      expect(switched).toEqual([]);
      expect(fixture.componentInstance.IsOpen).toBe(true);
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
});
