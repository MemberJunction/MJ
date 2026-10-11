/**
 * DATA_EXPLORER_DASHBOARDS_ROUTE against the real Router. A link to Data Explorer's Dashboards page opens the
 * Library of the Dashboards app, with the link's query params and fragment, when the user has that app and
 * Data Explorer no longer has a Dashboards nav item. Otherwise the link goes on to the app navigation route.
 */
import { describe, it, expect, vi } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import type { NavItem } from '@memberjunction/ng-base-application';
import { DATA_EXPLORER_DASHBOARDS_ROUTE } from './moved-nav-item-redirect';

/** The page of the app navigation route. */
@Component({ standalone: true, selector: 'mj-app-page-stub', template: '' })
class AppPageStub {}

/** The members of ApplicationManager that the route reads. */
interface AppManagerDouble {
  WhenReady(): Promise<void>;
  GetAllApps(): BaseApplication[];
}

/** An application with nav items of these labels. */
const application = (ID: string, Name: string, labels: string[]): BaseApplication =>
  new BaseApplication({ ID, Name, DefaultNavItems: JSON.stringify(labels.map((Label): NavItem => ({ Label, ResourceType: 'Custom' }))) });

const DATA_EXPLORER = application('A0000000-0000-4000-8000-0000000000DE', 'Data Explorer', ['Data', 'Queries']);
const DASHBOARDS = application('A0000000-0000-4000-8000-00000000000D', 'Dashboards', ['Library', 'Categories']);
const OLD_LINK = '/app/data-explorer/Dashboards?lib=favorites';

/** An application manager whose app list is ready and holds `apps`. */
const readyApps = (apps: BaseApplication[]): AppManagerDouble => ({ WhenReady: async () => undefined, GetAllApps: () => apps });

/**
 * Navigates to `url` with the route ahead of the app navigation route, as the Explorer routes have them, and
 * returns the URL the router ends on.
 */
async function navigate(url: string, appManager: AppManagerDouble): Promise<string> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([DATA_EXPLORER_DASHBOARDS_ROUTE, { path: 'app/:appName/:navItemName', component: AppPageStub }]),
      { provide: ApplicationManager, useValue: appManager },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return TestBed.inject(Router).url;
}

describe('DATA_EXPLORER_DASHBOARDS_ROUTE', () => {
  it("opens the Dashboards app's Library with the link's query params when the user has the Dashboards app", async () => {
    expect(await navigate(OLD_LINK, readyApps([DATA_EXPLORER, DASHBOARDS]))).toBe('/app/dashboards/Library?lib=favorites');
  });

  it("keeps the link's fragment", async () => {
    expect(await navigate(`${OLD_LINK}#top`, readyApps([DATA_EXPLORER, DASHBOARDS]))).toBe('/app/dashboards/Library?lib=favorites#top');
  });

  it('goes on to the app navigation route when the user has no Dashboards app', async () => {
    expect(await navigate(OLD_LINK, readyApps([DATA_EXPLORER]))).toBe(OLD_LINK);
  });

  it('goes on to the app navigation route when Data Explorer still has a Dashboards nav item', async () => {
    const dataExplorer = application(DATA_EXPLORER.ID, 'Data Explorer', ['Data', 'Queries', 'Dashboards']);
    expect(await navigate(OLD_LINK, readyApps([dataExplorer, DASHBOARDS]))).toBe(OLD_LINK);
  });

  it("waits for the user's app list before it decides", async () => {
    let loaded: BaseApplication[] = [];
    let finishLoading: () => void = () => undefined;
    const loading = new Promise<void>((resolve) => (finishLoading = resolve));
    const appManager = { WhenReady: vi.fn(() => loading), GetAllApps: () => loaded };

    const finalUrl = navigate(OLD_LINK, appManager);
    await vi.waitFor(() => expect(appManager.WhenReady).toHaveBeenCalled());
    loaded = [DATA_EXPLORER, DASHBOARDS];
    finishLoading();

    expect(await finalUrl).toBe('/app/dashboards/Library?lib=favorites');
  });

  it('leaves the other Data Explorer links alone', async () => {
    expect(await navigate('/app/data-explorer/Queries?x=1', readyApps([DATA_EXPLORER, DASHBOARDS]))).toBe('/app/data-explorer/Queries?x=1');
  });
});
