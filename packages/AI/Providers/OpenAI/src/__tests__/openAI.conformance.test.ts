/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to OpenAILLM itself.
 *
 * Runs the REAL OpenAILLM on the REAL BaseLLM template method and mocks ONLY the vendor seam: the `openai` SDK's
 * client class is replaced by one that forwards `chat.completions.create(body, options)` to the scriptable seam.
 *
 * `NonStreamingFailureMode: 'throws'` pins a contract callers depend on: a non-cancellation vendor failure is thrown
 * out of ChatCompletion, not resolved as a failed result (see `OpenAILLM.nonStreamingChatCompletion`).
 */
import { vi } from 'vitest';
import {
    RunLLMConformanceSuite,
    CreateOpenAICompatibleSeamMock,
    type OpenAICompatibleChatClient,
    type OpenAICompatibleRequestBody,
    type OpenAICompatibleRequestOptions
} from '@memberjunction/unit-testing';

/** The seam the mocked SDK client forwards to; set once the seam exists (the mock factory is hoisted above it). */
const seamTarget = vi.hoisted((): { Client: OpenAICompatibleChatClient | null } => ({ Client: null }));

vi.mock('openai', () => ({
    OpenAI: class {
        public chat = {
            completions: {
                create: (body: OpenAICompatibleRequestBody, options?: OpenAICompatibleRequestOptions) => {
                    if (!seamTarget.Client) {
                        throw new Error('conformance seam not installed');
                    }
                    return seamTarget.Client.chat.completions.create(body, options);
                }
            }
        };
    },
    APIUserAbortError: class extends Error {}
}));

import { OpenAILLM } from '../models/openAI';

const seam = CreateOpenAICompatibleSeamMock();
seamTarget.Client = seam.Client;

RunLLMConformanceSuite({
    ProviderName: 'OpenAI',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'throws',
    PreAbortedStreamingBehavior: 'rejectsErrorResult',
    CreateLLM: () => new OpenAILLM('conformance-test-key'),
    ScriptNonStreamingSuccess: seam.ScriptNonStreamingSuccess,
    ScriptStreamingSuccess: seam.ScriptStreamingSuccess,
    ScriptFailure: seam.ScriptFailure,
    ScriptStreamingCancellation: seam.ScriptStreamingCancellation
});
