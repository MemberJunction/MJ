import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, attr, capture } from '@memberjunction/ng-test-utils';
import { MJClickableDirective } from '@memberjunction/ng-ui-components';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { AppSwitcherComponent } from './app-switcher.component';

/**
 * DOM coverage for <mj-app-switcher> — the header trigger + centered launcher overlay
 * (filterable app-card grid). Apps come from a faked ApplicationManager.GetAppSwitcherApps();
 * the heavy <mj-user-app-config> child is replaced with a lightweight stub. Recents
 * persistence (UserInfoEngine) fails silently in the test environment by design, so the
 * launcher renders with no Recent section here.
 */

// Lightweight stand-in for the heavy config dialog child.
@Component({ standalone: true, selector: 'mj-user-app-config', template: '' })
class UserAppConfigStub {
  @Input() ShowDialog = false;
  @Output() ShowDialogChange = new EventEmitter<boolean>();
  @Output() ConfigSaved = new EventEmitter<void>();
}

const makeApp = (id: string, name: string, description = '') => ({
  ID: id, Name: name, Icon: 'fa-solid fa-cube', Description: description, GetColor: () => '#123456'
});
const APPS = [
  makeApp('a1', 'Sales', 'Pipelines and deals'),
  makeApp('a2', 'Marketing', 'Campaigns and outreach'),
  makeApp('a3', 'Lists', 'User-defined collections of records')
];

function render(inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(AppSwitcherComponent, {
    imports: [CommonModule, MJClickableDirective, UserAppConfigStub],
    declarations: [AppSwitcherComponent],
    providers: [{ provide: ApplicationManager, useValue: { GetAppSwitcherApps: () => APPS } }],
    inputs,
  });
}

function openLauncher(fixture: ReturnType<typeof render>) {
  (query(fixture, '.app-switcher-button') as HTMLElement).click();
  fixture.detectChanges();
}

function filterInput(fixture: ReturnType<typeof render>): HTMLInputElement {
  return query(fixture, '.launcher-filter input') as HTMLInputElement;
}

function typeFilter(fixture: ReturnType<typeof render>, text: string) {
  const input = filterInput(fixture);
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function pressKey(fixture: ReturnType<typeof render>, key: string) {
  filterInput(fixture).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  fixture.detectChanges();
}

describe('AppSwitcherComponent (DOM)', () => {
  beforeEach(() => {
    // Isolate recents: the UserInfoEngine singleton would otherwise carry
    // recents recorded by one test (via a card click) into the next.
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the app icon (not the spinner) when not loading', () => {
    const fixture = render();
    expect(query(fixture, '.app-switcher-button .app-icon')).not.toBeNull();
    expect(query(fixture, '.loading-spinner')).toBeNull();
  });

  it('shows the loading spinner when an app is loading', () => {
    expect(query(render({ loadingAppId: 'a2' }), '.loading-spinner')).not.toBeNull();
  });

  it('labels the trigger with the current app name', () => {
    const fixture = render({ activeApp: APPS[1] });
    expect(query(fixture, '.app-switcher-button .app-label')?.textContent?.trim()).toBe('Marketing');
    expect(attr(fixture, '.app-switcher-button', 'aria-label')).toBe('Switch application — current: Marketing');
  });

  it('falls back to "Apps" when no app is active', () => {
    expect(query(render(), '.app-switcher-button .app-label')?.textContent?.trim()).toBe('Apps');
  });

  it('falls back to "Apps" when viewing a system tab', () => {
    const fixture = render({ activeApp: APPS[1], isViewingSystemTab: true });
    expect(query(fixture, '.app-switcher-button .app-label')?.textContent?.trim()).toBe('Apps');
    expect(attr(fixture, '.app-switcher-button', 'aria-label')).toBe('Switch application');
  });

  it('hides the launcher by default and reflects aria-expanded=false', () => {
    const fixture = render();
    expect(query(fixture, '.launcher-panel')).toBeNull();
    expect(attr(fixture, '.app-switcher-button', 'aria-expanded')).toBe('false');
  });

  it('opens the launcher as a modal dialog listing every switcher app as a card', () => {
    const fixture = render();
    openLauncher(fixture);
    const panel = query(fixture, '.launcher-panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    const names = queryAll(fixture, '.app-card .app-card-name-label').map((e) => e.textContent?.trim());
    expect(names).toEqual(['Sales', 'Marketing', 'Lists']);
    expect(attr(fixture, '.app-switcher-button', 'aria-expanded')).toBe('true');
  });

  it('renders each app card with its Description summary', () => {
    const fixture = render();
    openLauncher(fixture);
    const descs = queryAll(fixture, '.app-card .app-card-desc').map((e) => e.textContent?.trim());
    expect(descs).toContain('Pipelines and deals');
    expect(descs).toContain('User-defined collections of records');
  });


  it('emits appSelected with the app ID when a card is clicked, and closes', () => {
    const fixture = render();
    const selected = capture(fixture.componentInstance.appSelected);
    openLauncher(fixture);
    (queryAll(fixture, '.app-card')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(selected).toEqual(['a2']);
    expect(query(fixture, '.launcher-panel')).toBeNull();
  });

  it('filters cards by name AND description', () => {
    const fixture = render();
    openLauncher(fixture);
    typeFilter(fixture, 'records'); // Matches Lists via its description only
    const names = queryAll(fixture, '.app-card .app-card-name-label').map((e) => e.textContent?.trim());
    expect(names).toEqual(['Lists']);
    typeFilter(fixture, 'zzz-no-match');
    expect(queryAll(fixture, '.app-card')).toHaveLength(0);
    expect(query(fixture, '.launcher-empty')).not.toBeNull();
  });

  it('puts every app card in the Tab order as a real focusable control', () => {
    const fixture = render();
    openLauncher(fixture);
    const cards = queryAll(fixture, '.app-card');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.getAttribute('tabindex')).toBe('0');
    }
    // Enter/Space activation comes from mjClickable — verify Enter on a focused card selects it
    const selected = capture(fixture.componentInstance.appSelected);
    const second = cards[1] as HTMLElement;
    second.focus();
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(selected).toEqual(['a2']);
  });

  it('supports arrow-key navigation: ArrowDown from filter focuses the first card, arrows traverse, ArrowUp returns to filter', () => {
    const fixture = render();
    openLauncher(fixture);
    pressKey(fixture, 'ArrowDown');
    expect(document.activeElement?.id).toBe('mj-launcher-opt-0');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('mj-launcher-opt-1');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(filterInput(fixture));
  });

  it('marks the active app card with aria-current', () => {
    const fixture = render({ activeApp: APPS[1] });
    openLauncher(fixture);
    const current = queryAll(fixture, '.app-card[aria-current="true"] .app-card-name-label')
      .map((e) => e.textContent?.trim());
    expect(current).toEqual(['Marketing']);
  });

  it('Escape clears an active filter first, then closes the launcher', () => {
    const fixture = render();
    openLauncher(fixture);
    typeFilter(fixture, 'sal');
    pressKey(fixture, 'Escape');
    expect(query(fixture, '.launcher-panel')).not.toBeNull(); // Still open — filter cleared
    expect((filterInput(fixture)).value).toBe('');
    expect(queryAll(fixture, '.app-card')).toHaveLength(3);
    pressKey(fixture, 'Escape');
    expect(query(fixture, '.launcher-panel')).toBeNull();
  });

  it('closes via the explicit close button', () => {
    const fixture = render();
    openLauncher(fixture);
    (query(fixture, '.launcher-close') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '.launcher-panel')).toBeNull();
  });
});
