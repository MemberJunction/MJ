/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to GroqLLM.
 *
 * Unlike groq.test.ts (which mocks @memberjunction/ai to unit-test driver internals), this file
 * runs the REAL BaseLLM template method end-to-end and mocks ONLY the vendor seam: the Groq SDK
 * client is replaced with a scriptable OpenAI-compatible fake at the exact surface the driver
 * calls (`client.chat.completions.create(body, { signal })`). Cancellation detection still works
 * because GroqLLM falls back to `error.name === 'AbortError'` / `signal.aborted` when the error
 * is not an instance of the SDK's APIUserAbortError.
 */
import {
    RunLLMConformanceSuite,
    CreateOpenAICompatibleSeamMock,
    OpenAICompatibleChatClient
} from '@memberjunction/unit-testing';
import { GroqLLM } from '../models/groq';

const seam = CreateOpenAICompatibleSeamMock();

RunLLMConformanceSuite({
    ProviderName: 'Groq',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'throws',
    PreAbortedStreamingBehavior: 'resolvesCancelled',
    CreateLLM: () => {
        const llm = new GroqLLM('conformance-test-key');
        // Swap the private SDK client for the scriptable seam (same boundary the SDK owns).
        (llm as unknown as { _client: OpenAICompatibleChatClient })._client = seam.Client;
        return llm;
    },
    ScriptNonStreamingSuccess: seam.ScriptNonStreamingSuccess,
    ScriptStreamingSuccess: seam.ScriptStreamingSuccess,
    ScriptFailure: seam.ScriptFailure,
    ScriptStreamingCancellation: seam.ScriptStreamingCancellation,
    KnownDeviations: [
        {
            Kind: 'StreamingDropsUsage',
            Reason:
                'GroqLLM.processStreamingChunk always returns usage:null ("Groq doesn\'t provide usage in ' +
                'streaming chunks"), so finalizeStreamingResponse reports ModelUsage(0,0) even though the ' +
                'vendor stream carries token counts on the final chunk (chunk.usage / x_groq.usage). ' +
                'Streamed Groq completions therefore under-report usage relative to non-streamed ones.'
        }
    ]
});
