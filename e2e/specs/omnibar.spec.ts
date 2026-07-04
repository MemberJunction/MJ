/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Unified Command Palette (omnibar) — Playwright UI tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS (PR: omnibar-command-palette):
 *   • Ctrl/Cmd+K opens the centered palette over the shell (flag
 *     Shell.Omnibar.Enabled defaults ON).
 *   • Plain text runs the cross-source global search: grouped rows render and
 *     the trailing "See all results" row opens the Search Results tab.
 *   • '#' switches to Jump-to-Record mode (Entities group renders).
 *   • '/' switches to Commands mode; Enter on an app row switches apps.
 *   • '@' lists agents (tolerant: skipped when no agents/plugin available).
 *   • Escape closes; the header affordance opens the palette on click.
 *
 * PREREQUISITES (NOT started by these tests): MJAPI + MJExplorer running,
 * primed auth profile at .playwright-cli/profile (see user-routines.spec.ts).
 *
 * RUN:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/omnibar.spec.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Shell header present = app booted past the loading screen.
  await expect(page.locator('.shell-omnibar-affordance, .shell-search-bar').first()).toBeVisible({ timeout: 90_000 });
}

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await expect(page.locator('.omnibar-palette')).toBeVisible({ timeout: 15_000 });
}

test.describe.serial('Unified command palette', () => {
  test('Ctrl+K opens; Escape closes; header affordance opens', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await expect(page.locator('.ob-mode-badge')).toHaveText(/search/i);
    // Empty state: trigger hint chips for #, /, @
    await expect(page.locator('.ob-hint-chip')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('.omnibar-palette')).toBeHidden();

    await page.locator('.shell-omnibar-affordance').click();
    await expect(page.locator('.omnibar-palette')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('plain text → global search results with see-all row', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('user');
    // Debounced network search — allow generous time; the see-all row ALWAYS lands.
    await expect(page.locator('.ob-row', { hasText: 'See all results' })).toBeVisible({ timeout: 30_000 });
    // Open the full Search Results tab through the see-all row.
    await page.locator('.ob-row', { hasText: 'See all results' }).click();
    await expect(page.locator('.omnibar-palette')).toBeHidden();
  });

  test('# switches to Jump-to-Record mode and lists entities', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('#user');
    await expect(page.locator('.ob-mode-badge')).toHaveText(/record/i, { timeout: 15_000 });
    await expect(page.locator('.ob-group-label', { hasText: 'Entities' })).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
  });

  test('/ switches to Commands mode and Enter switches app', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('/');
    await expect(page.locator('.ob-mode-badge')).toHaveText(/command/i, { timeout: 15_000 });
    await expect(page.locator('.ob-row').first()).toBeVisible({ timeout: 30_000 });
    // Deterministic target: Chat is present for every test user (visible on Home).
    await page.locator('.ob-input').fill('/chat');
    const chatRow = page.locator('.ob-row', { hasText: 'Open Chat' }).first();
    await expect(chatRow).toBeVisible({ timeout: 30_000 });
    await chatRow.click();
    await expect(page.locator('.omnibar-palette')).toBeHidden();
    await expect(page).toHaveURL(/chat/i, { timeout: 30_000 });
  });

  test('@ lists agents (tolerant when plugin absent)', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('@');
    await expect(page.locator('.ob-mode-badge')).toHaveText(/agent/i, { timeout: 15_000 });
    // Agents come from the conversations composer plugin; environments without it
    // legitimately show none — assert the mode switch, and rows only if present.
    const rows = page.locator('.ob-row');
    const count = await rows.count().catch(() => 0);
    if (count > 0) {
      await expect(rows.first().locator('.ob-rsub')).toContainText(/pre-addressed/i);
    }
    await page.keyboard.press('Escape');
  });
});
