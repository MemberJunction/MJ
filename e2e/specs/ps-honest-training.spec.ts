/**
 * Predictive Studio surfaces that render a training run's stored gate decision. Prerequisites as e2e/README.md (a
 * running MJAPI and Explorer, a primed signed-in profile). The record names come from the caller's database (the PS_*
 * env vars below), so the spec asserts on real stored decisions, not fixtures. Where the primed profile cannot sign in
 * (no Auth0 callback for the Explorer's port), pass a one-time magic-link redemption URL as PS_SIGN_IN_URL: the spec
 * redeems it in its own tab first (the session lives in that tab's sessionStorage).
 *
 * RUN:
 *   PW_BASE_URL=http://localhost:4201 PW_API_URL=http://localhost:4001 \
 *   PS_C1_CARD_NAME='<a published model whose run kept a simple baseline (glm)>' \
 *   PS_W7_CARD_NAME='<a published model whose run stored no-signal>' \
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/ps-honest-training.spec.ts
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

const BASE = process.env.PW_BASE_URL || 'http://localhost:4201';

/** A required environment value, or a thrown error naming it. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (see the spec header)`);
  return v;
}

/**
 * Open an Explorer path signed in. With PS_SIGN_IN_URL, redeem it in this tab and wait until Explorer has kept the
 * session token (it strips `#token=` from the URL once stored), then load `path`; otherwise the primed profile is used.
 */
async function openSignedIn(page: Page, path: string): Promise<void> {
  const url = process.env.PS_SIGN_IN_URL;
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Continue to sign in' }).click();
    await page.waitForURL((u) => u.href.startsWith(BASE), { timeout: 60_000 });
    await page.waitForFunction(() => !window.location.hash.includes('token='), undefined, { timeout: 60_000 });
  }
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
}

test.describe('Predictive Studio — trust cards render the stored gate decision', () => {
  test('a keep-simple-baseline model ships as a simple baseline and a no-signal model does not open', async ({ page }) => {
    await openSignedIn(page, '/app/predictive-studio/Predictions');
    const c1 = page.locator('[data-testid="ps-prediction-card"]', { hasText: need('PS_C1_CARD_NAME') });
    await expect(c1.locator('[data-testid="ps-trust-badge"]')).toContainText('Ships — a simple baseline', { timeout: 60_000 });
    await expect(c1).toContainText('A simple baseline (glm) beats the flat guess by');
    await expect(c1.locator('[data-testid="ps-open-prediction"]')).toHaveCount(1);
    const w7 = page.locator('[data-testid="ps-prediction-card"]', { hasText: need('PS_W7_CARD_NAME') });
    await expect(w7.locator('[data-testid="ps-trust-badge"]')).toContainText('No signal — not usable');
    await expect(w7.locator('[data-testid="ps-open-prediction"]')).toHaveCount(0);
  });
});
