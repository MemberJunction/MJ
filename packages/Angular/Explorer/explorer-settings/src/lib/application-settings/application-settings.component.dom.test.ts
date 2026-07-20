import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { renderComponentFixture, query, queryAll, text, createFakeProvider } from '@memberjunction/ng-test-utils';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { ApplicationSettingsComponent } from './application-settings.component';

/**
 * DOM coverage for <mj-application-settings> — the app-visibility/order configurator (two panels:
 * Available vs. Your Applications). ngOnInit loads system apps from a faked ApplicationManager and
 * the user's UserApplication rows via `Provider`'s RunView (we return none → every app starts in
 * Available). We assert the two-panel layout, the Available list, and the add-then-active list
 * transition (pure array logic on AddApp). `mj-loading`/`mj-alert`/`mj-empty-state` are stubbed;
 * mjButton resolves via the real directive; SharedService is a bare stub (only used on save).
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() text = '';
}
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub {
  @Input() Variant = '';
}
@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub {
  @Input() Size = '';
  @Input() Icon = '';
  @Input() Title = '';
}

const systemApps = [
  { ID: 'app-1', Name: 'Sales', Icon: 'fa-solid fa-dollar', Description: 'CRM' },
  { ID: 'app-2', Name: 'Marketing', Icon: 'fa-solid fa-bullhorn', Description: '' },
];

async function render() {
  const fixture = renderComponentFixture(ApplicationSettingsComponent, {
    imports: [MJButtonDirective, LoadingStub, AlertStub, EmptyStateStub],
    declarations: [ApplicationSettingsComponent],
    providers: [
      { provide: ApplicationManager, useValue: { GetAuthorizedSystemApps: () => systemApps } },
      { provide: SharedService, useValue: { CreateSimpleNotification: () => {} } },
    ],
    // No user-application rows → both apps land in the Available panel.
    inputs: { Provider: createFakeProvider({ runViewResults: [], currentUser: { ID: 'u1' } }) },
    autoDetect: true,
  });
  // LoadConfiguration awaits the (async) fake RunView; flush the microtask chain past whenStable,
  // then run CD so the resolved data (IsLoading=false + populated panels) renders.
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  return fixture;
}

describe('ApplicationSettingsComponent (DOM)', () => {
  it('renders the Applications heading and the two config panels', async () => {
    const fixture = await render();
    expect(text(fixture, '.section-title')).toBe('Applications');
    expect(query(fixture, '.available-panel')).not.toBeNull();
    expect(query(fixture, '.selected-panel')).not.toBeNull();
  });

  it('lists every system app in the Available panel when the user has none selected', async () => {
    const fixture = await render();
    const names = queryAll(fixture, '.available-panel .app-name').map((e) => e.textContent?.trim());
    expect(names).toEqual(expect.arrayContaining(['Sales', 'Marketing']));
    expect(queryAll(fixture, '.available-panel .app-item').length).toBe(2);
  });

  it('shows the empty-state in the selected panel when no apps are active', async () => {
    const fixture = await render();
    expect(query(fixture, '.selected-panel mj-empty-state')).not.toBeNull();
    expect(queryAll(fixture, '.selected-panel .app-item').length).toBe(0);
  });

  it('moves an app into the active list when an available app is clicked', async () => {
    const fixture = await render();
    // Click the first Available app tile (autoDetect drives CD from the click handler).
    (query(fixture, '.available-panel .app-item') as HTMLElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.ActiveApps.length).toBe(1);
    expect(fixture.componentInstance.AvailableApps.length).toBe(1);
    expect(queryAll(fixture, '.selected-panel .app-item').length).toBe(1);
  });

  it('reports unsaved changes after adding an app', async () => {
    const fixture = await render();
    const comp = fixture.componentInstance;
    expect(comp.HasChanges()).toBe(false);
    comp.AddApp(comp.AvailableApps[0]);
    expect(comp.HasChanges()).toBe(true);
  });
});
