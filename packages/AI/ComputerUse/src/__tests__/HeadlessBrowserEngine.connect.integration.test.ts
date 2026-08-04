import { describe, it, expect, afterEach } from 'vitest';
import { chromium } from 'playwright';
import { HeadlessBrowserEngine } from '../browser/HeadlessBrowserEngine.js';

/**
 * Real-browser integration test for attaching the singleton engine to an
 * existing Playwright server. Skipped by default; enable with:
 *   RUN_BROWSER_INTEGRATION=1 npx vitest run src/__tests__/HeadlessBrowserEngine.connect.integration.test.ts
 *
 * Proves the engine's Shutdown() does not kill an attached browser.
 */
const RUN = !!process.env.RUN_BROWSER_INTEGRATION;

describe.skipIf(!RUN)('HeadlessBrowserEngine real connect (integration)', () => {
    afterEach(async () => {
        await HeadlessBrowserEngine.Instance.Shutdown();
    });

    it('attaches to a Playwright server, serves a GetNew adapter, and leaves the server running after Shutdown', async () => {
        const server = await chromium.launchServer({ headless: true });
        const wsEndpoint = server.wsEndpoint();
        try {
            await HeadlessBrowserEngine.Instance.Initialize(true, wsEndpoint);
            const adapter = await HeadlessBrowserEngine.Instance.GetNew();
            await adapter.Navigate('about:blank');
            expect(adapter.CurrentUrl).toMatch(/about:blank/);
            await HeadlessBrowserEngine.Instance.Shutdown();

            // If Shutdown() had killed the external server, this second client
            // could not attach. It succeeding proves the server is still alive.
            const probe = await chromium.connect(wsEndpoint);
            expect(probe.isConnected()).toBe(true);
            await probe.close();
        } finally {
            await server.close();
        }
    }, 60000);
});
