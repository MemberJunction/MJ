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
