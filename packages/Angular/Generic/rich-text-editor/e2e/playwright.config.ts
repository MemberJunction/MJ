/**
 * Real-browser tier for @memberjunction/ng-rich-text-editor.
 *
 * jsdom covers the engine's algorithms; it cannot cover what only a browser does — native
 * Backspace and the deferred repair behind it, `insertText`, selection behaviour around
 * `contenteditable`, the clipboard `DataTransfer`, layout-dependent caret placement. Those
 * run here, against the Angular-free engine bundled into a static page. No server, no
 * sign-in, no MJAPI: `pnpm run test:live` from the package directory is the whole setup.
 *
 * The bundle is built by `global-setup.ts` into `e2e/.harness/` (gitignored) with esbuild.
 */
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
    testDir: path.resolve(__dirname, 'specs'),
    testMatch: '**/*.spec.ts',
    globalSetup: path.resolve(__dirname, 'global-setup.ts'),
    // Artifacts live under e2e/ (see e2e/.gitignore); Playwright would otherwise resolve them
    // relative to the nearest package.json.
    outputDir: path.resolve(__dirname, 'test-results'),
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    retries: process.env['CI'] ? 1 : 0,
    reporter: process.env['CI']
        ? [['line'], ['html', { open: 'never', outputFolder: path.resolve(__dirname, 'playwright-report') }]]
        : [['list']],
    use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    // Chromium by default. `PW_BROWSERS=all pnpm run test:live` adds WebKit (Safari's engine)
    // and Firefox — run `pnpm exec playwright install webkit firefox` once first.
    projects:
        process.env['PW_BROWSERS'] === 'all'
            ? [
                  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
                  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
                  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
              ]
            : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
