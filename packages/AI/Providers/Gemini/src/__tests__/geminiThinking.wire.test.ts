/**
 * What the real `@google/genai` SDK puts on the wire for an effort level — nothing mocked.
 *
 * The driver used to set `thinkingConfig` on the chat session, which the SDK replaces with the
 * per-request config, so it never reached Google; unit tests with a mocked SDK could not see that.
 * Here the real driver and SDK send to a local server that records each request body and answers
 * like `generateContent` / `streamGenerateContent`, so the assertions are on the HTTP body itself.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
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

interface RecordedRequest {
    Path: string;
    Body: { generationConfig?: { thinkingConfig?: Record<string, unknown> } };
}

/** Model ids for which the server rejects `MINIMAL`, as Gemini 3.8 Flash does. */
const REJECTS_MINIMAL = /gemini-3\.8-flash-rejects-minimal/;

const RESPONSE = {
    candidates: [{ content: { role: 'model', parts: [{ text: 'weighing it.', thought: true }, { text: 'ok' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, thoughtsTokenCount: 11 },
};

const requests: RecordedRequest[] = [];
let server: http.Server;
let baseUrl: string;

function answer(req: http.IncomingMessage, res: http.ServerResponse, raw: string): void {
    const body = JSON.parse(raw) as RecordedRequest['Body'];
    requests.push({ Path: req.url ?? '', Body: body });
    if (REJECTS_MINIMAL.test(req.url ?? '') && body.generationConfig?.thinkingConfig?.thinkingLevel === 'MINIMAL') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 400, message: 'minimal thinking level is not supported for this model', status: 'INVALID_ARGUMENT' } }));
        return;
    }
    if ((req.url ?? '').includes(':streamGenerateContent')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify(RESPONSE)}\r\n\r\n`);
        return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(RESPONSE));
}

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        req.on('end', () => answer(req, res, raw));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    requests.length = 0;
});

async function chat(model: string, effortLevel: string | undefined, streaming: boolean): Promise<ChatResult> {
    return new LocalGeminiLLM(baseUrl).ChatCompletion({
        model,
        messages: [{ role: 'user', content: 'hello' }],
        effortLevel,
        streaming,
        streamingCallbacks: streaming ? { OnContent: () => {} } : undefined,
    });
}

const sentThinking = (index = 0): Record<string, unknown> | undefined => requests[index]?.Body.generationConfig?.thinkingConfig;

describe.each([false, true])('thinkingConfig on the wire (streaming: %s)', (streaming) => {
    it('a Gemini 3+ model at effort 90 sends thinkingLevel HIGH with thought summaries', async () => {
        const result = await chat('gemini-3.8-flash', '90', streaming);
        expect(result.success).toBe(true);
        expect(sentThinking()).toEqual({ thinkingLevel: 'HIGH', includeThoughts: true });
    });

    it('Gemini 2.5 sends a thinkingBudget, not a level', async () => {
        await chat('gemini-2.5-flash', '50', streaming);
        expect(sentThinking()).toEqual({ thinkingBudget: 8192, includeThoughts: true });
    });

    it('no effort level sends no thinkingConfig', async () => {
        await chat('gemini-3.8-flash', undefined, streaming);
        expect(requests).toHaveLength(1);
        expect(sentThinking()).toBeUndefined();
    });

    it('a rejected MINIMAL is retried with LOW and succeeds, and a higher level is still sent afterwards', async () => {
        const model = `gemini-3.8-flash-rejects-minimal-${streaming ? 'stream' : 'unary'}`;
        const result = await chat(model, 'minimal', streaming);
        expect(result.success).toBe(true);
        expect(requests).toHaveLength(2);
        expect(sentThinking(0)).toEqual({ thinkingLevel: 'MINIMAL', includeThoughts: true });
        expect(sentThinking(1)).toEqual({ thinkingLevel: 'LOW', includeThoughts: true });

        await chat(model, '90', streaming);
        expect(sentThinking(2)).toEqual({ thinkingLevel: 'HIGH', includeThoughts: true });
    });
});

describe('the response', () => {
    it('returns the thought summary and counts thinking tokens as completion tokens', async () => {
        const result = await chat('gemini-3.8-flash', '90', false);
        expect(result.data.choices[0].message).toMatchObject({ content: 'ok', thinking: 'weighing it.' });
        expect(result.data.usage).toMatchObject({ promptTokens: 5, completionTokens: 13 });
    });
});
