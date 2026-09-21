import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpPost, IsHttpError, IsCancellationError } from '@memberjunction/network-utils';
import { ChatParams, ChatMessageRole } from '@memberjunction/ai';
import { BettyLLM } from '../models/BettyLLM';
import { BettyEndpoint } from '../config';

vi.mock('@memberjunction/network-utils');

const BASE = 'https://betty.example.com/betty/v1';

/** Reach the protected member the same way `BaseLLM` does when it runs a turn. */
function run(llm: BettyLLM, params: ChatParams) {
    return (llm as unknown as {
        nonStreamingChatCompletion(p: ChatParams): Promise<import('@memberjunction/ai').ChatResult>;
    }).nonStreamingChatCompletion(params);
}

function paramsWith(messages: Array<{ role: ChatMessageRole; content: string }>): ChatParams {
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
            const err = Object.assign(new Error('Request failed'), {
                Status: 403,
                StatusText: 'Forbidden',
                Data: { error: { message: 'Key lacks betty:chat scope' } },
            });
            vi.mocked(IsHttpError).mockReturnValue(true);
            vi.mocked(HttpPost).mockRejectedValue(err);

            const result = await run(new BettyLLM('key'), paramsWith([{ role: ChatMessageRole.user, content: 'q' }]));

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('403');
            expect(result.errorMessage).toContain('Key lacks betty:chat scope');
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
            vi.mocked(IsCancellationError).mockReturnValue(true);
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
