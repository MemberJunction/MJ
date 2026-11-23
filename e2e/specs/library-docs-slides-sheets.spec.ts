/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Library Workspace & Collaborative Docs / Slides / Sheets — Playwright E2E
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS:
 *   • Unified Library surface (`/app/Library`) with Hub/Navigator layout switch,
 *     Split Studio, Full-Canvas Studio, real Close button URL cleanup, and
 *     Browser Back state restoration.
 *   • Moved-nav redirects (`P0-22`): `/app/Chat/Collections` & `/app/chat/Collections`
 *     resolve directly to the Library surface preserving query parameters, and
 *     `/app/Chat/Tasks` resolves to `Agent Activity`.
 *   • Native MJ Document editing, version saving, anchored comments/replies/resolve,
 *     and tracked Suggest Mode (`NW-3`).
 *   • Native MJ Spreadsheet cell entry, formula evaluation (`=SUM`), cell merge,
 *     Named Range creation (`NW-4`), comments/suggestions (`NW-3`), and save.
 *   • Native MJ Presentation editing, slide creation, speaker notes, slide
 *     comments (`NW-3`), and version saving.
 *   • Real-time 2-browser-context Yjs collaboration (`Criterion #14 D.3`): edits
 *     made in Context A converge immediately in Context B (and vice versa) over
 *     `/collaboration/yjs` without saving a version or reloading.
 *   • External Guest Share (`/magic-link/redeem?token=...` -> `/guest/artifact#token=<jwt>`, `NW-1`)
 *     verified in a fresh unauthenticated browser context via Magic Link anonymous
 *     session + authenticated `ResolveGuestArtifactSnapshot`, `[DriverClass]`,
 *     `[PreVerifiedFrozenSnapshots]` (zero red `unverified-snapshot-banner`), and
 *     immediate revocation (`?mlError=revoked` / `REVOKED` banner).
 *   • Multi-Artifact Synthesis (`NW-5`) creating a Presentation from Library sources.
 *
 * PREREQUISITES (NOT started by these tests): MJAPI + MJExplorer running,
 * primed auth profile at `.playwright-cli/profile` (see `e2e/fixtures.ts`).
 *
 * RUN:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/library-docs-slides-sheets.spec.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';

interface GuestResolveResponseBody {
  Success?: boolean;
  Valid?: boolean;
  ErrorCode?: string | null;
  DriverClass?: string | null;
  ReadOnly?: boolean;
  FrozenProvenance?: ReadonlyArray<Record<string, string | number | boolean | null>> | null;
}

async function openAuthenticatedSiblingContext(
  browser: Browser,
  sourcePage: Page,
): Promise<BrowserContext> {
  const storageState = await sourcePage.context().storageState();
  const { origin, sessionEntries } = await sourcePage.evaluate(() => ({
    origin: window.location.origin,
    sessionEntries: Object.entries(window.sessionStorage),
  }));

  const siblingContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState,
  });

  if (sessionEntries.length > 0) {
    await siblingContext.addInitScript(
      (payload: { expectedOrigin: string; entries: ReadonlyArray<readonly [string, string]> }) => {
        if (window.location.origin !== payload.expectedOrigin) {
          return;
        }
        for (const [key, value] of payload.entries) {
          try {
            window.sessionStorage.setItem(key, value);
          } catch {
            // Ignore storage write errors on restricted contexts
          }
        }
      },
      { expectedOrigin: origin, entries: sessionEntries },
    );
  }

  return siblingContext;
}

async function bootToApp(page: Page, appPath: string): Promise<void> {
  await page.goto(appPath, { waitUntil: 'domcontentloaded' });
  const reset = page.getByRole('button', { name: /reset/i });
  const isResetVisible = await reset.isVisible().catch(() => false);
  if (isResetVisible) {
    await reset.click();
    await page.goto(appPath, { waitUntil: 'domcontentloaded' });
  }
}

async function openCreateDialogFromLibrary(page: Page): Promise<void> {
  await bootToApp(page, '/app/Library');
  await expect(page.locator('[data-testid="library-unified-surface"]')).toBeVisible({
    timeout: 120_000,
  });

  const createBtn = page.locator('[data-testid="library-create-btn"]');
  await expect(createBtn).toBeVisible({ timeout: 30_000 });
  await createBtn.click();
  await expect(page.locator('[data-testid="library-create-dialog"]')).toBeVisible({
    timeout: 15_000,
  });
}

async function clickFirstPresent(candidates: ReadonlyArray<Locator>, timeoutMs = 15_000): Promise<void> {
  for (const candidate of candidates) {
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  await candidates[0].waitFor({ state: 'visible', timeout: timeoutMs });
  await candidates[0].click();
}

test.describe.serial('Library workspace & collaborative Docs, Slides, and Sheets', () => {
  const createdDocTitle = `E2E Strategy Doc ${Date.now()}`;

  test('resolves moved /app/Chat/Collections routes to Library and /app/Chat/Tasks to Agent Activity (P0-22)', async ({
    page,
  }) => {
    await bootToApp(page, '/app/Chat/Collections?e2eNavCheck=1');
    await expect(page.locator('[data-testid="library-unified-surface"]')).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator('mj-page-header')).toContainText('Library', { timeout: 30_000 });
    await expect(page).toHaveURL(/e2eNavCheck=1/, { timeout: 15_000 });

    await bootToApp(page, '/app/chat/Collections');
    await expect(page.locator('[data-testid="library-unified-surface"]')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('mj-page-header')).toContainText('Library', { timeout: 30_000 });

    await bootToApp(page, '/app/Chat/Tasks');
    await expect(page.locator('mj-tasks-full-view')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.cc-title')).toHaveText('Agent Activity');
  });

  test('creates an MJ Document, edits content, manages NW-3 comments/suggestions, closes Split Studio cleanly, and restores on Browser Back', async ({
    page,
  }) => {
    await openCreateDialogFromLibrary(page);

    await page.locator('[data-testid="dialog-starter-document"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(createdDocTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(createdDocTitle);
    await expect(page).toHaveURL(/artifactId=/, { timeout: 15_000 });
    await expect(page.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({ timeout: 30_000 });

    // Edit document content in Write mode and save a version
    await page.locator('[data-testid="mode-edit-btn"]').click();
    const editableParagraph = page.locator('[data-testid^="editable-paragraph-"]').first();
    await expect(editableParagraph).toBeVisible({ timeout: 15_000 });
    await editableParagraph.click();
    const editedParagraphMarker = `E2E revised narrative ${Date.now()}`;
    await editableParagraph.fill(editedParagraphMarker);
    await editableParagraph.blur();

    const saveDocBtn = page.locator('[data-testid="save-doc-version-btn"]');
    await expect(saveDocBtn).toBeEnabled({ timeout: 15_000 });
    await saveDocBtn.click();
    await expect(saveDocBtn).toContainText(/Saved v\d+/i, { timeout: 20_000 });

    // NW-3: Anchored comment thread, reply, and resolve toggle
    await page.locator('[data-testid="toggle-comments-btn"]').click();
    await expect(page.locator('[data-testid="docs-comments-drawer"]')).toBeVisible({
      timeout: 15_000,
    });
    const commentText = `E2E anchored review ${Date.now()}`;
    await page.locator('[data-testid="new-anchored-comment-input"]').fill(commentText);
    await page.locator('[data-testid="post-anchored-comment-btn"]').click();

    const createdThread = page.locator('[data-testid^="anchored-thread-"]').filter({
      hasText: commentText,
    });
    await expect(createdThread).toBeVisible({ timeout: 15_000 });

    const replyInput = createdThread.locator('[data-testid^="thread-reply-input-"]');
    const replySubmit = createdThread.locator('[data-testid^="thread-reply-submit-"]');
    const replyText = `E2E follow-up reply ${Date.now()}`;
    await replyInput.fill(replyText);
    await replySubmit.click();
    await expect(createdThread).toContainText(replyText, { timeout: 15_000 });

    await createdThread.locator('[data-testid^="resolve-thread-btn-"]').click();

    // NW-3: Tracked Suggest Mode edit -> accept/commit suggestion
    const moreToolsBtn = page.locator('[data-testid="toggle-more-tools-btn"]');
    await moreToolsBtn.click();
    await expect(page.locator('[data-testid="docs-more-tools-menu"]')).toBeVisible({
      timeout: 10_000,
    });
    await clickFirstPresent([
      page.locator('[data-testid="mode-suggest-btn"]'),
      page.locator('[data-testid="menu-mode-suggest-btn"]'),
    ]);
    await expect(page.locator('[data-testid="docs-suggest-mode-banner"]')).toBeVisible({
      timeout: 15_000,
    });

    const suggestSegment = page.locator('[data-testid^="editable-paragraph-"]').first();
    await suggestSegment.click();
    const suggestedMarker = `${editedParagraphMarker} — approved change`;
    await suggestSegment.fill(suggestedMarker);
    await suggestSegment.blur();

    const suggestionCard = page.locator('[data-testid^="suggestion-card-"]').first();
    await expect(suggestionCard).toBeVisible({ timeout: 15_000 });
    await suggestionCard.locator('[data-testid^="accept-suggestion-btn-"]').click();
    await expect(page.locator('[data-testid="mj-docs-workspace"]')).toContainText(suggestedMarker, {
      timeout: 15_000,
    });

    // Switch to Split Studio, close via real Studio Close button, and verify Browser Back restoration
    await page.locator('[data-testid="full-canvas-split-btn"]').click();
    const splitStudio = page.locator('[data-testid="library-split-studio"]');
    await expect(splitStudio).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/artifactId=/, { timeout: 15_000 });

    const studioUrlBeforeClose = page.url();
    const studioCloseBtn = splitStudio.locator('.close-btn');
    await expect(studioCloseBtn).toBeVisible({ timeout: 10_000 });
    await studioCloseBtn.click();

    await expect(splitStudio).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('[data-testid="library-unified-surface"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/artifactId=/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(studioUrlBeforeClose, { timeout: 15_000 });
    await expect(
      page.locator('[data-testid="library-split-studio"]').or(page.locator('[data-testid="library-full-canvas"]')).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('edits MJ Spreadsheet formulas, merges cells, defines Named Range (NW-4), posts NW-3 comment/suggestion, and saves version', async ({
    page,
  }) => {
    const sheetTitle = `E2E Revenue Sheet ${Date.now()}`;
    await openCreateDialogFromLibrary(page);

    await page.locator('[data-testid="dialog-starter-spreadsheet"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(sheetTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(sheetTitle);
    await expect(page.locator('[data-testid="mj-sheets-shell"]')).toBeVisible({ timeout: 30_000 });

    const enterCellFormula = async (addr: string, value: string): Promise<void> => {
      await page.locator(`[data-testid="sheet-cell-${addr}"]`).click();
      await expect(page.locator('[data-testid="sheet-active-cell-address"]')).toHaveText(addr, {
        timeout: 10_000,
      });
      await page.locator('[data-testid="sheet-formula-input"]').fill(value);
      await page.locator('[data-testid="sheet-formula-apply-btn"]').click();
    };

    await enterCellFormula('B2', '125');
    await enterCellFormula('B3', '75');
    await enterCellFormula('B4', '=SUM(B2:B3)');
    await expect(page.locator('[data-testid="sheet-cell-B4"]')).toContainText('200', {
      timeout: 15_000,
    });

    // NW-4: Merge cells A5:B5 via range selector + overflow menu
    await page.locator('[data-testid="sheet-selected-range-input"]').fill('A5:B5');
    await page.locator('[data-testid="sheets-more-tools-btn"]').click();
    await expect(page.locator('[data-testid="sheets-more-tools-menu"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="sheets-overflow-merge-cells"]').click();

    // NW-4: Named range creation and selector verification
    await page.locator('[data-testid="sheets-more-tools-btn"]').click();
    await expect(page.locator('[data-testid="sheets-more-tools-menu"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="sheets-overflow-named-ranges"]').click();
    await expect(page.locator('[data-testid="sheets-named-range-modal"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="named-range-name-input"]').fill('E2ERevenueRange');
    await page.locator('[data-testid="named-range-ref-input"]').fill('B2:B4');
    await page.locator('[data-testid="named-range-save-btn"]').click();
    await expect(page.locator('[data-testid="sheet-named-range-select"]')).toContainText(
      'E2ERevenueRange',
      { timeout: 15_000 },
    );

    // NW-3: Spreadsheet cell comment + proposed suggestion
    await page.locator('[data-testid="sheet-toggle-comments-btn"]').click();
    await expect(page.locator('[data-testid="sheets-comments-drawer"]')).toBeVisible({
      timeout: 15_000,
    });
    const sheetComment = `Verify Q1 subtotal ${Date.now()}`;
    await page.locator('[data-testid="sheet-comment-input"]').fill(sheetComment);
    await page.locator('[data-testid="sheet-post-comment-btn"]').click();
    await expect(page.locator('[data-testid="sheets-comments-drawer"]')).toContainText(sheetComment, {
      timeout: 15_000,
    });

    await page.locator('[data-testid="sheet-open-propose-suggestion-btn"]').click();
    await expect(page.locator('[data-testid="sheets-suggestion-modal"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="suggestion-value-input"]').fill('250');
    await page.locator('[data-testid="suggestion-rationale-input"]').fill('Include late invoice');
    await page.locator('[data-testid="suggestion-submit-btn"]').click();
    await expect(page.locator('[data-testid="sheets-comments-drawer"]')).toContainText(
      'Include late invoice',
      { timeout: 15_000 },
    );

    const saveSheetBtn = page.locator('[data-testid="sheet-save-version-btn"]');
    await expect(saveSheetBtn).toBeEnabled({ timeout: 15_000 });
    await saveSheetBtn.click();
    await expect(saveSheetBtn).toContainText(/Saved v\d+/i, { timeout: 20_000 });
  });

  test('edits MJ Presentation title, adds slide & speaker notes, posts NW-3 comment, and saves version', async ({
    page,
  }) => {
    const deckTitle = `E2E Board Deck ${Date.now()}`;
    await openCreateDialogFromLibrary(page);

    await page.locator('[data-testid="dialog-starter-presentation"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(deckTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(deckTitle);
    await expect(page.locator('[data-testid="mj-slides-shell"]')).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-testid="slides-mode-edit"]').click();
    const slideTitleInput = page.locator('[data-testid="editable-slide-title"]');
    await expect(slideTitleInput).toBeVisible({ timeout: 15_000 });
    await slideTitleInput.click();
    const updatedSlideTitle = `Q4 Executive Briefing ${Date.now()}`;
    await slideTitleInput.fill(updatedSlideTitle);
    await slideTitleInput.blur();

    const speakerNotes = page.locator('[data-testid="speaker-notes-input"]');
    await expect(speakerNotes).toBeVisible({ timeout: 15_000 });
    await speakerNotes.fill('Highlight ARR expansion and gross margin durability.');

    const addSlideBtn = page.locator('[data-testid="add-slide-btn"]');
    await expect(addSlideBtn).toBeVisible({ timeout: 10_000 });
    await addSlideBtn.click();
    await expect(page.locator('[data-testid="toggle-filmstrip-btn"]')).toContainText(/Slides \(2\)/, {
      timeout: 15_000,
    });

    await page.locator('[data-testid="toggle-slide-comments-btn"]').click();
    await expect(page.locator('[data-testid="slide-comments-drawer"]')).toBeVisible({
      timeout: 15_000,
    });
    const slideComment = `Tighten speaker transitions ${Date.now()}`;
    await page.locator('[data-testid="slide-comment-draft-input"]').fill(slideComment);
    await page.locator('[data-testid="submit-slide-comment-btn"]').click();
    await expect(page.locator('[data-testid="slide-comment-thread-list"]')).toContainText(
      slideComment,
      { timeout: 15_000 },
    );

    const saveSlideBtn = page.locator('[data-testid="save-slide-version-btn"]');
    await expect(saveSlideBtn).toBeEnabled({ timeout: 15_000 });
    await saveSlideBtn.click();
    await expect(saveSlideBtn).toContainText(/Saved/i, { timeout: 20_000 });
  });

  test('converges live Yjs edits across two authenticated browser contexts without version save or reload (Criterion #14 D.3)', async ({
    page,
    browser,
  }) => {
    const syncDocTitle = `E2E Live Yjs Sync Doc ${Date.now()}`;
    await openCreateDialogFromLibrary(page);

    await page.locator('[data-testid="dialog-starter-document"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(syncDocTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="collaboration-presence-pill"]')).toHaveAttribute(
      'data-status',
      'connected',
      { timeout: 25_000 },
    );

    const artifactUrl = page.url();
    expect(artifactUrl).toMatch(/artifactId=/);

    const contextB = await openAuthenticatedSiblingContext(browser, page);
    try {
      const pageB = await contextB.newPage();
      await bootToApp(pageB, artifactUrl);
      await expect(pageB.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({
        timeout: 45_000,
      });
      await expect(pageB.locator('[data-testid="collaboration-presence-pill"]')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 25_000 },
      );

      // Edit in Context A WITHOUT saving a version -> Context B must converge live without reload
      await page.locator('[data-testid="mode-edit-btn"]').click();
      const paragraphA = page.locator('[data-testid^="editable-paragraph-"]').first();
      await expect(paragraphA).toBeVisible({ timeout: 15_000 });
      await paragraphA.click();
      const ctxAMarker = `E2E Yjs ContextA live edit ${Date.now()}`;
      await paragraphA.fill(ctxAMarker);
      await paragraphA.blur();

      await expect(pageB.locator('[data-testid="mj-docs-workspace"]')).toContainText(ctxAMarker, {
        timeout: 20_000,
      });

      // Bidirectional verification: edit in Context B WITHOUT saving -> Context A converges live
      await pageB.locator('[data-testid="mode-edit-btn"]').click();
      const paragraphB = pageB.locator('[data-testid^="editable-paragraph-"]').first();
      await expect(paragraphB).toBeVisible({ timeout: 15_000 });
      await paragraphB.click();
      const ctxBMarker = `${ctxAMarker} — ContextB reply ${Date.now()}`;
      await paragraphB.fill(ctxBMarker);
      await paragraphB.blur();

      await expect(page.locator('[data-testid="mj-docs-workspace"]')).toContainText(ctxBMarker, {
        timeout: 20_000,
      });
    } finally {
      await contextB.close();
    }
  });

  test('creates an External Guest Share link (/magic-link/redeem -> /guest/artifact#token), verifies ResolveGuestArtifactSnapshot + DriverClass + zero unverified banners, and blocks access after revocation (NW-1)', async ({
    page,
    browser,
  }) => {
    const shareDocTitle = `E2E Guest Shared Doc ${Date.now()}`;
    await openCreateDialogFromLibrary(page);
    await page.locator('[data-testid="dialog-starter-document"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(shareDocTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('[data-testid="guest-share-btn"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-testid="guest-share-btn"]').click();
    await expect(page.locator('[data-testid="guest-share-modal"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('[data-testid="guest-share-label-input"]').fill('Board External Review');
    await page.locator('[data-testid="create-guest-share-btn"]').click();

    const createdUrlInput = page.locator('[data-testid="guest-share-created-url"] input');
    await expect(createdUrlInput).toBeVisible({ timeout: 20_000 });
    const guestUrl = await createdUrlInput.inputValue();
    expect(guestUrl).toContain('/magic-link/redeem?token=');

    // Verify in a fresh unauthenticated browser context (zero session cookies/localStorage)
    const guestContext = await browser.newContext();
    try {
      const guestPage = await guestContext.newPage();
      await guestPage.goto(guestUrl, { waitUntil: 'domcontentloaded' });

      // Safe GET /magic-link/redeem renders human click interstitial before minting session JWT
      const continueBtn = guestPage.locator('button[type="submit"]');
      await expect(continueBtn).toBeVisible({ timeout: 20_000 });

      const gqlResolvePromise = guestPage.waitForResponse(
        (res) =>
          res.url().includes('/graphql') &&
          res.request().method() === 'POST' &&
          (res.request().postData() ?? '').includes('ResolveGuestArtifactSnapshot'),
        { timeout: 30_000 },
      );

      await continueBtn.click();
      const resolveResponse = await gqlResolvePromise;
      expect(resolveResponse.status()).toBe(200);
      const gqlBody = (await resolveResponse.json()) as {
        data?: { ResolveGuestArtifactSnapshot?: GuestResolveResponseBody };
      };
      const resolvedBody = gqlBody.data?.ResolveGuestArtifactSnapshot;
      expect(resolvedBody?.Success).toBe(true);
      expect(resolvedBody?.Valid).toBe(true);
      expect(resolvedBody?.DriverClass).toBe('MarkdownArtifactViewerPlugin');
      expect(resolvedBody?.ReadOnly).toBe(true);

      await expect(guestPage.locator('.guest-page')).toBeVisible({ timeout: 30_000 });
      await expect(guestPage.locator('.guest-badge')).toContainText('Guest View', { timeout: 20_000 });
      await expect(guestPage.locator('.guest-title')).toContainText(shareDocTitle, {
        timeout: 20_000,
      });
      await expect(guestPage.locator('.guest-viewer-shell')).toBeVisible({ timeout: 20_000 });
      await expect(guestPage.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({
        timeout: 20_000,
      });
      // Server-verified / non-tampered snapshots must never show red unverified-snapshot-banner
      await expect(guestPage.locator('[data-testid="unverified-snapshot-banner"]')).toHaveCount(0);

      // Owner revokes the guest link from the authenticated modal
      const revokeBtn = page.locator('[data-testid^="revoke-guest-link-"]').first();
      await expect(revokeBtn).toBeVisible({ timeout: 15_000 });
      await revokeBtn.click();
      await expect(revokeBtn).toBeHidden({ timeout: 15_000 });

      // Re-opening the Magic Link in the unauthenticated context must now render Revoked state
      await guestPage.goto(guestUrl, { waitUntil: 'domcontentloaded' });
      const retryContinueBtn = guestPage.locator('button[type="submit"]');
      await expect(retryContinueBtn).toBeVisible({ timeout: 20_000 });
      await retryContinueBtn.click();

      await expect(guestPage.locator('.guest-error-banner')).toBeVisible({ timeout: 20_000 });
      await expect(guestPage.locator('.guest-error-title')).toContainText(/Revoked/i, {
        timeout: 15_000,
      });
    } finally {
      await guestContext.close();
    }
  });

  test('synthesizes a Presentation from existing Library sources via Synthesize with AI (NW-5)', async ({
    page,
  }) => {
    await bootToApp(page, '/app/Library');
    await expect(page.locator('[data-testid="library-unified-surface"]')).toBeVisible({
      timeout: 120_000,
    });

    await page.locator('[data-testid="library-synthesize-btn"]').click();
    await expect(page.locator('[data-testid="library-create-dialog"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="library-synthesize-panel"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('[data-testid="synth-target-presentation"]').click();
    await page.locator('[data-testid="library-synth-source-search"]').fill('E2E Strategy Doc');
    const sourceCheckbox = page.locator('input[data-testid^="synth-source-"]').first();
    await expect(sourceCheckbox).toBeVisible({ timeout: 15_000 });
    await sourceCheckbox.check();

    const synthTitle = `E2E Synthesized Deck ${Date.now()}`;
    await page.locator('[data-testid="library-synthesize-title-input"]').fill(synthTitle);
    await page
      .locator('[data-testid="library-synthesize-goal-input"]')
      .fill('Create a concise executive readout summarizing key points and metrics.');

    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="library-full-canvas"]')).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.locator('.full-canvas-title')).toContainText(synthTitle);
    await expect(page).toHaveURL(/artifactId=/, { timeout: 15_000 });
    await expect(page.locator('[data-testid="mj-slides-shell"]')).toBeVisible({ timeout: 30_000 });
  });

  test('isolates per-user Y.UndoManager Undo/Redo across live 2-context Docs edits and toolbars in Sheets & Slides', async ({
    page,
    browser,
  }) => {
    const docTitle = `E2E Scoped Undo Doc ${Date.now()}`;
    await openCreateDialogFromLibrary(page);
    await page.locator('[data-testid="dialog-starter-document"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(docTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="collaboration-presence-pill"]')).toHaveAttribute(
      'data-status',
      'connected',
      { timeout: 25_000 },
    );
    const sharedUrl = page.url();

    const contextB = await openAuthenticatedSiblingContext(browser, page);
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(sharedUrl, { waitUntil: 'domcontentloaded' });
      await expect(pageB.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({ timeout: 30_000 });
      await expect(pageB.locator('[data-testid="collaboration-presence-pill"]')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 25_000 },
      );

      // Context A writes local marker A (captured in A's Y.UndoManager local origin)
      await page.locator('[data-testid="mode-edit-btn"]').click();
      const paraA = page.locator('[data-testid^="editable-paragraph-"]').first();
      await expect(paraA).toBeVisible({ timeout: 15_000 });
      await paraA.click();
      const markerA = `LocalUndoMarkerA-${Date.now()}`;
      await paraA.fill(markerA);
      await paraA.blur();
      await expect(pageB.locator('[data-testid="mj-docs-workspace"]')).toContainText(markerA, {
        timeout: 20_000,
      });

      // Context B appends remote marker B on top
      await pageB.locator('[data-testid="mode-edit-btn"]').click();
      const paraB = pageB.locator('[data-testid^="editable-paragraph-"]').first();
      await expect(paraB).toBeVisible({ timeout: 15_000 });
      await paraB.click();
      const markerB = `PeerMarkerB-${Date.now()}`;
      await paraB.fill(`${markerA}\n${markerB}`);
      await paraB.blur();
      await expect(page.locator('[data-testid="mj-docs-workspace"]')).toContainText(markerB, {
        timeout: 20_000,
      });

      // Context A clicks Undo -> reverts A's local edit while preserving B's concurrent edit
      const docsUndoBtn = page.locator('[data-testid="docs-undo-btn"]');
      const docsRedoBtn = page.locator('[data-testid="docs-redo-btn"]');
      await expect(docsUndoBtn).toBeEnabled({ timeout: 10_000 });
      await docsUndoBtn.click();
      await expect(page.locator('[data-testid="mj-docs-workspace"]')).toContainText(markerB, {
        timeout: 15_000,
      });
      await expect(page.locator('[data-testid="mj-docs-workspace"]')).not.toContainText(markerA, {
        timeout: 15_000,
      });

      // Redo restores marker A cleanly
      await expect(docsRedoBtn).toBeEnabled({ timeout: 10_000 });
      await docsRedoBtn.click();
      await expect(page.locator('[data-testid="mj-docs-workspace"]')).toContainText(markerA, {
        timeout: 15_000,
      });
    } finally {
      await contextB.close();
    }
  });

  test('verifies Sheets desktop ergonomics (Arrow/Shift+Arrow, Col/Row drag-resize, Fill Handle, Undo/Redo) and Slides filmstrip drag-reorder', async ({
    page,
  }) => {
    // 1) Sheets ergonomics
    const sheetTitle = `E2E Ergonomics Sheet ${Date.now()}`;
    await openCreateDialogFromLibrary(page);
    await page.locator('[data-testid="dialog-starter-spreadsheet"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(sheetTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="mj-sheets-shell"]')).toBeVisible({ timeout: 30_000 });

    const setCell = async (addr: string, val: string): Promise<void> => {
      await page.locator(`[data-testid="sheet-cell-${addr}"]`).click();
      await page.locator('[data-testid="sheet-formula-input"]').fill(val);
      await page.locator('[data-testid="sheet-formula-apply-btn"]').click();
    };

    await setCell('B2', '10');
    await setCell('B3', '20');
    await expect(page.locator('[data-testid="sheet-cell-B3"]')).toContainText('20', { timeout: 10_000 });

    // Keyboard navigation & Shift+Arrow range selection
    await page.locator('[data-testid="sheet-cell-B2"]').click();
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('[data-testid="sheet-selected-range-input"]')).toHaveValue('B2:B3', {
      timeout: 10_000,
    });

    // Fill handle drag from B2 down to B4 extends numeric step (10, 20 -> 30)
    const fillHandle = page.locator('[data-testid="sheet-fill-handle-B2"]');
    await expect(fillHandle).toBeVisible({ timeout: 10_000 });
    const handleBox = await fillHandle.boundingBox();
    const b4Box = await page.locator('[data-testid="sheet-cell-B4"]').boundingBox();
    expect(handleBox).not.toBeNull();
    expect(b4Box).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b4Box!.x + b4Box!.width / 2, b4Box!.y + b4Box!.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('[data-testid="sheet-cell-B4"]')).toContainText('30', {
      timeout: 10_000,
    });

    // Sheets Undo/Redo assert actual cell mutation rollback & restore
    const sheetUndo = page.locator('[data-testid="sheet-undo-btn"]');
    const sheetRedo = page.locator('[data-testid="sheet-redo-btn"]');
    await expect(sheetUndo).toBeEnabled({ timeout: 10_000 });
    await sheetUndo.click();
    await expect(page.locator('[data-testid="sheet-cell-B4"]')).not.toContainText('30', {
      timeout: 10_000,
    });
    await expect(sheetRedo).toBeEnabled({ timeout: 10_000 });
    await sheetRedo.click();
    await expect(page.locator('[data-testid="sheet-cell-B4"]')).toContainText('30', {
      timeout: 10_000,
    });

    // Column & Row drag-resize actually alter rendered cell geometry
    const b2Before = await page.locator('[data-testid="sheet-cell-B2"]').boundingBox();
    const colResizeB = page.locator('[data-testid="sheet-col-resize-B"]');
    const colHandleBox = await colResizeB.boundingBox();
    expect(b2Before).not.toBeNull();
    expect(colHandleBox).not.toBeNull();
    await page.mouse.move(colHandleBox!.x + colHandleBox!.width / 2, colHandleBox!.y + colHandleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(colHandleBox!.x + 60, colHandleBox!.y + colHandleBox!.height / 2, { steps: 6 });
    await page.mouse.up();
    const b2AfterCol = await page.locator('[data-testid="sheet-cell-B2"]').boundingBox();
    expect((b2AfterCol?.width ?? 0) > b2Before!.width + 20).toBe(true);

    const rowResize2 = page.locator('[data-testid="sheet-row-resize-2"]');
    const rowHandleBox = await rowResize2.boundingBox();
    const b2PreRow = await page.locator('[data-testid="sheet-cell-B2"]').boundingBox();
    expect(rowHandleBox).not.toBeNull();
    expect(b2PreRow).not.toBeNull();
    await page.mouse.move(rowHandleBox!.x + rowHandleBox!.width / 2, rowHandleBox!.y + rowHandleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(rowHandleBox!.x + rowHandleBox!.width / 2, rowHandleBox!.y + 30, { steps: 6 });
    await page.mouse.up();
    const b2AfterRow = await page.locator('[data-testid="sheet-cell-B2"]').boundingBox();
    expect((b2AfterRow?.height ?? 0) > b2PreRow!.height + 10).toBe(true);

    // 2) Slides filmstrip drag-reorder + Undo/Redo
    const deckTitle = `E2E Slide Reorder Deck ${Date.now()}`;
    await openCreateDialogFromLibrary(page);
    await page.locator('[data-testid="dialog-starter-presentation"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(deckTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="mj-slides-shell"]')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-testid="add-slide-btn"]').click();
    await expect(page.locator('[data-testid^="filmstrip-slide-"]')).toHaveCount(2, { timeout: 15_000 });

    const thumbs = page.locator('[data-testid^="filmstrip-slide-"]');
    const firstSlideId = await thumbs.nth(0).getAttribute('data-testid');
    const secondSlideId = await thumbs.nth(1).getAttribute('data-testid');
    await thumbs.nth(0).dragTo(thumbs.nth(1));
    await expect(thumbs.nth(1)).toHaveAttribute('data-testid', firstSlideId ?? '', { timeout: 10_000 });
    await expect(thumbs.nth(0)).toHaveAttribute('data-testid', secondSlideId ?? '', { timeout: 10_000 });

    // Slides Undo & Redo toggle order cleanly
    const slidesUndo = page.locator('[data-testid="slides-undo-btn"]');
    const slidesRedo = page.locator('[data-testid="slides-redo-btn"]');
    await expect(slidesUndo).toBeEnabled({ timeout: 10_000 });
    await slidesUndo.click();
    await expect(thumbs.nth(0)).toHaveAttribute('data-testid', firstSlideId ?? '', { timeout: 10_000 });
    await expect(slidesRedo).toBeEnabled({ timeout: 10_000 });
    await slidesRedo.click();
    await expect(thumbs.nth(0)).toHaveAttribute('data-testid', secondSlideId ?? '', { timeout: 10_000 });
  });

  test('links a Spreadsheet Range via Docs formatting ribbon and tests Living Report manual refresh + recurring schedule lifecycle', async ({
    page,
  }) => {
    const stamp = Date.now();
    const sourceSheetTitle = `E2E Live Source Sheet ${stamp}`;

    // 1) Create Source Workbook v1
    await openCreateDialogFromLibrary(page);
    await page.locator('[data-testid="dialog-starter-spreadsheet"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(sourceSheetTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();
    await expect(page.locator('[data-testid="mj-sheets-shell"]')).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-testid="sheet-cell-A1"]').click();
    await page.locator('[data-testid="sheet-formula-input"]').fill('Metric');
    await page.locator('[data-testid="sheet-formula-apply-btn"]').click();
    await page.locator('[data-testid="sheet-cell-B1"]').click();
    await page.locator('[data-testid="sheet-formula-input"]').fill('ARR');
    await page.locator('[data-testid="sheet-formula-apply-btn"]').click();
    await page.locator('[data-testid="sheet-cell-A2"]').click();
    await page.locator('[data-testid="sheet-formula-input"]').fill('Q4 Total');
    await page.locator('[data-testid="sheet-formula-apply-btn"]').click();
    await page.locator('[data-testid="sheet-cell-B2"]').click();
    await page.locator('[data-testid="sheet-formula-input"]').fill('500');
    await page.locator('[data-testid="sheet-formula-apply-btn"]').click();

    await page.locator('[data-testid="sheet-save-version-btn"]').click();
    await expect(page.locator('[data-testid="sheet-save-version-btn"]')).toContainText(/Saved v\d+/i, {
      timeout: 20_000,
    });
    const sourceSheetIdMatch = page.url().match(/artifactId=([^&]+)/i);
    const sourceSheetId = sourceSheetIdMatch?.[1] ?? '';
    expect(sourceSheetId.length).toBeGreaterThan(10);

    // 2) Create Living Report Doc, link Sheet Range via ribbon button, and test Refresh + Schedule UI
    const livingDocTitle = `E2E Living Report Doc ${stamp}`;
    await openCreateDialogFromLibrary(page);
    await page.locator('[data-testid="dialog-starter-document"]').click();
    await page.locator('[data-testid="library-create-title-input"]').fill(livingDocTitle);
    await page.locator('[data-testid="library-create-submit-btn"]').click();

    await expect(page.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-testid="mode-edit-btn"]').click();

    // Reveal Formatting Ribbon if collapsed, then click Sheet Range button
    if (!(await page.locator('[data-testid="docs-format-ribbon"]').isVisible())) {
      await page.locator('[data-testid="toggle-format-ribbon-btn"]').click();
    }
    await expect(page.locator('[data-testid="fmt-sheet-range-btn"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="fmt-sheet-range-btn"]').click();

    await expect(page.locator('[data-testid="insert-block-modal"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="new-block-artifact-id-input"]').fill(sourceSheetId);
    await page.locator('[data-testid="sheet-embed-range-input"]').fill('A1:B2');
    await page.locator('[data-testid="confirm-insert-block-btn"]').click();

    await expect(page.locator('[data-testid^="ole-artifact-block-"]').first()).toContainText('500', {
      timeout: 25_000,
    });

    await page.locator('[data-testid="save-doc-version-btn"]').click();
    await expect(page.locator('[data-testid="save-doc-version-btn"]')).toContainText(/Saved/i, {
      timeout: 20_000,
    });
    const livingDocUrl = page.url();

    // 2b) Update Source Workbook v2 (B2: 500 -> 750) so Manual Living Report Refresh propagates real data changes
    await page.goto(`${livingDocUrl.split('/app/')[0]}/app/Library?artifactId=${sourceSheetId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('[data-testid="mj-sheets-shell"]')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-testid="sheet-cell-B2"]').click();
    await page.locator('[data-testid="sheet-formula-input"]').fill('750');
    await page.locator('[data-testid="sheet-formula-apply-btn"]').click();
    await page.locator('[data-testid="sheet-save-version-btn"]').click();
    await expect(page.locator('[data-testid="sheet-save-version-btn"]')).toContainText(/Saved v2/i, {
      timeout: 20_000,
    });

    await page.goto(livingDocUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="mj-docs-workspace"]')).toBeVisible({ timeout: 30_000 });

    // 3) Manual Refresh Live Data via GraphQL mutation and verify live workbook change -> Doc v2
    const refreshBtn = page.locator('[data-testid="living-report-refresh-btn"]');
    await expect(refreshBtn).toBeVisible({ timeout: 15_000 });
    const refreshRespPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/graphql') &&
        res.request().method() === 'POST' &&
        (res.request().postData() ?? '').includes('RefreshLivingArtifact'),
      { timeout: 30_000 },
    );
    await refreshBtn.click();
    const refreshResp = await refreshRespPromise;
    expect(refreshResp.status()).toBe(200);
    const refreshJson = (await refreshResp.json()) as {
      data?: {
        RefreshLivingArtifact?: {
          Success?: boolean;
          Changed?: boolean;
          SavedNewVersion?: boolean;
          VersionNumber?: number;
        };
      };
    };
    expect(refreshJson.data?.RefreshLivingArtifact?.Success).toBe(true);
    expect(refreshJson.data?.RefreshLivingArtifact?.Changed).toBe(true);
    expect(refreshJson.data?.RefreshLivingArtifact?.SavedNewVersion).toBe(true);
    expect(refreshJson.data?.RefreshLivingArtifact?.VersionNumber).toBe(2);
    await expect(page.locator('[data-testid^="ole-artifact-block-"]').first()).toContainText('750', {
      timeout: 25_000,
    });

    // 4) Living Report Schedule lifecycle (Create -> Verify Active badge -> Remove)
    await page.locator('[data-testid="living-report-schedule-btn"]').click();
    await expect(page.locator('[data-testid="living-report-schedule-modal"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('[data-testid="living-report-name-input"]').fill(`E2E Living Cadence ${stamp}`);
    await page.locator('[data-testid="living-report-preset-select"]').selectOption('hourly');
    await expect(page.locator('[data-testid="living-report-cron-input"]')).toHaveValue('0 0 * * * *');

    const saveSchedulePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/graphql') &&
        res.request().method() === 'POST' &&
        (res.request().postData() ?? '').includes('UpsertArtifactLivingReportSchedule'),
      { timeout: 25_000 },
    );
    await page.locator('[data-testid="living-report-save-btn"]').click();
    const saveSchedResp = await saveSchedulePromise;
    expect(saveSchedResp.status()).toBe(200);
    const saveSchedJson = (await saveSchedResp.json()) as {
      data?: { UpsertArtifactLivingReportSchedule?: { Success?: boolean; Schedule?: { Enabled?: boolean } } };
    };
    expect(saveSchedJson.data?.UpsertArtifactLivingReportSchedule?.Success).toBe(true);
    expect(saveSchedJson.data?.UpsertArtifactLivingReportSchedule?.Schedule?.Enabled).toBe(true);

    await expect(page.locator('[data-testid="living-report-status-badge"]')).toContainText('Scheduled', {
      timeout: 15_000,
    });

    // Reopen and remove schedule cleanly so database stays clean
    await page.locator('[data-testid="living-report-schedule-btn"]').click();
    await expect(page.locator('[data-testid="living-report-remove-btn"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="living-report-remove-btn"]').click();
    await expect(page.locator('[data-testid="living-report-status-badge"]')).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});
