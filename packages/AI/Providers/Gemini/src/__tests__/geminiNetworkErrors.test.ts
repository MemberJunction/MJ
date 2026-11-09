/**
 * Connection failures through the real `@google/genai` SDK and Node's fetch — nothing mocked.
 *
 * Each case points the driver at a local socket that fails in one specific way and checks how the
 * failed ChatResult is classified. The SDK rethrows fetch's own `TypeError: fetch failed`, whose
 * message names no network condition, so this pins the classification of the errors the SDK
 * really produces rather than of hand-built look-alikes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { AddressInfo } from 'node:net';
import { GoogleGenAI } from '@google/genai';
import { ChatResult } from '@memberjunction/ai';
import { GeminiLLM } from '../index';

/** GeminiLLM whose SDK client sends every request to a local base URL. */
class LocalGeminiLLM extends GeminiLLM {
    constructor(private readonly baseUrl: string) {
        super('test-key');
    }

    protected override async createClient(): Promise<GoogleGenAI> {
        return new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { baseUrl: this.baseUrl } });
    }
}

const servers: net.Server[] = [];

async function listen(server: net.Server): Promise<number> {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return (server.address() as AddressInfo).port;
}

/** A port that was just bound and released, so nothing is listening on it. */
async function unusedPort(): Promise<number> {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
}

function jsonServer(status: number, message: string, apiStatus: string): http.Server {
    return http.createServer((req, res) => {
        req.resume();
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: status, message, status: apiStatus } }));
    });
}

async function chat(baseUrl: string, streaming: boolean): Promise<ChatResult> {
    return new LocalGeminiLLM(baseUrl).ChatCompletion({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        streaming,
    });
}

const urls: Record<string, string> = {};

beforeAll(async () => {
    urls.refused = `http://127.0.0.1:${await unusedPort()}`;
    urls.reset = `http://127.0.0.1:${await listen(net.createServer((socket) => socket.resetAndDestroy()))}`;
    urls.closedMidResponse = `http://127.0.0.1:${await listen(net.createServer((socket) => {
        socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 999\r\n\r\n{"partial'));
    }))}`;
    urls.dns = 'http://mj-gemini-network-test.invalid';
    urls.unavailable = `http://127.0.0.1:${await listen(jsonServer(503, 'The service is currently unavailable.', 'UNAVAILABLE'))}`;
    urls.badRequest = `http://127.0.0.1:${await listen(jsonServer(400, 'Invalid JSON payload received.', 'INVALID_ARGUMENT'))}`;
});

afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

describe.each([false, true])('GeminiLLM connection failures (streaming: %s)', (streaming) => {
    it.each([
        ['connection refused', 'refused'],
        ['connection reset', 'reset'],
        ['socket closed mid-response', 'closedMidResponse'],
        ['DNS lookup failure', 'dns'],
    ])('classifies %s as a retriable NetworkError that fails over', async (_label, key) => {
        const result = await chat(urls[key], streaming);

        expect(result.success).toBe(false);
        expect(result.errorInfo?.errorType).toBe('NetworkError');
        expect(result.errorInfo?.severity).toBe('Retriable');
        expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('still classifies an HTTP 503 as ServiceUnavailable', async () => {
        const result = await chat(urls.unavailable, streaming);

        expect(result.errorInfo?.errorType).toBe('ServiceUnavailable');
    });

    it('still classifies an HTTP 400 as a fatal InvalidRequest', async () => {
        const result = await chat(urls.badRequest, streaming);

        expect(result.errorInfo?.errorType).toBe('InvalidRequest');
        expect(result.errorInfo?.severity).toBe('Fatal');
    });
});
