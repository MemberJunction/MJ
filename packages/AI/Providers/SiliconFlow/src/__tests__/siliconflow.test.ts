import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams } from '@memberjunction/ai';
import { CreateOpenAICompatibleSeamMock, OpenAICompatibleChatClient } from '@memberjunction/unit-testing';
import { SiliconFlowLLM } from '../models/siliconflow';

const seam = CreateOpenAICompatibleSeamMock();

function createLLM(): SiliconFlowLLM {
    const llm = new SiliconFlowLLM('test-key');
    (llm as unknown as { _openAI: OpenAICompatibleChatClient })._openAI = seam.Client;
    return llm;
}

function chatParams(maxOutputTokens?: number): ChatParams {
    const params = new ChatParams();
    params.model = 'zai-org/GLM-5.3-Flash';
    params.messages = [{ role: 'user', content: 'hi' }];
    params.maxOutputTokens = maxOutputTokens;
    return params;
}

describe('SiliconFlowLLM', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        seam.ScriptNonStreamingSuccess('ok', { PromptTokens: 3, CompletionTokens: 1 });
    });

    it('targets the SiliconFlow OpenAI-compatible endpoint', () => {
        expect(new SiliconFlowLLM('test-key').OpenAI.baseURL).toBe('https://api.siliconflow.com/v1');
    });

    it('mirrors maxOutputTokens onto max_tokens, the only cap SiliconFlow documents', async () => {
        const create = vi.spyOn(seam.Client.chat.completions, 'create');
        const result = await createLLM().ChatCompletion(chatParams(4096));

        expect(result.success).toBe(true);
        expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 4096, max_completion_tokens: 4096 });
    });

    it('sends no max_tokens when no cap is requested', async () => {
        const create = vi.spyOn(seam.Client.chat.completions, 'create');
        await createLLM().ChatCompletion(chatParams());

        expect(create.mock.calls[0][0]).not.toHaveProperty('max_tokens');
    });
});
