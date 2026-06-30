/**
 * Playwright (browser/UI) test config for MemberJunction Explorer e2e specs.
 *
 * This is intentionally separate from the repo's Vitest unit-test suite
 * (`npm test` / `turbo run test`). These specs drive a *running* MJExplorer in a
 * real browser, so they are NOT part of the default CI test run — invoke them
 * explicitly via `npm run test:e2e` (see the `test:e2e` script in the repo-root
 * package.json).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREREQUISITES (the app is NOT started for you by this config):
 *   1. MJAPI       running and reachable (default port 4001 per CLAUDE.md;
 *                  override with PW_API_URL).
 *   2. MJExplorer  running and reachable (default http://localhost:4201;
 *                  override with PW_BASE_URL).
 *   3. The Predictive Studio metadata synced into the target environment
 *      (`npx mj sync push --dir=metadata --include="applications"` + the PS
 *      reference data) so the "Predictive Studio" app/nav item exists.
 *   4. A primed persistent auth profile so the browser is already signed in.
 *      Create it once, headed, then reuse it:
 *
 *        npx playwright-cli open --headed \
 *          --profile .playwright-cli/profile http://localhost:4201
 *
 *      ...and sign in. The `.playwright-cli/` dir is gitignored; tokens persist
 *      ~30 days. Point the specs at it with PW_USER_DATA_DIR (defaults to
 *      ../.playwright-cli/profile relative to this config).
 *
 * RUN:
 *   # from repo root
 *   npm run test:e2e
 *   # or directly
 *   npx playwright test --config e2e/playwright.config.ts
 *   # headed / debug
 *   npx playwright test --config e2e/playwright.config.ts --headed --debug
 *
 * Credentials, if you ever wire login automation, MUST come from .env (dotenv) —
 * never hardcode secrets in spec files. See the spec header for details.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load repo-root .env so PW_* overrides (and any future credentials) come from env, never code.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.PW_BASE_URL ?? 'http://localhost:4201';

// Persistent, signed-in browser profile (MSAL tokens / cookies). Reused across runs.
const USER_DATA_DIR =
  process.env.PW_USER_DATA_DIR ?? path.resolve(__dirname, '..', '.playwright-cli', 'profile');

export default defineConfig({
  testDir: path.resolve(__dirname, 'specs'),
  testMatch: '**/*.spec.ts',
  // The Explorer + agent UI can take a moment on first paint; be generous but bounded.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // single signed-in profile → run serially to avoid lock contention
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-authenticated',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // The signed-in profile is bound via a persistent context in e2e/fixtures.ts (the standard
  // @playwright/test runner creates ephemeral contexts; reusing an on-disk MSAL profile requires
  // launchPersistentContext, which the fixture handles). Surfaced here for reference/branching.
  metadata: { userDataDir: USER_DATA_DIR, baseUrl: BASE_URL },
});
