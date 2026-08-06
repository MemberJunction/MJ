/**
 * Runs the shared LLM conformance suite (src/test-support/llm-conformance.ts) against an
 * in-package reference driver that implements the IDEAL BaseLLM contract:
 *  - non-streaming failures resolve a failed ChatResult WITH errorInfo,
 *  - a pre-aborted streaming request resolves the cancelled shape (empty stream + cancelled
 *    finalize) instead of rejecting,
 *  - streaming usage is carried through, and
 *  - no KnownDeviations are declared.
 *
 * This is the suite's own regression test: if the conformance suite or the OpenAI-compatible
 * seam mock drifts from BaseLLM's real template-method behavior, this file breaks here in Core
 * before any provider package sees it.
 */
import { BaseLLM } from '../generic/baseLLM';
import { ChatParams, ChatResult, ChatMessageRole } from '../generic/chat.types';
import { ModelUsage } from '../generic/baseModel';
import { AIErrorInfo } from '../generic/errorTypes';
import { ErrorAnalyzer } from '../generic/errorAnalyzer';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';
import { RunLLMConformanceSuite } from '../test-support/llm-conformance';
import {
    CreateOpenAICompatibleSeamMock,
    OpenAICompatibleChatClient,
    OpenAICompatibleChunkPayload,
    OpenAICompatibleResponsePayload,
    OpenAICompatibleUsagePayload
} from '../test-support/openai-compatible-seam';

/** True when the failure represents the caller's cancellation rather than a vendor fault. */
function isCancellationError(error: unknown, token: AbortSignal | undefined): boolean {
    if (token?.aborted) {
        return true;
    }
    return error instanceof Error && error.name === 'AbortError';
}

/**
 * Reference driver implementing the ideal shared contract on top of the OpenAI-compatible seam.
 */
class ReferenceConformanceLLM extends BaseLLM {
    private client: OpenAICompatibleChatClient;
    private streamCancelled = false;
    private activeStreamToken: AbortSignal | undefined = undefined;

    constructor(apiKey: string, client: OpenAICompatibleChatClient) {
        super(apiKey);
        this.client = client;
    }

    public override get SupportsStreaming(): boolean {
        return true;
    }

    private buildCancelledResult(startTime: Date): ChatResult {
        const errorInfo: AIErrorInfo = {
            errorType: 'Unknown',
            severity: 'Fatal',
            canFailover: false,
            providerErrorCode: 'request_cancelled',
            context: { provider: 'reference', cancelled: true }
        };
        const result = new ChatResult(false, startTime, new Date());
        result.statusText = 'cancelled';
        result.errorMessage = 'Request cancelled via cancellationToken';
        result.exception = null;
        result.errorInfo = errorInfo;
        result.data = { choices: [], usage: new ModelUsage(0, 0) };
        return result;
    }

    private buildFailedResult(startTime: Date, error: Error): ChatResult {
        const result = new ChatResult(false, startTime, new Date());
        result.statusText = 'error';
        result.errorMessage = error.message;
        result.exception = error;
        result.errorInfo = ErrorAnalyzer.analyzeError(error, 'ReferenceConformanceLLM');
        result.data = { choices: [], usage: new ModelUsage(0, 0) };
        return result;
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        if (params.cancellationToken?.aborted) {
            return this.buildCancelledResult(startTime);
        }

        let response: OpenAICompatibleResponsePayload;
        try {
            response = (await this.client.chat.completions.create(
                { model: params.model, stream: false },
                { signal: params.cancellationToken }
            )) as OpenAICompatibleResponsePayload;
        } catch (error) {
            if (isCancellationError(error, params.cancellationToken)) {
                return this.buildCancelledResult(startTime);
            }
            return this.buildFailedResult(startTime, error as Error);
        }

        const result = new ChatResult(true, startTime, new Date());
        result.statusText = 'success';
        result.exception = null;
        result.data = {
            choices: response.choices.map((choice) => ({
                message: { role: ChatMessageRole.assistant, content: choice.message.content },
                finish_reason: choice.finish_reason,
                index: choice.index
            })),
            usage: new ModelUsage(response.usage.prompt_tokens, response.usage.completion_tokens)
        };
        return result;
    }

    private async *emptyStream(): AsyncGenerator<OpenAICompatibleChunkPayload> {
        // intentionally yields nothing — used for pre-aborted requests
    }

    protected override resetStreamingState(): void {
        this.streamCancelled = false;
        this.activeStreamToken = undefined;
    }

    protected async createStreamingRequest(params: ChatParams): Promise<AsyncGenerator<OpenAICompatibleChunkPayload>> {
        if (params.cancellationToken?.aborted) {
            this.streamCancelled = true;
            return this.emptyStream();
        }
        this.activeStreamToken = params.cancellationToken;
        return (await this.client.chat.completions.create(
            { model: params.model, stream: true },
            { signal: params.cancellationToken }
        )) as AsyncGenerator<OpenAICompatibleChunkPayload>;
    }

    protected processStreamingChunk(chunk: OpenAICompatibleChunkPayload): {
        content: string;
        finishReason?: string | undefined;
        usage?: OpenAICompatibleUsagePayload | null;
    } {
        const choice = chunk?.choices?.[0];
        return {
            content: choice?.delta?.content ?? '',
            finishReason: choice?.finish_reason ?? undefined,
            usage: chunk?.usage ?? null
        };
    }

    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: OpenAICompatibleChunkPayload | null | undefined,
        usage: OpenAICompatibleUsagePayload | null | undefined
    ): ChatResult {
        if (this.streamCancelled || this.activeStreamToken?.aborted) {
            return this.buildCancelledResult(new Date());
        }
        const now = new Date();
        const result = new ChatResult(true, now, now);
        result.statusText = 'success';
        result.exception = null;
        result.data = {
            choices: [
                {
                    message: { role: ChatMessageRole.assistant, content: accumulatedContent ?? '' },
                    finish_reason: lastChunk?.choices?.[0]?.finish_reason ?? 'stop',
                    index: 0
                }
            ],
            usage: new ModelUsage(usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0)
        };
        return result;
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error('Not implemented for the conformance reference driver');
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error('Not implemented for the conformance reference driver');
    }
}

const seam = CreateOpenAICompatibleSeamMock();

RunLLMConformanceSuite({
    ProviderName: 'ReferenceConformanceLLM (ideal contract)',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'failedResult',
    PreAbortedStreamingBehavior: 'resolvesCancelled',
    CreateLLM: () => new ReferenceConformanceLLM('reference-test-key', seam.Client),
    ScriptNonStreamingSuccess: seam.ScriptNonStreamingSuccess,
    ScriptStreamingSuccess: seam.ScriptStreamingSuccess,
    ScriptFailure: seam.ScriptFailure,
    ScriptStreamingCancellation: seam.ScriptStreamingCancellation
});
