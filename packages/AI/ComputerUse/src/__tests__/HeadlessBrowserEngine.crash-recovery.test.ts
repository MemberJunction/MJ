import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Surviving a crashed Chromium process.
 *
 * Workers share ONE Browser and take a BrowserContext each, so the browser
 * process is a single point of failure for the whole suite. When a page kills
 * that process — an OOM, a renderer crash — Playwright's Browser object stays
 * truthy while `isConnected()` goes false. `ensureBrowser` only checked the
 * reference for null, so every later checkout was served from the corpse and
 * died on `browser.newContext: Target page, context or browser has been closed`.
 *
 * Observed in run-20260915T191846Z: T038 crashed the target at step 22, and the
 * next TWELVE tests failed at 0s each without running a single step. The tests
 * were fine; there was simply no browser left to give them.
 *
 * A crashed process is indistinguishable from no process at all, so the engine
 * must treat it that way and launch a replacement.
 */

const { launch, connectOverCDP } = vi.hoisted(() => ({ launch: vi.fn(), connectOverCDP: vi.fn() }));
vi.mock('playwright', () => ({
    chromium: { launch, connect: vi.fn(), connectOverCDP },
}));

import { HeadlessBrowserEngine } from '../browser/HeadlessBrowserEngine.js';

interface MockBrowser {
    newContext: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    isConnected: ReturnType<typeof vi.fn>;
    id: number;
}

let browsers: MockBrowser[];

function makeContext() {
    return {
        newPage: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined), isClosed: () => false }),
        close: vi.fn().mockResolvedValue(undefined),
        storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
    };
}

function makeBrowser(id: number): MockBrowser {
    return {
        id,
        newContext: vi.fn().mockImplementation(() => Promise.resolve(makeContext())),
        close: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
    };
}

/** Kill a mock browser the way a real crash does: disconnected, and refusing contexts. */
function crash(b: MockBrowser): void {
    b.isConnected.mockReturnValue(false);
    b.newContext.mockRejectedValue(new Error('Target page, context or browser has been closed'));
}

beforeEach(async () => {
    vi.clearAllMocks();
    browsers = [];
    launch.mockImplementation(() => {
        const b = makeBrowser(browsers.length);
        browsers.push(b);
        return Promise.resolve(b);
    });
    await HeadlessBrowserEngine.Instance.Shutdown();
});

afterEach(async () => {
    await HeadlessBrowserEngine.Instance.Shutdown();
});

describe('HeadlessBrowserEngine — crashed-browser recovery', () => {
    it('launches a replacement when the browser process has crashed', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        const first = await engine.GetIsolated('worker-0');
        await engine.ReleaseIsolated(first);
        expect(browsers.length).toBe(1);

        crash(browsers[0]);

        // This is the checkout that failed twelve times in production.
        const next = await engine.GetIsolated('worker-1');

        expect(browsers.length).toBe(2);
        expect(browsers[1].newContext).toHaveBeenCalled();
        await engine.ReleaseIsolated(next);
    });

    it('keeps serving every later worker from the replacement, not the corpse', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await engine.ReleaseIsolated(await engine.GetIsolated('worker-0'));
        crash(browsers[0]);

        for (const w of ['worker-1', 'worker-2', 'worker-3']) {
            await engine.ReleaseIsolated(await engine.GetIsolated(w));
        }

        // One replacement covers them all — a relaunch per checkout would be its
        // own bug (three Chromium processes for three tests).
        expect(browsers.length).toBe(2);
    });

    it('does not relaunch while the browser is healthy', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await engine.ReleaseIsolated(await engine.GetIsolated('worker-0'));
        await engine.ReleaseIsolated(await engine.GetIsolated('worker-1'));

        expect(browsers.length).toBe(1);
        expect(browsers[0].close).not.toHaveBeenCalled();
    });
});
