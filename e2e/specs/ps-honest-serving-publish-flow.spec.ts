/**
 * Predictive Studio — the publish and sign-off flow and the model detail's lifecycle surfaces (PR 4, D-076). Prerequisites
 * as e2e/README.md (a running MJAPI and Explorer on this build). Every model ID comes from the caller's database (the
 * PS_* env vars below), seeded as the plan's Task M7.6 Step 3 says: the publish through `PredictiveStudio.PromoteModel`,
 * the monitoring rows through `PredictiveStudio.RunModelMonitoring`, the Unevaluated model by the migration's demotion of
 * a pre-change row. Each test reads the DOM and then the matching stored row through the API: after an action it reloads
 * the page, so the publish history it asserts on is what the server returns for `MJ: ML Model Publish Records`, never the
 * component's local state. The runner also checks the rows with sqlcmd (Task M7.6 Step 4).
 *
 * Sign-in: pass a one-time magic-link redemption URL as PS_SIGN_IN_URL for the suite's seeded test user (D4-04); the spec
 * redeems it in each test's own tab (the session lives in that tab's sessionStorage), so the link must allow one
 * redemption per test (`MaxUses` on POST /magic-link/create). Without it the primed profile is used.
 *
 * RUN:
 *   PW_BASE_URL=http://localhost:4241 PW_API_URL=http://localhost:4041 PS_SIGN_IN_URL='<redemption URL>' \
 *   PS_VALIDATED_MODEL_ID=<a Validated model with no leakage flag, under a protocol without requiresHumanSignOff> \
 *   PS_SIGN_OFF_MODEL_ID=<a Validated model under a protocol version with requiresHumanSignOff, withheld no-sign-off> \
 *   PS_AUTO_PUBLISHED_MODEL_ID=<a model auto-train published through the gate> \
 *   PS_WITHHELD_MODEL_ID=<a model whose automatic publish was withheld (a refusal record)> \
 *   PS_MONITORED_MODEL_ID=<a Published model with MJ: ML Monitoring Results rows> \
 *   PS_UNEVALUATED_MODEL_ID=<a pre-change model the migration made Unevaluated> \
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/ps-honest-serving-publish-flow.spec.ts
 */
import { test, expect, EXPLORER_BASE_URL, RedeemSignInLink, RequiredEnv } from '../fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * Open an Explorer path signed in. With PS_SIGN_IN_URL, redeem it in this tab and wait until Explorer has kept the
 * session token (it strips `#token=` from the URL once stored), then load `path`; otherwise the primed profile is used.
 */
async function openSignedIn(page: Page, path: string): Promise<void> {
  const url = process.env.PS_SIGN_IN_URL;
  if (url) await RedeemSignInLink(page, url);
  await page.goto(`${EXPLORER_BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
}

/** Opens the model registry on `modelId` and returns its detail pane. */
async function openModel(page: Page, modelId: string): Promise<Locator> {
  await openSignedIn(page, `/app/predictive-studio/Models?section=registry&modelId=${encodeURIComponent(modelId)}`);
  const detail = page.locator('[data-testid="ps-registry-detail"] [data-testid="ps-model-detail"]');
  await expect(detail).toBeVisible({ timeout: 60_000 });
  return detail;
}

/** Reloads the page (the rows the detail shows are then read from the server again) and returns the detail pane. */
async function reloadModel(page: Page): Promise<Locator> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const detail = page.locator('[data-testid="ps-registry-detail"] [data-testid="ps-model-detail"]');
  await expect(detail).toBeVisible({ timeout: 60_000 });
  return detail;
}

/** Presses the confirm button of the open `mj-confirm-dialog` (its leftmost action). */
async function confirmDialog(page: Page): Promise<void> {
  await page.locator('mj-confirm-dialog mj-dialog-actions button').first().click();
}

/** Opens the detail's publish history tab and returns its rows. */
async function historyRows(detail: Locator): Promise<Locator> {
  await detail.locator('[data-testid="ps-detail-tab-history"]').click();
  const history = detail.locator('[data-testid="ps-publish-history"]');
  await expect(history).toBeVisible();
  return history.locator('[data-testid="ps-publish-history-row"]');
}

test.describe('Predictive Studio — the publish and sign-off flow', () => {
  test('publishes a Validated model from the panel and the publish record names the user', async ({ page }) => {
    const detail = await openModel(page, RequiredEnv('PS_VALIDATED_MODEL_ID'));
    const panel = detail.locator('[data-testid="ps-sign-off-panel"]');
    await expect(panel.locator('[data-testid="ps-evidence-primary"]')).toHaveText(/\d\.\d{3}/, { timeout: 60_000 });
    await panel.locator('[data-testid="ps-sign-off-publish"]').click();
    await confirmDialog(page);
    await expect(detail.locator('[data-testid="ps-lifecycle-chip"]')).toHaveText('Published', { timeout: 60_000 });
    const rows = await historyRows(await reloadModel(page));
    const newest = rows.first();
    await expect(newest).toContainText('Published');
    await expect(newest).not.toContainText('automated gate');
  });

  test('a sign-off then publishes a model held by requiresHumanSignOff', async ({ page }) => {
    const detail = await openModel(page, RequiredEnv('PS_SIGN_OFF_MODEL_ID'));
    const panel = detail.locator('[data-testid="ps-sign-off-panel"]');
    await expect(panel.locator('[data-testid="ps-sign-off-required"]')).toContainText('Sign-off required by the protocol', { timeout: 60_000 });
    await expect(panel.locator('[data-testid="ps-sign-off-publish"]')).toBeDisabled();
    await panel.locator('[data-testid="ps-sign-off-reason"]').fill('reviewed the holdout evidence and the data window');
    await panel.locator('[data-testid="ps-sign-off-approve"]').click();
    await confirmDialog(page);
    await expect(panel.locator('[data-testid="ps-sign-off-recorded"]')).toBeVisible({ timeout: 60_000 });
    await panel.locator('[data-testid="ps-sign-off-publish"]').click();
    await confirmDialog(page);
    await expect(detail.locator('[data-testid="ps-lifecycle-chip"]')).toHaveText('Published', { timeout: 60_000 });
    const rows = await historyRows(await reloadModel(page));
    await expect(rows.filter({ hasText: 'Sign-off: approved' })).toHaveCount(1);
    await expect(rows.first()).toContainText('Published');
  });
});

test.describe('Predictive Studio — the model detail tabs', () => {
  test('the publish history shows an automatic publish and a withheld one with their initiators', async ({ page }) => {
    const auto = await historyRows(await openModel(page, RequiredEnv('PS_AUTO_PUBLISHED_MODEL_ID')));
    const published = auto.filter({ hasText: 'automated gate' }).first();
    await expect(published).toContainText('Published', { timeout: 60_000 });
    await expect(published.locator('[data-testid="ps-publish-initiator"]')).toHaveAttribute('data-record-id', /[0-9A-Fa-f-]{36}/);

    const withheld = await historyRows(await openModel(page, RequiredEnv('PS_WITHHELD_MODEL_ID')));
    const refusal = withheld.filter({ hasText: 'withheld' }).first();
    await expect(refusal).toBeVisible({ timeout: 60_000 });
    await expect(refusal.locator('[data-testid="ps-publish-refusal"]')).toHaveText(/\w+ \w+/);
    await expect(refusal.locator('[data-testid="ps-publish-initiator"]')).not.toHaveText('');
  });

  test('the monitoring tab renders the rows RunModelMonitoring wrote', async ({ page }) => {
    const detail = await openModel(page, RequiredEnv('PS_MONITORED_MODEL_ID'));
    await detail.locator('[data-testid="ps-detail-tab-monitoring"]').click();
    const monitoring = detail.locator('[data-testid="ps-model-monitoring"]');
    const periods = monitoring.locator('[data-testid="ps-monitoring-period"]');
    await expect(periods.first()).toBeVisible({ timeout: 60_000 });
    const periodCount = await periods.count();
    const evaluated = await periods.filter({ hasText: 'evaluated' }).count();
    expect(periodCount).toBeGreaterThan(0);
    await expect(monitoring.locator('[data-testid="ps-monitoring-point"]')).toHaveCount(evaluated);
  });

  test('an Unevaluated model shows its chip and reason', async ({ page }) => {
    const detail = await openModel(page, RequiredEnv('PS_UNEVALUATED_MODEL_ID'));
    await expect(detail.locator('[data-testid="ps-lifecycle-chip"]')).toContainText('retrain to publish', { timeout: 60_000 });
    await expect(detail.locator('[data-testid="ps-lifecycle-reason"]')).toContainText('Trained before the Predictive Studio lifecycle gate');
    const row = page.locator('[data-testid="ps-registry-row"].sel');
    await expect(row.locator('[data-testid="ps-lifecycle-chip"]')).toContainText('Unevaluated');
  });
});
