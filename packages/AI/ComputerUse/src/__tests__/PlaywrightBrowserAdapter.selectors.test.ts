import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted Playwright spies so the vi.mock factory (hoisted above imports) can
// reference them. PlaywrightBrowserAdapter dynamically imports 'playwright', so
// we mock the module to fully isolate from any real browser. These tests cover
// the additive selector-capable action branches and the GetVisibleText read.
const { launch, connect, connectOverCDP } = vi.hoisted(() => ({
    launch: vi.fn(),
    connect: vi.fn(),
    connectOverCDP: vi.fn(),
}));

vi.mock('playwright', () => ({
    chromium: { launch, connect, connectOverCDP },
}));

import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import {
    BrowserConfig,
    ClickAction,
    TypeAction,
    ScrollAction,
    WaitAction,
} from '../types/browser.js';

function makeConfig(overrides: Partial<BrowserConfig> = {}): BrowserConfig {
    const cfg = new BrowserConfig();
    Object.assign(cfg, overrides);
    return cfg;
}

// A locator returned by page.locator() — only the methods the adapter uses.
interface MockLocator {
    focus: ReturnType<typeof vi.fn>;
    scrollIntoViewIfNeeded: ReturnType<typeof vi.fn>;
}

interface MockMouse {
    click: ReturnType<typeof vi.fn>;
    wheel: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
    down: ReturnType<typeof vi.fn>;
    up: ReturnType<typeof vi.fn>;
}
interface MockKeyboard {
    type: ReturnType<typeof vi.fn>;
}
interface MockPage {
    close: ReturnType<typeof vi.fn>;
    setDefaultNavigationTimeout: ReturnType<typeof vi.fn>;
    setDefaultTimeout: ReturnType<typeof vi.fn>;
    route: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
    click: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    locator: ReturnType<typeof vi.fn>;
    scrollIntoViewIfNeeded: ReturnType<typeof vi.fn>;
    waitForSelector: ReturnType<typeof vi.fn>;
    waitForTimeout: ReturnType<typeof vi.fn>;
    innerText: ReturnType<typeof vi.fn>;
    mouse: MockMouse;
    keyboard: MockKeyboard;
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

let locator: MockLocator;
let page: MockPage;
let context: MockContext;
let browser: MockBrowser;

const ACTION_TIMEOUT = 4321;

beforeEach(() => {
    vi.clearAllMocks();

    locator = {
        focus: vi.fn().mockResolvedValue(undefined),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    };
    page = {
        close: vi.fn().mockResolvedValue(undefined),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        route: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('about:blank'),
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue(locator),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        innerText: vi.fn().mockResolvedValue('hello visible world'),
        mouse: {
            click: vi.fn().mockResolvedValue(undefined),
            wheel: vi.fn().mockResolvedValue(undefined),
            move: vi.fn().mockResolvedValue(undefined),
            down: vi.fn().mockResolvedValue(undefined),
            up: vi.fn().mockResolvedValue(undefined),
        },
        keyboard: {
            type: vi.fn().mockResolvedValue(undefined),
        },
    };
    context = {
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
});

async function launchedAdapter(): Promise<PlaywrightBrowserAdapter> {
    const adapter = new PlaywrightBrowserAdapter();
    await adapter.Launch(makeConfig({ ActionTimeoutMs: ACTION_TIMEOUT }));
    return adapter;
}

describe('PlaywrightBrowserAdapter selector branches — Click', () => {
    it('clicks the matched element via page.click when Selector is set', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new ClickAction(), {
            Selector: '#submit',
            Button: 'right' as const,
            ClickCount: 2,
            X: 11,
            Y: 22,
        });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.click).toHaveBeenCalledTimes(1);
        expect(page.click).toHaveBeenCalledWith('#submit', {
            button: 'right',
            clickCount: 2,
            timeout: ACTION_TIMEOUT,
        });
        // Coordinate path must NOT run when a selector is supplied.
        expect(page.mouse.click).not.toHaveBeenCalled();
    });

    it('falls back to the coordinate click when Selector is absent (unchanged behavior)', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new ClickAction(), { X: 11, Y: 22 });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.mouse.click).toHaveBeenCalledTimes(1);
        expect(page.mouse.click).toHaveBeenCalledWith(11, 22, {
            button: 'left',
            clickCount: 1,
        });
        expect(page.click).not.toHaveBeenCalled();
    });
});

describe('PlaywrightBrowserAdapter selector branches — Type', () => {
    it('focuses the matched element then types when Selector is set', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new TypeAction(), {
            Selector: '#email',
            Text: 'a@b.com',
        });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.locator).toHaveBeenCalledWith('#email');
        expect(locator.focus).toHaveBeenCalledWith({ timeout: ACTION_TIMEOUT });
        expect(page.keyboard.type).toHaveBeenCalledWith('a@b.com');
    });

    it('types into the focused element when Selector is absent (unchanged behavior)', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new TypeAction(), { Text: 'plain' });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.keyboard.type).toHaveBeenCalledWith('plain');
        expect(page.locator).not.toHaveBeenCalled();
        expect(locator.focus).not.toHaveBeenCalled();
    });
});

describe('PlaywrightBrowserAdapter selector branches — Scroll', () => {
    it('scrolls the matched element into view when Selector is set', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new ScrollAction(), {
            Selector: '.footer',
            DeltaX: 5,
            DeltaY: 99,
        });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.locator).toHaveBeenCalledWith('.footer');
        expect(locator.scrollIntoViewIfNeeded).toHaveBeenCalledWith({ timeout: ACTION_TIMEOUT });
        // Delta scroll must NOT run when a selector is supplied.
        expect(page.mouse.wheel).not.toHaveBeenCalled();
    });

    it('performs a delta scroll when Selector is absent (unchanged behavior)', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new ScrollAction(), { DeltaX: 5, DeltaY: 99 });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.mouse.wheel).toHaveBeenCalledWith(5, 99);
        expect(page.locator).not.toHaveBeenCalled();
    });
});

describe('PlaywrightBrowserAdapter selector branches — Wait', () => {
    it('waits for the selector (bounded by the action timeout) when Selector is set', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new WaitAction(), {
            Selector: '#ready',
            DurationMs: 5000,
        });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.waitForSelector).toHaveBeenCalledWith('#ready', { timeout: ACTION_TIMEOUT });
        // DurationMs wait must NOT run when a selector is supplied.
        expect(page.waitForTimeout).not.toHaveBeenCalled();
    });

    it('waits DurationMs when Selector is absent (unchanged behavior)', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new WaitAction(), { DurationMs: 750 });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.waitForTimeout).toHaveBeenCalledWith(750);
        expect(page.waitForSelector).not.toHaveBeenCalled();
    });
});

describe('PlaywrightBrowserAdapter.GetVisibleText', () => {
    it('returns the page body innerText when a page is open', async () => {
        const adapter = await launchedAdapter();

        const text = await adapter.GetVisibleText();

        expect(page.innerText).toHaveBeenCalledWith('body');
        expect(text).toBe('hello visible world');
    });

    it('returns an empty string when no page is open (not launched)', async () => {
        const adapter = new PlaywrightBrowserAdapter();

        const text = await adapter.GetVisibleText();

        expect(text).toBe('');
        expect(page.innerText).not.toHaveBeenCalled();
    });
});
