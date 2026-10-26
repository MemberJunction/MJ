import { describe, it, expect, vi, beforeEach } from 'vitest';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch, connect: vi.fn(), connectOverCDP: vi.fn() } }));

import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import { NavigationGuard } from '../browser/NavigationGuard.js';
import { BrowserConfig, NavigateAction } from '../types/browser.js';

type RouteHandler = (route: { request: () => { url: () => string }; abort: (code: string) => Promise<void>; continue: () => Promise<void> }) => Promise<void>;

type FrameListener = (frame: { url: () => string }) => void;
const mainFrame = { url: () => currentUrl };
let currentUrl = 'about:blank';
/** Whether a navigation is in flight: a second one started meanwhile collides with it, as in Chromium. */
let inFlight = false;
/** Where a goto to each URL lands, standing in for a server's redirect. */
let redirects: Record<string, string> = {};
let page: {
    goto: ReturnType<typeof vi.fn>; route: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; mainFrame: () => typeof mainFrame;
    url: () => string; close: () => Promise<void>; setDefaultNavigationTimeout: () => void; setDefaultTimeout: () => void;
};

beforeEach(() => {
    currentUrl = 'about:blank';
    inFlight = false;
    redirects = {};
    page = {
        // Like Chromium: a navigation takes a moment, commits (firing framenavigated) before goto resolves with
        // the landing's response, and one started while another is in flight is interrupted.
        goto: vi.fn(async (url: string) => {
            if (inFlight) {
                throw new Error('page.goto: Navigation is interrupted by another navigation');
            }
            inFlight = true;
            await new Promise((resolve) => setTimeout(resolve, 0));
            inFlight = false;
            const landed = redirects[url] ?? url;
            currentUrl = landed;
            for (const call of page.on.mock.calls) {
                if (call[0] === 'framenavigated') {
                    (call[1] as FrameListener)(mainFrame);
                }
            }
            return landed === 'about:blank' ? null : { url: () => landed };
        }),
        route: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        mainFrame: () => mainFrame,
        url: () => currentUrl,
        close: async () => undefined,
        setDefaultNavigationTimeout: () => undefined,
        setDefaultTimeout: () => undefined,
    };
    const context = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn(), addCookies: vi.fn() };
    launch.mockResolvedValue({ newContext: vi.fn().mockResolvedValue(context), contexts: () => [], close: vi.fn(), isConnected: () => true });
});

async function launched(): Promise<PlaywrightBrowserAdapter> {
    const adapter = new PlaywrightBrowserAdapter();
    await adapter.Launch(new BrowserConfig());
    return adapter;
}

describe('NavigationGuard.IsPrivateNetworkHost', () => {
    it('flags this machine and private networks, trailing dot or not, and IPv6 literals by their prefix', () => {
        for (const host of ['localhost', 'localhost.', 'api.localhost', 'intranet', '127.0.0.1', '127.0.0.1.', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '[fd00::1]', '[fc00::1]', '[fe80::1]', '[::ffff:7f00:1]']) {
            expect([host, NavigationGuard.IsPrivateNetworkHost(host)]).toEqual([host, true]);
        }
    });

    it('lets public names through, including ones that merely start like an IPv6 prefix', () => {
        for (const host of ['example.com', 'fda.gov', 'fdic.gov', 'fcc.gov', 'fe80.example.com', '8.8.8.8', '172.32.0.1', '[2606:4700::1]']) {
            expect([host, NavigationGuard.IsPrivateNetworkHost(host)]).toEqual([host, false]);
        }
    });
});

describe('PlaywrightBrowserAdapter.RestrictNavigation', () => {
    it('leaves an unrestricted adapter as it was', async () => {
        const adapter = await launched();
        await adapter.Navigate('file:///tmp/x.html');
        expect(page.goto).toHaveBeenCalledWith('file:///tmp/x.html', { waitUntil: 'load' });
    });

    it('opens only http(s) and about:blank, through Navigate and through a Navigate action alike', async () => {
        const adapter = await launched();
        await adapter.RestrictNavigation(null);
        await expect(adapter.Navigate('file:///proc/self/environ')).rejects.toThrow('only http and https');
        const action = Object.assign(new NavigateAction(), { Url: 'chrome://settings' });
        expect((await adapter.ExecuteAction(action)).Success).toBe(false);
        await adapter.Navigate('about:blank');
        await adapter.Navigate('http://localhost:4000/'); // no private-network rule without an allow-list
        expect(page.goto.mock.calls.map((c) => c[0])).toEqual(['about:blank', 'http://localhost:4000/']);
    });

    it('with an allow-list, refuses private hosts except those listed, and aborts their requests', async () => {
        const adapter = await launched();
        await adapter.RestrictNavigation(['localhost:4200']);
        await expect(adapter.Navigate('http://localhost:4000/graphql')).rejects.toThrow('private network');
        await expect(adapter.Navigate('http://169.254.169.254/latest/meta-data')).rejects.toThrow('private network');
        await adapter.Navigate('http://localhost:4200/app');
        await adapter.Navigate('https://example.com/');
        expect(page.goto.mock.calls.map((c) => c[0])).toEqual(['http://localhost:4200/app', 'https://example.com/']);

        // A link the page follows or a fetch it makes goes through the route, not Navigate.
        const handler = page.route.mock.calls[0][1] as RouteHandler;
        const request = async (url: string) => {
            const route = { request: () => ({ url: () => url, headers: () => ({}) }), abort: vi.fn().mockResolvedValue(undefined), continue: vi.fn().mockResolvedValue(undefined) };
            await handler(route);
            return route.abort.mock.calls.length > 0 ? 'aborted' : 'continued';
        };
        expect(await request('http://10.0.0.5/admin')).toBe('aborted');
        expect(await request('https://example.com/a.js')).toBe('continued');
    });

    it('refuses a navigation a redirect lands on a private host, even after the listener has moved the page away', async () => {
        const adapter = await launched();
        await adapter.RestrictNavigation([]);
        redirects['https://short.example/x'] = 'http://169.254.169.254/latest/meta-data';
        await expect(adapter.Navigate('https://short.example/x')).rejects.toThrow('redirected to 169.254.169.254');
        expect(page.url()).toBe('about:blank');
        const action = Object.assign(new NavigateAction(), { Url: 'https://short.example/x' });
        const result = await adapter.ExecuteAction(action);
        expect(result.Success).toBe(false);
        expect(result.Error).toContain('redirected to 169.254.169.254');
    });

    it('a refused redirect leaves the next navigation free to run (its about:blank has finished first)', async () => {
        const adapter = await launched();
        await adapter.RestrictNavigation([]);
        redirects['https://short.example/x'] = 'http://169.254.169.254/latest/meta-data';
        await expect(adapter.Navigate('https://short.example/x')).rejects.toThrow('redirected to 169.254.169.254');
        await adapter.Navigate('https://example.com/');
        expect(page.url()).toBe('https://example.com/');
        const action = Object.assign(new NavigateAction(), { Url: 'https://short.example/x' });
        expect((await adapter.ExecuteAction(action)).Error).toContain('redirected to');
        expect((await adapter.ExecuteAction(Object.assign(new NavigateAction(), { Url: 'https://example.org/' }))).Success).toBe(true);
    });

    it('sends the page back when a main-frame navigation it did not start (a followed link) lands on a private host', async () => {
        const adapter = await launched();
        await adapter.RestrictNavigation([]);
        const onNavigated = page.on.mock.calls.find((c) => c[0] === 'framenavigated')![1] as FrameListener;
        currentUrl = 'http://localhost:4000/graphql';
        onNavigated(mainFrame);
        expect(page.goto).toHaveBeenLastCalledWith('about:blank');
    });
});
