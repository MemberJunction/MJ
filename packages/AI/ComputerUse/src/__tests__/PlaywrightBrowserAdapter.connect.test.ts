import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted Playwright spies so the vi.mock factory (hoisted above imports) can
// reference them. PlaywrightBrowserAdapter dynamically imports 'playwright',
// so we mock the module to fully isolate from any real browser.
const { launch, connect, connectOverCDP } = vi.hoisted(() => ({
    launch: vi.fn(),
    connect: vi.fn(),
    connectOverCDP: vi.fn(),
}));

vi.mock('playwright', () => ({
    chromium: { launch, connect, connectOverCDP },
}));

import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import { BrowserConfig } from '../types/browser.js';

function makeConfig(overrides: Partial<BrowserConfig> = {}): BrowserConfig {
    const cfg = new BrowserConfig();
    Object.assign(cfg, overrides);
    return cfg;
}

interface MockPage {
    close: ReturnType<typeof vi.fn>;
    setDefaultNavigationTimeout: ReturnType<typeof vi.fn>;
    setDefaultTimeout: ReturnType<typeof vi.fn>;
    route: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
}
interface MockContext {
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addCookies: ReturnType<typeof vi.fn>;
}
interface MockBrowser {
    newContext: ReturnType<typeof vi.fn>;
    contexts: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    isConnected: ReturnType<typeof vi.fn>;
}

let page: MockPage;
let context: MockContext;
let existingContext: MockContext;
let browser: MockBrowser;

beforeEach(() => {
    vi.clearAllMocks();

    page = {
        close: vi.fn().mockResolvedValue(undefined),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        route: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('about:blank'),
    };
    context = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
        addCookies: vi.fn().mockResolvedValue(undefined),
    };
    existingContext = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
        addCookies: vi.fn().mockResolvedValue(undefined),
    };
    browser = {
        newContext: vi.fn().mockResolvedValue(context),
        contexts: vi.fn().mockReturnValue([]),
        close: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
    };
    launch.mockResolvedValue(browser);
    connect.mockResolvedValue(browser);
    connectOverCDP.mockResolvedValue(browser);
});

describe('PlaywrightBrowserAdapter attach behavior', () => {
    it('launches its own browser when Connect is unset (default)', async () => {
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({ Headless: true }));

        expect(launch).toHaveBeenCalledTimes(1);
        expect(launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
        expect(connect).not.toHaveBeenCalled();
        expect(connectOverCDP).not.toHaveBeenCalled();
        expect(browser.newContext).toHaveBeenCalledTimes(1);
    });

    it('attaches over a Playwright server for ws:// endpoints', async () => {
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({ Connect: 'ws://localhost:55001/abc' }));

        expect(connect).toHaveBeenCalledWith('ws://localhost:55001/abc');
        expect(launch).not.toHaveBeenCalled();
        expect(connectOverCDP).not.toHaveBeenCalled();
    });

    it('attaches over CDP for http:// endpoints', async () => {
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({ Connect: 'http://localhost:9222' }));

        expect(connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
        expect(launch).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it('honors ConnectType to force CDP on a ws:// endpoint', async () => {
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({
            Connect: 'ws://localhost:9222/x',
            ConnectType: 'cdp',
        }));

        expect(connectOverCDP).toHaveBeenCalledWith('ws://localhost:9222/x');
        expect(connect).not.toHaveBeenCalled();
    });

    it('creates a fresh isolated context by default when attaching', async () => {
        browser.contexts.mockReturnValue([existingContext]); // existing tabs present...
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({ Connect: 'http://localhost:9222' }));

        // ...but the default is isolation, so we do NOT reuse the existing context.
        expect(browser.newContext).toHaveBeenCalledTimes(1);
        expect(existingContext.newPage).not.toHaveBeenCalled();
    });

    it('reuses the existing default context when opted in', async () => {
        browser.contexts.mockReturnValue([existingContext]);
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({
            Connect: 'http://localhost:9222',
            ReuseExistingContext: true,
        }));

        expect(browser.newContext).not.toHaveBeenCalled();
        expect(existingContext.newPage).toHaveBeenCalledTimes(1);
    });

    it('creates a context when reuse is requested but none exists (fresh server case)', async () => {
        browser.contexts.mockReturnValue([]); // fresh Playwright server has no contexts
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({
            Connect: 'ws://localhost:55001/x',
            ReuseExistingContext: true,
        }));

        expect(browser.newContext).toHaveBeenCalledTimes(1);
    });
});

describe('PlaywrightBrowserAdapter.Close ownership', () => {
    it('closes the browser we launched', async () => {
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig());
        await adapter.Close();

        expect(page.close).toHaveBeenCalledTimes(1);
        expect(context.close).toHaveBeenCalledTimes(1); // we own the context we created
        expect(browser.close).toHaveBeenCalledTimes(1); // we own the browser we launched
    });

    it('never closes a browser we only attached to', async () => {
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({ Connect: 'ws://localhost:55001/x' }));
        await adapter.Close();

        expect(page.close).toHaveBeenCalledTimes(1); // we created the page
        expect(context.close).toHaveBeenCalledTimes(1); // we created a fresh context
        expect(browser.close).not.toHaveBeenCalled(); // external browser stays alive
    });

    it('never closes a reused/shared context belonging to the attached browser', async () => {
        browser.contexts.mockReturnValue([existingContext]);
        const adapter = new PlaywrightBrowserAdapter();
        await adapter.Launch(makeConfig({
            Connect: 'http://localhost:9222',
            ReuseExistingContext: true,
        }));
        await adapter.Close();

        expect(page.close).toHaveBeenCalledTimes(1); // our page is closed
        expect(existingContext.close).not.toHaveBeenCalled(); // shared context intact
        expect(browser.close).not.toHaveBeenCalled(); // external browser stays alive
    });
});
