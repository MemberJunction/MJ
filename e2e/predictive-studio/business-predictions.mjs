// Predictive Studio — business Predictions surface E2E.
//
// Navigates to the new default "Predictions" nav item, verifies the catalog renders (cards + trust
// badges, or a clean empty state), opens a prediction → the trust-gated workspace (banner + action bar
// + at-risk list / empty), returns to the catalog, and checks for non-cosmetic console errors.
//
//   node e2e/predictive-studio/business-predictions.mjs
// Env: MJ_EXPLORER_URL (default http://localhost:4201) · PW_HEADED=1 · PW_PROFILE_DIR
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PROFILE = process.env.PW_PROFILE_DIR ?? path.join(ROOT, '.playwright-cli', 'profile');
const SHOTS = path.join(ROOT, '.playwright-cli', 'shots');
const BASE = process.env.MJ_EXPLORER_URL ?? 'http://localhost:4201';
fs.mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log(...a);

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: process.env.PW_HEADED !== '1', viewport: { width: 1680, height: 1000 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/gravatar|ERR_FAILED|net::|favicon|JWT_EXPIRED|401/i.test(t)) errs.push(t.slice(0, 160)); } });
const count = (tid) => page.locator(`[data-testid="${tid}"]`).count().catch(() => 0);

try {
  await page.goto(`${BASE}/app/predictive-studio/Predictions`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const grid = await count('ps-predictions-grid');
  const empty = await count('ps-predictions-empty');
  const cards = await count('ps-prediction-card');
  const badges = await count('ps-trust-badge');
  const newBtn = await count('ps-new-prediction');
  log(`CATALOG  grid=${grid} empty=${empty} cards=${cards} trustBadges=${badges} newPredictionBtn=${newBtn}`);
  log(`  ${grid > 0 || empty > 0 ? 'OK' : 'FAIL'}  Predictions surface rendered`);

  const openable = await count('ps-open-prediction');
  log(`  openable prediction cards: ${openable}`);
  if (openable > 0) {
    await page.locator('[data-testid="ps-open-prediction"]').first().click();
    await page.waitForTimeout(4500);
    const banner = await count('ps-trust-banner');
    const bar = await count('ps-action-bar');
    const list = await count('ps-atrisk-list');
    const emptyList = await count('ps-atrisk-empty');
    const rows = await page.locator('[data-testid="ps-atrisk-row"]').count().catch(() => 0);
    log(`WORKSPACE  trustBanner=${banner} actionBar=${bar} atRiskList=${list} (rows=${rows}) emptyList=${emptyList}`);
    log(`  ${banner > 0 && bar > 0 ? 'OK' : 'FAIL'}  trust-gated workspace rendered`);
    await page.locator('[data-testid="ps-crumb-home"]').first().click().catch(() => {});
    await page.waitForTimeout(1200);
    log(`  back to catalog: grid=${await count('ps-predictions-grid')}`);
  }

  await page.screenshot({ path: path.join(SHOTS, 'ps-predictions.png') });
  log(`NON-COSMETIC CONSOLE ERRORS: ${errs.length}`);
  errs.slice(0, 8).forEach((e) => log('  x', e));
} catch (e) {
  log('ERROR:', String(e).slice(0, 400));
  process.exitCode = 1;
} finally {
  await ctx.close();
}
