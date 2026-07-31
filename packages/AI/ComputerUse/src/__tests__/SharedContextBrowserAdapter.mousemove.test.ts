import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserContext } from 'playwright';
import { SharedContextBrowserAdapter } from '../browser/SharedContextBrowserAdapter.js';
import { BrowserConfig, MouseMoveAction } from '../types/browser.js';

// SharedContextBrowserAdapter imports playwright only as a TYPE, so no module
// mock is needed — we hand it a mock BrowserContext at construction time and
// drive a Page mock through it. This verifies the additive MouseMove case was
// wired into the adapter's own (duplicated) action switch.

interface MockMouse {
    click: ReturnType<typeof vi.fn>;
    wheel: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
    down: ReturnType<typeof vi.fn>;
    up: ReturnType<typeof vi.fn>;
}
interface MockPage {
    close: ReturnType<typeof vi.fn>;
    setDefaultNavigationTimeout: ReturnType<typeof vi.fn>;
    setDefaultTimeout: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
    isClosed: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    mouse: MockMouse;
    accessibility: { snapshot: ReturnType<typeof vi.fn> };
    locator: ReturnType<typeof vi.fn>;
}
interface MockContext {
    newPage: ReturnType<typeof vi.fn>;
}

let page: MockPage;
let context: MockContext;

beforeEach(() => {
    vi.clearAllMocks();
    page = {
        close: vi.fn().mockResolvedValue(undefined),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        url: vi.fn().mockReturnValue('about:blank'),
        isClosed: vi.fn().mockReturnValue(false),
        on: vi.fn(),
        mouse: {
            click: vi.fn().mockResolvedValue(undefined),
            wheel: vi.fn().mockResolvedValue(undefined),
            move: vi.fn().mockResolvedValue(undefined),
            down: vi.fn().mockResolvedValue(undefined),
            up: vi.fn().mockResolvedValue(undefined),
        },
        accessibility: { snapshot: vi.fn().mockResolvedValue({ role: 'WebArea', name: 'Test', children: [] }) },
        locator: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    };
    context = {
        newPage: vi.fn().mockResolvedValue(page),
    };
});

async function launchedAdapter(): Promise<SharedContextBrowserAdapter> {
    // Cast the mock context to the Playwright type the constructor expects.
    const adapter = new SharedContextBrowserAdapter(context as unknown as BrowserContext);
    await adapter.Launch(new BrowserConfig());
    return adapter;
}

describe('SharedContextBrowserAdapter — MouseMove action', () => {
    it('moves the cursor via page.mouse.move (additive switch case compiles & runs)', async () => {
        const adapter = await launchedAdapter();
        const action = Object.assign(new MouseMoveAction(), { X: 55, Y: 66 });

        const result = await adapter.ExecuteAction(action);

        expect(result.Success).toBe(true);
        expect(page.mouse.move).toHaveBeenCalledTimes(1);
        expect(page.mouse.move).toHaveBeenCalledWith(55, 66);
        expect(page.mouse.down).not.toHaveBeenCalled();
        expect(page.mouse.up).not.toHaveBeenCalled();
        expect(page.mouse.click).not.toHaveBeenCalled();
    });
});

describe('SharedContextBrowserAdapter — perception (delegates to shared helpers, CU-A3)', () => {
    it('GetAccessibilitySnapshot maps the real page snapshot (no longer the base no-op null)', async () => {
        const adapter = await launchedAdapter();
        const snapshot = await adapter.GetAccessibilitySnapshot();
        // Proves SCBA now runs real perception (page.accessibility.snapshot),
        // not the inherited base no-op that always returned null pre-CU-A3.
        expect(snapshot).not.toBeNull();
        expect(snapshot?.Role).toBe('WebArea');
        expect(page.accessibility.snapshot).toHaveBeenCalledTimes(1);
    });

    it('QueryElement runs page.locator (absent element → Exists:false via real query, not a no-op)', async () => {
        const adapter = await launchedAdapter();
        const info = await adapter.QueryElement('#x');
        expect(page.locator).toHaveBeenCalledWith('#x');
        expect(info.Exists).toBe(false);
        expect(info.Visible).toBe(false);
        expect(info.Text).toBe('');
    });

    it('StartScreencast resolves as a no-op (screencast is a live-view feature SCBA does not provide)', async () => {
        const adapter = await launchedAdapter();
        const frames: unknown[] = [];
        await expect(adapter.StartScreencast(f => frames.push(f))).resolves.toBeUndefined();
        expect(frames).toHaveLength(0);
    });
});
