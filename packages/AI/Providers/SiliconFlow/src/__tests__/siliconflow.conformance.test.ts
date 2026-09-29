/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to SiliconFlowLLM.
 *
 * SiliconFlowLLM is OpenAILLM with a different base URL, so its entire streaming/ChatResult behavior
 * is inherited from @memberjunction/ai-openai. siliconflow.test.ts covers the base URL and the
 * max_tokens mirror; this file runs the REAL OpenAILLM driver on the REAL BaseLLM template method and mocks ONLY the
 * vendor seam: the `openai` SDK client instance is replaced with a scriptable fake at the exact
 * surface the driver calls (`client.chat.completions.create(body, { signal })`). The seam's
 * AbortError-named abort error exercises OpenAILLM's `error.name === 'AbortError'` cancellation
 * fallback (its instanceof APIUserAbortError check is SDK-internal).
 */
import {
    RunLLMConformanceSuite,
    CreateOpenAICompatibleSeamMock,
    OpenAICompatibleChatClient
} from '@memberjunction/unit-testing';
import { SiliconFlowLLM } from '../models/siliconflow';

const seam = CreateOpenAICompatibleSeamMock();

RunLLMConformanceSuite({
    ProviderName: 'SiliconFlow',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'throws',
    PreAbortedStreamingBehavior: 'rejectsErrorResult',
    CreateLLM: () => {
        const llm = new SiliconFlowLLM('conformance-test-key');
        // Swap the private OpenAI SDK client for the scriptable seam (same boundary the SDK owns).
        (llm as unknown as { _openAI: OpenAICompatibleChatClient })._openAI = seam.Client;
        return llm;
    },
    ScriptNonStreamingSuccess: seam.ScriptNonStreamingSuccess,
    ScriptStreamingSuccess: seam.ScriptStreamingSuccess,
    ScriptFailure: seam.ScriptFailure,
    ScriptStreamingCancellation: seam.ScriptStreamingCancellation
});
