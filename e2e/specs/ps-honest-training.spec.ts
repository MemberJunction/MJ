/**
 * Predictive Studio surfaces that render a training run's stored gate decision. Prerequisites as e2e/README.md (a
 * running MJAPI and Explorer, a primed signed-in profile). The record names come from the caller's database (the PS_*
 * env vars below), so the spec asserts on real stored decisions, not fixtures. Where the primed profile cannot sign in
 * (no Auth0 callback for the Explorer's port), pass a one-time magic-link redemption URL as PS_SIGN_IN_URL: the spec
 * redeems it in its own tab first (the session lives in that tab's sessionStorage). Every test opens its own tab, so the
 * link must allow one redemption per test (`MaxUses` on POST /magic-link/create).
 *
 * RUN (add PS_SIGN_IN_URL='<redemption URL from POST /magic-link/create>' when signing in by magic link):
 *   PW_BASE_URL=http://localhost:4201 PW_API_URL=http://localhost:4001 \
 *   PS_C1_CARD_NAME='<a published model whose run kept a simple baseline (glm)>' \
 *   PS_W7_CARD_NAME='<a published model whose run stored no-signal>' \
 *   PS_C1_UNIT_NAME='<a Prediction Unit lineage>' PS_C1_PROTOCOL_NAME='<an Evaluation Protocol lineage with a bound pipeline>' \
 *   PS_C1_PIPELINE_ID=<a pipeline bound to an older version of that protocol> PS_C1_MODEL_ID=<a model trained under a protocol> \
 *   PS_LEGACY_MODEL_ID=<a model trained without a Prediction Unit> \
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/ps-honest-training.spec.ts
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

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

const record = (entity: string, id: string): string => `${BASE}/app/predictive-studio/record/${encodeURIComponent(entity)}/${id}`;

// The record panels register when the Predictive Studio chunk loads, so a record form is opened inside the app after the
// Studio door has loaded that chunk, never by a cold page load. The app-scoped record URL is used: the shell opens it as a
// new record tab, while the legacy /resource/record/ URL on this in-page navigation lands on the app's default door.
async function openRecordInApp(page: Page, entity: string, id: string): Promise<void> {
  await openSignedIn(page, '/app/predictive-studio/Studio');
  await expect(page.locator('mj-ps-studio-resource')).toBeVisible();
  const target = new URL(record(entity, id)).pathname;
  await page.evaluate((p) => { history.pushState(null, '', p); dispatchEvent(new PopStateEvent('popstate')); }, target);
}

/** Opens the latest version of the named lineage from a Studio list section, on its record form. */
async function openLineage(page: Page, section: 'units' | 'protocols', name: string): Promise<void> {
  await openSignedIn(page, `/app/predictive-studio/Studio?section=${section}`);
  await page.locator('[data-testid="ps-versioned-row"]', { hasText: name }).locator('[data-testid="ps-versioned-open"]').click();
}

async function expectReadable(page: Page, selector: string): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    // The theme switch animates colors; measured mid-transition, a background still on the old theme's color fails. Wait
    // for the CSS transitions only (a looping animation never finishes); a cancelled transition has settled too.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.then(() => undefined, () => undefined))));
    const r = await new AxeBuilder({ page }).include(selector).withRules(['color-contrast']).analyze();
    expect(r.violations.map((v) => `${theme}: ${v.id} ${v.nodes.length}`)).toEqual([]);
  }
}

test.describe.serial('Predictive Studio — unit and protocol surfaces', () => {
  test('Prediction Units: the C1 lineage is listed and "Create version N+1" with window 365 saves a new version', async ({ page }) => {
    await openLineage(page, 'units', need('PS_C1_UNIT_NAME'));
    const versions = page.locator('[data-testid="ps-unit-version-list"] li');
    await expect(versions.first()).toBeVisible();
    const before = await versions.count();
    await page.locator('[data-testid="ps-unit-edit"]').click();
    await page.locator('[data-testid="ps-unit-window"]').fill('365');
    await page.locator('[data-testid="ps-unit-save"]').click();
    await expect(versions).toHaveCount(before + 1);
  });

  test('Evaluation Protocols: a negative margin is refused in the editor and 0.002 saves the next version', async ({ page }) => {
    await openLineage(page, 'protocols', need('PS_C1_PROTOCOL_NAME'));
    const versions = page.locator('[data-testid="ps-protocol-version-list"] li');
    await expect(versions.first()).toBeVisible();
    const before = await versions.count();
    await page.locator('[data-testid="ps-protocol-edit"]').click();
    await page.locator('#ps-margin').fill('-1');
    await expect(page.locator('[data-testid="ps-protocol-refusals"]')).toContainText('The margin must be a number >= 0');
    await expect(page.locator('[data-testid="ps-protocol-save"]')).toBeDisabled();
    await page.locator('#ps-margin').fill('0.002');
    await expect(page.locator('[data-testid="ps-protocol-save"]')).toBeEnabled();
    await page.locator('[data-testid="ps-protocol-save"]').click();
    await expect(versions).toHaveCount(before + 1);
  });

  test('the pipeline bindings panel moves the C1 pipeline to the newest protocol version', async ({ page }) => {
    await openRecordInApp(page, 'MJ: ML Training Pipelines', need('PS_C1_PIPELINE_ID'));
    await expect(page.locator('[data-testid="ps-pipeline-bindings"]')).toBeVisible();
    await page.locator('[data-testid="ps-bind-latest-protocol"]').click();
    await expect(page.locator('[data-testid="ps-bind-latest-protocol"]')).toHaveCount(0);
  });

  test('the model form shows the stored protocol results, readable in light and dark themes', async ({ page }) => {
    await openRecordInApp(page, 'MJ: ML Models', need('PS_C1_MODEL_ID'));
    const evalPanel = page.locator('mj-ps-model-evaluation-panel mj-collapsible-panel[data-section-key="ps-model-evaluation"]');
    await expect(evalPanel).toHaveCount(1);
    await expect(evalPanel.locator('.mj-forms-panel-header')).toContainText('Evaluation (protocol results)');
    await expect(page.locator('[data-testid="ps-eval-outcome"]')).toBeVisible();
    await expect(page.locator('[data-testid="ps-eval-reason"]')).toContainText('[');
    expect(await page.locator('[data-testid="ps-eval-baseline"]').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-testid="ps-eval-optimistic"]')).toContainText('optimistic');
    await expect(page.locator('[data-testid="ps-eval-calibration"]')).toContainText('slope');
    await expect(page.locator('[data-testid="ps-eval-leakage"], [data-testid="ps-eval-leakage-none"]')).toHaveCount(1);
    await expectReadable(page, '[data-testid="ps-eval"]');
    await openRecordInApp(page, 'MJ: ML Models', need('PS_LEGACY_MODEL_ID'));
    const legacyEvalPanel = page.locator('mj-ps-model-evaluation-panel mj-collapsible-panel[data-section-key="ps-model-evaluation"]');
    await expect(legacyEvalPanel).toHaveCount(1);
    await expect(legacyEvalPanel.locator('.mj-forms-panel-header')).toContainText('Evaluation (protocol results)');
    await expect(page.locator('[data-testid="ps-eval-empty"]')).toContainText('not evaluated under an Evaluation Protocol');
  });
});
