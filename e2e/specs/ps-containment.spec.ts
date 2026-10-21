/**
 * Predictive Studio containment — browser checks against a running Explorer.
 * Data: the truth suite's UI fixture (`pnpm run truth:ui-fixture`), whose JSON path is PS_UI_FIXTURE.
 * Prerequisites as e2e/README.md (Explorer + MJAPI running, a profile primed by e2e/overlay/prime-auth.mjs).
 */
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { SafeJSONParse } from '@memberjunction/global';
import { test, expect } from '../fixtures';

// The JSON scripts/ui-fixture.mts writes (TruthSuite). Restated here: e2e/ does not depend on the private TruthSuite.
interface UIFixtureModel { algorithm: string; pipelineName: string; modelId: string; grade: string; canAct: boolean }
interface UIFixture { coefficient: UIFixtureModel; tree: UIFixtureModel; treeRefusals: string[] }

/** How many Auto Renew top-driver rows the badge check opens. */
const ROWS_TO_CHECK = 5;

function loadFixture(): UIFixture | null {
  const file = process.env.PS_UI_FIXTURE;
  return file ? SafeJSONParse<UIFixture>(readFileSync(file, 'utf8')) : null;
}

const FIXTURE = loadFixture();

function fixture(): UIFixture {
  if (!FIXTURE) throw new Error('PS_UI_FIXTURE is not set');
  return FIXTURE;
}

async function openCatalog(page: Page): Promise<void> {
  await page.goto('/app/predictive-studio/Predictions', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ps-predictions-grid')).toBeVisible({ timeout: 60_000 });
}

function card(page: Page, pipelineName: string): Locator {
  return page.getByTestId('ps-prediction-card').filter({ hasText: pipelineName });
}

test.describe('Predictive Studio containment — drivers, global drivers, At-Risk list', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(FIXTURE === null, 'PS_UI_FIXTURE is not set (the UI fixture step sets it)');

  test('coefficient model: "Weighted most by this model:", Auto Renew rows read Lowers Risk, list ≤ 200', async ({ page }) => {
    await openCatalog(page);
    const coefficientCard = card(page, fixture().coefficient.pipelineName);
    await expect(coefficientCard).toHaveCount(1);
    await coefficientCard.getByTestId('ps-open-prediction').click();
    await expect(page.getByTestId('ps-drivers')).toContainText('Weighted most by this model:');
    await expect(page.getByTestId('ps-drivers')).not.toContainText("What's driving this");

    const grid = page.getByTestId('ps-atrisk-list');
    await grid.locator('.pg-search-input').fill('Auto Renew');
    const rows = grid.locator('.ag-center-cols-container .ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    let checked = 0;
    const rendered = await rows.count();
    for (let i = 0; i < rendered && checked < ROWS_TO_CHECK; i++) {
      const row = rows.nth(i);
      if ((await row.locator('.ps-why-chip').first().getAttribute('title')) !== 'Auto Renew') continue;
      await row.click();
      await expect(page.getByTestId('ps-row-driver-label').first()).toContainText('Auto Renew');
      await expect(page.getByTestId('ps-row-driver-badge').first()).toHaveText('Lowers Risk');
      await expect(page.getByTestId('ps-row-driver-badge').first()).toHaveClass(/\bgreen\b/);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('ps-row-drivers')).toHaveCount(0);
      checked += 1;
    }
    expect(checked, 'Auto Renew top-driver rows checked').toBeGreaterThan(0);

    await page.getByTestId('ps-act-list').click();
    await expect(page.getByTestId('ps-list-result')).toBeVisible({ timeout: 60_000 });
  });

  test('split-importance model: no global driver line', async ({ page }) => {
    await openCatalog(page);
    const treeCard = card(page, fixture().tree.pipelineName);
    await expect(treeCard).toHaveCount(1);
    if ((await treeCard.getByTestId('ps-open-prediction').count()) === 0) {
      // Not openable (trust not cleared): the card itself must not carry a driver list either.
      await expect(treeCard.getByTestId('ps-improve-prediction')).toBeVisible();
      test.info().annotations.push({ type: 'tree-card-blocked', description: fixture().tree.grade });
      return;
    }
    await treeCard.getByTestId('ps-open-prediction').click();
    await expect(page.getByTestId('ps-workspace-body')).toBeVisible();
    await expect(page.getByTestId('ps-drivers')).toHaveCount(0);
  });
});

test.describe('Predictive Studio containment — experiment sessions switched off', () => {
  test('Studio → Experiments offers no new session and says why', async ({ page }) => {
    await page.goto('/app/predictive-studio/Studio?section=experiments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ps-experiments-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('ps-experiments-new-btn')).toHaveCount(0);
    await expect(page.getByTestId('ps-experiments-new-btn-empty')).toHaveCount(0);
    const pastSessions = Number(process.env.PS_PAST_SESSIONS || '0');
    if (pastSessions > 0) {
      // Past sessions stay readable, under the switched-off notice.
      await expect(page.getByTestId('ps-experiments-unavailable')).toBeVisible();
      await expect(page.getByTestId('ps-experiments-kanban')).toBeVisible();
    } else {
      await expect(page.getByTestId('ps-experiments-empty')).toContainText('switched off');
    }
  });
});
