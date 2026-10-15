/**
 * @fileoverview ContentFetcher — a source's session goes to the source, not to every URL it lists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/network-utils', () => ({ SafeFetch: safeFetch }));

import { ContentFetcher, FetchRequest } from '../ContentFetcher.js';

const ok = () => new Response('body', { status: 200 });

function request(url: string, extra: Partial<FetchRequest> = {}): FetchRequest {
    return {
        URL: url,
        ContentSourceID: 'S1',
        SourceURL: 'https://api.source.test/feed',
        Parameters: {},
        Access: { Headers: { 'x-api-key': 'secret' }, QueryParameters: { token: 't' } },
        Signal: new AbortController().signal,
        ...extra,
    };
}

beforeEach(() => {
    safeFetch.mockReset().mockImplementation(async () => ok());
});

describe('ContentFetcher session binding', () => {
    it("presents the session to the source's own origin", async () => {
        await new ContentFetcher().Fetch(request('https://api.source.test/items/1'));
        const [url, init] = safeFetch.mock.calls[0];
        expect(url).toBe('https://api.source.test/items/1?token=t');
        expect(init.headers).toEqual({ 'x-api-key': 'secret' });
    });

    it('withholds it from an item on another site — an RSS feed links to the whole web', async () => {
        await new ContentFetcher().Fetch(request('https://news.elsewhere.test/story'));
        const [url, init] = safeFetch.mock.calls[0];
        expect(url).toBe('https://news.elsewhere.test/story');
        expect(init.headers).toBeUndefined();
    });

    it("honours the origins an access driver declares, in place of the source's", async () => {
        await new ContentFetcher().Fetch(
            request('https://cdn.source.test/file.pdf', {
                Access: { Headers: { 'x-api-key': 'secret' }, Origins: ['https://cdn.source.test'] },
            }),
        );
        expect(safeFetch.mock.calls[0][1].headers).toEqual({ 'x-api-key': 'secret' });
    });

    it('always asks SafeFetch to drop the session on a cross-origin redirect', async () => {
        await new ContentFetcher().Fetch(request('https://api.source.test/items/1'));
        expect(safeFetch.mock.calls[0][1].StripHeadersOnCrossOriginRedirect).toBe(true);
    });

    it('fails closed when it cannot tell where the source lives', async () => {
        await new ContentFetcher().Fetch(request('https://api.source.test/items/1', { SourceURL: undefined }));
        expect(safeFetch.mock.calls[0][1].headers).toBeUndefined();
    });
});
