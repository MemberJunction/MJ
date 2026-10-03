/**
 * MermaidRenderer drives headless Chromium through Playwright. These tests replace Playwright with
 * a fake browser so they cover the renderer's own contract — error classification, page cleanup,
 * the network lockdown, config precedence and relaunch — without needing a browser binary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakePage {
    setDefaultTimeout: ReturnType<typeof vi.fn>;
    route: ReturnType<typeof vi.fn>;
    setContent: ReturnType<typeof vi.fn>;
    addScriptTag: ReturnType<typeof vi.fn>;
    evaluate: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}

interface FakeBrowser {
    isConnected: ReturnType<typeof vi.fn>;
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}

const launchMock = vi.fn();

vi.mock('playwright', () => ({
    chromium: { launch: (...args: unknown[]) => launchMock(...args) },
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
}));

import { MermaidRenderer } from '../custom/visualization/shared/mermaid-renderer';

function makePage(evaluateResult: unknown | (() => Promise<unknown>)): FakePage {
    return {
        setDefaultTimeout: vi.fn(),
        route: vi.fn().mockResolvedValue(undefined),
        setContent: vi.fn().mockResolvedValue(undefined),
        addScriptTag: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn(typeof evaluateResult === 'function'
            ? evaluateResult as () => Promise<unknown>
            : async () => evaluateResult),
        close: vi.fn().mockResolvedValue(undefined),
    };
}

function makeBrowser(page: FakePage, connected = true): FakeBrowser {
    return {
        isConnected: vi.fn().mockReturnValue(connected),
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
    };
}

describe('MermaidRenderer', () => {
    beforeEach(async () => {
        launchMock.mockReset();
        // The renderer is a process-wide singleton; drop any browser a previous test left behind.
        await MermaidRenderer.Instance.Shutdown();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the SVG the page rendered and closes the page', async () => {
        const page = makePage({ ok: true, svg: '<svg>ok</svg>' });
        launchMock.mockResolvedValue(makeBrowser(page));

        const result = await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});

        expect(result).toEqual({ Success: true, Svg: '<svg>ok</svg>' });
        expect(page.close).toHaveBeenCalledTimes(1);
    });

    it('loads the bundled Mermaid script and blocks every network request', async () => {
        const page = makePage({ ok: true, svg: '<svg/>' });
        launchMock.mockResolvedValue(makeBrowser(page));

        await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});

        const scriptArg = page.addScriptTag.mock.calls[0][0] as { path: string };
        expect(scriptArg.path).toMatch(/mermaid[\\/]dist[\\/]mermaid\.min\.js$/);
        const [pattern, handler] = page.route.mock.calls[0] as [string, (route: { abort: () => void }) => void];
        expect(pattern).toBe('**/*');
        const route = { abort: vi.fn() };
        handler(route);
        expect(route.abort).toHaveBeenCalled();
    });

    it('lets the theme and strict security level win over caller config', async () => {
        const page = makePage({ ok: true, svg: '<svg/>' });
        launchMock.mockResolvedValue(makeBrowser(page));

        await MermaidRenderer.Instance.Render('pie\n"A": 1', 'dark', { securityLevel: 'loose', fontSize: 14 });

        const args = page.evaluate.mock.calls[0][1] as { Code: string; Config: Record<string, unknown> };
        expect(args.Code).toBe('pie\n"A": 1');
        expect(args.Config).toMatchObject({ theme: 'dark', securityLevel: 'strict', startOnLoad: false, fontSize: 14 });
    });

    it('reports a Mermaid syntax error as RENDER_FAILED and still closes the page', async () => {
        const page = makePage({ ok: false, error: 'Parse error on line 2' });
        launchMock.mockResolvedValue(makeBrowser(page));

        const result = await MermaidRenderer.Instance.Render('flowchart TD\nA-->', 'default', {});

        expect(result).toEqual({ Success: false, ErrorCode: 'RENDER_FAILED', Message: 'Parse error on line 2' });
        expect(page.close).toHaveBeenCalledTimes(1);
    });

    it('reports BROWSER_UNAVAILABLE when Chromium cannot launch, and tries again next time', async () => {
        launchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));

        const first = await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});
        expect(first.Success).toBe(false);
        expect(first.Success === false && first.ErrorCode).toBe('BROWSER_UNAVAILABLE');
        expect(first.Success === false && first.Message).toContain("Executable doesn't exist");

        const page = makePage({ ok: true, svg: '<svg/>' });
        launchMock.mockResolvedValueOnce(makeBrowser(page));
        const second = await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});
        expect(second.Success).toBe(true);
        expect(launchMock).toHaveBeenCalledTimes(2);
    });

    it('reuses one browser across renders', async () => {
        const browser = makeBrowser(makePage({ ok: true, svg: '<svg/>' }));
        launchMock.mockResolvedValue(browser);

        await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});
        await MermaidRenderer.Instance.Render('flowchart TD\nB-->C', 'default', {});

        expect(launchMock).toHaveBeenCalledTimes(1);
        expect(browser.newPage).toHaveBeenCalledTimes(2);
    });

    it('relaunches when the shared browser has disconnected', async () => {
        const dead = makeBrowser(makePage({ ok: true, svg: '<svg/>' }));
        const fresh = makeBrowser(makePage({ ok: true, svg: '<svg>fresh</svg>' }));
        launchMock.mockResolvedValueOnce(dead).mockResolvedValueOnce(fresh);

        await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});
        dead.isConnected.mockReturnValue(false);
        const result = await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});

        expect(result).toEqual({ Success: true, Svg: '<svg>fresh</svg>' });
        expect(launchMock).toHaveBeenCalledTimes(2);
    });

    it('gives up on a render that never finishes and reports TIMEOUT', async () => {
        vi.useFakeTimers();
        const page = makePage(() => new Promise(() => undefined));
        launchMock.mockResolvedValue(makeBrowser(page));

        const pending = MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});
        await vi.advanceTimersByTimeAsync(20_000);
        const result = await pending;

        expect(result.Success).toBe(false);
        expect(result.Success === false && result.ErrorCode).toBe('TIMEOUT');
        expect(page.close).toHaveBeenCalledTimes(1);
    });

    it('closes the shared browser on Shutdown', async () => {
        const browser = makeBrowser(makePage({ ok: true, svg: '<svg/>' }));
        launchMock.mockResolvedValue(browser);
        await MermaidRenderer.Instance.Render('flowchart TD\nA-->B', 'default', {});

        await MermaidRenderer.Instance.Shutdown();

        expect(browser.close).toHaveBeenCalledTimes(1);
    });
});
