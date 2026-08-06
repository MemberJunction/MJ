/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to OpenRouterLLM.
 *
 * OpenRouterLLM is OpenAILLM with a different base URL plus a request-body extra
 * (`usage: { include: true }` via getProviderRequestExtras), so its streaming/ChatResult behavior
 * is inherited from @memberjunction/ai-openai. Unlike OpenRouterLLM.test.ts (which mocks both
 * @memberjunction/ai and @memberjunction/ai-openai and asserts only constructor wiring), this
 * file runs the REAL OpenAILLM driver on the REAL BaseLLM template method and mocks ONLY the
 * vendor seam: the `openai` SDK client instance is replaced with a scriptable fake at the exact
 * surface the driver calls (`client.chat.completions.create(body, { signal })`). The seam's
 * AbortError-named abort error exercises OpenAILLM's `error.name === 'AbortError'` cancellation
 * fallback (its instanceof APIUserAbortError check is SDK-internal).
 */
import { RunLLMConformanceSuite } from '@memberjunction/ai/dist/test-support/llm-conformance.js';
import {
    CreateOpenAICompatibleSeamMock,
    OpenAICompatibleChatClient
} from '@memberjunction/ai/dist/test-support/openai-compatible-seam.js';
import { OpenRouterLLM } from '../models/openRouter';

const seam = CreateOpenAICompatibleSeamMock();

RunLLMConformanceSuite({
    ProviderName: 'OpenRouter',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'throws',
    PreAbortedStreamingBehavior: 'rejectsErrorResult',
    CreateLLM: () => {
        const llm = new OpenRouterLLM('conformance-test-key');
        // Swap the private OpenAI SDK client for the scriptable seam (same boundary the SDK owns).
        (llm as unknown as { _openAI: OpenAICompatibleChatClient })._openAI = seam.Client;
        return llm;
    },
    ScriptNonStreamingSuccess: seam.ScriptNonStreamingSuccess,
    ScriptStreamingSuccess: seam.ScriptStreamingSuccess,
    ScriptFailure: seam.ScriptFailure,
    ScriptStreamingCancellation: seam.ScriptStreamingCancellation
});
