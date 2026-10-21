import { describe, it, expect } from 'vitest';
import { WorkQueueApiPublisher } from '../api/WorkQueueApiPublisher';
import { ParseRestPublishBody } from '../api/restContract';

interface FetchCall {
    Url: string;
    Init: RequestInit | undefined;
}

type Scripted = Response | Error | ((init: RequestInit | undefined) => Promise<Response>);

function fakeFetch(script: Scripted[]): { Fetch: typeof fetch; Calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    const queue = [...script];
    const impl: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        calls.push({ Url: url, Init: init });
        const next = queue.shift();
        if (next === undefined) {
            throw new Error('No scripted response left');
        }
        if (next instanceof Error) {
            throw next;
        }
        return typeof next === 'function' ? next(init) : next;
    };
    return { Fetch: impl, Calls: calls };
}

function json(status: number, body: object, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function messageIDsOf(init: RequestInit | undefined): string[] {
    const parsed = ParseRestPublishBody(JSON.parse(String(init?.body)));
    return parsed.Kind === 'Parsed' ? parsed.Requests.map((request) => request.MessageID ?? '') : [];
}

function echo(status: string): (init: RequestInit | undefined) => Promise<Response> {
    return async (init) => json(202, { results: messageIDsOf(init).map((messageId) => ({ messageId, status })) });
}

function sequentialIds(): () => string {
    let next = 0;
    return () => {
        next += 1;
        return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
    };
}

const UUID = '6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60';

describe('WorkQueueApiPublisher', () => {
    it('posts camelCase messages with the API key to the encoded topic URL', async () => {
        const { Fetch, Calls } = fakeFetch([echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj.example.com/work-queue/', ApiKey: 'mj_sk_test', Fetch, NewId: () => UUID });
        const results = await publisher.Publish('email events/v2', [
            { PartitionKey: 'sub-1', Attributes: { eventType: 'click' }, Payload: { url: 'https://x' }, DeduplicationKey: 'sg:1', DeduplicationTTLSeconds: 3600 },
        ]);
        expect(Calls[0].Url).toBe('https://mj.example.com/work-queue/topics/email%20events%2Fv2/messages');
        expect(Calls[0].Init?.method).toBe('POST');
        expect(new Headers(Calls[0].Init?.headers).get('X-API-Key')).toBe('mj_sk_test');
        const body: unknown = JSON.parse(String(Calls[0].Init?.body));
        expect(body).toEqual({
            messages: [{ messageId: UUID, partitionKey: 'sub-1', attributes: { eventType: 'click' }, payload: { url: 'https://x' }, deduplicationKey: 'sg:1', deduplicationTtlSeconds: 3600 }],
        });
        expect(results).toEqual([{ MessageID: UUID, Status: 'Accepted' }]);
    });

    it('keeps caller-supplied MessageIDs', async () => {
        const { Fetch, Calls } = fakeFetch([echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => 'should-not-be-used' });
        await publisher.Publish('t', [{ MessageID: UUID }]);
        expect(messageIDsOf(Calls[0].Init)).toEqual([UUID]);
    });

    it('reuses MessageIDs when retrying after a 503', async () => {
        const sleeps: number[] = [];
        const { Fetch, Calls } = fakeFetch([json(503, {}), echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({
            BaseUrl: 'https://mj',
            ApiKey: 'k',
            Fetch,
            NewId: sequentialIds(),
            Sleep: async (ms) => {
                sleeps.push(ms);
            },
        });
        const results = await publisher.Publish('t', [{}, {}]);
        expect(Calls).toHaveLength(2);
        expect(messageIDsOf(Calls[1].Init)).toEqual(messageIDsOf(Calls[0].Init));
        expect(sleeps).toEqual([200]);
        expect(results.map((result) => result.Status)).toEqual(['Accepted', 'Accepted']);
    });

    it('chunks large batches into requests of 100', async () => {
        const { Fetch, Calls } = fakeFetch([echo('Accepted'), echo('Accepted'), echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: sequentialIds() });
        const results = await publisher.Publish('t', Array.from({ length: 250 }, () => ({})));
        expect(Calls.map((call) => messageIDsOf(call.Init).length)).toEqual([100, 100, 50]);
        expect(results).toHaveLength(250);
        expect(new Set(results.map((result) => result.MessageID)).size).toBe(250);
    });

    it('honours Retry-After on 429', async () => {
        const sleeps: number[] = [];
        const { Fetch } = fakeFetch([json(429, {}, { 'Retry-After': '3' }), echo('Accepted')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID, Sleep: async (ms) => { sleeps.push(ms); } });
        await publisher.Publish('t', [{}]);
        expect(sleeps).toEqual([3000]);
    });

    it('caps Retry-After at 60 s, whether it is delta-seconds or an HTTP date', async () => {
        const sleeps: number[] = [];
        const { Fetch } = fakeFetch([
            json(429, {}, { 'Retry-After': '86400' }),
            json(503, {}, { 'Retry-After': 'Fri, 31 Dec 2099 23:59:59 GMT' }),
            echo('Accepted'),
        ]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID, Sleep: async (ms) => { sleeps.push(ms); } });
        await publisher.Publish('t', [{}]);
        expect(sleeps).toEqual([60_000, 60_000]);
    });

    it('reports TransportUnavailable after exhausting retries on network errors', async () => {
        const sleeps: number[] = [];
        const { Fetch, Calls } = fakeFetch([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, MaxRetries: 2, NewId: () => UUID, Sleep: async (ms) => { sleeps.push(ms); } });
        const [result] = await publisher.Publish('t', [{}]);
        expect(Calls).toHaveLength(3);
        expect(sleeps).toEqual([200, 400]);
        expect(result).toEqual({ MessageID: UUID, Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'ECONNRESET', Retryable: true } });
    });

    it('maps 400 to non-retryable rejections using the body code, without retrying', async () => {
        const { Fetch, Calls } = fakeFetch([json(400, { code: 'InvalidAttributes', message: 'bad key' })]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        const [result] = await publisher.Publish('t', [{}]);
        expect(Calls).toHaveLength(1);
        expect(result).toEqual({ MessageID: UUID, Status: 'Rejected', Error: { Code: 'InvalidAttributes', Message: 'bad key', Retryable: false } });
    });

    it('maps 403 and 404 with sensible default codes', async () => {
        const { Fetch } = fakeFetch([json(403, { code: 'TopicNotExternallyPublishable', message: 'internal topic' }), new Response('', { status: 404 })]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        const [forbidden] = await publisher.Publish('t', [{}]);
        const [missing] = await publisher.Publish('t', [{}]);
        expect(forbidden.Error?.Code).toBe('TopicNotExternallyPublishable');
        expect(missing.Error).toEqual({ Code: 'TopicNotFound', Message: 'HTTP 404', Retryable: false });
    });

    it('rejects a malformed success body as a retryable InvalidResponse', async () => {
        const { Fetch } = fakeFetch([json(202, { results: [] })]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        const [result] = await publisher.Publish('t', [{}]);
        expect(result.Error).toMatchObject({ Code: 'InvalidResponse', Retryable: true });
    });

    it('parses status values case-insensitively', async () => {
        const { Fetch } = fakeFetch([echo('duplicate')]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, NewId: () => UUID });
        expect(await publisher.Publish('t', [{}])).toEqual([{ MessageID: UUID, Status: 'Duplicate' }]);
    });

    it('treats a timeout as a retryable transport failure', async () => {
        const hang = (init: RequestInit | undefined): Promise<Response> =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        const { Fetch } = fakeFetch([hang]);
        const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://mj', ApiKey: 'k', Fetch, TimeoutMs: 20, MaxRetries: 0, NewId: () => UUID });
        const [result] = await publisher.Publish('t', [{}]);
        expect(result.Error).toMatchObject({ Code: 'TransportUnavailable', Retryable: true });
        expect(result.Error?.Message).toContain('Timed out after 20 ms');
    });
});
