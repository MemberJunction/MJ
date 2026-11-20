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
 * If credentials ever need to be supplied programmatically, read them from
 * `process.env` (populated from .env via dotenv in the config) — NEVER hardcode.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import * as path from 'path';

const USER_DATA_DIR =
  process.env.PW_USER_DATA_DIR ?? path.resolve(__dirname, '..', '.playwright-cli', 'profile');

const HEADED = process.env.PW_HEADED === '1' || process.env.PWDEBUG === '1';

export const test = base.extend<{ context: BrowserContext; page: Page }>({
  // Replace the default ephemeral context with a persistent one bound to the signed-in profile.
  context: async ({ playwright }, use) => {
    const context = await playwright.chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: !HEADED,
      viewport: { width: 1440, height: 900 },
      // Inherit timeouts from config defaults via context options where applicable.
    });
    await use(context);
    await context.close();
  },
  // Use the first page from the persistent context (or open one) instead of a fresh context page.
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

export { expect };

/** Explorer's base URL for the specs: PW_BASE_URL, else the local dev server. */
export const EXPLORER_BASE_URL = process.env.PW_BASE_URL || 'http://localhost:4241';

/** A required environment value, or a thrown error naming it (each spec's header lists the ones it needs). */
export function RequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (see the spec header)`);
  return v;
}

/**
 * `value` as a T-SQL N'…' literal for the specs' sqlcmd checks, escaped exactly as `EscapeSQLString`
 * (`@memberjunction/global`) escapes it: NULs dropped, quotes doubled. The e2e folder sits outside the pnpm package
 * graph (the repository root declares no `@memberjunction/*` dependency), so it cannot import that helper; this is the
 * one copy every spec shares.
 */
export function SqlTextLiteral(value: string): string {
  return `N'${value.replace(/\0/g, '').replace(/'/g, "''")}'`;
}

/**
 * Redeems a one-time magic-link sign-in URL in this tab and waits until Explorer has kept the session token (it strips
 * `#token=` from the URL once stored). The session lives in the tab's sessionStorage, so each test redeems its own link.
 */
export async function RedeemSignInLink(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue to sign in' }).click();
  await page.waitForURL((u) => u.href.startsWith(EXPLORER_BASE_URL), { timeout: 60_000 });
  await page.waitForFunction(() => !window.location.hash.includes('token='), undefined, { timeout: 60_000 });
}
