/**
 * @fileoverview The DEFAULT, zero-config {@link IChromeContainerRunner} for Self-Hosted Chrome: a LOCAL
 * headless Chromium launched on this host (no Docker, no container orchestrator, no cloud account).
 *
 * It launches the Chromium that Playwright manages with a `--remote-debugging-port`, then returns the
 * DevTools **CDP HTTP endpoint** (`http://127.0.0.1:<port>`) for the shared CDP adapter to attach to via
 * `connectOverCDP`. `Release()` closes that Chromium. This is what makes
 * `@memberjunction/remote-browser-selfhost` work out of the box — it is bound as the default factory at
 * module load, so a deployment needs NO `SetContainerRunnerFactory` call and NO external service to drive
 * a real browser. The seam stays open: a deployment that wants a real container backend still overrides it
 * via `SetContainerRunnerFactory`.
 *
 * ## Why the CDP HTTP endpoint (not `browser.wsEndpoint()`)
 * For a `chromium.launch()` browser, `browser.wsEndpoint()` is the **Playwright-protocol** endpoint, which
 * `connectOverCDP` cannot attach to. The shared `BaseCdpRemoteBrowserProvider` always attaches via CDP, so
 * the runner launches Chromium with `--remote-debugging-port=<port>` and hands back the raw DevTools HTTP
 * endpoint, which `connectOverCDP` accepts directly.
 *
 * Playwright is a (peer) dependency only because of this default runner; it is imported lazily so a
 * deployment that overrides the runner — or never starts a self-host session — pays nothing for it.
 *
 * @module @memberjunction/remote-browser-selfhost
 * @author MemberJunction.com
 */

import type { Browser } from 'playwright';
import { createServer } from 'node:net';
import {
    ChromeContainerAcquireOptions,
    ChromeContainerHandle,
    IChromeContainerRunner,
} from './chrome-container-runner';

/** Default viewport when the acquire options carry no hint. */
const DEFAULT_VIEWPORT_WIDTH = 1280;
/** Default viewport when the acquire options carry no hint. */
const DEFAULT_VIEWPORT_HEIGHT = 800;

/** How long to wait for Chromium's DevTools endpoint to become reachable, in ms. */
const DEVTOOLS_READY_TIMEOUT_MS = 10_000;
/** Poll interval while waiting for the DevTools endpoint, in ms. */
const DEVTOOLS_POLL_INTERVAL_MS = 100;

/**
 * The default local-Chrome runner — launches a local headless Chromium via Playwright and exposes its
 * real CDP HTTP endpoint. Stateless; one instance is shared process-wide (each {@link Acquire} launches
 * its own browser and its {@link ChromeContainerHandle.Release} closes exactly that one).
 */
export class LocalChromeContainerRunner implements IChromeContainerRunner {
    /**
     * Launches a local headless Chromium and returns its CDP HTTP endpoint + teardown hook.
     *
     * @param opts Per-session viewport hints (and the opaque backend configuration, unused here).
     * @returns A handle carrying the launched browser's CDP HTTP endpoint and a `Release` that closes it.
     * @throws When Playwright is not installed, or the browser fails to launch / expose a CDP endpoint.
     */
    public async Acquire(opts: ChromeContainerAcquireOptions): Promise<ChromeContainerHandle> {
        const chromium = await this.loadChromium();
        const port = await this.findFreePort();
        const browser = await chromium.launch({
            headless: true,
            args: this.launchArgs(opts, port),
        });
        const cdpEndpoint = `http://127.0.0.1:${port}`;
        try {
            await this.waitForDevTools(cdpEndpoint);
        } catch (err) {
            await this.closeQuietly(browser);
            throw err;
        }
        return {
            CdpEndpoint: cdpEndpoint,
            // Self-host's local runner has no first-party hosted viewer; the MJ live view is backed by the
            // inherited CDP screencast. Surface the CDP endpoint as the (non-navigable) viewer reference.
            ViewerUrl: cdpEndpoint,
            Release: async () => {
                await this.closeQuietly(browser);
            },
        };
    }

    /**
     * Lazily imports Playwright's `chromium` launcher. Kept dynamic (the sanctioned optional-peer case) so
     * the package builds and a non-self-host deployment pays nothing — but the error is explicit when a
     * self-host session is actually started without Playwright installed.
     *
     * @returns Playwright's `chromium` browser type.
     * @throws When the optional `playwright` peer dependency is not installed.
     */
    private async loadChromium(): Promise<Awaited<typeof import('playwright')>['chromium']> {
        try {
            const { chromium } = await import('playwright');
            return chromium;
        } catch {
            throw new Error(
                'The default Self-Hosted Chrome runner needs Playwright, but it is not installed. ' +
                    "Install it with 'npm install playwright' (and run 'npx playwright install chromium'), " +
                    'or bind a real container runner via SelfHostRemoteBrowser.SetContainerRunnerFactory(...).',
            );
        }
    }

    /**
     * Builds the Chromium launch args: the chosen remote-debugging port (exposing a real CDP endpoint),
     * bound to loopback, plus the resolved window size.
     *
     * @param opts The acquire options carrying optional viewport hints.
     * @param port The remote-debugging port to expose CDP on.
     * @returns The Chromium command-line args.
     */
    private launchArgs(opts: ChromeContainerAcquireOptions, port: number): string[] {
        const width = opts.ViewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
        const height = opts.ViewportHeight ?? DEFAULT_VIEWPORT_HEIGHT;
        return [
            `--remote-debugging-port=${port}`,
            '--remote-debugging-address=127.0.0.1',
            `--window-size=${width},${height}`,
        ];
    }

    /**
     * Polls Chromium's DevTools `/json/version` document until it is reachable (the browser has fully
     * started its CDP server) or the readiness timeout elapses.
     *
     * @param cdpEndpoint The CDP HTTP base endpoint (`http://127.0.0.1:<port>`).
     * @throws When the DevTools endpoint is not reachable within {@link DEVTOOLS_READY_TIMEOUT_MS}.
     */
    private async waitForDevTools(cdpEndpoint: string): Promise<void> {
        const deadline = Date.now() + DEVTOOLS_READY_TIMEOUT_MS;
        let lastError: unknown;
        while (Date.now() < deadline) {
            try {
                const response = await fetch(`${cdpEndpoint}/json/version`);
                if (response.ok) {
                    return;
                }
            } catch (err) {
                lastError = err;
            }
            await this.delay(DEVTOOLS_POLL_INTERVAL_MS);
        }
        throw new Error(
            `Local Chromium did not expose a CDP endpoint at ${cdpEndpoint} within ${DEVTOOLS_READY_TIMEOUT_MS}ms` +
                (lastError instanceof Error ? `: ${lastError.message}` : '.'),
        );
    }

    /**
     * Reserves a free TCP port by binding an ephemeral server to loopback and reading the assigned port.
     * There is an unavoidable (tiny) race between releasing the port and Chromium binding it; on a single
     * host this is acceptable for the default runner.
     *
     * @returns A free TCP port on loopback.
     */
    private findFreePort(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const server = createServer();
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address === 'object') {
                    const { port } = address;
                    server.close(() => resolve(port));
                } else {
                    server.close(() => reject(new Error('Failed to reserve a free port for local Chromium.')));
                }
            });
        });
    }

    /** Closes a browser, swallowing any teardown error so `Release` (and failure cleanup) never throws. */
    private async closeQuietly(browser: Browser): Promise<void> {
        try {
            await browser.close();
        } catch {
            // best-effort teardown — a browser that already exited is a benign no-op
        }
    }

    /** A cancellable-free delay used between DevTools readiness polls. */
    private delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    }
}
