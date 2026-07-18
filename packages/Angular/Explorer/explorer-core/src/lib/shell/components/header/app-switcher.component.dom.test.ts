import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { renderComponentFixture, query, queryAll, attr, capture } from '@memberjunction/ng-test-utils';
import { MJClickableDirective } from '@memberjunction/ng-ui-components';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { AppSwitcherComponent } from './app-switcher.component';

/**
 * DOM coverage for <mj-app-switcher> — the header app-switcher trigger + dropdown. Its apps come
 * from a faked ApplicationManager.GetAppSwitcherApps(); the heavy data-bound <mj-user-app-config>
 * child (its own package's tests cover it) is replaced with a lightweight stub matching its
 * selector + two-way ShowDialog binding. `mjClickable`/`testId` resolve via the real directive.
 * Synchronous (no ngOnInit load), so a single render + post-click detectChanges suffices.
 */

// Lightweight stand-in for the heavy config dialog child.
@Component({ standalone: true, selector: 'mj-user-app-config', template: '' })
class UserAppConfigStub {
  @Input() ShowDialog = false;
  @Output() ShowDialogChange = new EventEmitter<boolean>();
  @Output() ConfigSaved = new EventEmitter<void>();
}

const makeApp = (id: string, name: string) => ({ ID: id, Name: name, Icon: 'fa-solid fa-cube', GetColor: () => '#123456' });
const APPS = [makeApp('a1', 'Sales'), makeApp('a2', 'Marketing')];

function render(inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(AppSwitcherComponent, {
    imports: [MJClickableDirective, UserAppConfigStub],
    declarations: [AppSwitcherComponent],
    providers: [{ provide: ApplicationManager, useValue: { GetAppSwitcherApps: () => APPS } }],
    inputs,
  });
}

describe('AppSwitcherComponent (DOM)', () => {
  it('shows the app icon (not the spinner) when not loading', () => {
    const fixture = render();
    expect(query(fixture, '.app-switcher-button .app-icon')).not.toBeNull();
    expect(query(fixture, '.loading-spinner')).toBeNull();
  });

  it('shows the loading spinner when an app is loading', () => {
    expect(query(render({ loadingAppId: 'a2' }), '.loading-spinner')).not.toBeNull();
  });

  it('hides the dropdown by default and reflects aria-expanded=false', () => {
    const fixture = render();
    expect(query(fixture, '.app-switcher-dropdown')).toBeNull();
    expect(attr(fixture, '.app-switcher-button', 'aria-expanded')).toBe('false');
  });

  it('opens the dropdown listing the switcher apps when the trigger is clicked', () => {
    const fixture = render();
    (query(fixture, '.app-switcher-button') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '.app-switcher-dropdown')).not.toBeNull();
    const names = queryAll(fixture, '.app-switcher-list .app-switcher-item').map((e) => e.textContent?.trim());
    expect(names).toEqual(['Sales', 'Marketing']);
    expect(attr(fixture, '.app-switcher-button', 'aria-expanded')).toBe('true');
  });

  it('emits appSelected with the app ID when an app is chosen', () => {
    const fixture = render();
    const selected = capture(fixture.componentInstance.appSelected);
    (query(fixture, '.app-switcher-button') as HTMLElement).click();
    fixture.detectChanges();
    (queryAll(fixture, '.app-switcher-list .app-switcher-item')[1] as HTMLElement).click();
    expect(selected).toEqual(['a2']);
  });
});
