/**
 * openAICompatibleTools.ts — the tool-calling wire mapping shared by every OpenAI-shaped provider.
 *
 * OpenAI's function-calling shape is the de-facto standard: Groq, Cerebras, Fireworks, xAI,
 * Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it. The mapping
 * between MJ's neutral surface and that shape is therefore written **once, here**, rather than
 * per driver.
 *
 * That matters more than it saves. The mapping has three details that are easy to get subtly
 * wrong and impossible to notice from a passing test:
 *
 *   1. arguments cross the wire as a **JSON string**, not an object;
 *   2. a tool RESULT is its own `tool`-role message with a `tool_call_id`, so one MJ tool turn
 *      expands into N provider messages;
 *   3. a call whose arguments are malformed JSON must still be **surfaced**, because an agent loop
 *      that sees nothing cannot tell "the model said nothing" from "the model said something broken".
 *
 * Three implementations of that would drift. One cannot.
 *
 * These functions return plain structural objects rather than any SDK's types, because every
 * provider ships its own near-identical copies. Each driver assigns the result into its own SDK
 * type at the boundary, which is where the compiler can still check the shape.
 */
import type { ChatMessage, ChatTool, ChatToolCall, ChatToolChoice } from './chat.types';
import { getToolResultBlocks } from './chat.types';

/** A tool declaration in the OpenAI-compatible request body. */
export interface OpenAICompatibleToolDeclaration {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
}

/** The `tool_choice` field. The string forms pass through; only the named form is reshaped. */
export type OpenAICompatibleToolChoice =
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };

/**
 * A tool call as it arrives on an assistant turn — note `arguments` is a JSON STRING.
 *
 * The index signature is deliberate. Provider SDKs declare their own near-identical copies of this
 * shape, several of them WITH an open index signature (Cerebras does), and a closed type is not
 * assignable to an open one. Declaring these wire types open keeps them assignable in both
 * directions, which is what lets one mapping serve every OpenAI-shaped provider — and it is honest
 * about what they are: a body providers are free to extend.
 */
export interface OpenAICompatibleToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
    [key: string]: unknown;
}

/** One `tool`-role message carrying the result of one call. */
export interface OpenAICompatibleToolResultMessage {
    role: 'tool';
    tool_call_id: string;
    content: string;
    [key: string]: unknown;
}

/**
 * A non-tool message in the OpenAI-compatible request body.
 *
 * Discriminated on `role` rather than a single interface with a union-typed role, because every
 * provider SDK models it that way — a flat interface fails to narrow when assigned to theirs.
 * `tool_calls` rides on the assistant turn; without it the `tool` messages answering those calls
 * are orphaned and the provider rejects the conversation.
 */
export type OpenAICompatibleChatMessage =
    | { role: 'system'; content: string; [key: string]: unknown }
    | { role: 'user'; content: string; [key: string]: unknown }
    | { role: 'assistant'; content: string; tool_calls?: OpenAICompatibleToolCall[]; [key: string]: unknown };

/** Any message in an OpenAI-compatible request body. */
export type OpenAICompatibleMessage = OpenAICompatibleChatMessage | OpenAICompatibleToolResultMessage;

/** The subset of a raw response tool call this module can read, whatever SDK produced it. */
export interface RawOpenAICompatibleToolCall {
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
}

/** Maps MJ tool declarations onto the request's `tools` array. */
export function buildOpenAICompatibleTools(tools: ChatTool[]): OpenAICompatibleToolDeclaration[] {
    return tools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }
    }));
}

/** Maps the neutral {@link ChatToolChoice} onto the provider's `tool_choice`. */
export function buildOpenAICompatibleToolChoice(choice: ChatToolChoice): OpenAICompatibleToolChoice {
    return typeof choice === 'string'
        ? choice
        : { type: 'function' as const, function: { name: choice.name } };
}

/**
 * Maps normalized calls from a prior assistant turn back onto the wire.
 *
 * Round-tripping matters: without the assistant's `tool_calls`, the `tool` messages answering them
 * are orphaned and the provider rejects the conversation.
 */
export function buildOpenAICompatibleToolCalls(toolCalls: ChatToolCall[]): OpenAICompatibleToolCall[] {
    return toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments ?? {})
        }
    }));
}

/**
 * Expands one MJ `tool`-role message into the provider's per-result `tool` messages.
 *
 * Returns an empty array — and warns — for a tool turn carrying no result blocks, rather than
 * emitting a malformed message the provider would reject with an opaque error.
 */
export function buildOpenAICompatibleToolResults(
    message: ChatMessage,
    providerName: string
): OpenAICompatibleToolResultMessage[] {
    const blocks = getToolResultBlocks(message.content);
    if (blocks.length === 0) {
        console.warn(`${providerName}: a tool-role message carried no tool_result blocks; skipping it.`);
        return [];
    }
    return blocks.map((block) => ({
        role: 'tool' as const,
        tool_call_id: block.toolCallId,
        // This wire shape has no error flag on a tool result, so a failure has to be marked in the
        // text or the model cannot tell a failure from a result.
        content: block.isError ? `ERROR: ${block.content}` : block.content
    }));
}

/**
 * Normalizes raw response tool calls into {@link ChatToolCall}s with PARSED arguments.
 *
 * A model can emit malformed JSON for its arguments. That is a tool-specific failure the caller
 * must be able to see, so the call is surfaced with empty arguments and a warning rather than
 * dropped — dropping it would look to an agent loop like the model said nothing at all.
 *
 * @param toolCalls Raw calls from the response, if any
 * @param providerName Used only in the warning, so a log line names the provider
 * @returns Normalized calls, or `undefined` when the model called nothing
 */
export function extractOpenAICompatibleToolCalls(
    toolCalls: RawOpenAICompatibleToolCall[] | undefined | null,
    providerName: string
): ChatToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
        return undefined;
    }
    const calls: ChatToolCall[] = [];
    for (const call of toolCalls) {
        // Custom (non-function) tool types are not part of the neutral surface.
        if (call.type !== undefined && call.type !== 'function') {
            continue;
        }
        const name = call.function?.name;
        if (!name) {
            continue;
        }
        let parsedArguments: Record<string, unknown> = {};
        try {
            const parsed: unknown = JSON.parse(call.function?.arguments || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                parsedArguments = parsed as Record<string, unknown>;
            }
        } catch {
            console.warn(`${providerName}: could not parse arguments for tool call '${name}'; surfacing the call with empty arguments.`);
        }
        calls.push({ id: call.id ?? '', name, arguments: parsedArguments });
    }
    return calls.length > 0 ? calls : undefined;
}
