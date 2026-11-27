/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Attached-view change detection — Playwright regression probe
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS:
 *   Explorer mounts every tab's resource component with createComponent() +
 *   ApplicationRef.attachView(). A root view like that re-renders only when it
 *   is flagged dirty, so state a dashboard changes from an RxJS delivery (not
 *   a template event) never reaches the DOM unless the framework asks for a
 *   render (BaseResourceComponent.RefreshView, called after every
 *   OnQueryParamsChanged delivery). This probe changes a dashboard's state
 *   only through a query-param navigation — browser Back, which arrives as
 *   popstate → OnQueryParamsChanged — and asserts the DOM follows.
 *
 *   Uses the Predictive Studio "Studio" nav item, which round-trips its
 *   ?section= param and whose template carries data-testid hooks
 *   (ps-nav-<section>, ps-panel-<section>).
 *
 * PREREQUISITES (NOT started by these tests): MJAPI + MJExplorer running,
 * the Predictive Studio application installed, and a primed auth profile at
 * .playwright-cli/profile (see e2e/README.md).
 *
 * RUN:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/attached-view-refresh.spec.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

const APP_NAME = 'Predictive Studio';
const NAV_ITEM = 'Studio';

function sectionUrl(section: string): string {
  return `/app/${encodeURIComponent(APP_NAME)}/${encodeURIComponent(NAV_ITEM)}?section=${section}`;
}

async function waitForPanel(page: Page, panel: string): Promise<void> {
  await expect(page.getByTestId(`ps-panel-${panel}`)).toBeVisible({ timeout: 30_000 });
}

test.describe('Attached-view change detection', () => {
  test('a query-param navigation (browser Back) re-renders the dashboard', async ({ page }) => {
    await page.goto(sectionUrl('home'), { waitUntil: 'domcontentloaded' });
    await waitForPanel(page, 'home');

    // A template click: the dashboard switches panel and writes ?section=pipelines to the URL.
    await page.getByTestId('ps-nav-pipelines').click();
    await waitForPanel(page, 'pipelines');
    await expect(page).toHaveURL(/section=pipelines/);

    // Back arrives as popstate → OnQueryParamsChanged, outside any template event. The DOM must
    // follow without a click or a page reload.
    await page.goBack();
    await expect(page).toHaveURL(/section=home/);
    await waitForPanel(page, 'home');
    await expect(page.getByTestId('ps-panel-pipelines')).toBeHidden();

    // And Forward the other way.
    await page.goForward();
    await expect(page).toHaveURL(/section=pipelines/);
    await waitForPanel(page, 'pipelines');
    await expect(page.getByTestId('ps-panel-home')).toBeHidden();
  });
});
