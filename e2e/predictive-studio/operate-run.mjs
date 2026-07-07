// Predictive Studio — Operate "Run now" end-to-end driver.
//
// Drives the Models-in-Production tab against a SIGNED-IN persistent profile (the same
// `.playwright-cli/profile` the e2e fixtures + overlay drivers use): select a published model →
// open the Operate dialog → Run now (generic, Everyone scope) → wait for the run → drill into the
// run's per-record predictions. Proves the full stack: browser → GraphQL CreateScoringProcess +
// RunNow → server → sidecar → Process Run Details → reactive run-history refresh → drill-in.
//
// This is the driver that surfaced (and now guards) the virtual-feature train/serve skew: a healthy
// run shows the per-record predictions VARYING — see plans/predictive-studio-scoring-virtualfield-skew.md.
//
//   node e2e/predictive-studio/operate-run.mjs
//
// Env:
//   MJ_EXPLORER_URL   base URL (default http://localhost:4201)
//   PW_HEADED=1       run headed (default headless)
//   PW_PROFILE_DIR    override the signed-in profile dir
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // e2e/predictive-studio
const ROOT = path.resolve(HERE, '..', '..'); // repo root
const PROFILE = process.env.PW_PROFILE_DIR ?? path.join(ROOT, '.playwright-cli', 'profile');
const SHOTS = path.join(ROOT, '.playwright-cli', 'shots'); // gitignored
const BASE_URL = process.env.MJ_EXPLORER_URL ?? 'http://localhost:4201';
const HEADED = process.env.PW_HEADED === '1';
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(...a);

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: !HEADED, viewport: { width: 1680, height: 1000 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!/gravatar|ERR_FAILED|net::|favicon|JWT_EXPIRED|401/i.test(t)) errs.push(t.slice(0, 160));
    }
  });
  const count = (tid) => page.locator(`[data-testid="${tid}"]`).count().catch(() => 0);

  try {
    await page.goto(`${BASE_URL}/app/predictive-studio/Models%20in%20Production`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    if (await count('ps-production-row')) {
      await page.locator('[data-testid="ps-production-row"]').first().click();
      await page.waitForTimeout(1200);
    }
    const runsBefore = await count('ps-production-run');
    log('runs BEFORE operate:', runsBefore);

    await page.locator('[data-testid="ps-production-operate"]').first().click();
    await page.locator('[data-testid="ps-operate-dialog"]').first().waitFor({ state: 'visible', timeout: 8000 });
    log('Operate dialog open. Defaults: scope=Everyone, output=generic. Clicking Run now…');
    await page.locator('[data-testid="ps-operate-run"]').first().click();

    // The run scores the whole entity via the sidecar; the dialog closes on success.
    let closed = false;
    try {
      await page.locator('[data-testid="ps-operate-dialog"]').first().waitFor({ state: 'hidden', timeout: 120000 });
      closed = true;
    } catch {}
    log('dialog closed (run completed):', closed);
    await page.waitForTimeout(4000); // let the reactive run-history reload settle

    const runsAfter = await count('ps-production-run');
    log('runs AFTER operate:', runsAfter, runsAfter > runsBefore ? '(NEW RUN appeared ✓)' : '(no new run row)');

    if (runsAfter > 0) {
      await page.locator('[data-testid="ps-production-run"]').first().click();
      await page.waitForTimeout(2500);
      const rows = page.locator('[data-testid="ps-production-run-detail"] tbody tr');
      const predRows = await rows.count().catch(() => 0);
      const scores = (await rows.allInnerTexts().catch(() => [])).map((t) => (t.match(/\d\.\d+/) ?? [])[0]).filter(Boolean);
      const distinct = new Set(scores).size;
      log('run drill-in: per-record prediction rows =', predRows, '· distinct scores (sampled) =', distinct);
      log('  →', distinct > 1 ? 'predictions VARY ✓ (no skew)' : 'predictions look CONSTANT — investigate skew');
    }
    await page.screenshot({ path: path.join(SHOTS, 'ps-operate-run.png') });
    log('non-cosmetic console errors:', errs.length);
    errs.slice(0, 6).forEach((e) => log('  x', e));
  } catch (e) {
    log('ERROR:', String(e).slice(0, 400));
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

main();
