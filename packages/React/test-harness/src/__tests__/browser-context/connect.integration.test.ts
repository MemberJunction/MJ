import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright';
import { BrowserManager } from '../../lib/browser-context';

/**
 * Real-browser integration test for attaching to an existing Playwright server.
 * Skipped by default (needs Playwright browsers installed); enable with:
 *   RUN_BROWSER_INTEGRATION=1 npx vitest run src/__tests__/browser-context/connect.integration.test.ts
 *
 * Proves the safety-critical property: closing the harness must NOT tear down a
 * browser it only attached to.
 */
const RUN = !!process.env.RUN_BROWSER_INTEGRATION;

describe.skipIf(!RUN)('BrowserManager real connect (integration)', () => {
  it('attaches to a Playwright server and leaves it running after close()', async () => {
    const server = await chromium.launchServer({ headless: true });
    const wsEndpoint = server.wsEndpoint();
    try {
      const mgr = new BrowserManager({ connect: wsEndpoint });
      await mgr.initialize();

      const page = await mgr.getPage();
      await page.goto('about:blank');
      expect(typeof (await page.title())).toBe('string');

      await mgr.close();

      // If close() had killed the external browser, this second client could not
      // attach. It succeeding proves the server is still alive.
      const probe = await chromium.connect(wsEndpoint);
      expect(probe.isConnected()).toBe(true);
      await probe.close(); // disconnect only this probe client
    } finally {
      await server.close();
    }
  }, 60000);
});
