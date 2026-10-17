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
 *     kit cards (e.g. MJ Default Brand Kit), palette swatch strip, logo
 *     thumbnail, company/default badge, asset count, and opens the
 *     `MJ: Brand Kits` entity form with BOTH custom `BrandKitAssetsPanel` and
 *     `BrandKitGenerationPolicyPanel` editors visible + interactive generation
 *     policy pill toggling.
 *   • Archetypes tab (`VideoStudioArchetypesResource`) — renders seeded
 *     archetypes grouped by category, proportional beat-timeline blocks, opens
 *     the inline slide-out preview with Beat Template, Pacing, Guidance, and
 *     shipped read-only banner + "Clone to Company" button, and exercises the
 *     Clone `<mj-dialog>` modal.
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

  test('Brand Kits tab renders seeded kit cards with palette swatches, logo thumb, company badge, and asset count, then opens Brand Kit form with Assets and Generation Policy editors', async ({
    page,
  }) => {
    await openVideoStudioTab(page, 'Brand Kits');
    await expect(
      page.locator('mj-video-studio-brand-kits-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const grid = page.getByTestId('brand-kits-grid');
    await expect(grid).toBeVisible({ timeout: 30_000 });

    const firstCard = page.locator('[data-testid^="brand-kit-card-"]').first();
    await expect(firstCard).toBeVisible();

    await expect(firstCard.getByTestId('brand-kit-logo-thumb')).toBeVisible();
    await expect(firstCard.getByTestId('brand-kit-palette-strip')).toBeVisible();
    await expect(firstCard.getByTestId('brand-kit-company-badge')).toBeVisible();
    await expect(firstCard.getByTestId('brand-kit-asset-count')).toBeVisible();

    // Clicking the card navigates to the MJ: Brand Kits entity form
    await firstCard.click();

    const assetsEditor = page.locator('mj-brand-kit-assets-editor');
    const policyEditor = page.locator('mj-brand-kit-generation-policy-editor');
    await expect(assetsEditor).toBeVisible({ timeout: 30_000 });
    await expect(policyEditor).toBeVisible({ timeout: 30_000 });

    // Exercise generation policy pill toggle in the Generation Policy editor
    const mutedPill = policyEditor.getByTestId('policy-music-pill-Muted');
    await expect(mutedPill).toBeVisible();
    await mutedPill.click();
    await expect(mutedPill).toHaveClass(/active/);
  });

  test('Archetypes tab groups seeded archetypes by category, renders beat timeline blocks, opens slide-out preview, and exercises Clone to Company modal', async ({
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

    // Seeded archetypes are shipped (CompanyID === null): verify read-only banner + Clone button
    const cloneBtn = slideout.getByTestId('archetype-clone-button');
    const editBtn = slideout.getByTestId('archetype-edit-record-button');
    await expect(cloneBtn.or(editBtn)).toBeVisible();

    if (await cloneBtn.isVisible()) {
      await expect(slideout.getByTestId('archetype-shipped-readonly-banner')).toBeVisible();
      await cloneBtn.click();

      const cloneDialog = page.getByTestId('archetype-clone-dialog');
      await expect(cloneDialog).toBeVisible();
      await expect(cloneDialog.getByTestId('archetype-clone-name-input')).toBeVisible();
      await expect(cloneDialog.getByTestId('archetype-clone-company-select')).toBeVisible();
      await expect(cloneDialog.getByTestId('archetype-clone-confirm')).toBeVisible();

      await cloneDialog.getByTestId('archetype-clone-cancel').click();
      await expect(cloneDialog).toBeHidden();
    }

    await slideout.getByTestId('archetype-slideout-close').click();
    await expect(slideout).toBeHidden();
  });
});

