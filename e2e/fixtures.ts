/**
 * Shared Playwright fixtures for MJ Explorer e2e specs.
 *
 * The key job here is to launch a **persistent browser context** bound to the
 * primed `.playwright-cli/profile` directory (see playwright.config.ts header),
 * so every spec starts already signed in to MJExplorer — no login automation,
 * no secrets in code. This mirrors the `--profile` approach documented in the
 * repo CLAUDE.md "Browser Testing with Playwright CLI" section.
 *
 * Standard `@playwright/test` projects create *ephemeral* contexts; to reuse an
 * on-disk MSAL/cookie profile we override the `context` + `page` fixtures with
 * `browserType.launchPersistentContext(userDataDir, ...)`.
 *
 * **Magic-link mode (local dev databases).** When `PW_MAGIC_LINK_MINT` is set, each test instead gets a fresh
 * ephemeral context and signs in by redeeming a one-use magic link: the fixture runs that command, which must
 * print the redeem URL as its last line (minting is the host's business — e.g. a script that inserts an invite
 * into the dev database), opens it, clicks "Continue to sign in", and waits to land on Explorer. A magic-link
 * session lives in the tab, so it cannot be primed into a profile; the server must run with `magicLink.enabled`
 * and `explorerUrl` pointing at `PW_BASE_URL`.
 *
 * If credentials ever need to be supplied programmatically, read them from
 * `process.env` (populated from .env via dotenv in the config) — NEVER hardcode.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as path from 'path';

const USER_DATA_DIR =
  process.env.PW_USER_DATA_DIR ?? path.resolve(__dirname, '..', '.playwright-cli', 'profile');

const HEADED = process.env.PW_HEADED === '1' || process.env.PWDEBUG === '1';

const MAGIC_LINK_MINT = process.env.PW_MAGIC_LINK_MINT;

const VIEWPORT = { width: 1440, height: 900 };

/** Run the mint command and return the redeem URL it printed on its last line. */
function mintMagicLink(command: string): string {
  const out = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const url = out.trim().split('\n').pop()?.trim() ?? '';
  if (!/^https?:\/\//.test(url)) throw new Error(`PW_MAGIC_LINK_MINT printed no redeem URL (last line: "${url}")`);
  return url;
}

/** Redeem a fresh magic link in `page` and wait until Explorer (at `baseURL`) has loaded. */
async function signInByMagicLink(page: Page, command: string, baseURL: string): Promise<void> {
  await page.goto(mintMagicLink(command), { waitUntil: 'domcontentloaded' });
  const proceed = page.getByRole('button', { name: /continue to sign in/i });
  if (await proceed.isVisible().catch(() => false)) await proceed.click();
  const explorerOrigin = new URL(baseURL).origin;
  // Explorer's magic-link provider stores the session, THEN strips `#token=` from the URL — so the fragment going
  // away is the signal that the session survives the next navigation. Landing on the origin alone is too early.
  await page.waitForURL(
    (u) => u.origin === explorerOrigin && !u.searchParams.has('mlError') && !u.hash.includes('token='),
    { timeout: 60_000 },
  );
}

export const test = base.extend<{ context: BrowserContext; page: Page }>({
  // Replace the default ephemeral context with a persistent one bound to the signed-in profile
  // (or, in magic-link mode, a clean ephemeral context per test).
  context: async ({ playwright, browser }, use) => {
    const context = MAGIC_LINK_MINT
      ? await browser.newContext({ viewport: VIEWPORT })
      : await playwright.chromium.launchPersistentContext(USER_DATA_DIR, {
          headless: !HEADED,
          viewport: VIEWPORT,
          // Inherit timeouts from config defaults via context options where applicable.
        });
    await use(context);
    await context.close();
  },
  // Use the first page from the persistent context (or open one) instead of a fresh context page.
  page: async ({ context, baseURL }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    if (MAGIC_LINK_MINT) await signInByMagicLink(page, MAGIC_LINK_MINT, baseURL ?? 'http://localhost:4201');
    await use(page);
  },
});

export { expect };
