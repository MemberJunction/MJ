import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted Playwright spies so the vi.mock factory (hoisted above imports) can
// reference them. PlaywrightBrowserAdapter dynamically imports 'playwright', so
// we mock the module to fully isolate from any real browser/CDP. These tests
// cover the additive perception + screencast + MouseMove capabilities.
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
    MouseMoveAction,
    ScreencastFrame,
} from '../types/browser.js';

function makeConfig(overrides: Partial<BrowserConfig> = {}): BrowserConfig {
    const cfg = new BrowserConfig();
    Object.assign(cfg, overrides);
    return cfg;
}

// ─── Mock shapes (only the members the adapter touches) ────────
interface MockLocator {
    count: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    innerText: ReturnType<typeof vi.fn>;
    boundingBox: ReturnType<typeof vi.fn>;
}
interface MockMouse {
    click: ReturnType<typeof vi.fn>;
    wheel: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
    down: ReturnType<typeof vi.fn>;
    up: ReturnType<typeof vi.fn>;
}
interface MockAccessibility {
    snapshot: ReturnType<typeof vi.fn>;
}
interface MockPage {
    close: ReturnType<typeof vi.fn>;
    setDefaultNavigationTimeout: ReturnType<typeof vi.fn>;
    setDefaultTimeout: ReturnType<typeof vi.fn>;
    route: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
    title: ReturnType<typeof vi.fn>;
    waitForLoadState: ReturnType<typeof vi.fn>;
    locator: ReturnType<typeof vi.fn>;
    accessibility: MockAccessibility;
    mouse: MockMouse;
}
interface MockCDPSession {
    on: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
}
interface MockContext {
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addCookies: ReturnType<typeof vi.fn>;
    newCDPSession: ReturnType<typeof vi.fn>;
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
let cdpSession: MockCDPSession;

// Captured Page.screencastFrame listener so tests can drive frame emission.
let screencastFrameListener: ((payload: unknown) => void) | null;

const ACTION_TIMEOUT = 4321;

beforeEach(() => {
    vi.clearAllMocks();
    screencastFrameListener = null;

    locator = {
        count: vi.fn().mockResolvedValue(1),
        first: vi.fn(),
        isVisible: vi.fn().mockResolvedValue(true),
        innerText: vi.fn().mockResolvedValue('element text'),
        boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 30, height: 40 }),
    };
    // locator.first() returns the same locator object (chainable reads).
    locator.first.mockReturnValue(locator);

    cdpSession = {
        on: vi.fn((event: string, handler: (payload: unknown) => void) => {
            if (event === 'Page.screencastFrame') {
                screencastFrameListener = handler;
            }
        }),
        send: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
    };

    page = {
        close: vi.fn().mockResolvedValue(undefined),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        route: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('about:blank'),
        title: vi.fn().mockResolvedValue('Page Title'),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue(locator),
        accessibility: {
            snapshot: vi.fn().mockResolvedValue(null),
        },
        mouse: {
            click: vi.fn().mockResolvedValue(undefined),
            wheel: vi.fn().mockResolvedValue(undefined),
            move: vi.fn().mockResolvedValue(undefined),
            down: vi.fn().mockResolvedValue(undefined),
            up: vi.fn().mockResolvedValue(undefined),
        },
    };
    context = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
        addCookies: vi.fn().mockResolvedValue(undefined),
        newCDPSession: vi.fn().mockResolvedValue(cdpSession),
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

// ─── MouseMove action ──────────────────────────────────────────
describe('PlaywrightBrowserAdapter — MouseMove action', () => {
    it('moves the cursor to the given coordinates via page.mouse.move', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new MouseMoveAction(), { X: 120, Y: 240 });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.mouse.move).toHaveBeenCalledTimes(1);
        expect(page.mouse.move).toHaveBeenCalledWith(120, 240);
        // No button press should be issued by a mouse move.
        expect(page.mouse.down).not.toHaveBeenCalled();
        expect(page.mouse.up).not.toHaveBeenCalled();
        expect(page.mouse.click).not.toHaveBeenCalled();
    });
});

// ─── GetTitle ──────────────────────────────────────────────────
describe('PlaywrightBrowserAdapter.GetTitle', () => {
    it('returns the page title when a page is open', async () => {
        const adapter = await launchedAdapter();

        const title = await adapter.GetTitle();

        expect(page.title).toHaveBeenCalledTimes(1);
        expect(title).toBe('Page Title');
    });

    it('returns an empty string when no page is open', async () => {
        const adapter = new PlaywrightBrowserAdapter();

        const title = await adapter.GetTitle();

        expect(title).toBe('');
        expect(page.title).not.toHaveBeenCalled();
    });
});

// ─── WaitForLoadState ──────────────────────────────────────────
describe('PlaywrightBrowserAdapter.WaitForLoadState', () => {
    it('forwards the requested state to page.waitForLoadState', async () => {
        const adapter = await launchedAdapter();

        await adapter.WaitForLoadState('networkidle');

        expect(page.waitForLoadState).toHaveBeenCalledTimes(1);
        expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle');
    });

    it('is a no-op when no page is open (never throws)', async () => {
        const adapter = new PlaywrightBrowserAdapter();

        await expect(adapter.WaitForLoadState('load')).resolves.toBeUndefined();
        expect(page.waitForLoadState).not.toHaveBeenCalled();
    });
});

// ─── GetAccessibilitySnapshot ──────────────────────────────────
describe('PlaywrightBrowserAdapter.GetAccessibilitySnapshot', () => {
    it('maps a nested Playwright snapshot into AccessibilityNode (recursive)', async () => {
        const adapter = await launchedAdapter();
        page.accessibility.snapshot.mockResolvedValue({
            role: 'WebArea',
            name: 'Root',
            children: [
                { role: 'heading', name: 'Title' },
                {
                    role: 'textbox',
                    name: 'Email',
                    value: 'a@b.com',
                    children: [{ role: 'text', name: 'inner' }],
                },
            ],
        });

        const node = await adapter.GetAccessibilitySnapshot();

        expect(node).not.toBeNull();
        expect(node!.Role).toBe('WebArea');
        expect(node!.Name).toBe('Root');
        expect(node!.Value).toBeUndefined();
        expect(node!.Children).toHaveLength(2);

        const [heading, textbox] = node!.Children!;
        expect(heading.Role).toBe('heading');
        expect(heading.Name).toBe('Title');
        expect(heading.Children).toBeUndefined(); // empty children omitted

        expect(textbox.Role).toBe('textbox');
        expect(textbox.Value).toBe('a@b.com');
        expect(textbox.Children).toHaveLength(1);
        expect(textbox.Children![0].Name).toBe('inner');
    });

    it('coerces a numeric value to string', async () => {
        const adapter = await launchedAdapter();
        page.accessibility.snapshot.mockResolvedValue({ role: 'slider', name: 'Volume', value: 42 });

        const node = await adapter.GetAccessibilitySnapshot();

        expect(node!.Value).toBe('42');
    });

    it('returns null when Playwright produces no snapshot', async () => {
        const adapter = await launchedAdapter();
        page.accessibility.snapshot.mockResolvedValue(null);

        const node = await adapter.GetAccessibilitySnapshot();

        expect(node).toBeNull();
    });

    it('returns null when no page is open', async () => {
        const adapter = new PlaywrightBrowserAdapter();

        const node = await adapter.GetAccessibilitySnapshot();

        expect(node).toBeNull();
        expect(page.accessibility.snapshot).not.toHaveBeenCalled();
    });
});

// ─── QueryElement ──────────────────────────────────────────────
describe('PlaywrightBrowserAdapter.QueryElement', () => {
    it('reports a present, visible element with text and bounding box', async () => {
        const adapter = await launchedAdapter();

        const info = await adapter.QueryElement('#email');

        expect(page.locator).toHaveBeenCalledWith('#email');
        expect(info.Exists).toBe(true);
        expect(info.Visible).toBe(true);
        expect(info.Text).toBe('element text');
        expect(info.BoundingBox).toBeDefined();
        expect(info.BoundingBox!.XMin).toBe(10);
        expect(info.BoundingBox!.YMin).toBe(20);
        expect(info.BoundingBox!.XMax).toBe(40); // 10 + 30
        expect(info.BoundingBox!.YMax).toBe(60); // 20 + 40
    });

    it('reports a missing element as not-found without throwing', async () => {
        const adapter = await launchedAdapter();
        locator.count.mockResolvedValue(0);

        const info = await adapter.QueryElement('.nope');

        expect(info.Exists).toBe(false);
        expect(info.Visible).toBe(false);
        expect(info.Text).toBe('');
        expect(info.BoundingBox).toBeUndefined();
        // Should short-circuit before reading visibility/text/box.
        expect(locator.isVisible).not.toHaveBeenCalled();
    });

    it('reports an invisible element with no bounding box', async () => {
        const adapter = await launchedAdapter();
        locator.isVisible.mockResolvedValue(false);
        locator.boundingBox.mockResolvedValue(null);

        const info = await adapter.QueryElement('.hidden');

        expect(info.Exists).toBe(true);
        expect(info.Visible).toBe(false);
        expect(info.BoundingBox).toBeUndefined();
    });

    it('swallows an innerText failure and still returns the element', async () => {
        const adapter = await launchedAdapter();
        locator.innerText.mockRejectedValue(new Error('detached'));

        const info = await adapter.QueryElement('.flaky');

        expect(info.Exists).toBe(true);
        expect(info.Text).toBe('');
    });

    it('returns not-found defaults when no page is open', async () => {
        const adapter = new PlaywrightBrowserAdapter();

        const info = await adapter.QueryElement('#anything');

        expect(info.Exists).toBe(false);
        expect(page.locator).not.toHaveBeenCalled();
    });
});

// ─── Screencast ────────────────────────────────────────────────
describe('PlaywrightBrowserAdapter screencast', () => {
    it('starts a CDP screencast, emits decoded frames with monotonic sequence, and acks each', async () => {
        const adapter = await launchedAdapter();
        const frames: ScreencastFrame[] = [];

        await adapter.StartScreencast(f => frames.push(f), { Format: 'png', MaxWidth: 800, Quality: 70 });

        // CDP session obtained from the context for our page.
        expect(context.newCDPSession).toHaveBeenCalledWith(page);
        // startScreencast invoked with mapped options.
        expect(cdpSession.send).toHaveBeenCalledWith('Page.startScreencast', expect.objectContaining({
            format: 'png',
            maxWidth: 800,
            quality: 70,
        }));
        expect(screencastFrameListener).toBeTypeOf('function');

        // Drive two frames through the captured listener.
        screencastFrameListener!({
            data: 'AAA',
            sessionId: 11,
            metadata: { deviceWidth: 640, deviceHeight: 480 },
        });
        screencastFrameListener!({
            data: 'BBB',
            sessionId: 12,
            metadata: { deviceWidth: 640, deviceHeight: 480 },
        });

        expect(frames).toHaveLength(2);
        expect(frames[0].DataBase64).toBe('AAA');
        expect(frames[0].Width).toBe(640);
        expect(frames[0].Height).toBe(480);
        expect(frames[0].SequenceNumber).toBe(0);
        expect(frames[1].DataBase64).toBe('BBB');
        expect(frames[1].SequenceNumber).toBe(1); // monotonic

        // Each frame is acked with its sessionId.
        expect(cdpSession.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 11 });
        expect(cdpSession.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 12 });
    });

    it('defaults to jpeg format when no options are supplied', async () => {
        const adapter = await launchedAdapter();

        await adapter.StartScreencast(() => {});

        expect(cdpSession.send).toHaveBeenCalledWith('Page.startScreencast', expect.objectContaining({
            format: 'jpeg',
        }));
    });

    it('does not double-subscribe when StartScreencast is called twice', async () => {
        const adapter = await launchedAdapter();

        await adapter.StartScreencast(() => {});
        await adapter.StartScreencast(() => {});

        // Only one CDP session created / one startScreencast issued.
        expect(context.newCDPSession).toHaveBeenCalledTimes(1);
        const startCalls = cdpSession.send.mock.calls.filter(c => c[0] === 'Page.startScreencast');
        expect(startCalls).toHaveLength(1);
    });

    it('stops the screencast: sends Page.stopScreencast and detaches the session', async () => {
        const adapter = await launchedAdapter();
        await adapter.StartScreencast(() => {});

        await adapter.StopScreencast();

        expect(cdpSession.send).toHaveBeenCalledWith('Page.stopScreencast');
        expect(cdpSession.detach).toHaveBeenCalledTimes(1);
    });

    it('StopScreencast is a no-op when no screencast is running', async () => {
        const adapter = await launchedAdapter();

        await expect(adapter.StopScreencast()).resolves.toBeUndefined();
        expect(cdpSession.detach).not.toHaveBeenCalled();
    });

    it('throws via requirePage when starting a screencast before launch', async () => {
        const adapter = new PlaywrightBrowserAdapter();

        await expect(adapter.StartScreencast(() => {})).rejects.toThrow(/Browser not launched/);
    });
});
