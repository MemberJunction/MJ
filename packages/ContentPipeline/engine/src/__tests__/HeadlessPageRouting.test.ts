/**
 * @fileoverview The headless renderer's route, without a browser: what it refuses, what it fetches, and how
 * it handles a redirect. These run everywhere (the tests in HeadlessPageRenderer.test.ts need Chromium and
 * skip without it), so the SSRF checks are exercised in every CI run.
 *
 * A route sees only the first request of a redirect; the browser would follow the rest unchecked. So the route
 * fetches every request without following redirects: the page's own navigation stops at a redirect and says
 * where it points, and anything else has its redirects followed here, every hop checked.
 */
import { describe, expect, it, vi } from 'vitest';
import type { APIRequestContext, APIResponse, Page, Route } from 'playwright';
import type { PageRenderRequest } from '@memberjunction/content-pipeline-base';
import { HeadlessPageRenderer, HeadlessRenderState } from '../HeadlessPageRenderer.js';

const SITE = 'https://site.test';
const CDN = 'https://cdn.test';
const INTERNAL = 'http://10.0.0.5';

class TestRenderer extends HeadlessPageRenderer {
    public readonly Checked: string[] = [];
    protected override async AssertAllowed(url: string): Promise<void> {
        this.Checked.push(url);
        if (url.startsWith(INTERNAL)) {
            throw new Error(`refused ${url}`);
        }
    }
    public Route(route: Route, request: PageRenderRequest, state: HeadlessRenderState): Promise<void> {
        return this.RouteRequest(route, request, state);
    }
}

function answer(status: number, location?: string): APIResponse {
    return { status: () => status, headers: () => (location ? { location } : {}) } as unknown as APIResponse;
}

const mainFrame = {};
const page = { mainFrame: () => mainFrame } as unknown as Page;

/** A request the page made, its route's calls, and the render's state. */
function setup(options: { url: string; navigation?: boolean; method?: string; body?: string; first: APIResponse; later?: APIResponse[] }) {
    const later = [...(options.later ?? [])];
    const route = {
        request: () => ({
            url: () => options.url,
            method: () => options.method ?? 'GET',
            headers: () => ({ accept: '*/*' }),
            postDataBuffer: () => (options.body ? Buffer.from(options.body) : null),
            isNavigationRequest: () => options.navigation ?? false,
            frame: () => (options.navigation ? mainFrame : {}),
        }),
        fetch: vi.fn(async () => options.first),
        fulfill: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
        continue: vi.fn(async () => undefined),
    };
    const requests = { fetch: vi.fn(async () => later.shift() ?? answer(200)) };
    const state: HeadlessRenderState = {
        Page: page,
        RedirectTo: null,
        Requests: requests as unknown as APIRequestContext,
    };
    return { route, requests, state, asRoute: route as unknown as Route };
}

const plain: PageRenderRequest = { URL: `${SITE}/page`, AccessOrigins: [], Signal: new AbortController().signal };
const withSession: PageRenderRequest = { ...plain, Access: { Headers: { Authorization: 'Bearer s' } }, AccessOrigins: [SITE] };

describe("the headless renderer's route", () => {
    it('refuses a request to a refused address without fetching it', async () => {
        const { route, asRoute, state } = setup({ url: `${INTERNAL}/x`, first: answer(200) });
        await new TestRenderer().Route(asRoute, plain, state);
        expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
        expect(route.fetch).not.toHaveBeenCalled();
    });

    it('fetches an allowed request without following redirects, and hands the browser the answer', async () => {
        const first = answer(200);
        const { route, asRoute, state } = setup({ url: `${SITE}/a.js`, first });
        await new TestRenderer().Route(asRoute, plain, state);
        expect(route.fetch).toHaveBeenCalledWith(expect.objectContaining({ maxRedirects: 0 }));
        expect(route.fulfill).toHaveBeenCalledWith({ response: first });
    });

    it("sends the session's headers only to the session's own origins", async () => {
        const own = setup({ url: `${SITE}/a.js`, first: answer(200) });
        await new TestRenderer().Route(own.asRoute, withSession, own.state);
        expect(own.route.fetch).toHaveBeenCalledWith(expect.objectContaining({ headers: { accept: '*/*', Authorization: 'Bearer s' } }));

        const other = setup({ url: `${CDN}/a.js`, first: answer(200) });
        await new TestRenderer().Route(other.asRoute, withSession, other.state);
        expect(other.route.fetch).toHaveBeenCalledWith(expect.objectContaining({ headers: { accept: '*/*' } }));
    });

    it('re-checks every request through AssertAllowed, even on the same origin', async () => {
        const renderer = new TestRenderer();
        const one = setup({ url: `${SITE}/a.js`, first: answer(200) });
        await renderer.Route(one.asRoute, plain, one.state);
        const two = setup({ url: `${SITE}/b.js`, first: answer(200) });
        await renderer.Route(two.asRoute, plain, two.state);
        expect(renderer.Checked).toEqual([`${SITE}/a.js`, `${SITE}/b.js`]);
    });
});

describe('a redirect of something the page loads', () => {
    it('is refused when a hop points at a refused address, which is never fetched', async () => {
        const { route, requests, asRoute, state } = setup({ url: `${SITE}/img`, first: answer(302, `${INTERNAL}/secret`) });
        await new TestRenderer().Route(asRoute, plain, state);
        expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
        expect(requests.fetch).not.toHaveBeenCalled();
        expect(route.fulfill).not.toHaveBeenCalled();
    });

    it('is followed here, every hop checked, with the session only on its own origins', async () => {
        const last = answer(200);
        const { route, requests, asRoute, state } = setup({
            url: `${SITE}/img`,
            first: answer(301, '/moved'),
            later: [answer(302, `${CDN}/img.png`), last],
        });
        const renderer = new TestRenderer();
        await renderer.Route(asRoute, withSession, state);

        expect(requests.fetch).toHaveBeenNthCalledWith(1, `${SITE}/moved`, expect.objectContaining({ maxRedirects: 0, headers: { accept: '*/*', Authorization: 'Bearer s' } }));
        expect(requests.fetch).toHaveBeenNthCalledWith(2, `${CDN}/img.png`, expect.objectContaining({ maxRedirects: 0, headers: { accept: '*/*' } }));
        expect(renderer.Checked).toEqual([`${SITE}/img`, `${SITE}/moved`, `${CDN}/img.png`]);
        expect(route.fulfill).toHaveBeenCalledWith({ response: last });
    });

    it('is refused past the redirect limit', async () => {
        const loop = Array.from({ length: 30 }, () => answer(302, `${SITE}/again`));
        const { route, asRoute, state } = setup({ url: `${SITE}/img`, first: answer(302, `${SITE}/again`), later: loop });
        await new TestRenderer().Route(asRoute, plain, state);
        expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    });

    it('goes on as a GET without the body after a 303', async () => {
        const { requests, asRoute, state } = setup({ url: `${SITE}/form`, method: 'POST', body: 'a=1', first: answer(303, '/done') });
        await new TestRenderer().Route(asRoute, plain, state);
        const [, options] = requests.fetch.mock.calls[0] as unknown as [string, { method: string; data?: unknown }];
        expect(options.method).toBe('GET');
        expect(options.data).toBeUndefined();
    });

    it('keeps the method and body after a 307', async () => {
        const { requests, asRoute, state } = setup({ url: `${SITE}/form`, method: 'POST', body: 'a=1', first: answer(307, '/again') });
        await new TestRenderer().Route(asRoute, plain, state);
        const [, options] = requests.fetch.mock.calls[0] as unknown as [string, { method: string; data?: Buffer }];
        expect(options.method).toBe('POST');
        expect(options.data?.toString()).toBe('a=1');
    });
});

describe("a redirect of the page's own navigation", () => {
    it('stops there with an empty page and says where it points, for the render to check and follow', async () => {
        const { route, requests, asRoute, state } = setup({ url: `${SITE}/page`, navigation: true, first: answer(302, `${INTERNAL}/secret`) });
        await new TestRenderer().Route(asRoute, plain, state);
        expect(state.RedirectTo).toBe(`${INTERNAL}/secret`);
        expect(requests.fetch).not.toHaveBeenCalled();
        expect(route.fulfill).toHaveBeenCalledWith({ status: 200, contentType: 'text/html', body: '' });
    });
});
