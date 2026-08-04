// Primes the persistent Playwright profile (`.playwright-cli/profile`) by signing into
// MJExplorer via Auth0, so the e2e fixtures + overlay driver start already authenticated.
// Run once (and again whenever the cached session expires):  node e2e/overlay/prime-auth.mjs
//
// Credentials are READ FROM packages/MJAPI/.env (HEADLESS_AUTH0_TEST_UID / _PWD) — never
// hardcoded. Override the target with MJ_EXPLORER_URL (default http://localhost:4201).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PROFILE = process.env.PW_PROFILE_DIR ?? path.join(ROOT, '.playwright-cli', 'profile');
const SHOTS = path.join(ROOT, '.playwright-cli', 'shots');
const BASE_URL = process.env.MJ_EXPLORER_URL ?? 'http://localhost:4201';
fs.mkdirSync(SHOTS, { recursive: true });

const envText = fs.readFileSync(path.join(ROOT, 'packages/MJAPI/.env'), 'utf8');
const pick = (k) => {
  const m = envText.match(new RegExp(`^\\s*${k}\\s*=\\s*['"]?([^'"\\n\\r]+)['"]?`, 'm'));
  return m ? m[1].trim() : null;
};
const USER = process.env.MJ_TEST_USER ?? pick('HEADLESS_AUTH0_TEST_UID');
const PWD = process.env.MJ_TEST_PWD ?? pick('HEADLESS_AUTH0_TEST_PWD');
if (!USER || !PWD) { console.error('MISSING_CREDS — set HEADLESS_AUTH0_TEST_UID/_PWD in packages/MJAPI/.env'); process.exit(2); }
console.log('priming auth for:', USER);

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(45000);
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n) }).catch(() => {});

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  let url = page.url();

  // In-app landing gates the Auth0 redirect behind a "Log In" button — click it first.
  const inAppLogin = page.locator('button:has-text("Log In"), button:has-text("Log in"), a:has-text("Log In")').first();
  if (!url.includes('auth0.com') && (await page.locator('input[type="password"]').count()) === 0 && (await inAppLogin.count()) > 0) {
    await inAppLogin.click();
    await page.waitForTimeout(6000);
    url = page.url();
  }

  if (url.includes('auth0.com') || (await page.locator('input[name="username"], input[type="email"], input#username').count()) > 0) {
    const email = page.locator('input[name="username"], input#username, input[type="email"]').first();
    await email.waitFor({ state: 'visible' });
    await email.fill(USER);
    await page.locator('input[name="password"], input#password, input[type="password"]').first().fill(PWD);
    await page.locator('button[type="submit"], button[name="action"]').first().click();
    await page.waitForTimeout(6000);
    if (page.url().includes('auth0.com')) {
      const consent = page.locator('button[value="accept"], button:has-text("Accept"), button:has-text("Allow")').first();
      if (await consent.count() > 0) { await consent.click(); await page.waitForTimeout(6000); }
    }
  }

  await page.waitForURL(new RegExp(BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await shot('prime-auth-final.png');
  const stillLogin = (await page.locator('button:has-text("Log In"), input[type="password"]').count()) > 0;
  console.log(!stillLogin && !page.url().includes('auth0.com') ? 'LOGIN_OK — profile primed' : 'LOGIN_UNCERTAIN — see .playwright-cli/shots/prime-auth-final.png');
} catch (e) {
  console.error('LOGIN_ERR', e.message);
  await shot('prime-auth-error.png');
} finally {
  await ctx.close();
}
