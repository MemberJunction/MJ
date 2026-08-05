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
import { ensureOmnibarEnabled, setOmnibarEnabled } from '../omnibar-optin';

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // The persistent profile's IndexedDB metadata cache can go stale after bundle
  // rebuilds — the shell then offers a "Taking longer than expected → Reset" card.
  // Click it once; Reset clears the local cache and reloads clean.
  const reset = page.getByRole('button', { name: /reset/i });
  try {
    await reset.waitFor({ timeout: 20_000 });
    await reset.click();
  } catch {
    // no recovery card — normal boot
  }
  // Shell header present = app booted past the loading screen. Which search
  // affordance renders depends on omnibar opt-in: the bar button (on) or the
  // inline composite (off) — wait for either.
  await expect(
    page.locator('.search-btn').or(page.locator('.shell-search-bar')).first()
  ).toBeVisible({ timeout: 120_000 });
  // The omnibar is per-user OPT-IN — enable it for the test user (idempotent).
  await ensureOmnibarEnabled(page);
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

    await page.locator('.search-btn').click();
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

  test('# lists entities and Enter on an entity opens its list view', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('#users');
    await expect(page.locator('.ob-mode-badge')).toHaveText(/record/i, { timeout: 15_000 });
    await expect(page.locator('.ob-group-label', { hasText: 'Entities' })).toBeVisible({ timeout: 30_000 });
    const usersEntity = page.locator('.ob-row', { hasText: 'Users' }).first();
    await expect(usersEntity).toBeVisible({ timeout: 15_000 });
    await usersEntity.click();
    await expect(page.locator('.omnibar-palette')).toBeHidden();
    // Entity selection opens the entity's dynamic list view in a tab.
    await expect(page.locator('.tab-label, [class*="tab"]', { hasText: 'Users' }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('/ switches to Go to App mode and Enter switches app', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('/');
    await expect(page.locator('.ob-mode-badge')).toHaveText(/go to app/i, { timeout: 15_000 });
    await expect(page.locator('.ob-row').first()).toBeVisible({ timeout: 30_000 });
    // Deterministic target: Chat is present for every test user (visible on Home).
    await page.locator('.ob-input').fill('/chat');
    const chatRow = page.locator('.ob-row', { hasText: 'Chat' }).first();
    await expect(chatRow).toBeVisible({ timeout: 30_000 });
    await chatRow.click();
    await expect(page.locator('.omnibar-palette')).toBeHidden();
    await expect(page).toHaveURL(/chat/i, { timeout: 30_000 });
  });

  test('@ agent selection opens Chat with the composer pre-addressed + focused', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('@sage');
    await expect(page.locator('.ob-mode-badge')).toHaveText(/agent/i, { timeout: 15_000 });
    const sageRow = page.locator('.ob-row', { hasText: 'Sage' }).first();
    await expect(sageRow).toBeVisible({ timeout: 30_000 });
    await sageRow.click();
    await expect(page.locator('.omnibar-palette')).toBeHidden();
    await expect(page).toHaveURL(/chat/i, { timeout: 30_000 });
    // The composer is pre-addressed with a RESOLVED mention PILL (not raw text) —
    // identical to typing '@sage' and picking from the dropdown — and focused.
    const composer = page.locator('mj-mention-editor [contenteditable="true"]:visible').first();
    const chip = composer.locator('.mention-chip[data-mention-type="agent"][data-mention-name="Sage"]');
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await expect(composer).toBeFocused({ timeout: 15_000 });
    // Typing lands AFTER the pill (caret placed past the trailing space).
    await page.keyboard.type('hello');
    await expect(composer).toContainText('hello');
  });

  test('re-tagging via the omnibar REPLACES the un-sent draft (no pill stacking)', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    await page.locator('.ob-input').fill('@sage');
    await page.locator('.ob-row', { hasText: 'Sage' }).first().click();
    // Scope to the VISIBLE composer — cached per-conversation inputs from earlier
    // tests remain in the DOM ([hidden]-toggled) and would confuse .first().
    const composer = page.locator('mj-mention-editor [contenteditable="true"]:visible').first();
    await expect(composer.locator('.mention-chip')).toHaveCount(1, { timeout: 30_000 });
    // Abandon the draft, summon the palette again, tag again.
    await openPalette(page);
    await page.locator('.ob-input').fill('@sage');
    await page.locator('.ob-row', { hasText: 'Sage' }).first().click();
    await expect(page.locator('.omnibar-palette')).toBeHidden();
    // Still exactly ONE pill — the previous un-sent draft was replaced, not stacked.
    await page.waitForTimeout(2_000);
    await expect(composer.locator('.mention-chip')).toHaveCount(1);
    await expect(composer.locator('.mention-chip[data-mention-name="Sage"]')).toBeVisible();
  });
  test('omnibar is per-user opt-in: My Profile toggle turns it off and back on live', async ({ page }) => {
    await gotoHome(page); // ends opted-IN via ensureOmnibarEnabled

    // Opt OUT → the header swaps to the inline composite (real input, attached
    // suggest dropdown); Ctrl+K now FOCUSES it instead of opening the palette.
    await setOmnibarEnabled(page, false);
    const composite = page.locator('.shell-search-bar');
    await expect(composite.first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await expect(composite.locator('input').first()).toBeFocused({ timeout: 10_000 });
    await expect(page.locator('.omnibar-palette')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Opt back IN → the bar button returns and Ctrl+K opens the palette again.
    await setOmnibarEnabled(page, true);
    await expect(page.locator('.search-btn').first()).toBeVisible({ timeout: 10_000 });
    await openPalette(page);
    await page.keyboard.press('Escape');
  });

});
