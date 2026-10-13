/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to CerebrasLLM.
 *
 * Unlike cerebras.test.ts (which mocks @memberjunction/ai to unit-test driver internals), this
 * file runs the REAL BaseLLM template method end-to-end and mocks ONLY the vendor seam: the
 * Cerebras SDK client is replaced with a scriptable OpenAI-compatible fake at the exact surface
 * the driver calls (`client.chat.completions.create(body, { signal })`). Cancellation detection
 * still works because CerebrasLLM falls back to `error.name === 'AbortError'` / `signal.aborted`
 * when the error is not an instance of the SDK's APIUserAbortError.
 */
import {
    RunLLMConformanceSuite,
    CreateOpenAICompatibleSeamMock,
    OpenAICompatibleChatClient
} from '@memberjunction/unit-testing';
import { CerebrasLLM } from '../models/cerebras';

const seam = CreateOpenAICompatibleSeamMock();

RunLLMConformanceSuite({
    ProviderName: 'Cerebras',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'throws',
    PreAbortedStreamingBehavior: 'resolvesCancelled',
    CreateLLM: () => {
        const llm = new CerebrasLLM('conformance-test-key');
        // Swap the private SDK client for the scriptable seam (same boundary the SDK owns).
        (llm as unknown as { _client: OpenAICompatibleChatClient })._client = seam.Client;
        return llm;
    },
    ScriptNonStreamingSuccess: seam.ScriptNonStreamingSuccess,
    ScriptStreamingSuccess: seam.ScriptStreamingSuccess,
    ScriptFailure: seam.ScriptFailure,
    ScriptStreamingCancellation: seam.ScriptStreamingCancellation
});
