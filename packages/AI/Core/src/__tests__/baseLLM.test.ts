import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLLM } from '../generic/baseLLM';
import { ChatParams, ChatResult, ChatResultData } from '../generic/chat.types';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';

// Concrete test implementation of BaseLLM
class TestLLM extends BaseLLM {
    public mockChatResult: ChatResult;

    constructor(apiKey: string = 'test-key') {
        super(apiKey);
        const start = new Date();
        const end = new Date();
        this.mockChatResult = new ChatResult(true, start, end);
        this.mockChatResult.data = {
            choices: [{ message: { role: 'assistant', content: 'test response' }, finish_reason: 'stop', index: 0 }],
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } as never
        };
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        return this.mockChatResult;
    }

    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<string>> {
        return {
            async *[Symbol.asyncIterator]() {
                yield 'chunk1';
                yield 'chunk2';
            }
        };
    }

    protected processStreamingChunk(chunk: string): { content: string; finishReason?: string; usage?: null } {
        return { content: chunk, finishReason: undefined, usage: null };
    }

    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: string | null | undefined,
        usage: Record<string, number> | null | undefined
    ): ChatResult {
        const result = new ChatResult(true, new Date(), new Date());
        result.data = {
            choices: [{ message: { role: 'assistant', content: accumulatedContent || '' }, finish_reason: 'stop', index: 0 }],
            usage: usage as never
        };
        return result;
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error('Not implemented');
    }

    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error('Not implemented');
    }
}

describe('BaseLLM', () => {
    let llm: TestLLM;

    beforeEach(() => {
        llm = new TestLLM();
    });

    describe('AdditionalSettings', () => {
        it('should start with empty additional settings', () => {
            expect(llm.AdditionalSettings).toEqual({});
        });

        it('should merge additional settings', () => {
            llm.SetAdditionalSettings({ key1: 'value1' });
            llm.SetAdditionalSettings({ key2: 'value2' });

            expect(llm.AdditionalSettings).toEqual({ key1: 'value1', key2: 'value2' });
        });

        it('should override existing settings with same key', () => {
            llm.SetAdditionalSettings({ key1: 'value1' });
            llm.SetAdditionalSettings({ key1: 'new-value' });

            expect(llm.AdditionalSettings.key1).toBe('new-value');
        });

        it('should clear all settings', () => {
            llm.SetAdditionalSettings({ key1: 'value1', key2: 'value2' });
            llm.ClearAdditionalSettings();

            expect(llm.AdditionalSettings).toEqual({});
        });
    });

    describe('SupportsStreaming', () => {
        it('should default to false', () => {
            expect(llm.SupportsStreaming).toBe(false);
        });
    });

    describe('ChatCompletion', () => {
        it('should complete a non-streaming chat request', async () => {
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            const result = await llm.ChatCompletion(params);

            expect(result.success).toBe(true);
            expect(result.data.choices[0].message.content).toBe('test response');
        });

        it('should default enableCaching to true', async () => {
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            await llm.ChatCompletion(params);

            expect(params.enableCaching).toBe(true);
        });

        it('should respect explicit enableCaching=false', async () => {
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];
            params.enableCaching = false;

            await llm.ChatCompletion(params);

            expect(params.enableCaching).toBe(false);
        });
    });

    describe('ChatCompletions (parallel)', () => {
        it('should return empty array for empty input', async () => {
            const results = await llm.ChatCompletions([]);

            expect(results).toEqual([]);
        });

        it('should return empty array for null input', async () => {
            const results = await llm.ChatCompletions(null as unknown as ChatParams[]);

            expect(results).toEqual([]);
        });

        it('should process multiple requests in parallel', async () => {
            const params1 = new ChatParams();
            params1.model = 'test-model';
            params1.messages = [{ role: 'user', content: 'Hello 1' }];

            const params2 = new ChatParams();
            params2.model = 'test-model';
            params2.messages = [{ role: 'user', content: 'Hello 2' }];

            const results = await llm.ChatCompletions([params1, params2]);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should call OnCompletion callback for each result', async () => {
            const onCompletion = vi.fn();
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            await llm.ChatCompletions([params], { OnCompletion: onCompletion });

            expect(onCompletion).toHaveBeenCalledTimes(1);
            expect(onCompletion).toHaveBeenCalledWith(expect.objectContaining({ success: true }), 0);
        });

        it('should call OnAllCompleted callback', async () => {
            const onAllCompleted = vi.fn();
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            await llm.ChatCompletions([params], { OnAllCompleted: onAllCompleted });

            expect(onAllCompleted).toHaveBeenCalledTimes(1);
            expect(onAllCompleted).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ success: true })]));
        });
    });

    describe('Thinking model support', () => {
        it('should default supportsThinkingModels to false', () => {
            // Access through casting since it's protected
            expect((llm as Record<string, unknown>)['supportsThinkingModels']()).toBe(false);
        });

        it('should return default thinking tag format', () => {
            const tags = (llm as Record<string, unknown>)['getThinkingTagFormat']() as { open: string; close: string };

            expect(tags.open).toBe('<think>');
            expect(tags.close).toBe('</think>');
        });

        it('should extract thinking content from non-streaming content', () => {
            const result = (llm as Record<string, unknown>)['extractThinkingFromContent'](
                '<think>My reasoning here</think>Actual response'
            ) as { content: string; thinking?: string };

            expect(result.thinking).toBe('My reasoning here');
            expect(result.content).toBe('Actual response');
        });

        it('should handle content without thinking tags', () => {
            const result = (llm as Record<string, unknown>)['extractThinkingFromContent'](
                'Just a normal response'
            ) as { content: string; thinking?: string };

            expect(result.thinking).toBeUndefined();
            expect(result.content).toBe('Just a normal response');
        });

        it('should handle null/empty content in extractThinkingFromContent', () => {
            const result = (llm as Record<string, unknown>)['extractThinkingFromContent'](
                ''
            ) as { content: string; thinking?: string };

            expect(result.content).toBe('');
            expect(result.thinking).toBeUndefined();
        });

        it('should add thinking to a message', () => {
            const message = { role: 'assistant' as const, content: 'response' };
            const result = (llm as Record<string, unknown>)['addThinkingToMessage'](
                message,
                'My thinking'
            ) as { role: string; content: string; thinking?: string };

            expect(result.thinking).toBe('My thinking');
        });
    });
});
