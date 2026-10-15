/**
 * Streaming through the REAL BaseLLM. Only `BedrockRuntimeClient.send()` is replaced; the commands,
 * the base-class streaming loop and the result types are the real ones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatMessageRole, ChatParams } from '@memberjunction/ai';
import { BedrockLLM } from '../models/bedrockLLM';

/** One event of the response stream `InvokeModelWithResponseStreamCommand` returns in `body`. */
type ResponseStreamEvent = { chunk: { bytes: Uint8Array } };

const mockSend = vi.fn();

function createLLM(): BedrockLLM {
    const llm = new BedrockLLM('access-key:secret-key');
    (llm as unknown as { _client: { send: typeof mockSend } })._client = { send: mockSend };
    return llm;
}

function streamingParams(): ChatParams {
    const params = new ChatParams();
    params.model = 'anthropic.claude-v2';
    params.messages = [{ role: ChatMessageRole.user, content: 'Hello' }];
    params.maxOutputTokens = 1024;
    params.streaming = true;
    params.streamingCallbacks = { OnContent: vi.fn(), OnComplete: vi.fn(), OnError: vi.fn() };
    return params;
}

function textEvent(text: string): ResponseStreamEvent {
    return { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ delta: { text } })) } };
}

describe('BedrockLLM streaming (real BaseLLM)', () => {
    beforeEach(() => {
        mockSend.mockReset();
    });

    it('streams the events of the response body', async () => {
        // send() resolves the command output envelope; the event stream is its `body`.
        mockSend.mockResolvedValue({
            $metadata: {},
            contentType: 'application/json',
            body: (async function* () {
                yield textEvent('Hello ');
                yield textEvent('world');
            })()
        });

        const result = await createLLM().ChatCompletion(streamingParams());

        expect(result.success).toBe(true);
        expect(result.data.choices[0].message.content).toBe('Hello world');
    });

    it('fails clearly when the response has no stream body', async () => {
        mockSend.mockResolvedValue({ $metadata: {}, contentType: 'application/json' });

        await expect(createLLM().ChatCompletion(streamingParams())).rejects.toMatchObject({
            success: false,
            errorMessage: expect.stringContaining('Bedrock returned no response stream'),
        });
    });
});
