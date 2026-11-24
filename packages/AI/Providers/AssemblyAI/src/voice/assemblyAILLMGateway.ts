import { randomUUID } from 'node:crypto';
import { OpenAI } from 'openai';
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { RealtimeToolDefinition } from '@memberjunction/ai';

/** AssemblyAI's LLM Gateway: an OpenAI-compatible API over many vendors' models, on the AssemblyAI key. */
export const ASSEMBLYAI_LLM_GATEWAY_URL = 'https://llm-gateway.assemblyai.com/v1';

/** The gateway's fast model with tool calling; also the one AssemblyAI's own reference agent uses. */
export const ASSEMBLYAI_DEFAULT_LLM = 'gemma-4-31b';

export interface LLMRequest {
    Model: string;
    Messages: ChatCompletionMessageParam[];
    Tools: RealtimeToolDefinition[];
    MaxOutputTokens: number;
}

export interface LLMToolCall {
    CallID: string;
    Name: string;
    /** JSON text. */
    Arguments: string;
}

export type LLMEvent =
    | { Kind: 'text'; Text: string }
    | { Kind: 'toolCalls'; Calls: LLMToolCall[] }
    | { Kind: 'usage'; InputTokens: number; OutputTokens: number };

/** Sends one streaming request. The seam tests replace. */
export type LLMTransport = (body: ChatCompletionCreateParamsStreaming, signal: AbortSignal) => Promise<AsyncIterable<ChatCompletionChunk>>;

/** Tries per reply. A caller is waiting in silence, so one retry is all a transient failure gets. */
const MAX_ATTEMPTS = 2;

/** How long one try may take to produce anything, in ms. */
const FIRST_EVENT_TIMEOUT_MS = 12_000;

/** A streaming chat client for the gateway: text as it arrives, tool calls whole, then usage. */
export class AssemblyAILLMGateway {
    constructor(private readonly transport: LLMTransport) {}

    /** The client for a real gateway account. */
    public static ForKey(apiKey: string): AssemblyAILLMGateway {
        // maxRetries 0: the retry here knows whether anything has been spoken yet, the SDK's does not.
        const client = new OpenAI({ apiKey, baseURL: ASSEMBLYAI_LLM_GATEWAY_URL, maxRetries: 0 });
        return new AssemblyAILLMGateway((body, signal) => client.chat.completions.create(body, { signal }));
    }

    /**
     * Streams one reply. Ends without an error when `signal` aborts. A failure before anything streamed is tried once
     * more when it may pass; after that a retry could speak the same words twice, so it is thrown.
     */
    public async *Stream(request: LLMRequest, signal: AbortSignal): AsyncGenerator<LLMEvent> {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let streamed = false;
            try {
                for await (const event of this.streamOnce(request, signal)) {
                    streamed = true;
                    yield event;
                }
                return;
            } catch (err) {
                if (signal.aborted) {
                    return;
                }
                if (streamed || attempt === MAX_ATTEMPTS || !isTransient(err)) {
                    throw err;
                }
                console.warn(`AssemblyAI LLM Gateway: retrying after ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    private async *streamOnce(request: LLMRequest, signal: AbortSignal): AsyncGenerator<LLMEvent> {
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(), FIRST_EVENT_TIMEOUT_MS);
        try {
            const calls = new Map<number, LLMToolCall>();
            let usage: LLMEvent | null = null;
            const stream = await this.transport(buildBody(request), AbortSignal.any([signal, deadline.signal]));
            for await (const chunk of stream) {
                clearTimeout(timer);
                if (signal.aborted) {
                    return;
                }
                const delta = chunk.choices?.[0]?.delta;
                collectToolCalls(delta, calls);
                if (delta?.content) {
                    yield { Kind: 'text', Text: delta.content };
                }
                if (chunk.usage) {
                    usage = { Kind: 'usage', InputTokens: chunk.usage.prompt_tokens, OutputTokens: chunk.usage.completion_tokens };
                }
            }
            if (calls.size > 0) {
                yield { Kind: 'toolCalls', Calls: [...calls.values()].map(withDefaults) };
            }
            if (usage) {
                yield usage;
            }
        } catch (err) {
            if (deadline.signal.aborted && !signal.aborted) {
                throw new LLMTimeoutError(`no reply within ${FIRST_EVENT_TIMEOUT_MS} ms`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
}

class LLMTimeoutError extends Error {}

function buildBody(request: LLMRequest): ChatCompletionCreateParamsStreaming {
    return {
        model: request.Model,
        messages: request.Messages,
        stream: true,
        stream_options: { include_usage: true },
        // The gateway reserves this much of the account's per-minute allowance up front, and 8,000 when it is not set.
        max_tokens: request.MaxOutputTokens,
        ...(request.Tools.length > 0
            ? {
                  tools: request.Tools.map((tool) => ({
                      type: 'function' as const,
                      function: { name: tool.Name, description: tool.Description, parameters: tool.ParametersSchema },
                  })),
              }
            : {}),
    };
}

function collectToolCalls(delta: ChatCompletionChunk.Choice.Delta | undefined, calls: Map<number, LLMToolCall>): void {
    for (const part of delta?.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { CallID: '', Name: '', Arguments: '' };
        call.CallID = part.id ?? call.CallID;
        call.Name += part.function?.name ?? '';
        call.Arguments += part.function?.arguments ?? '';
        calls.set(part.index, call);
    }
}

function withDefaults(call: LLMToolCall): LLMToolCall {
    return { ...call, CallID: call.CallID || `call_${randomUUID()}`, Arguments: call.Arguments || '{}' };
}

/** Whether trying again may work: rate limits, server faults, timeouts and lost connections (which carry no status). */
function isTransient(err: unknown): boolean {
    if (err instanceof LLMTimeoutError) {
        return true;
    }
    const status = (err as { status?: unknown } | null)?.status;
    return typeof status === 'number' ? status === 429 || status >= 500 : true;
}
