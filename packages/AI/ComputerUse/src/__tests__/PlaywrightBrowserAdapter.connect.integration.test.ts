import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright';
import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import { BrowserConfig } from '../types/browser.js';

/**
 * Real-browser integration test for attaching to an existing Playwright server.
 * Skipped by default (needs Playwright browsers installed); enable with:
 *   RUN_BROWSER_INTEGRATION=1 npx vitest run src/__tests__/PlaywrightBrowserAdapter.connect.integration.test.ts
 *
 * Proves the safety-critical property: closing the adapter must NOT tear down a
 * browser it only attached to.
 */
const RUN = !!process.env.RUN_BROWSER_INTEGRATION;

describe.skipIf(!RUN)('PlaywrightBrowserAdapter real connect (integration)', () => {
    it('attaches to a Playwright server and leaves it running after Close()', async () => {
        const server = await chromium.launchServer({ headless: true });
        const wsEndpoint = server.wsEndpoint();
        try {
            const config = new BrowserConfig();
            config.Connect = wsEndpoint;

            const adapter = new PlaywrightBrowserAdapter();
            await adapter.Launch(config);
            await adapter.Navigate('about:blank');
            expect(adapter.CurrentUrl).toMatch(/about:blank/);

            await adapter.Close();

            // If Close() had killed the external browser, this second client could
            // not attach. It succeeding proves the server is still alive.
            const probe = await chromium.connect(wsEndpoint);
            expect(probe.isConnected()).toBe(true);
            await probe.close(); // disconnect only this probe client
        } finally {
            await server.close();
        }
    }, 60000);
});
