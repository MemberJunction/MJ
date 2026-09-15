import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserContext, Locator } from 'playwright';
import { SharedContextBrowserAdapter } from '../browser/SharedContextBrowserAdapter.js';
import { BrowserConfig, ClickAction } from '../types/browser.js';

/**
 * SCBA is the adapter the regression suite actually runs on, and its action
 * switch is a hand-maintained duplicate of PBA's — so an overlay fix applied to
 * one adapter and not the other leaves the suite exactly as broken as before.
 * This is the behavioral half of the parity gate.
 */

interface MockLocator {
    click: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    evaluateAll: ReturnType<typeof vi.fn>;
    nth: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
}

const OVERLAY_INTERCEPTION = new Error(
    'locator.click: Timeout 10000ms exceeded.\n' +
    'Call log:\n  - waiting for locator("#submit")\n' +
    '  - <div class="cdk-overlay-backdrop"></div> intercepts pointer events'
);

let locator: MockLocator;
let page: { keyboard: { press: ReturnType<typeof vi.fn> }; [k: string]: unknown };
let context: { newPage: ReturnType<typeof vi.fn> };

beforeEach(() => {
    vi.clearAllMocks();
    locator = {
        click: vi.fn().mockResolvedValue(undefined),
        count: vi.fn().mockResolvedValue(1),
        evaluateAll: vi.fn().mockResolvedValue([{ width: 10, height: 10 }]),
        nth: vi.fn(),
        first: vi.fn(),
    };
    locator.first.mockReturnValue(locator);
    page = {
        close: vi.fn().mockResolvedValue(undefined),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        url: vi.fn().mockReturnValue('about:blank'),
        isClosed: vi.fn().mockReturnValue(false),
        on: vi.fn(),
        keyboard: { press: vi.fn().mockResolvedValue(undefined) },
        locator: vi.fn().mockReturnValue(locator as unknown as Locator),
    };
    context = { newPage: vi.fn().mockResolvedValue(page) };
});

async function launchedAdapter(): Promise<SharedContextBrowserAdapter> {
    const adapter = new SharedContextBrowserAdapter(context as unknown as BrowserContext);
    await adapter.Launch(new BrowserConfig());
    return adapter;
}

describe('SharedContextBrowserAdapter selector click — blocking overlay', () => {
    it('dismisses the overlay and retries the click once', async () => {
        const adapter = await launchedAdapter();
        locator.click.mockRejectedValueOnce(OVERLAY_INTERCEPTION);

        const result = await adapter.ExecuteAction(Object.assign(new ClickAction(), { Selector: '#submit' }));

        expect(page.keyboard.press).toHaveBeenCalledWith('Escape');
        expect(locator.click).toHaveBeenCalledTimes(2);
        expect(result.Success).toBe(true);
    });

    it('leaves an ordinary timeout alone — nothing to dismiss', async () => {
        const adapter = await launchedAdapter();
        locator.click.mockRejectedValue(new Error('locator.click: Timeout 10000ms exceeded.'));

        const result = await adapter.ExecuteAction(Object.assign(new ClickAction(), { Selector: '#submit' }));

        expect(page.keyboard.press).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
    });
});
