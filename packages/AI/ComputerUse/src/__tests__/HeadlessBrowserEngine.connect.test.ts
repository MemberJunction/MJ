import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted Playwright spies so the vi.mock factory (hoisted above imports) can
// reference them. HeadlessBrowserEngine dynamically imports 'playwright', so
// we mock the module to fully isolate from any real browser.
const { launch, connect, connectOverCDP } = vi.hoisted(() => ({
    launch: vi.fn(),
    connect: vi.fn(),
    connectOverCDP: vi.fn(),
}));

vi.mock('playwright', () => ({
    chromium: { launch, connect, connectOverCDP },
}));

import { HeadlessBrowserEngine } from '../browser/HeadlessBrowserEngine.js';

interface MockBrowser {
    newContext: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}

let browser: MockBrowser;

beforeEach(() => {
    vi.clearAllMocks();
    browser = {
        newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
            close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
    };
    launch.mockResolvedValue(browser);
    connect.mockResolvedValue(browser);
    connectOverCDP.mockResolvedValue(browser);
});

afterEach(async () => {
    // Fully reset the singleton's internal state between tests so each test
    // sees a fresh "uninitialized" engine. Shutdown clears _browser, _connected,
    // and all caches. The singleton instance itself persists, which is fine.
    await HeadlessBrowserEngine.Instance.Shutdown();
});

describe('HeadlessBrowserEngine.Initialize attach behavior', () => {
    it('launches its own browser when connect is unset (default)', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true);

        expect(launch).toHaveBeenCalledTimes(1);
        expect(launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
        expect(connect).not.toHaveBeenCalled();
        expect(connectOverCDP).not.toHaveBeenCalled();
    });

    it('attaches over a Playwright server for ws:// endpoints', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true, 'ws://localhost:55001/abc');

        expect(connect).toHaveBeenCalledWith('ws://localhost:55001/abc');
        expect(launch).not.toHaveBeenCalled();
        expect(connectOverCDP).not.toHaveBeenCalled();
    });

    it('attaches over CDP for http:// endpoints', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true, 'http://localhost:9222');

        expect(connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
        expect(launch).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it('honors connectType to force CDP on a ws:// endpoint', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true, 'ws://localhost:9222/x', 'cdp');

        expect(connectOverCDP).toHaveBeenCalledWith('ws://localhost:9222/x');
        expect(connect).not.toHaveBeenCalled();
    });

    it('is idempotent — second call is a no-op (first call wins)', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true, 'ws://localhost:55001/x');
        await HeadlessBrowserEngine.Instance.Initialize(true, 'http://localhost:9222');

        // The second call's endpoint is ignored — the singleton already has a browser.
        expect(connect).toHaveBeenCalledTimes(1);
        expect(connectOverCDP).not.toHaveBeenCalled();
    });
});

describe('HeadlessBrowserEngine.Shutdown ownership', () => {
    it('closes the browser we launched', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true);
        await HeadlessBrowserEngine.Instance.Shutdown();

        expect(browser.close).toHaveBeenCalledTimes(1); // we own the browser we launched
    });

    it('never closes a browser we only attached to', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true, 'ws://localhost:55001/x');
        await HeadlessBrowserEngine.Instance.Shutdown();

        // External browser/server stays alive — its lifecycle belongs to the
        // caller that launched it. Our Playwright client connection is
        // released on process exit.
        expect(browser.close).not.toHaveBeenCalled();
    });

    it('allows reinitialization after shutdown with a different mode', async () => {
        await HeadlessBrowserEngine.Instance.Initialize(true, 'ws://localhost:55001/x');
        await HeadlessBrowserEngine.Instance.Shutdown();
        // After Shutdown, the engine is fully reset and the next Initialize wins.
        await HeadlessBrowserEngine.Instance.Initialize(true);

        expect(connect).toHaveBeenCalledTimes(1);
        expect(launch).toHaveBeenCalledTimes(1);
    });
});
