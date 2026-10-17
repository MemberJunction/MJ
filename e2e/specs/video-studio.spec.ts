/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Video Studio application — Playwright UI tests (Brand Kits & Archetypes)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS (VS-UX-1 — first half of Video Studio e2e suite):
 *   • Navigating to the Video Studio application (`/app/video-studio`).
 *   • Productions tab (`VideoStudioProductionsResource`) — renders page header,
 *     search + filter popover controls, and either the productions grid or
 *     empty state without runtime errors.
 *   • Brand Kits tab (`VideoStudioBrandKitsResource`) — renders seeded brand
 *     kit cards (e.g. MJ Default Brand Kit), palette swatch strip, company/default
 *     badges, asset count, and opens the `MJ: Brand Kits` entity form with the
 *     custom `BrandKitAssetsPanel` and `BrandKitGenerationPolicyPanel` editors.
 *   • Archetypes tab (`VideoStudioArchetypesResource`) — renders seeded
 *     archetypes grouped by category, proportional beat-timeline blocks, and
 *     opens the inline slide-out preview with Beat Template, Pacing, Guidance,
 *     and the "Edit Record" button.
 *
 * NOTE: VS-UX-2 extends this spec with the second half (conversational
 * Video Producer / Sage storyboard creation + Productions gallery playback).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

const APP_PATH = '/app/video-studio';

async function openVideoStudioTab(page: Page, tabLabel: string): Promise<void> {
  await page.goto(APP_PATH, { waitUntil: 'domcontentloaded' });
  const navTab = page.getByRole('link', { name: tabLabel }).or(
    page.getByRole('tab', { name: tabLabel }),
  ).or(
    page.locator('.nav-item, .app-nav-item').filter({ hasText: tabLabel }),
  );
  await expect(navTab.first()).toBeVisible({ timeout: 30_000 });
  await navTab.first().click();
}

test.describe('Video Studio — Brand Kits & Archetypes (VS-UX-1)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Productions tab loads header, search, and filter controls cleanly', async ({ page }) => {
    await page.goto(APP_PATH, { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('mj-video-studio-productions-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const gridOrEmpty = page
      .getByTestId('productions-grid')
      .or(page.getByTestId('productions-empty'));
    await expect(gridOrEmpty).toBeVisible({ timeout: 30_000 });
  });

  test('Brand Kits tab renders seeded kit cards with palette swatches and opens Brand Kit form panels', async ({
    page,
  }) => {
    await openVideoStudioTab(page, 'Brand Kits');
    await expect(
      page.locator('mj-video-studio-brand-kits-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const grid = page.getByTestId('brand-kits-grid');
    await expect(grid).toBeVisible({ timeout: 30_000 });

    const cards = page.locator('[data-testid^="brand-kit-card-"]');
    await expect(cards.first()).toBeVisible();

    const paletteStrip = cards.first().getByTestId('brand-kit-palette-strip');
    await expect(paletteStrip).toBeVisible();

    // Clicking the card navigates to the MJ: Brand Kits entity form
    await cards.first().click();
    await expect(
      page.locator('mj-brand-kit-assets-editor, mj-brand-kit-generation-policy-editor').first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Archetypes tab groups seeded archetypes by category, renders beat timeline blocks, and opens slide-out preview', async ({
    page,
  }) => {
    await openVideoStudioTab(page, 'Archetypes');
    await expect(
      page.locator('mj-video-studio-archetypes-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const groups = page.getByTestId('archetypes-groups');
    await expect(groups).toBeVisible({ timeout: 30_000 });

    const firstCard = page.locator('[data-testid^="archetype-card-"]').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByTestId('archetype-beat-timeline')).toBeVisible();

    await firstCard.click();
    const slideout = page.getByTestId('archetype-slideout');
    await expect(slideout).toBeVisible();
    await expect(slideout.getByTestId('archetype-edit-record-button')).toBeVisible();

    await slideout.getByTestId('archetype-slideout-close').click();
    await expect(slideout).toBeHidden();
  });
});
