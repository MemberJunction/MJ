import { BaseLLM, ChatMessageRole, ChatParams, ChatResult, ModelUsage } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from '@memberjunction/ai-openai';
import type { OpenAI } from 'openai';

const __inceptionURL: string = 'https://api.inceptionlabs.ai/v1';

/**
 * Mercury-specific reasoning_effort tier. OpenAI exposes only low/medium/high;
 * Inception adds an "instant" tier for the fastest response path.
 */
type InceptionEffortLevel = 'instant' | 'low' | 'medium' | 'high';

/**
 * Mercury-specific request fields beyond the OpenAI-compatible schema. Callers
 * configure these on the driver instance via {@link BaseLLM.SetAdditionalSettings};
 * any field that is undefined is omitted from the wire request so Inception's
 * server-side defaults apply.
 */
interface InceptionAdditionalSettings {
    reasoning_summary?: boolean;
    reasoning_summary_wait?: boolean;
    diffusing?: boolean;
}

/**
 * Inception Labs implementation. Inception's API is OpenAI-compatible at the
 * surface level, so this class extends OpenAILLM and overrides only the
 * request-building methods to:
 *   1. Map effortLevel into Mercury's 4-tier reasoning_effort (instant/low/medium/high)
 *   2. Inject Mercury-specific fields (reasoning_summary, reasoning_summary_wait, diffusing)
 *
 * Streaming chunk processing and response finalization are inherited from
 * OpenAILLM unchanged.
 */
@RegisterClass(BaseLLM, 'InceptionLLM')
export class InceptionLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, __inceptionURL);
    }

    /**
     * 4-tier effort mapping. Accepts either a string ('instant'|'low'|'medium'|'high')
     * or a numeric 0-100 string. Numeric thresholds:
     *   0-25  -> instant
     *   26-50 -> low
     *   51-75 -> medium
     *   76+   -> high
     */
    private getInceptionEffortLevel(effortLevel: string): InceptionEffortLevel {
        const numValue = Number.parseInt(effortLevel);
        if (Number.isNaN(numValue)) {
            const level = effortLevel.trim().toLowerCase();
            if (level === 'instant' || level === 'low' || level === 'medium' || level === 'high') {
                return level as InceptionEffortLevel;
            }
            throw new Error(`Invalid effortLevel for Inception: ${effortLevel}`);
        }
        if (numValue <= 25) return 'instant';
        if (numValue <= 50) return 'low';
        if (numValue <= 75) return 'medium';
        return 'high';
    }

    /**
     * Mutate the OpenAI request payload with Mercury-specific fields. The OpenAI
     * SDK types don't know about these fields, so we cast through a record type
     * and let the wire request carry them.
     */
    private applyInceptionExtras(
        request: Record<string, unknown>,
        params: ChatParams
    ): void {
        if (params.effortLevel) {
            request.reasoning_effort = this.getInceptionEffortLevel(params.effortLevel);
        }

        const settings = this._additionalSettings as InceptionAdditionalSettings;
        if (settings.reasoning_summary != null) {
            request.reasoning_summary = settings.reasoning_summary;
        }
        if (settings.reasoning_summary_wait != null) {
            request.reasoning_summary_wait = settings.reasoning_summary_wait;
        }
        if (settings.diffusing != null) {
            request.diffusing = settings.diffusing;
        }
    }

    /**
     * Non-streaming chat completion. Mirrors OpenAILLM.nonStreamingChatCompletion
     * but with Mercury's 4-tier effort mapping and extra request fields. Response
     * processing is intentionally minimal — Mercury's response shape is OpenAI-
     * compatible, so we surface the same fields the parent class does.
     */
    protected override async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const formattedMessages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const startTime = new Date();
        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: formattedMessages,
            temperature: params.temperature,
            max_completion_tokens: params.maxOutputTokens,
        };

        if (params.topP != null) openAIParams.top_p = params.topP;
        if (params.frequencyPenalty != null) openAIParams.frequency_penalty = params.frequencyPenalty;
        if (params.presencePenalty != null) openAIParams.presence_penalty = params.presencePenalty;
        if (params.seed != null) openAIParams.seed = params.seed;
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            openAIParams.stop = params.stopSequences;
        }

        switch (params.responseFormat) {
            case 'JSON':
                openAIParams.response_format = { type: 'json_object' };
                break;
            case 'ModelSpecific':
                openAIParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        this.applyInceptionExtras(openAIParams as unknown as Record<string, unknown>, params);

        const result = await this.OpenAI.chat.completions.create(openAIParams);
        const endTime = new Date();

        const usage = new ModelUsage(result.usage?.prompt_tokens ?? 0, result.usage?.completion_tokens ?? 0);

        const choices = result.choices.map((c) => {
            const messageWithExtras = c.message as typeof c.message & {
                reasoning_content?: string;
                reasoning?: string;
                reasoning_summary?: string;
            };
            const thinking =
                messageWithExtras.reasoning_content ??
                messageWithExtras.reasoning ??
                messageWithExtras.reasoning_summary ??
                undefined;

            return {
                message: {
                    role: ChatMessageRole.assistant,
                    content: c.message.content,
                    thinking,
                },
                finish_reason: c.finish_reason,
                index: c.index,
            };
        });

        const chatResult: ChatResult = {
            data: {
                choices,
                usage,
            },
            success: true,
            statusText: 'success',
            startTime,
            endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            errorMessage: null,
            exception: null,
        } as ChatResult;

        chatResult.modelSpecificResponseDetails = {
            provider: 'inception',
            model: result.model,
            id: result.id,
            object: result.object,
            created: result.created,
        };

        return chatResult;
    }

    /**
     * Streaming chat completion request builder. Mercury's streaming response
     * is OpenAI-compatible, so we inherit OpenAILLM's chunk processor and
     * finalizer; only the request payload diverges.
     */
    protected override async createStreamingRequest(params: ChatParams): Promise<unknown> {
        const formattedMessages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: params.model,
            messages: formattedMessages,
            temperature: params.temperature,
            max_completion_tokens: params.maxOutputTokens,
            stream: true,
        };

        if (params.topP != null) openAIParams.top_p = params.topP;
        if (params.frequencyPenalty != null) openAIParams.frequency_penalty = params.frequencyPenalty;
        if (params.presencePenalty != null) openAIParams.presence_penalty = params.presencePenalty;
        if (params.seed != null) openAIParams.seed = params.seed;
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            openAIParams.stop = params.stopSequences;
        }

        switch (params.responseFormat) {
            case 'JSON':
                openAIParams.response_format = { type: 'json_object' };
                break;
            case 'ModelSpecific':
                openAIParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        this.applyInceptionExtras(openAIParams as unknown as Record<string, unknown>, params);

        return this.OpenAI.chat.completions.create(openAIParams);
    }
}
