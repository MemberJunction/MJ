#!/usr/bin/env node
/**
 * One-time Auth0 login for the regression suite — "single-login mode".
 *
 * Performs ONE deterministic browser login as the test user and writes the
 * resulting Playwright storageState (cookies + per-origin localStorage) to
 * MJ_TEST_AUTH_STATE_FILE. The ComputerUseTestDriver then seeds EVERY browser
 * context from this single file (HeadlessBrowserEngine shared seed), so no
 * individual test ever re-authenticates — collapsing the old ~1-login-per-test
 * behaviour down to a single Auth0 login per suite run.
 *
 * Contract with test-runner-entrypoint.sh:
 *   exit 0 + file written  → entrypoint keeps MJ_TEST_AUTH_STATE_FILE exported
 *                            (the suite runs in single-login mode).
 *   exit non-zero (no file) → entrypoint unsets MJ_TEST_AUTH_STATE_FILE and the
 *                            suite falls back to the per-worker login path.
 *
 * Auth0's SPA SDK only works on secure origins, so we log in via the
 * socat-forwarded http://localhost:4200 (the same origin the tests use), not
 * the internal mjexplorer host. The captured Auth0 session cookie + refresh
 * token mean the seeded state silently renews for the whole run.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.AUTH_BOOTSTRAP_URL || 'http://localhost:4200';
const USER = process.env.MJ_TEST_VAR_authUsername || process.env.TEST_UID || 'computeruse@bluecypress.io';
const PWD = process.env.MJ_TEST_VAR_authPassword || process.env.TEST_PWD || 'computerpassword2!';
const OUT = process.env.MJ_TEST_AUTH_STATE_FILE || '/tmp/mj-auth-state.json';
const ATTEMPTS = parseInt(process.env.AUTH_BOOTSTRAP_ATTEMPTS || '3', 10);

const log = (m) => console.log(`  [auth-bootstrap] ${m}`);

async function fillFirst(page, selectors, value) {
  for (const s of selectors) {
    const el = await page.$(s);
    if (el) { await el.fill(value); return true; }
  }
  return false;
}

async function clickFirst(page, selectors) {
  for (const s of selectors) {
    const el = await page.$(s);
    if (el) { await el.click(); return true; }
  }
  return false;
}

// Drives the proven MJ Explorer → Auth0 Universal Login flow, then verifies the
// app reached an authenticated state before capturing storageState.
async function attemptLogin(browser) {
  let ctx;
  try {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(45000);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Step A — MJ in-app "Log In" landing page: click to start the Auth0 flow.
    const landing = (await page.textContent('body').catch(() => '')) || '';
    if (/Please log in to your account/i.test(landing)) {
      log('clicking in-app "Log In"');
      await clickFirst(page, ['button:has-text("Log In")', 'a:has-text("Log In")', 'button:has-text("Log in")']);
      await page.waitForTimeout(4000);
    }

    // Step B — Auth0 Universal Login (handles both single-page and split
    // username→password flows).
    if (/auth0\.com|\/login|\/authorize|\/u\//.test(page.url())) {
      log('Auth0 login page: ' + page.url().slice(0, 70));
      await page.waitForTimeout(1500);
      await fillFirst(page, ['input#username', 'input[name=username]', 'input[type=email]', 'input[name=email]'], USER);
      const pwdField = await page.$('input#password, input[name=password], input[type=password]');
      if (!pwdField) {
        await clickFirst(page, ['button[type=submit]', 'button[name=action][value=default]', 'button:has-text("Continue")']);
        await page.waitForTimeout(2000);
      }
      await fillFirst(page, ['input#password', 'input[name=password]', 'input[type=password]'], PWD);
      await clickFirst(page, ['button[type=submit]', 'button[name=action][value=default]', 'button:has-text("Continue")', 'button:has-text("Log In")']);
      try {
        await page.waitForURL(/localhost:4200|mjexplorer/, { timeout: 60000 });
      } catch {
        log('waitForURL back to app timed out; url=' + page.url());
      }
    }

    // Let the SPA finish booting in the resource-constrained env.
    await page.waitForTimeout(8000);

    // Verify we are actually authenticated before trusting the state.
    const url = page.url();
    const lsKeys = await page.evaluate(() => Object.keys(window.localStorage)).catch(() => []);
    const hasToken = lsKeys.some((k) => k.startsWith('@@auth0spajs@@'));
    const onAuth = /auth0\.com|\/u\/login|\/authorize/.test(url);
    const body = (await page.textContent('body').catch(() => '')) || '';
    const onLanding = /Please log in to your account|Welcome back! Please log in/i.test(body);

    if (hasToken && !onAuth && !onLanding) {
      // Atomic write: capture to a temp file, then rename into place.
      const tmp = OUT + '.tmp';
      await ctx.storageState({ path: tmp });
      fs.renameSync(tmp, OUT);
      const state = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      log(`captured storageState → ${OUT} (cookies=${(state.cookies || []).length}, origins=${(state.origins || []).length})`);
      return true;
    }

    log(`not authenticated after login (url=${url} token=${hasToken} onAuth=${onAuth} onLanding=${onLanding})`);
    return false;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

(async () => {
  log(`base=${BASE} user=${USER} out=${OUT}`);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let ok = false;
  try {
    for (let i = 1; i <= ATTEMPTS && !ok; i++) {
      log(`attempt ${i}/${ATTEMPTS}`);
      ok = await attemptLogin(browser).catch((e) => { log('attempt error: ' + ((e && e.message) || e)); return false; });
      if (!ok && i < ATTEMPTS) await new Promise((r) => setTimeout(r, 5000));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  if (ok) {
    log('SUCCESS — single-login mode enabled for the suite');
    process.exit(0);
  }
  log('FAILED — suite will fall back to per-worker login');
  process.exit(1);
})().catch((e) => { console.error('  [auth-bootstrap] FATAL', e); process.exit(1); });
