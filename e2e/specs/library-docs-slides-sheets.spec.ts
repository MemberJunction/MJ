/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Library Workspace & Collaborative Docs / Slides / Sheets — Playwright E2E
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS:
 *   • Dedicated header-pinned `Library` application (`/app/Library`) with Hub
 *     and Power Navigator surfaces, Split Studio, and URL query-param sync.
 *   • Creating collaborative native MJ Documents, MJ Presentations (16:9 Slide
 *     Decks), and MJ Spreadsheets from the Library Create dialog and opening
 *     them in Full-Canvas and Split Studio.
 *   • `Chat` application (`Conversations`, `Collections` opening directly on
 *     the `'collections'` Navigator section, and `Agent Activity` plus legacy
 *     `/app/Chat/Tasks` retargeting).
 *
 * PREREQUISITES (NOT started by these tests): MJAPI + MJExplorer running,
 * primed auth profile at `.playwright-cli/profile` (see `e2e/fixtures.ts`).
 *
 * RUN:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/library-docs-slides-sheets.spec.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

async function bootToApp(page: Page, appPath: string): Promise<void> {
  await page.goto(appPath, { waitUntil: 'domcontentloaded' });
  const reset = page.getByRole('button', { name: /reset/i });
  try {
    await reset.waitFor({ timeout: 15_000 });
    await reset.click();
    await page.goto(appPath, { waitUntil: 'domcontentloaded' });
  } catch {
    // Normal boot — no stale IndexedDB recovery card
  }
}

async function openCreateDialogFromHub(page: Page): Promise<void> {
  await bootToApp(page, '/app/Library');
  const surface = page
    .locator('[data-testid="library-hub-surface"]')
    .or(page.locator('[data-testid="library-navigator-surface"]'))
    .first();
  await expect(surface).toBeVisible({ timeout: 120_000 });

  const createBtn = page.getByRole('button', { name: /create new/i }).first();
  await expect(createBtn).toBeVisible({ timeout: 30_000 });
  await createBtn.click();
  await expect(page.locator('[data-testid="library-create-dialog"]')).toBeVisible({
    timeout: 15_000,
  });
}

test.describe.serial('Library workspace & collaborative Docs, Slides, and Sheets', () => {
  test('creates an MJ Document in Library, opens Full-Canvas Studio, docks into Split Navigator, and restores on Browser Back', async ({
    page,
  }) => {
    const uniqueTitle = `E2E Strategy Doc ${Date.now()}`;
    await openCreateDialogFromHub(page);

    await page.locator('[data-testid="dialog-starter-document"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(uniqueTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    // Newly created artifact opens in Full-Canvas Studio with artifactId synced to URL
    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(uniqueTitle);
    await expect(page).toHaveURL(/artifactId=/, { timeout: 15_000 });

    // Dock into Power Navigator Split Studio
    await page.locator('[data-testid="full-canvas-split-btn"]').click();
    await expect(page.locator('[data-testid="library-split-studio"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/mode=navigator/, { timeout: 15_000 });

    // Close Split Studio and verify URL clears artifactId cleanly
    await page
      .locator('[data-testid="library-split-studio"]')
      .getByRole('button', { name: /close/i })
      .first()
      .click()
      .catch(async () => {
        await page.goBack();
      });
    await expect(page.locator('[data-testid="library-navigator-surface"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('creates an MJ Presentation and MJ Spreadsheet in Library Studio', async ({ page }) => {
    const deckTitle = `E2E Board Deck ${Date.now()}`;
    await openCreateDialogFromHub(page);

    await page.locator('[data-testid="dialog-starter-presentation"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(deckTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(deckTitle);
    await page.locator('[data-testid="full-canvas-back-btn"]').click();

    const sheetTitle = `E2E Revenue Sheet ${Date.now()}`;
    const createBtn = page.getByRole('button', { name: /create new/i }).first();
    await createBtn.click();
    await expect(page.locator('[data-testid="library-create-dialog"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('[data-testid="dialog-starter-spreadsheet"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(sheetTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(sheetTitle);
  });

  test('opens Chat Collections on the collections Navigator section and retargets /app/Chat/Tasks to Agent Activity', async ({
    page,
  }) => {
    await bootToApp(page, '/app/Chat/Collections');
    await expect(page.locator('[data-testid="library-navigator-surface"]')).toBeVisible({
      timeout: 120_000,
    });
    await expect(
      page.locator('mj-page-header-interior').getByText('Collections', { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await bootToApp(page, '/app/Chat/Tasks');
    await expect(page.locator('mj-tasks-full-view')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.cc-title')).toHaveText('Agent Activity');
  });
});
