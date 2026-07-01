// Predictive Studio — nav-item health sweep.
//
// Visits each of the 7 Predictive Studio nav items against a SIGNED-IN persistent profile and asserts
// the panel loads with no non-cosmetic console errors. A fast "no broken surface" smoke check.
//
//   node e2e/predictive-studio/nav-health.mjs
//
// Env:
//   MJ_EXPLORER_URL   base URL (default http://localhost:4201)
//   PW_HEADED=1       run headed (default headless)
//   PW_PROFILE_DIR    override the signed-in profile dir
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PROFILE = process.env.PW_PROFILE_DIR ?? path.join(ROOT, '.playwright-cli', 'profile');
const BASE_URL = process.env.MJ_EXPLORER_URL ?? 'http://localhost:4201';
const HEADED = process.env.PW_HEADED === '1';
const log = (...a) => console.log(...a);

// [nav label, expected panel testid]
const NAV = [
  ['Home', 'ps-home'],
  ['Training Pipelines', 'ps-pipelines-panel'],
  ['Algorithm Catalog', 'ps-catalog-panel'],
  ['Experiments', 'ps-experiments-panel'],
  ['Model Registry', 'ps-registry-panel'],
  ['Models in Production', 'ps-production-panel'],
  ['Compare Runs', 'ps-compare-panel'],
];

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: !HEADED, viewport: { width: 1680, height: 1000 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let bucket = [];
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => bucket.push('PAGEERR: ' + String(e).slice(0, 160)));
  const realErrs = () => bucket.filter((e) => !/gravatar|ERR_FAILED|net::|favicon|JWT_EXPIRED|401/i.test(e));

  let failures = 0;
  try {
    for (const [label, testid] of NAV) {
      bucket = [];
      await page.goto(`${BASE_URL}/app/predictive-studio/${encodeURIComponent(label)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6500);
      let loaded = false;
      try { await page.locator(`[data-testid="${testid}"]`).first().waitFor({ state: 'visible', timeout: 8000 }); loaded = true; } catch {}
      const anyPanel = await page.locator('[data-testid^="ps-"]').count().catch(() => 0);
      const errs = realErrs();
      const ok = (loaded || anyPanel > 0) && errs.length === 0;
      if (!ok) failures++;
      log(`${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(22)} panel=${loaded ? testid : anyPanel > 0 ? '(present)' : 'MISSING'}  errors=${errs.length}`);
      errs.slice(0, 4).forEach((e) => log('        x', e));
    }
  } catch (e) {
    log('ERROR:', String(e).slice(0, 400));
    failures++;
  } finally {
    await ctx.close();
  }
  process.exitCode = failures > 0 ? 1 : 0;
}

main();
