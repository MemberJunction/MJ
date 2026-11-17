/**
 * @fileoverview The headless renderer's Render, against a stand-in for Playwright, so it runs everywhere (the
 * real-browser tests in HeadlessPageRenderer.test.ts skip without Chromium).
 *
 * The stand-in browser sends each navigation through the route the renderer registered, as Chromium does, and
 * the route's fetches answer from a table of addresses. What is checked: the page may open no WebSocket, a
 * redirect of the page is checked before the page goes there, and a page whose address is refused once it
 * has loaded is not returned.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from 'playwright';

const INTERNAL = 'http://10.0.0.5';

/** What each address answers: a status, and where it redirects. */
let answers: Record<string, { status: number; location?: string }> = {};
/** Where the page ends up, when a test wants it somewhere the route never saw. */
let landOn: string | null = null;
const fetched: string[] = [];
let socketHandler: ((socket: { close: (o: unknown) => void }) => void) | null = null;

function apiResponse(url: string) {
    const a = answers[url] ?? { status: 200 };
    return { status: () => a.status, headers: () => (a.location ? { location: a.location } : {}) };
}

vi.mock('playwright', () => {
    const makeContext = () => {
        let handler: ((route: Route) => Promise<void>) | null = null;
        const mainFrame = {};
        let current = 'about:blank';
        const page = {
            mainFrame: () => mainFrame,
            url: () => current,
            content: async () => '<html><body>page</body></html>',
            goto: async (url: string) => {
                let fulfilled: { status?: number } | undefined;
                let aborted = false;
                const route = {
                    request: () => ({
                        url: () => url,
                        method: () => 'GET',
                        headers: () => ({}),
                        postDataBuffer: () => null,
                        isNavigationRequest: () => true,
                        frame: () => mainFrame,
                    }),
                    fetch: async () => {
                        fetched.push(url);
                        return apiResponse(url);
                    },
                    fulfill: async (o: { response?: { status: () => number }; status?: number }) => {
                        fulfilled = { status: o.response ? o.response.status() : o.status };
                    },
                    abort: async () => {
                        aborted = true;
                    },
                    continue: async () => undefined,
                };
                await handler!(route as unknown as Route);
                if (aborted) {
                    throw new Error(`net::ERR_BLOCKED_BY_CLIENT at ${url}`);
                }
                current = landOn ?? url;
                return { status: () => fulfilled?.status ?? 0 };
            },
        };
        return {
            request: { fetch: async (url: string) => (fetched.push(url), apiResponse(url)) },
            route: async (_pattern: string, h: (route: Route) => Promise<void>) => {
                handler = h;
            },
            routeWebSocket: async (_pattern: RegExp, h: typeof socketHandler) => {
                socketHandler = h;
            },
            newPage: async () => page,
            close: async () => undefined,
        };
    };
    const browser = { newContext: async () => makeContext(), isConnected: () => true, close: async () => undefined, once: () => undefined };
    return { chromium: { launch: async () => browser } };
});

import { HeadlessPageRenderer } from '../HeadlessPageRenderer.js';

class TestRenderer extends HeadlessPageRenderer {
    protected override async AssertAllowed(url: string): Promise<void> {
        if (url.startsWith(INTERNAL)) {
            throw new Error(`refused ${url}`);
        }
    }
}

const render = (url: string) => new TestRenderer().Render({ URL: url, AccessOrigins: [], Signal: new AbortController().signal });

afterEach(async () => {
    answers = {};
    landOn = null;
    fetched.length = 0;
    socketHandler = null;
    await HeadlessPageRenderer.Shutdown();
});

describe('Render', () => {
    it('closes every WebSocket the page opens', async () => {
        await render('https://site.test/page');
        const close = vi.fn();
        socketHandler!({ close });
        expect(close).toHaveBeenCalled();
    });

    it("follows the page's redirect, each hop through the route", async () => {
        answers = { 'https://site.test/old': { status: 301, location: '/new' } };
        const result = await render('https://site.test/old');
        expect(fetched).toEqual(['https://site.test/old', 'https://site.test/new']);
        expect(result.FinalURL).toBe('https://site.test/new');
        expect(result.Status).toBe(200);
    });

    it('refuses a redirect of the page to a refused address, naming it, without going there', async () => {
        answers = { 'https://site.test/old': { status: 302, location: `${INTERNAL}/secret` } };
        await expect(render('https://site.test/old')).rejects.toThrow(`refused ${INTERNAL}/secret`);
        expect(fetched).toEqual(['https://site.test/old']);
    });

    it('refuses a page whose address is refused once it has loaded', async () => {
        landOn = `${INTERNAL}/landed`;
        await expect(render('https://site.test/page')).rejects.toThrow(`refused ${INTERNAL}/landed`);
    });
});
