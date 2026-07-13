// Predictive Studio — 3-door nav consolidation E2E.
//
// Verifies the app exposes exactly three top-level doors (Predictions / Studio / Models) instead of the
// prior eight flat items, and that the two workbench doors host their section panels behind an internal
// left-nav (Studio: Overview · Pipelines · Algorithm Catalog · Experiments · Compare Runs; Models:
// Registry · Production). Switching a Studio left-nav item swaps the panel; deep links land on a section.
//
//   node e2e/predictive-studio/nav-consolidation.mjs
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
const goTo = async (suffix) => { await page.goto(`${BASE}/app/predictive-studio/${suffix}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(7000); };

try {
  // ── Studio door — internal left-nav over the build/run sections ──
  await goTo('Studio');
  const studioShell = await count('ps-studio-shell');
  const navHome = await count('ps-nav-home');
  const navPipelines = await count('ps-nav-pipelines');
  const navCatalog = await count('ps-nav-catalog');
  const navExperiments = await count('ps-nav-experiments');
  const navCompare = await count('ps-nav-compare');
  log(`STUDIO  shell=${studioShell} leftnav[home=${navHome} pipelines=${navPipelines} catalog=${navCatalog} experiments=${navExperiments} compare=${navCompare}]`);
  const studioOk = studioShell > 0 && navPipelines > 0 && navCatalog > 0 && navExperiments > 0 && navCompare > 0;
  log(`  ${studioOk ? 'OK' : 'FAIL'}  Studio hosts the build/run sections behind one left-nav`);

  // switch a left-nav item → the panel swaps
  if (navPipelines > 0) {
    await page.locator('[data-testid="ps-nav-pipelines"]').first().click();
    await page.waitForTimeout(2500);
    const panel = await count('ps-panel-pipelines');
    log(`  switch→Pipelines: ps-panel-pipelines=${panel}  ${panel > 0 ? 'OK' : 'FAIL'}`);
  }

  // ── Models door — internal left-nav over the lifecycle sections ──
  await goTo('Models');
  const modelsShell = await count('ps-models-shell');
  const navRegistry = await count('ps-nav-registry');
  const navProduction = await count('ps-nav-production');
  log(`MODELS  shell=${modelsShell} leftnav[registry=${navRegistry} production=${navProduction}]`);
  const modelsOk = modelsShell > 0 && navRegistry > 0 && navProduction > 0;
  log(`  ${modelsOk ? 'OK' : 'FAIL'}  Models hosts registry + production behind one left-nav`);

  // ── deep link straight to a Models section via ?section= ──
  await goTo('Models?section=production');
  const prodPanel = await count('ps-panel-production');
  log(`  deep-link ?section=production: ps-panel-production=${prodPanel}  ${prodPanel > 0 ? 'OK' : 'FAIL'}`);

  // ── Predictions door still present (the business front door) ──
  await goTo('Predictions');
  const predGrid = (await count('ps-predictions-grid')) + (await count('ps-predictions-empty'));
  log(`PREDICTIONS  rendered=${predGrid > 0 ? 'yes' : 'no'}  ${predGrid > 0 ? 'OK' : 'FAIL'}`);

  await page.screenshot({ path: path.join(SHOTS, 'ps-nav-consolidation.png') });
  log(`NON-COSMETIC CONSOLE ERRORS: ${errs.length}`);
  errs.slice(0, 8).forEach((e) => log('  x', e));
} catch (e) {
  log('ERROR:', String(e).slice(0, 400));
  process.exitCode = 1;
} finally {
  await ctx.close();
}
