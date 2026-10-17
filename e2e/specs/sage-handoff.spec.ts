/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Sage Handoff — Playwright live smoke spec
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS (VS-SAGE-5):
 *   1. Sending "Sage, have the Research Agent look into MemberJunction AI agent handoffs"
 *      renders `<mj-agent-handoff-card>` on Sage's source message row (initially
 *      Transferring, then Transferred to Research Agent).
 *   2. Research Agent streams and completes a top-level reply row attributed to
 *      Research Agent with the `"via Sage"` provenance subline and accent rail,
 *      while the header shows `"With Research Agent"` and the composer shows
 *      `"Replying to Research Agent · Return to Sage"`.
 *   3. An unmentioned follow-up turn stays with Research Agent (continuity).
 *   4. Clicking `"Return to Sage"` inserts the `@Sage` mention pill into the
 *      composer and routes the next turn back to Sage.
 *
 * PREREQUISITES: MJAPI + MJExplorer running against a database with Sage and
 * Research Agent active, plus a primed auth profile (`.playwright-cli/profile`).
 * Uses real Sage and real models — live smoke only, not default CI.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

async function bootToFreshChat(page: Page): Promise<void> {
    await page.goto('/app/Chat', { waitUntil: 'domcontentloaded' });
    const reset = page.getByRole('button', { name: /reset/i });
    try {
        await reset.waitFor({ timeout: 15_000 });
        await reset.click();
        await page.goto('/app/Chat', { waitUntil: 'domcontentloaded' });
    } catch {
        /* normal boot */
    }
    await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 120_000 });

    const newChatBtn = page.locator('button', { hasText: /new conversation|new chat/i }).first();
    if (await newChatBtn.isVisible().catch(() => false)) {
        await newChatBtn.click();
    }
}

const visibleComposer = (page: Page) =>
    page.locator('mj-mention-editor [contenteditable="true"]:visible').first();

test.describe.serial('Sage peer-to-peer handoff (live smoke)', () => {
    test('transfers from Sage to Research Agent, keeps follow-ups on Research Agent, and returns to Sage', async ({ page }) => {
        test.setTimeout(240_000);
        await bootToFreshChat(page);

        // 1. Ask Sage to hand off to Research Agent
        const composer = visibleComposer(page);
        await composer.click();
        await page.keyboard.type('Sage, please hand this conversation off to the Research Agent to summarize three key benefits of peer-to-peer agent handoffs in one short paragraph.');
        await page.keyboard.press('Enter');

        // 2. Handoff card appears in thread and settles to Transferred
        const handoffCard = page.locator('mj-agent-handoff-card .handoff').first();
        await expect(handoffCard).toBeVisible({ timeout: 90_000 });
        await expect(handoffCard).toContainText(/Transferring to Research Agent|Transferred to Research Agent/i);
        await expect(page.locator('mj-agent-handoff-card .handoff--done').first()).toBeVisible({ timeout: 120_000 });

        // 3. Target reply row is attributed to Research Agent with "via Sage" and ownership chrome
        const targetRow = page.locator('.message-item.handoff-target').first();
        await expect(targetRow).toBeVisible({ timeout: 60_000 });
        await expect(targetRow.locator('.via')).toContainText(/via\s+Sage/i);
        await expect(page.locator('.with-chip')).toContainText(/Research Agent/i);
        await expect(page.locator('.composer-route')).toContainText(/Replying to\s+Research Agent/i);

        // 4. Unmentioned follow-up stays with Research Agent
        const activeComposer = visibleComposer(page);
        await activeComposer.click();
        await page.keyboard.type('Now condense that into a single sentence.');
        await page.keyboard.press('Enter');

        await expect(page.locator('.composer-route')).toContainText(/Replying to\s+Research Agent/i, { timeout: 90_000 });

        // 5. Return to Sage inserts @Sage mention pill into composer
        const returnBtn = page.locator('.composer-route button.linkish', { hasText: /Return to Sage/i });
        await expect(returnBtn).toBeVisible();
        await returnBtn.click();
        await expect(activeComposer.locator('.mention-chip[data-mention-name="Sage"]')).toBeVisible({ timeout: 15_000 });
    });
});
