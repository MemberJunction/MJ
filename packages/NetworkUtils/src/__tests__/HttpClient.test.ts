import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    IsCancellationError,
    HttpRequest,
    HttpGet,
    HttpPost,
    HttpClient,
    HttpError,
    IsHttpError,
    BuildQueryString,
    DrainResponseBody,
    type HttpRequestConfig,
} from '../HttpClient.js';

/**
 * These tests exercise the client against a stubbed global `fetch`. The point is the
 * translation layer — URL/query building, body encoding, response parsing, error shape,
 * and the client's hook/retry behavior — not the network.
 */

/** Records every call the client made to `fetch`, for assertions. */
interface RecordedCall {
    url: string;
    init: RequestInit;
}

let calls: RecordedCall[] = [];

/** Installs a `fetch` stub that returns the given responses in order. */
function StubFetch(responses: Array<{ status?: number; body?: string; headers?: Record<string, string>; statusText?: string }>): void {
    let index = 0;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url: String(url), init });
            const spec = responses[Math.min(index, responses.length - 1)];
            index++;
            return new Response(spec.body ?? '', {
                status: spec.status ?? 200,
                statusText: spec.statusText ?? 'OK',
                headers: spec.headers ?? { 'content-type': 'application/json' },
            });
        })
    );
}

beforeEach(() => {
    calls = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// =====================================================================
// BuildQueryString
// =====================================================================
describe('BuildQueryString', () => {
    it('serializes scalars', () => {
        expect(BuildQueryString({ a: 1, b: 'x', c: true })).toBe('a=1&b=x&c=true');
    });

    it('omits null and undefined', () => {
        expect(BuildQueryString({ a: 1, b: null, c: undefined })).toBe('a=1');
    });

    it('repeats keys for array values', () => {
        expect(BuildQueryString({ tag: ['a', 'b'] })).toBe('tag=a&tag=b');
    });

    it('url-encodes values', () => {
        expect(BuildQueryString({ q: 'a b&c' })).toBe('q=a+b%26c');
    });
});

// =====================================================================
// HttpRequest — URL + body handling
// =====================================================================
describe('HttpRequest URL handling', () => {
    it('joins BaseURL with a relative path', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpRequest({ Url: '/forms/1', BaseURL: 'https://api.example.com/v1' });
        expect(calls[0].url).toBe('https://api.example.com/v1/forms/1');
    });

    it('tolerates a trailing slash on BaseURL and a bare relative path', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpRequest({ Url: 'forms/1', BaseURL: 'https://api.example.com/v1/' });
        expect(calls[0].url).toBe('https://api.example.com/v1/forms/1');
    });

    it('ignores BaseURL when the URL is already absolute', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpRequest({ Url: 'https://other.example.com/x', BaseURL: 'https://api.example.com' });
        expect(calls[0].url).toBe('https://other.example.com/x');
    });

    it('appends Query params, preserving an existing query string', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpRequest({ Url: 'https://api.example.com/x?a=1', Query: { b: 2 } });
        expect(calls[0].url).toBe('https://api.example.com/x?a=1&b=2');
    });
});

describe('HttpRequest body handling', () => {
    it('JSON-encodes a plain object and sets Content-Type', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpPost('https://api.example.com/x', { name: 'test' });
        expect(calls[0].init.body).toBe('{"name":"test"}');
        const headers = calls[0].init.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('does not override a caller-supplied Content-Type', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpPost('https://api.example.com/x', { a: 1 }, { Headers: { 'content-type': 'application/vnd.api+json' } });
        const headers = calls[0].init.headers as Record<string, string>;
        expect(headers['Content-Type']).toBeUndefined();
        expect(headers['content-type']).toBe('application/vnd.api+json');
    });

    it('passes URLSearchParams straight through so fetch sets the form content type', async () => {
        StubFetch([{ body: '{}' }]);
        const form = new URLSearchParams({ grant_type: 'refresh_token' });
        await HttpPost('https://api.example.com/token', form);
        expect(calls[0].init.body).toBe(form);
        const headers = calls[0].init.headers as Record<string, string>;
        expect(headers['Content-Type']).toBeUndefined();
    });

    it('encodes BasicAuth into an Authorization header', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpGet('https://api.example.com/x', { BasicAuth: { Username: 'user', Password: 'pass' } });
        const headers = calls[0].init.headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    });

    it('lets an explicit Authorization header win over BasicAuth', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpGet('https://api.example.com/x', {
            Headers: { Authorization: 'Bearer tok' },
            BasicAuth: { Username: 'user', Password: 'pass' },
        });
        const headers = calls[0].init.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer tok');
    });

    it('sends no body on GET', async () => {
        StubFetch([{ body: '{}' }]);
        await HttpRequest({ Url: 'https://api.example.com/x', Method: 'GET', Body: { a: 1 } });
        expect(calls[0].init.body).toBeUndefined();
    });
});

// =====================================================================
// HttpRequest — response handling
// =====================================================================
describe('HttpRequest response handling', () => {
    it('parses a JSON body into Data', async () => {
        StubFetch([{ body: '{"id":7,"name":"x"}' }]);
        const response = await HttpGet<{ id: number; name: string }>('https://api.example.com/x');
        expect(response.Data).toEqual({ id: 7, name: 'x' });
        expect(response.Status).toBe(200);
        expect(response.Ok).toBe(true);
    });

    it('returns raw text when the body is not valid JSON', async () => {
        StubFetch([{ body: 'not json' }]);
        const response = await HttpGet<string>('https://api.example.com/x');
        expect(response.Data).toBe('not json');
    });

    it('returns null for an empty body', async () => {
        StubFetch([{ body: '' }]);
        const response = await HttpGet('https://api.example.com/x');
        expect(response.Data).toBeNull();
    });

    it('honors ResponseType text', async () => {
        StubFetch([{ body: '{"a":1}' }]);
        const response = await HttpGet<string>('https://api.example.com/x', { ResponseType: 'text' });
        expect(response.Data).toBe('{"a":1}');
    });

    it('honors ResponseType arraybuffer', async () => {
        StubFetch([{ body: 'binary' }]);
        const response = await HttpGet<ArrayBuffer>('https://api.example.com/x', { ResponseType: 'arraybuffer' });
        expect(response.Data).toBeInstanceOf(ArrayBuffer);
        expect(new TextDecoder().decode(response.Data)).toBe('binary');
    });

    it('lower-cases response header keys', async () => {
        StubFetch([{ body: '{}', headers: { 'X-Rate-Limit': '42' } }]);
        const response = await HttpGet('https://api.example.com/x');
        expect(response.Headers['x-rate-limit']).toBe('42');
    });
});

// =====================================================================
// HttpRequest — error handling
// =====================================================================
describe('HttpRequest error handling', () => {
    it('throws HttpError carrying status and parsed body on a non-2xx', async () => {
        StubFetch([{ status: 404, statusText: 'Not Found', body: '{"error":"missing"}' }]);
        await expect(HttpGet('https://api.example.com/x')).rejects.toThrow(HttpError);

        try {
            await HttpGet('https://api.example.com/x');
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(IsHttpError(error)).toBe(true);
            const httpError = error as HttpError;
            expect(httpError.Status).toBe(404);
            expect(httpError.StatusText).toBe('Not Found');
            expect(httpError.Data).toEqual({ error: 'missing' });
            expect(httpError.Method).toBe('GET');
        }
    });

    it('returns the response instead of throwing when ThrowOnError is false', async () => {
        StubFetch([{ status: 500, body: '{"error":"boom"}' }]);
        const response = await HttpGet('https://api.example.com/x', { ThrowOnError: false });
        expect(response.Status).toBe(500);
        expect(response.Ok).toBe(false);
        expect(response.Data).toEqual({ error: 'boom' });
    });

    it('wraps a transport failure in HttpError with Status 0', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
        try {
            await HttpGet('https://api.example.com/x');
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(IsHttpError(error)).toBe(true);
            expect((error as HttpError).Status).toBe(0);
            expect((error as HttpError).IsTimeout).toBe(false);
        }
    });

    it('reports a caller abort as IsCancelled, not IsTimeout', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init: RequestInit) => {
                return new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                });
            })
        );
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5);
        try {
            await HttpGet('https://api.example.com/x', { Signal: controller.signal, Timeout: 10000 });
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(IsHttpError(error)).toBe(true);
            expect((error as HttpError).IsCancelled).toBe(true);
            expect((error as HttpError).IsTimeout).toBe(false);
            expect(IsCancellationError(error)).toBe(true);
        }
    });

    it('reports a timeout as IsTimeout', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init: RequestInit) => {
                return new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                });
            })
        );
        try {
            await HttpGet('https://api.example.com/x', { Timeout: 10 });
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(IsHttpError(error)).toBe(true);
            expect((error as HttpError).IsTimeout).toBe(true);
        }
    });
});

// =====================================================================
// HttpClient — defaults and hooks
// =====================================================================
describe('HttpClient', () => {
    it('applies BaseURL and default headers, letting per-request headers win', async () => {
        StubFetch([{ body: '{}' }]);
        const client = new HttpClient({
            BaseURL: 'https://api.example.com',
            Headers: { Accept: 'application/json', 'X-Env': 'prod' },
        });
        await client.Get('/x', { Headers: { 'X-Env': 'test' } });

        expect(calls[0].url).toBe('https://api.example.com/x');
        const headers = calls[0].init.headers as Record<string, string>;
        expect(headers['Accept']).toBe('application/json');
        expect(headers['X-Env']).toBe('test');
    });

    it('runs OnRequest before sending — the request-interceptor replacement', async () => {
        StubFetch([{ body: '{}' }]);
        const client = new HttpClient({
            BaseURL: 'https://api.example.com',
            OnRequest: (config: HttpRequestConfig) => ({
                ...config,
                Query: { ...config.Query, access_token: 'secret' },
            }),
        });
        await client.Get('/me');
        expect(calls[0].url).toBe('https://api.example.com/me?access_token=secret');
    });

    it('runs OnResponse on success', async () => {
        StubFetch([{ body: '{"ok":true}' }]);
        const seen: number[] = [];
        const client = new HttpClient({ OnResponse: (response) => { seen.push(response.Status); } });
        await client.Get('https://api.example.com/x');
        expect(seen).toEqual([200]);
    });

    it('retries when OnRetry returns true — the 429 back-off replacement', async () => {
        StubFetch([
            { status: 429, body: '{"error":"rate limited"}' },
            { status: 200, body: '{"ok":true}' },
        ]);
        const attempts: number[] = [];
        const client = new HttpClient({
            OnRetry: (error, attempt) => {
                attempts.push(attempt);
                return error.Status === 429;
            },
        });
        const response = await client.Get<{ ok: boolean }>('https://api.example.com/x');
        expect(response.Data).toEqual({ ok: true });
        expect(attempts).toEqual([1]);
        expect(calls).toHaveLength(2);
    });

    it('rethrows when OnRetry returns false', async () => {
        StubFetch([{ status: 500, body: '{}' }]);
        const client = new HttpClient({ OnRetry: () => false });
        await expect(client.Get('https://api.example.com/x')).rejects.toThrow(HttpError);
        expect(calls).toHaveLength(1);
    });

    it('stops retrying at MaxRetries', async () => {
        StubFetch([{ status: 429, body: '{}' }]);
        const client = new HttpClient({ MaxRetries: 2, OnRetry: () => true });
        await expect(client.Get('https://api.example.com/x')).rejects.toThrow(HttpError);
        // 1 initial + 2 retries
        expect(calls).toHaveLength(3);
    });
});

// =====================================================================
// DrainResponseBody
// =====================================================================
describe('DrainResponseBody', () => {
    it('cancels an unconsumed body stream', async () => {
        const cancel = vi.fn(async () => {});
        const stream = new ReadableStream({ cancel });
        const response = new Response(stream);

        await DrainResponseBody(response);

        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('resolves without throwing when the response has no body', async () => {
        const response = new Response(null, { status: 204 });
        await expect(DrainResponseBody(response)).resolves.toBeUndefined();
    });

    it('resolves without throwing when the body was already consumed', async () => {
        const response = new Response('some text');
        await response.text();
        await expect(DrainResponseBody(response)).resolves.toBeUndefined();
    });

    it('swallows a rejection from cancel() rather than propagating it', async () => {
        const stream = new ReadableStream({
            cancel: async () => {
                throw new Error('cancel failed');
            },
        });
        const response = new Response(stream);
        await expect(DrainResponseBody(response)).resolves.toBeUndefined();
    });
});

// =====================================================================
// HttpRequest — ResponseType 'stream' + non-2xx (the leak this round's audit found:
// an unconsumed stream body attached to a thrown HttpError held its connection open)
// =====================================================================
describe('HttpRequest stream response + error handling', () => {
    /** A ReadableStream whose cancel() is spy-able, backing a stubbed fetch Response. */
    function StreamResponse(cancel: () => void, status: number, statusText = 'OK'): Response {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('body'));
                controller.close();
            },
            cancel,
        });
        return new Response(stream, { status, statusText });
    }

    it('cancels the unconsumed stream body before throwing on a non-2xx', async () => {
        const cancel = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => StreamResponse(cancel, 500, 'Server Error')));

        await expect(HttpGet('https://api.example.com/x', { ResponseType: 'stream' })).rejects.toThrow(HttpError);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('does not cancel the stream on a 2xx response — the caller owns it', async () => {
        const cancel = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => StreamResponse(cancel, 200)));

        const response = await HttpGet('https://api.example.com/x', { ResponseType: 'stream' });
        expect(response.Data).toBeInstanceOf(ReadableStream);
        expect(cancel).not.toHaveBeenCalled();
    });

    it('does not throw when ThrowOnError is false on a non-2xx stream response', async () => {
        const cancel = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => StreamResponse(cancel, 500, 'Server Error')));

        const response = await HttpGet('https://api.example.com/x', { ResponseType: 'stream', ThrowOnError: false });
        expect(response.Status).toBe(500);
        expect(response.Data).toBeInstanceOf(ReadableStream);
        // Caller asked to inspect the response itself rather than have it thrown — leave the
        // stream alone for them to read or cancel themselves.
        expect(cancel).not.toHaveBeenCalled();
    });
});
