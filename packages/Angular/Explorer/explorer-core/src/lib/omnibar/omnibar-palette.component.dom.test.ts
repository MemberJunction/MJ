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
});
