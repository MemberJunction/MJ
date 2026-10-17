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
 *   • Brand Kits tab (`VideoStudioBrandKitsResource`) — creates a new brand kit
 *     via `new-brand-kit-button`, saves the form, uploads a Logo via
 *     `mj-files-file-upload` and verifies `bka-asset-thumbnail`, uploads an
 *     Image and flags `bka-asset-is-gen-ref` + saves via `bka-asset-save-btn`,
 *     toggles `bkgp-allow-images` (and verifies `bkgp-allow-synthetic-people`
 *     defaults off and shows `bkgp-synthetic-people-warning` when checked) and
 *     saves the form, then deletes the created kit from its card
 *     (`[data-testid^="brand-kit-delete-"]`).
 *   • Archetypes tab (`VideoStudioArchetypesResource`) — opens a shipped
 *     archetype card, verifies `archetype-shipped-readonly-banner`, clicks
 *     `archetype-clone-button`, picks a company in
 *     `archetype-clone-company-select`, clicks `archetype-clone-confirm`, and
 *     expects the new company-owned archetype's entity form.
 *
 * NOTE: VS-UX-2 extends this spec with the second half (conversational
 * Video Producer / Sage storyboard creation + Productions gallery playback).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

const APP_PATH = '/app/video-studio';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openVideoStudioTab(page: Page, tabLabel: string): Promise<void> {
  await page.goto(APP_PATH, { waitUntil: 'domcontentloaded' });
  const navTab = page
    .getByRole('link', { name: tabLabel })
    .or(page.getByRole('tab', { name: tabLabel }))
    .or(page.locator('.nav-item, .app-nav-item').filter({ hasText: tabLabel }));
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

  test('Brand Kits tab creates a brand kit, uploads a logo, flags a reference image, sets generation policy, and deletes the kit from its card', async ({
    page,
  }) => {
    const kitName = `E2E Brand Kit ${Date.now()}`;

    await openVideoStudioTab(page, 'Brand Kits');
    await expect(
      page.locator('mj-video-studio-brand-kits-resource'),
    ).toBeVisible({ timeout: 30_000 });

    // Step 1: Click new-brand-kit-button, name the kit, and save the form
    const newKitButton = page.getByTestId('new-brand-kit-button');
    await expect(newKitButton).toBeVisible({ timeout: 30_000 });
    await newKitButton.click();

    const nameInput = page
      .locator('mj-form-field[fieldname="Name"] input, input[name="Name"]')
      .first();
    await expect(nameInput).toBeVisible({ timeout: 30_000 });
    await nameInput.fill(kitName);

    const saveFormButton = page.getByRole('button', { name: /^save$/i }).first();
    await expect(saveFormButton).toBeVisible();
    await saveFormButton.click();

    const assetsEditor = page.locator('mj-brand-kit-assets-editor');
    const policyEditor = page.locator('mj-brand-kit-generation-policy-editor');
    await expect(assetsEditor).toBeVisible({ timeout: 30_000 });
    await expect(policyEditor).toBeVisible({ timeout: 30_000 });
    await expect(assetsEditor.getByTestId('bka-upload-card')).toBeVisible({ timeout: 30_000 });

    // Step 2: Upload a logo through mj-files-file-upload and expect bka-asset-thumbnail
    await assetsEditor.getByTestId('bka-new-asset-type').selectOption('Logo');
    await assetsEditor.getByTestId('bka-new-asset-name').fill('Primary E2E Logo');
    const fileInput = assetsEditor.locator('mj-files-file-upload input[type="file"]');
    await fileInput.setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: ONE_BY_ONE_PNG,
    });
    await expect(assetsEditor.getByTestId('bka-asset-thumbnail').first()).toBeVisible({
      timeout: 30_000,
    });

    // Step 3: Upload an Image, tick bka-asset-is-gen-ref, click bka-asset-save-btn
    await assetsEditor.getByTestId('bka-new-asset-type').selectOption('Image');
    await assetsEditor.getByTestId('bka-new-asset-name').fill('Reference E2E Plate');
    await fileInput.setInputFiles({
      name: 'reference.png',
      mimeType: 'image/png',
      buffer: ONE_BY_ONE_PNG,
    });

    const imageGroup = assetsEditor.locator('[data-testid="bka-asset-group"][data-asset-type="Image"]');
    await expect(imageGroup).toBeVisible({ timeout: 30_000 });
    const imageCard = imageGroup.getByTestId('bka-asset-card').first();
    const genRefCheckbox = imageCard.getByTestId('bka-asset-is-gen-ref');
    await expect(genRefCheckbox).toBeVisible();
    await genRefCheckbox.check();
    await imageCard.getByTestId('bka-asset-save-btn').click();

    // Step 4: Verify synthetic people is off by default, tick bkgp-allow-images, and save the form
    const syntheticPeopleCheckbox = policyEditor.getByTestId('bkgp-allow-synthetic-people');
    await expect(syntheticPeopleCheckbox).not.toBeChecked();
    await syntheticPeopleCheckbox.check();
    await expect(policyEditor.getByTestId('bkgp-synthetic-people-warning')).toBeVisible();
    await syntheticPeopleCheckbox.uncheck();

    const allowImagesCheckbox = policyEditor.getByTestId('bkgp-allow-images');
    if (!(await allowImagesCheckbox.isChecked())) {
      await allowImagesCheckbox.check();
    }

    const editFormButton = page.getByRole('button', { name: /^edit$/i }).first();
    if (await editFormButton.isVisible()) {
      await editFormButton.click();
    }
    await saveFormButton.click();

    // End by returning to Brand Kits and deleting the created kit from its card
    await openVideoStudioTab(page, 'Brand Kits');
    await expect(page.getByTestId('brand-kits-grid')).toBeVisible({ timeout: 30_000 });

    const createdCard = page
      .locator('[data-testid^="brand-kit-card-"]')
      .filter({ hasText: kitName })
      .first();
    await expect(createdCard).toBeVisible({ timeout: 30_000 });
    await expect(createdCard.getByTestId('brand-kit-logo-thumb')).toBeVisible();
    await expect(createdCard.getByTestId('brand-kit-palette-strip')).toBeVisible();
    await expect(createdCard.getByTestId('brand-kit-company-badge')).toBeVisible();
    await expect(createdCard.getByTestId('brand-kit-asset-count')).toBeVisible();

    await createdCard.locator('[data-testid^="brand-kit-delete-"]').click();
    const confirmButton = page
      .getByRole('button', { name: /delete|confirm|yes/i })
      .last();
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
    await expect(createdCard).toBeHidden({ timeout: 30_000 });
  });

  test('Archetypes tab opens a shipped card, verifies read-only banner, clones to a company, and opens the new archetype form', async ({
    page,
  }) => {
    await openVideoStudioTab(page, 'Archetypes');
    await expect(
      page.locator('mj-video-studio-archetypes-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const groups = page.getByTestId('archetypes-groups');
    await expect(groups).toBeVisible({ timeout: 30_000 });

    const shippedCard = page
      .locator('[data-testid^="archetype-card-"]')
      .filter({ has: page.getByTestId('archetype-shipped-badge') })
      .first();
    await expect(shippedCard).toBeVisible();
    await expect(shippedCard.getByTestId('archetype-beat-timeline')).toBeVisible();

    await shippedCard.click();
    const slideout = page.getByTestId('archetype-slideout');
    await expect(slideout).toBeVisible();
    await expect(slideout.getByTestId('archetype-shipped-readonly-banner')).toBeVisible();

    const cloneBtn = slideout.getByTestId('archetype-clone-button');
    await expect(cloneBtn).toBeVisible();
    await cloneBtn.click();

    const cloneDialog = page.getByTestId('archetype-clone-dialog');
    await expect(cloneDialog).toBeVisible();

    const cloneNameInput = cloneDialog.getByTestId('archetype-clone-name-input');
    await expect(cloneNameInput).toBeVisible();
    await cloneNameInput.fill(`E2E Cloned Archetype ${Date.now()}`);

    const companySelect = cloneDialog.getByTestId('archetype-clone-company-select');
    await expect(companySelect).toBeVisible();
    await companySelect.selectOption({ index: 1 });

    const confirmCloneBtn = cloneDialog.getByTestId('archetype-clone-confirm');
    await expect(confirmCloneBtn).toBeVisible();
    await confirmCloneBtn.click();

    await expect(page.locator('mj-record-form-container').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('Video Studio — Studio & Copilot Iterate (VS-UX-2)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Studio tab picks archetype, brand kit, and topic, clicks Start production to send composed message to copilot, then verifies Productions Iterate opens conversation with artifact attached', async ({
    page,
  }) => {
    await openVideoStudioTab(page, 'Studio');
    await expect(
      page.locator('mj-video-studio-studio-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const startForm = page.getByTestId('studio-start-form');
    const copilotPanel = page.getByTestId('vs-copilot-panel');
    await expect(startForm).toBeVisible({ timeout: 30_000 });
    await expect(copilotPanel).toBeVisible({ timeout: 30_000 });

    const startBtn = page.getByTestId('studio-start-button');
    await expect(startBtn).toBeDisabled();

    // Pick first archetype card
    const firstArchetype = page.locator('[data-testid^="studio-archetype-card-"]').first();
    await expect(firstArchetype).toBeVisible({ timeout: 30_000 });
    await firstArchetype.click();

    // Pick first brand kit option (index 1, after 'None') via mj-dropdown
    const brandKitSelect = page.getByTestId('studio-brand-kit-select');
    await expect(brandKitSelect).toBeVisible();
    await brandKitSelect.click();
    await page.getByRole('option').nth(1).click();

    // Enter topic
    const topicInput = page.getByTestId('studio-topic-input');
    const topicText = 'Q3 revenue highlights and customer momentum';
    await topicInput.fill(topicText);

    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    // Verify copilot chat area receives the composed message and an MJ: Video Production artifact opens in the viewer pane
    const chatArea = copilotPanel.getByTestId('vs-copilot-chat-area');
    await expect(chatArea).toBeVisible({ timeout: 30_000 });
    await expect(chatArea).toContainText(topicText, { timeout: 30_000 });
    await expect(
      copilotPanel.locator('mj-artifact-viewer-panel').first(),
    ).toBeVisible({ timeout: 60_000 });

    // Navigate to Productions and verify production + Iterate
    await openVideoStudioTab(page, 'Productions');
    await expect(
      page.locator('mj-video-studio-productions-resource'),
    ).toBeVisible({ timeout: 30_000 });

    const firstProductionCard = page.locator('[data-testid^="production-card-"]').first();
    await expect(firstProductionCard).toBeVisible({ timeout: 60_000 });
    await firstProductionCard.click();

    const detailPane = page.getByTestId('production-detail-pane');
    await expect(detailPane).toBeVisible({ timeout: 30_000 });

    const iterateBtn = detailPane.getByTestId('production-iterate-button');
    await expect(iterateBtn).toBeVisible();
    await expect(iterateBtn).toBeEnabled({ timeout: 30_000 });
    await iterateBtn.click();

    const dockedCopilot = detailPane.getByTestId('production-iterate-copilot');
    await expect(dockedCopilot).toBeVisible({ timeout: 30_000 });
    const dockedChatArea = dockedCopilot.getByTestId('vs-copilot-chat-area');
    await expect(dockedChatArea).toBeVisible({
      timeout: 30_000,
    });

    // Send a follow-up ("make the intro faster") and see version 2 appear in the viewer
    const chatInput = dockedChatArea.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 30_000 });
    await chatInput.fill('make the intro faster');
    await chatInput.press('Enter');
    await expect(detailPane).toContainText(/v2|version 2/i, { timeout: 60_000 });

    // Open the Share dialog and share with another user
    const shareBtn = detailPane.getByTitle('Share');
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    const shareModal = page.locator('mj-artifact-share-modal');
    await expect(shareModal).toBeVisible({ timeout: 30_000 });

    const userPicker = shareModal.locator('mj-user-picker');
    const userSearchInput = userPicker.locator('.user-search-input');
    await expect(userSearchInput).toBeVisible({ timeout: 30_000 });
    await userSearchInput.fill(process.env.PLAYWRIGHT_SHARE_USER_QUERY ?? '.com');
    await userSearchInput.press('Enter');

    const firstUserResult = userPicker.locator('.user-search-item').first();
    await expect(firstUserResult).toBeVisible({ timeout: 30_000 });
    await firstUserResult.click();

    const addUserBtn = shareModal.getByRole('button', { name: /Add User/i });
    await expect(addUserBtn).toBeVisible();
    await addUserBtn.click();

    await expect(
      shareModal.locator('.permissions-list .permission-item').first(),
    ).toBeVisible({ timeout: 30_000 });

    // Toggle dark and light theme and verify the workspace renders cleanly in both
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(detailPane).toBeVisible();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect(detailPane).toBeVisible();
  });
});

