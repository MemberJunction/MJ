import { describe, it, expect, vi, beforeEach } from 'vitest';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch, connect: vi.fn(), connectOverCDP: vi.fn() } }));

import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import { NavigationGuard } from '../browser/NavigationGuard.js';
import { BrowserConfig, NavigateAction } from '../types/browser.js';

type RouteHandler = (route: { request: () => { url: () => string }; abort: (code: string) => Promise<void>; continue: () => Promise<void> }) => Promise<void>;

let page: { goto: ReturnType<typeof vi.fn>; route: ReturnType<typeof vi.fn>; url: () => string; close: () => Promise<void>; setDefaultNavigationTimeout: () => void; setDefaultTimeout: () => void };

beforeEach(() => {
    page = {
        goto: vi.fn().mockResolvedValue(undefined),
        route: vi.fn().mockResolvedValue(undefined),
        url: () => 'about:blank',
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
    it('flags this machine and private networks, not public hosts', () => {
        for (const host of ['localhost', 'api.localhost', 'intranet', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', 'fd00::1', 'fe80::1']) {
            expect(NavigationGuard.IsPrivateNetworkHost(host)).toBe(true);
        }
        for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '[2606:4700::1]']) {
            expect(NavigationGuard.IsPrivateNetworkHost(host)).toBe(false);
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
});
