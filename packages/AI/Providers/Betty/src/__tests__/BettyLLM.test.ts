import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpPost, HttpError } from '@memberjunction/network-utils';
import { ChatParams, ChatMessageRole, ChatMessageContent } from '@memberjunction/ai';
import { BettyLLM } from '../models/BettyLLM';
import { BettyEndpoint } from '../config';

// PARTIAL mock: only the network call is faked. Automocking the whole module also stubs
// `IsHttpError` / `IsCancellationError` to return undefined, so `describe()` and `isCancellation()`
// silently take their fallback branches and the real error-shape handling is never executed — which
// is exactly how an empty error message survived review.
vi.mock('@memberjunction/network-utils', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/network-utils')>()),
    HttpPost: vi.fn(),
}));

const BASE = 'https://betty.example.com/betty/v1';

/** Reach the protected member the same way `BaseLLM` does when it runs a turn. */
function run(llm: BettyLLM, params: ChatParams) {
    return (llm as unknown as {
        nonStreamingChatCompletion(p: ChatParams): Promise<import('@memberjunction/ai').ChatResult>;
    }).nonStreamingChatCompletion(params);
}

function paramsWith(messages: Array<{ role: ChatMessageRole; content: ChatMessageContent }>): ChatParams {
    const p = new ChatParams();
    p.model = 'betty';
    p.messages = messages;
    return p;
}

function reply(overrides: Record<string, unknown> = {}) {
    return { Data: { conversationId: 'c1', response: 'An answer.', references: [], requestId: 'r1', ...overrides } };
}

describe('BettyLLM', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env.BETTY_API_BASE_URL = BASE;
    });

    afterEach(() => {
        delete process.env.BETTY_API_BASE_URL;
    });

    describe('the turn it sends', () => {
        it('sends the LATEST user message, not the first', async () => {
            // The legacy provider used messages.find(...), which returns the FIRST match and
            // silently discarded every follow-up. This is the regression that must not come back.
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.user, content: 'Opening question' },
                { role: ChatMessageRole.assistant, content: 'First answer' },
                { role: ChatMessageRole.user, content: 'Follow-up question' },
            ]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { message: string };
            expect(body.message).toBe('Follow-up question');
        });

        it('carries the earlier turns as advisory context', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.user, content: 'Opening question' },
                { role: ChatMessageRole.assistant, content: 'First answer' },
                { role: ChatMessageRole.user, content: 'Follow-up question' },
            ]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { context?: { text: string } };
            expect(body.context?.text).toContain('User: Opening question');
            expect(body.context?.text).toContain('Assistant: First answer');
            // The turn itself is the message, so it must not also appear in the transcript.
            expect(body.context?.text).not.toContain('Follow-up question');
        });

        it('passes a system prompt through as an instruction preamble', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.system, content: 'Answer briefly.' },
                { role: ChatMessageRole.user, content: 'Hello' },
            ]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { context?: { text: string } };
            expect(body.context?.text).toContain('Instructions from the calling application: Answer briefly.');
        });

        it('omits context entirely on a first, single-message turn', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'Hello' }]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { context?: unknown };
            expect(body.context).toBeUndefined();
        });

        it('authenticates with the key as a bearer — no JWT exchange', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('sekrit'), paramsWith([{ role: ChatMessageRole.user, content: 'Hi' }]));

            expect(vi.mocked(HttpPost)).toHaveBeenCalledTimes(1); // legacy did two calls
            const [url, , cfg] = vi.mocked(HttpPost).mock.calls[0];
            expect(url).toBe(`${BASE}/messages`);
            expect((cfg as { Headers: Record<string, string> }).Headers.Authorization).toBe('Bearer sekrit');
        });
    });

    describe('message shapes that used to break it', () => {
        it('extracts text from block content instead of stringifying the array', async () => {
            // AIPromptRunner rewrites the last user message into blocks whenever the prompt carries
            // file inputs. String(blocks) posts "[object Object]" and Betty answers a question
            // nobody asked, with no error to show for it.
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([{
                role: ChatMessageRole.user,
                content: [
                    { type: 'text', content: 'What is in this image?' },
                    { type: 'image_url', content: 'data:image/png;base64,AAAA' },
                ] as unknown as ChatMessageContent,
            }]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { message: string };
            expect(body.message).toContain('What is in this image?');
            expect(body.message).not.toContain('[object Object]');
        });

        it('splits at the latest USER turn even when an assistant turn follows it', async () => {
            // slice(0, -1) only lines up when the user turn is last. With a trailing assistant
            // reply the question appeared twice and the assistant's last answer was dropped.
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.user, content: 'Q1' },
                { role: ChatMessageRole.assistant, content: 'A1' },
                { role: ChatMessageRole.user, content: 'Q2' },
                { role: ChatMessageRole.assistant, content: 'A2' },
            ]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { message: string; context?: { text: string } };
            expect(body.message).toBe('Q2');
            expect(body.context?.text).toContain('Assistant: A2');      // no longer dropped
            expect(body.context?.text).not.toContain('User: Q2');       // not duplicated
        });

        it('labels a tool result as a tool result, not as the user', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.user, content: 'Q1' },
                { role: ChatMessageRole.tool, content: 'lookup returned 42' },
                { role: ChatMessageRole.user, content: 'Q2' },
            ]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { context?: { text: string } };
            expect(body.context?.text).toContain('Tool result: lookup returned 42');
        });

        it('keeps every system message, not just the first', async () => {
            // System turns are filtered out of the transcript, so a second one used to appear
            // nowhere at all — neither preamble nor history.
            vi.mocked(HttpPost).mockResolvedValue(reply());

            await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.system, content: 'Answer briefly.' },
                { role: ChatMessageRole.system, content: 'Cite your sources.' },
                { role: ChatMessageRole.user, content: 'Hello' },
            ]));

            const body = vi.mocked(HttpPost).mock.calls[0][1] as { context?: { text: string } };
            expect(body.context?.text).toContain('Answer briefly.');
            expect(body.context?.text).toContain('Cite your sources.');
        });
    });

    describe('the result it returns', () => {
        it('puts the answer in the first choice', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply({ response: 'Cheese is aged.' }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.success).toBe(true);
            expect(result.data.choices[0].message.content).toBe('Cheese is aged.');
        });

        it('maps citations onto choices 1 and 2, matching the legacy shape', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply({
                references: [{ title: 'Ageing guide', url: 'https://example.com/ageing' }],
            }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.data.choices).toHaveLength(3);
            expect(result.data.choices[1].message.content).toContain('Ageing guide: https://example.com/ageing');
            expect(result.data.choices[2].finish_reason).toBe('references_json');
            expect(JSON.parse(result.data.choices[2].message.content as string)).toHaveLength(1);
        });

        it('leaves the extra choices off when there are no citations', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply({ references: [] }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.data.choices).toHaveLength(1);
        });
    });

    describe('failure modes', () => {
        it('names the missing environment variable rather than calling an empty host', async () => {
            delete process.env.BETTY_API_BASE_URL;

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('BETTY_API_BASE_URL');
            expect(vi.mocked(HttpPost)).not.toHaveBeenCalled();
        });

        it('fails clearly when there is no user message at all', async () => {
            const result = await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.system, content: 'Only instructions' },
            ]));

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('No user message');
            expect(vi.mocked(HttpPost)).not.toHaveBeenCalled();
        });

        it("surfaces the server's own error message and status", async () => {
            vi.mocked(HttpPost).mockRejectedValue(new HttpError('Request failed', {
                Url: `${BASE}/messages`, Method: 'POST', Status: 403, StatusText: 'Forbidden',
                Data: { error: { message: 'Key lacks betty:chat scope' } },
            }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('403');
            expect(result.errorMessage).toContain('Key lacks betty:chat scope');
        });
    });

    describe('error reporting', () => {
        it('says a timeout timed out, and keeps the underlying detail', async () => {
            vi.mocked(HttpPost).mockRejectedValue(new HttpError(
                `Request to ${BASE}/messages timed out after 120000ms`,
                { Url: `${BASE}/messages`, Method: 'POST', IsTimeout: true },
            ));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.errorMessage).toContain('timed out');
            expect(result.errorMessage).not.toMatch(/:\s*$/);   // no trailing colon with nothing after it
        });

        it('hands the ORIGINAL error to the failover analyzer, not a rebuilt one', async () => {
            // AIPromptRunner does `result.exception || new Error(result.errorMessage)`; leaving
            // exception unset loses status, headers and retry-after before anything decides to retry.
            const err = new HttpError('Request failed', {
                Url: `${BASE}/messages`, Method: 'POST', Status: 500, StatusText: 'Server Error',
            });
            vi.mocked(HttpPost).mockRejectedValue(err);

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.exception).toBe(err);
        });

        it('classifies a 401 as an auth failure rather than something retryable', async () => {
            // ErrorAnalyzer probes lower-case `status`; network-utils exposes `Status`. Without the
            // alias every Betty error came back Unknown/Transient and a bad key was retried.
            vi.mocked(HttpPost).mockRejectedValue(new HttpError('Request failed', {
                Url: `${BASE}/messages`, Method: 'POST', Status: 401, StatusText: 'Unauthorized',
            }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            // canFailover stays TRUE by MJ policy — "different vendor may have valid API key"
            // (errorAnalyzer.canFailoverForError). What matters is that it is no longer `Unknown`.
            expect(result.errorInfo?.errorType).toBe('Authentication');
        });

        it('classifies a 429 as rate limiting', async () => {
            vi.mocked(HttpPost).mockRejectedValue(new HttpError('Request failed', {
                Url: `${BASE}/messages`, Method: 'POST', Status: 429, StatusText: 'Too Many Requests',
            }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.errorInfo?.errorType).toBe('RateLimit');
        });

        it('does not leave lower-cased aliases on the error it hands back', async () => {
            const err = new HttpError('Request failed', {
                Url: `${BASE}/messages`, Method: 'POST', Status: 500, StatusText: 'Server Error',
            });
            vi.mocked(HttpPost).mockRejectedValue(err);

            await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect((err as unknown as Record<string, unknown>).status).toBeUndefined();
        });
    });

    describe('refusing a turn it cannot ask', () => {
        it('fails locally when the latest user turn has no text', async () => {
            const result = await run(new BettyLLM('key'), paramsWith([
                { role: ChatMessageRole.user, content: '   ' },
            ]));

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('no text');
            expect(vi.mocked(HttpPost)).not.toHaveBeenCalled();
        });

        it('treats a 200 with no answer text as a failure, not an empty success', async () => {
            vi.mocked(HttpPost).mockResolvedValue(reply({ response: '' }));

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('no answer text');
        });
    });

    describe('cancellation', () => {
        it('does not open a socket when the token is already aborted', async () => {
            const p = paramsWith([{ role: ChatMessageRole.user, content: 'q' }]);
            p.cancellationToken = AbortSignal.abort();

            const result = await run(new BettyLLM('key'), p);

            expect(result.statusText).toBe('cancelled');
            expect(vi.mocked(HttpPost)).not.toHaveBeenCalled();
        });

        it('reports an abort as cancelled, not as a Betty failure', async () => {
            // Marked non-failover so no layer retries a request the caller gave up on.
            const controller = new AbortController();
            vi.mocked(HttpPost).mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

            const p = paramsWith([{ role: ChatMessageRole.user, content: 'q' }]);
            p.cancellationToken = controller.signal;
            const result = await run(new BettyLLM('key'), p);

            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
            expect(result.errorInfo?.canFailover).toBe(false);
        });
    });

    describe('streaming', () => {
        it('declares itself unsupported so BaseLLM never routes a stream here', () => {
            expect(new BettyLLM('key').SupportsStreaming).toBe(false);
        });
    });
});

describe('BettyEndpoint', () => {
    it('joins without doubling or dropping a slash', () => {
        expect(BettyEndpoint('https://h/betty/v1', 'messages')).toBe('https://h/betty/v1/messages');
        expect(BettyEndpoint('https://h/betty/v1/', 'messages')).toBe('https://h/betty/v1/messages');
        expect(BettyEndpoint('https://h/betty/v1', '/messages')).toBe('https://h/betty/v1/messages');
    });

    it('collapses runs of slashes on both sides', () => {
        expect(BettyEndpoint('https://h/betty/v1///', '///messages')).toBe('https://h/betty/v1/messages');
    });

    it('stays linear on a long run of slashes (no ReDoS)', () => {
        // CodeQL flagged the previous /\/+$/ and /^\/+/ as polynomial backtracking.
        // Index scanning cannot backtrack; this would hang on the regex version.
        const many = '/'.repeat(100_000);
        const start = Date.now();
        expect(BettyEndpoint(`https://h${many}`, `${many}messages`)).toBe('https://h/messages');
        expect(Date.now() - start).toBeLessThan(1_000);
    });

    it('keeps the version segment — the trap new URL() falls into', () => {
        // new URL('messages', 'https://h/betty/v1') resolves to https://h/betty/messages.
        expect(BettyEndpoint('https://h/betty/v1', 'messages')).not.toContain('/betty/messages');
    });
});
