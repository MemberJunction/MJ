import { describe, it, expect } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { renderComponentFixture, queryAll, query, attr, capture } from '@memberjunction/ng-test-utils';
import { MJClickableDirective } from '@memberjunction/ng-ui-components';
import { WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { AppNavComponent } from './app-nav.component';
import type { NavItem } from '@memberjunction/ng-base-application';

/**
 * DOM coverage for <mj-app-nav> — the horizontal per-app nav. It's OnPush and its `app` input setter
 * kicks off an ASYNC GetNavItems() load, so we render with `autoDetect` + await whenStable so the
 * async result is applied before asserting. WorkspaceStateManager is stubbed with a Configuration
 * observable + GetConfiguration (nav-item active-state math reads it); SharedService is a bare stub
 * (only used by apps that expose SetSharedService — our fake app doesn't). `mjClickable`/`testId`
 * resolve via the real directive.
 */

const NAV_ITEMS: NavItem[] = [
  { Label: 'Dashboard', Icon: 'fa-solid fa-gauge' },
  { Label: 'Reports', Icon: 'fa-solid fa-chart-line', Badge: 3 },
  { Label: 'Hidden', Status: 'Pending' }, // filtered out (not Active)
];

/** A minimal BaseApplication stand-in — the component only calls GetNavItems / GetColor / reads ID. */
function fakeApp(items: NavItem[]) {
  return { ID: 'app-1', GetNavItems: async () => items, GetColor: () => '#123456' };
}

const workspaceStub = () => ({
  Configuration: new BehaviorSubject<unknown>(null),
  GetConfiguration: () => null,
});

async function render(app: unknown) {
  const fixture = renderComponentFixture(AppNavComponent, {
    imports: [MJClickableDirective],
    declarations: [AppNavComponent],
    providers: [
      { provide: WorkspaceStateManager, useValue: workspaceStub() },
      { provide: SharedService, useValue: {} },
    ],
    inputs: { app },
    autoDetect: true,
  });
  await fixture.whenStable();
  return fixture;
}

describe('AppNavComponent (DOM)', () => {
  it('renders nothing when there is no app', async () => {
    expect(queryAll(await render(null), '.nav-item').length).toBe(0);
  });

  it('renders one nav item per Active nav item (Pending items filtered out)', async () => {
    const fixture = await render(fakeApp(NAV_ITEMS));
    // The label lives in a direct-child <span> of .nav-item (the badge is a nested .badge span).
    const labels = queryAll(fixture, '.nav-item > span:not(.badge)').map((s) => s.textContent?.trim());
    expect(labels).toEqual(['Dashboard', 'Reports']);
  });

  it('shows the item icon and badge', async () => {
    const fixture = await render(fakeApp(NAV_ITEMS));
    const items = queryAll(fixture, '.nav-item');
    expect(items.length).toBe(2); // Dashboard + Reports (Hidden/Pending excluded)
    expect(query(fixture, '.nav-item i.fa-gauge, .nav-item i.fa-solid')).not.toBeNull();
    expect(query(fixture, '.nav-item .badge')?.textContent?.trim()).toBe('3');
  });

  it('exposes the app color as a CSS custom property on the nav list', async () => {
    const fixture = await render(fakeApp(NAV_ITEMS));
    const style = (query(fixture, '.nav-list') as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain('#123456');
  });

  it('emits navItemClick with the clicked item', async () => {
    const fixture = await render(fakeApp(NAV_ITEMS));
    const clicks = capture(fixture.componentInstance.navItemClick);
    (queryAll(fixture, '.nav-item')[0] as HTMLElement).click();
    expect(clicks.length).toBe(1);
    expect(clicks[0].item.Label).toBe('Dashboard');
  });
});
