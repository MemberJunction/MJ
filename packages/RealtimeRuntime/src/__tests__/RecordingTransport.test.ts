import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchRecordingTransport, RecordingBaseURLFromGraphQLURL } from '../session/RecordingTransport';

afterEach(() => vi.restoreAllMocks());

function make(fetchImpl: ReturnType<typeof vi.fn>) {
    return new FetchRecordingTransport({
        BaseURL: 'http://h:4000',
        Headers: () => ({ authorization: 'Bearer t' }),
        Fetch: fetchImpl as unknown as typeof fetch,
    });
}

describe('FetchRecordingTransport', () => {
    it('posts a shard as raw bytes without keepalive', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        const bytes = new Uint8Array([1, 2]);
        const outcome = await make(fetchMock).UploadShard('a/b', { Index: 4, StartSample: 0, SampleCount: 1, Bytes: bytes });
        expect(outcome).toBe('Acked');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://h:4000/realtime/recording/a%2Fb/shard/4');
        expect(init.method).toBe('POST');
        expect(init.body).toBe(bytes);
        expect(init.headers).toEqual({ 'Content-Type': 'application/octet-stream', authorization: 'Bearer t' });
        expect(init.keepalive).toBeUndefined();
    });

    it('posts a shard with keepalive when asked (a pagehide handler sealed it)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        await make(fetchMock).UploadShard('s', { Index: 1, StartSample: 0, SampleCount: 1, Bytes: new Uint8Array(1) }, { Keepalive: true });
        expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    });

    it('reports Retry and logs when the browser refuses a keepalive request over its budget', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('keepalive budget exceeded'));
        const outcome = await make(fetchMock).UploadShard('s', { Index: 3, StartSample: 0, SampleCount: 1, Bytes: new Uint8Array(1) }, { Keepalive: true });
        expect(outcome).toBe('Retry');
        expect(String(warn.mock.calls[0][0])).toContain('s/3');
    });

    it('accepts a pending (stored) shard', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        await make(fetchMock).UploadShard('s', { SessionID: 's', Index: 2, Bytes: new Uint8Array(1), SavedAt: 1 });
        expect(fetchMock.mock.calls[0][0]).toBe('http://h:4000/realtime/recording/s/shard/2');
    });

    it('sends the terminal with keepalive, counts in the query, and the tail as body', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        const tail = new Uint8Array([5]);
        const ok = await make(fetchMock).SendTerminal('s1', { Tail: tail, LastShardIndex: 7, CapturedSamples: 12345 });
        expect(ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://h:4000/realtime/recording/s1/end?lastShardIndex=7&capturedSamples=12345');
        expect(init.keepalive).toBe(true);
        expect(init.body).toBe(tail);
    });

    it('marks a non-final terminal (a hidden tab) with final=false, and leaves a final one unmarked', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        await make(fetchMock).SendTerminal('s1', { Tail: null, LastShardIndex: 2, CapturedSamples: 9, Final: false });
        await make(fetchMock).SendTerminal('s1', { Tail: null, LastShardIndex: 3, CapturedSamples: 10, Final: true });
        expect(fetchMock.mock.calls[0][0]).toBe('http://h:4000/realtime/recording/s1/end?lastShardIndex=2&capturedSamples=9&final=false');
        expect(fetchMock.mock.calls[1][0]).toBe('http://h:4000/realtime/recording/s1/end?lastShardIndex=3&capturedSamples=10');
    });

    it('sends an empty body when there is no tail', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        await make(fetchMock).SendTerminal('s1', { Tail: null, LastShardIndex: 0, CapturedSamples: 0 });
        expect((fetchMock.mock.calls[0][1].body as Uint8Array).byteLength).toBe(0);
    });

    it('reports Retry and warns with status and index on a server that may recover', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        const outcome = await make(fetchMock).UploadShard('s9', { Index: 6, StartSample: 0, SampleCount: 1, Bytes: new Uint8Array(1) });
        expect(outcome).toBe('Retry');
        const msg = String(warn.mock.calls[0][0]);
        expect(msg).toContain('503');
        expect(msg).toContain('s9');
        expect(msg).toContain('6');
    });

    it.each([400, 403, 409, 410, 413])('reports Refused on %i: the server will never take that shard', async (status) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
        const outcome = await make(fetchMock).UploadShard('s', { Index: 1, StartSample: 0, SampleCount: 1, Bytes: new Uint8Array(1) });
        expect(outcome).toBe('Refused');
    });

    // 404 stays Retry: an MJAPI older than the recording routes answers 404 for every shard, and a browser
    // upgraded before its server must keep its audio until the server catches up.
    it.each([401, 404, 408, 429, 500, 502])('reports Retry on %i: a refreshed token, a recovered or upgraded server can still take it', async (status) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
        const outcome = await make(fetchMock).UploadShard('s', { Index: 1, StartSample: 0, SampleCount: 1, Bytes: new Uint8Array(1) });
        expect(outcome).toBe('Retry');
    });

    it('returns false and logs when fetch throws', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
        expect(await make(fetchMock).SendTerminal('s', { Tail: null, LastShardIndex: 1, CapturedSamples: 1 })).toBe(false);
        expect(warn).toHaveBeenCalled();
    });

    it('resolves globalThis.fetch at call time when none is injected', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);
        try {
            const t = new FetchRecordingTransport({ BaseURL: 'http://x', Headers: () => ({}) });
            expect(await t.SendTerminal('s', { Tail: null, LastShardIndex: 0, CapturedSamples: 0 })).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('RecordingBaseURLFromGraphQLURL', () => {
    it.each([
        ['http://h:4000/', 'http://h:4000'],
        ['https://h/api/graphql', 'https://h/api'],
        ['https://h/graphql/', 'https://h'],
        ['http://h:4000', 'http://h:4000'],
        ['https://h/api/graphql///', 'https://h/api'],
        ['https://h/graphqlx', 'https://h/graphqlx'],
        ['', ''],
    ])('%s -> %s', (input, expected) => {
        expect(RecordingBaseURLFromGraphQLURL(input)).toBe(expected);
    });

    it('runs in linear time on a long run of slashes that does not end the string (CodeQL polynomial regex)', () => {
        // A backtracking `/\/+$/` retries every start position of the run: tens of thousands of
        // slashes followed by another character cost seconds. The URL comes from host configuration.
        const input = `https://h/${'/'.repeat(50_000)}x`;
        const started = performance.now();
        expect(RecordingBaseURLFromGraphQLURL(input)).toBe(input);
        expect(performance.now() - started).toBeLessThan(250);
    });
});
