/**
 * The record panel's predictions as Feature Values (PR 4 M5b.9, D-076): a scored record's form shows the binding's
 * latest prediction with its lineage to a user who holds the binding's view authorization, and no prediction card —
 * only the "Derived values" section — to a user who does not. Every assertion reads the DOM and the matching database
 * row, so the spec checks real stored predictions, not fixtures.
 *
 * Prerequisites as e2e/README.md: MJAPI and Explorer running on the milestone's build (§2.4: MJAPI :4041, Explorer
 * :4241). Each identity signs in by a one-time magic-link redemption URL (POST /magic-link/create, `MaxUses` 1 per test
 * that uses it, `ApplicationId` the Predictive Studio application: a magic-link session is scoped to its invite's
 * application, so a Data Explorer link cannot open the Studio); the session lives in the test's own tab. The scored record and the binding's feature come from the
 * caller's database: a record of PS_SCORED_ENTITY_NAME scored by the binding (with at least one pipeline Feature Value,
 * so the restricted user's Derived values section has a row). The database is read through PS_SQLCMD: a JSON array of
 * the sqlcmd argv without the query, e.g. '["sqlcmd","-S","localhost,1433","-U","sa","-P","…","-d","MJ_PS_PR4_claude","-C","-h","-1","-W"]'.
 *
 * RUN:
 *   PW_BASE_URL=http://localhost:4241 PW_API_URL=http://localhost:4041 \
 *   PS_AUTHORIZED_SIGN_IN_URL='<redemption URL of a Developer>' PS_RESTRICTED_SIGN_IN_URL='<redemption URL of a UI-only user>' \
 *   PS_SCORED_ENTITY_NAME='<the binding target entity name>' PS_SCORED_PERSON_ID=<a scored record ID> \
 *   PS_BINDING_FEATURE_NAME='<the binding feature name>' PS_SQLCMD='<sqlcmd argv as JSON>' \
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/ps-honest-serving-record-panel.spec.ts
 */
import { execFileSync } from 'child_process';
import { test, expect, EXPLORER_BASE_URL, RedeemSignInLink, RequiredEnv } from '../fixtures';
import type { Page } from '@playwright/test';

/** A SQL string literal of `value` (quotes doubled). */
function sqlText(value: string): string {
  return `N'${value.replace(/'/g, "''")}'`;
}

/** The rows of `query` through PS_SQLCMD, each row's columns split on its `|` separator. */
function sqlRows(query: string): string[][] {
  const argv: unknown = JSON.parse(RequiredEnv('PS_SQLCMD'));
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((a): a is string => typeof a === 'string')) {
    throw new Error('PS_SQLCMD must be a JSON array of strings (the sqlcmd argv without the query)');
  }
  const [cmd, ...args] = argv;
  const out = execFileSync(cmd, [...args, '-s', '|', '-Q', `SET NOCOUNT ON; ${query}`], { encoding: 'utf8' });
  return out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0).map((l) => l.split('|').map((c) => c.trim()));
}

/** The binding's latest stored prediction of the scored record, with its scoring run's model version. */
interface StoredPrediction {
  ValueNumeric: number;
  ModelVersion: number;
  ScoringRunID: string;
  BindingID: string;
}

function storedPrediction(): StoredPrediction {
  const rows = sqlRows(
    `SELECT l.ValueNumeric, r.ModelVersion, l.MLScoringRunID, l.MLModelScoringBindingID FROM __mj.vwLatestFeatureValues l ` +
    `JOIN __mj.MLScoringRun r ON r.ID = l.MLScoringRunID ` +
    `WHERE l.RecordID = ${sqlText(RequiredEnv('PS_SCORED_PERSON_ID'))} AND l.FeatureName = ${sqlText(RequiredEnv('PS_BINDING_FEATURE_NAME'))} AND l.Source = N'Model'`,
  );
  if (rows.length !== 1) throw new Error(`expected one latest Model value of the scored record, found ${rows.length}`);
  const [value, version, run, binding] = rows[0];
  return { ValueNumeric: Number(value), ModelVersion: Number(version), ScoringRunID: run, BindingID: binding };
}

/**
 * Open the scored record's form signed in as the identity of `signInUrl`. The app-scoped record URL is used, after the
 * Predictive Studio door has loaded (PR 3's form: the shell opens it as a record tab on in-page navigation).
 */
async function openScoredRecord(page: Page, signInUrl: string): Promise<void> {
  await RedeemSignInLink(page, signInUrl);
  await page.goto(`${EXPLORER_BASE_URL}/app/predictive-studio/Studio`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('mj-ps-studio-resource')).toBeVisible({ timeout: 60_000 });
  const target = `/app/predictive-studio/record/${encodeURIComponent(RequiredEnv('PS_SCORED_ENTITY_NAME'))}/${RequiredEnv('PS_SCORED_PERSON_ID')}`;
  await page.evaluate((p) => { history.pushState(null, '', p); dispatchEvent(new PopStateEvent('popstate')); }, target);
  await expect(page.locator('mj-model-prediction-panel')).toHaveCount(1, { timeout: 60_000 });
}

test.describe('Predictive Studio — the record panel reads predictions from Feature Values', () => {
  test('an authorized user sees the prediction with its lineage on a scored Person', async ({ page }) => {
    const stored = storedPrediction();
    await openScoredRecord(page, RequiredEnv('PS_AUTHORIZED_SIGN_IN_URL'));
    // the card's title is the model's record-panel label, so the binding's card is found by its binding ID
    const card = page.locator(`[data-testid="ps-prediction-card"][data-binding-id="${stored.BindingID}" i]`);
    await expect(card).toHaveCount(1, { timeout: 60_000 });
    await expect(card.locator('[data-testid="ps-prediction-value"]')).toContainText(`${Math.round(stored.ValueNumeric * 100)}%`);
    const lineage = card.locator('[data-testid="ps-prediction-lineage"]');
    await expect(lineage).toContainText(`v${stored.ModelVersion}`);
    // sqlcmd prints a uniqueidentifier in lower case; the panel shows the ID as the provider returns it
    await expect(lineage).toContainText(new RegExp(stored.ScoringRunID, 'i'));
  });

  test('a restricted user sees no prediction card and the Derived values section only', async ({ page }) => {
    // the prediction is stored: its absence from the page is the view gate, not a missing score
    expect(storedPrediction().ScoringRunID.length).toBeGreaterThan(0);
    const pipelineValues = sqlRows(
      `SELECT COUNT(*) FROM __mj.vwFeatureValues WHERE RecordID = ${sqlText(RequiredEnv('PS_SCORED_PERSON_ID'))} AND RecordProcessID IS NOT NULL AND Role = N'Champion'`,
    );
    expect(Number(pipelineValues[0][0])).toBeGreaterThan(0);
    await openScoredRecord(page, RequiredEnv('PS_RESTRICTED_SIGN_IN_URL'));
    await expect(page.locator('[data-testid="ps-derived-values"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid="ps-prediction-card"]')).toHaveCount(0);
  });
});
