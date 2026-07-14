/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Composer draft persistence — Playwright UI tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS (UserInfoEngine-backed drafts, key mj.chat.drafts.v1):
 *   • A draft typed into the NEW-conversation composer (including a resolved
 *     agent mention pill staged via the omnibar) survives a FULL PAGE RELOAD:
 *     the pill rehydrates as a pill (not text) and the typed tail is intact.
 *   • Clearing the composer clears the persisted draft (no ghost restore).
 *
 * PREREQUISITES: MJAPI + MJExplorer running, primed auth profile (see
 * user-routines.spec.ts). Drafts persist per-user server-side, so this spec
 * cleans up after itself by clearing the composer at the end.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { ensureOmnibarEnabled } from '../omnibar-optin';

/**
 * Deterministic persistence sync: the draft pipeline logs '[Drafts]' at each stage
 * (chat-area change → store SetDraft → Flush). Waiting on those signals instead of
 * fixed sleeps removes every timing race (cold Vite chunk loads, GraphQL RTT) and
 * pinpoints the failing stage when something regresses.
 */
function collectConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (m) => lines.push(m.text()));
  return lines;
}

async function waitForLine(lines: string[], pattern: RegExp, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let seen = 0;
  while (Date.now() - start < timeoutMs) {
    for (; seen < lines.length; seen++) {
      if (pattern.test(lines[seen])) {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`console signal not seen within ${timeoutMs}ms: ${pattern}`);
}

async function bootToShell(page: Page): Promise<void> {
  // Boot straight into the Chat app — the workspace's restored active tab varies
  // across runs, and this spec needs the conversations composer on screen.
  await page.goto('/app/Chat', { waitUntil: 'domcontentloaded' });
  const reset = page.getByRole('button', { name: /reset/i });
  try {
    await reset.waitFor({ timeout: 15_000 });
    await reset.click();
    await page.goto('/app/Chat', { waitUntil: 'domcontentloaded' });
  } catch { /* normal boot */ }
  await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 120_000 });
  // The omnibar is per-user OPT-IN — this spec stages pills through it.
  await ensureOmnibarEnabled(page);
}

const visibleComposer = (page: Page) =>
  page.locator('mj-mention-editor [contenteditable="true"]:visible').first();

test.describe.serial('Composer draft persistence', () => {
  test('pill + text draft survives a full page reload', async ({ page }) => {
    const consoleLines = collectConsole(page);
    await bootToShell(page);

    // Stage a pill via the omnibar, then type a tail.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await expect(page.locator('.omnibar-palette')).toBeVisible({ timeout: 15_000 });
    await page.locator('.ob-input').fill('@sage');
    await page.locator('.ob-row', { hasText: 'Sage' }).first().click();
    const composer = visibleComposer(page);
    await expect(composer.locator('.mention-chip[data-mention-name="Sage"]')).toBeVisible({ timeout: 30_000 });
    await composer.click();
    await page.keyboard.press('End');
    await page.keyboard.type('summarize this week before I forget');
    await expect(composer).toContainText('summarize this week before I forget');

    // DETERMINISTIC persist sync: the typed tail must be REGISTERED by the store
    // (pill token ≈146 chars + 35-char tail ⇒ >170), then blur must FLUSH, then
    // the immediate server save needs its round trip before reload.
    await waitForLine(consoleLines, /\[Drafts\] SetDraft\('new'\): 1[7-9][0-9] chars/, 15_000);
    await page.locator('body').click({ position: { x: 5, y: 200 } });
    await waitForLine(consoleLines, /\[Drafts\] Flush: persisting/, 10_000);
    await page.waitForTimeout(2_500);

    // Full reload — a brand-new Angular app instance.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 120_000 });

    // Back into chat: the draft must restore — pill as a PILL, tail intact.
    const restored = visibleComposer(page);
    await expect(restored.locator('.mention-chip[data-mention-name="Sage"]')).toBeVisible({ timeout: 60_000 });
    await expect(restored).toContainText('summarize this week before I forget');
  });

  test('clearing the composer clears the persisted draft (no ghost on reload)', async ({ page }) => {
    // SELF-CONTAINED: stage + persist a draft first (no dependence on prior tests).
    await bootToShell(page);
    let composer = visibleComposer(page);
    await composer.click();
    await page.keyboard.type('ghost check draft');
    await page.locator('body').click({ position: { x: 5, y: 200 } });
    // Blur fires an IMMEDIATE server save — give the GraphQL round trip time to
    // land before reload kills the page (reloading mid-flight loses the write).
    await page.waitForTimeout(4_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 120_000 });
    composer = visibleComposer(page);
    await expect(composer).toContainText('ghost check draft', { timeout: 60_000 }); // precondition: restore works
    // Select-all + delete, then blur to flush the (now empty ⇒ deleted) draft.
    await composer.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.keyboard.press('Delete');
    await page.locator('body').click({ position: { x: 5, y: 200 } });
    // Blur fires an IMMEDIATE server save — give the GraphQL round trip time to
    // land before reload kills the page (reloading mid-flight loses the write).
    await page.waitForTimeout(4_000);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 120_000 });
    const after = visibleComposer(page);
    await expect(after).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_000); // give any (wrong) restore a chance to appear
    await expect(after).not.toContainText('ghost check draft');
    await expect(after.locator('.mention-chip')).toHaveCount(0);
  });
});
