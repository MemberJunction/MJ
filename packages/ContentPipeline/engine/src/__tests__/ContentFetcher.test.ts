/**
 * @fileoverview FetchContent — a source's session goes to the source, not to every URL it lists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpGet, httpHead } = vi.hoisted(() => ({ httpGet: vi.fn(), httpHead: vi.fn() }));
vi.mock('@memberjunction/network-utils', () => ({ HttpGet: httpGet, HttpHead: httpHead }));

import { FetchContent, FetchRequest, ProbeContentType } from '../ContentFetcher.js';

function request(url: string, extra: Partial<FetchRequest> = {}): FetchRequest {
    return {
        URL: url,
        SourceURL: 'https://api.source.test/feed',
        Access: { Headers: { 'x-api-key': 'secret' }, QueryParameters: { token: 't' } },
        Signal: new AbortController().signal,
        ...extra,
    };
}

beforeEach(() => {
    httpGet.mockReset().mockResolvedValue({ Data: new ArrayBuffer(4), Headers: {}, Url: '' });
});

describe('FetchContent session binding', () => {
    it("presents the session to the source's own origin", async () => {
        await FetchContent(request('https://api.source.test/items/1'));
        const [url, config] = httpGet.mock.calls[0];
        expect(url).toBe('https://api.source.test/items/1');
        expect(config.Headers).toEqual({ 'x-api-key': 'secret' });
        expect(config.Query).toEqual({ token: 't' });
    });

    it('withholds it from an item on another site — an RSS feed links to the whole web', async () => {
        await FetchContent(request('https://news.elsewhere.test/story'));
        const config = httpGet.mock.calls[0][1];
        expect(config.Headers).toBeUndefined();
        expect(config.Query).toBeUndefined();
    });

    it("honours the origins the session declares, in place of the source's", async () => {
        await FetchContent(
            request('https://cdn.source.test/file.pdf', {
                Access: { Headers: { 'x-api-key': 'secret' }, Origins: ['https://cdn.source.test'] },
            }),
        );
        expect(httpGet.mock.calls[0][1].Headers).toEqual({ 'x-api-key': 'secret' });
    });

    it('always validates the URL and drops the session on a cross-origin redirect', async () => {
        await FetchContent(request('https://api.source.test/items/1'));
        expect(httpGet.mock.calls[0][1]).toMatchObject({ ValidateUrl: true, StripHeadersOnCrossOriginRedirect: true });
    });

    it('fails closed when it cannot tell where the source lives', async () => {
        await FetchContent(request('https://api.source.test/items/1', { SourceURL: undefined }));
        expect(httpGet.mock.calls[0][1].Headers).toBeUndefined();
    });
});

describe('FetchContent User-Agent and size cap', () => {
    it('sends the configured User-Agent and reads at most MaxBytes', async () => {
        await FetchContent(request('https://api.source.test/items/1', { UserAgent: 'MJ-Bot/1', MaxBytes: 1024 }));
        const config = httpGet.mock.calls[0][1];
        expect(config.UserAgent).toBe('MJ-Bot/1');
        expect(config.MaxResponseBytes).toBe(1024);
    });
});

describe('ProbeContentType', () => {
    it('asks with a HEAD, with the session for its own origin', async () => {
        httpHead.mockReset().mockResolvedValue({ Ok: true, Headers: { 'content-type': 'application/pdf' } });
        expect(await ProbeContentType(request('https://api.source.test/doc.pdf'))).toBe('application/pdf');
        expect(httpHead.mock.calls[0][1]).toMatchObject({ ValidateUrl: true, Headers: { 'x-api-key': 'secret' } });
    });

    it('says nothing when the server refuses HEAD', async () => {
        httpHead.mockReset().mockResolvedValue({ Ok: false, Status: 405, Headers: { 'content-type': 'text/html' } });
        expect(await ProbeContentType(request('https://api.source.test/x'))).toBeUndefined();
        httpHead.mockReset().mockRejectedValue(new Error('network'));
        expect(await ProbeContentType(request('https://api.source.test/x'))).toBeUndefined();
    });
});
