/**
 * Helpers the Predictive Studio honest-serving specs share (the sign-in link, the required environment values and the
 * SQL literal for their sqlcmd checks). They belong to those specs, so they sit beside them rather than in the shared
 * `e2e/fixtures.ts`.
 */
import type { Page } from '@playwright/test';

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
 * one copy the specs share.
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
