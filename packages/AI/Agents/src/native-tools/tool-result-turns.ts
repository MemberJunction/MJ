/**
 * @fileoverview Results go back to the model as native tool-result turns.
 *
 * The assistant turn that carried the calls MUST precede the tool turn: every driver, and the core
 * validator in BaseLLM (`validateToolConversation`), reject a tool_result whose call no earlier
 * assistant message declared. The loop appends that assistant turn once per model turn and then
 * answers each call here.
 * @module @memberjunction/ai-agents
 */
import type { ChatToolCall, ChatMessageContentBlock, ChatReasoningBlock } from '@memberjunction/ai';
import type { AgentChatMessage, AgentChatMessageMetadata } from '@memberjunction/ai-core-plus';

/** One tool call's outcome, ready to be shown to the model. */
export interface NativeToolResult {
    toolCallId: string;
    toolName: string;
    /** What the model should read — the same markdown the user-message path renders, per call. */
    content: string;
    isError: boolean;
}

/** The model's tool-call turn as the loop records it. */
export interface NativeAssistantTurn {
    text: string;
    toolCalls: ChatToolCall[];
    /** The provider's reasoning blocks from the turn, when the driver kept any. */
    reasoning?: ChatReasoningBlock[];
}

/**
 * The model's own turn, replayed into history so the results that follow have something to answer.
 * Its reasoning blocks travel with it: Anthropic asks for a tool-use turn's thinking to come back
 * unchanged, and the driver replays them ahead of the calls.
 */
export function BuildAssistantToolCallTurn(turn: NativeAssistantTurn): AgentChatMessage {
    return {
        role: 'assistant',
        content: turn.text ?? '',
        toolCalls: turn.toolCalls,
        ...(turn.reasoning?.length ? { reasoning: turn.reasoning } : {})
    };
}

/** @deprecated Use {@link BuildAssistantToolCallTurn}. */
export function buildAssistantToolCallTurn(turn: NativeAssistantTurn): AgentChatMessage {
    return BuildAssistantToolCallTurn(turn);
}

/** One `tool` turn with a `tool_result` block per result, paired to its call by id. */
export function BuildToolResultTurn(results: readonly NativeToolResult[], metadata: AgentChatMessageMetadata | undefined): AgentChatMessage {
    const content: ChatMessageContentBlock[] = results.map((r) => ({
        type: 'tool_result',
        content: r.content,
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        isError: r.isError
    }));
    return { role: 'tool', content, metadata };
}

/** @deprecated Use {@link BuildToolResultTurn}. */
export function buildToolResultTurn(results: readonly NativeToolResult[], metadata: AgentChatMessageMetadata | undefined): AgentChatMessage {
    return BuildToolResultTurn(results, metadata);
}

/**
 * Compaction for tool turns: shrink each block's text and keep the block structure — a tool turn
 * whose content became a plain string would be rejected by every provider.
 */
export function CompactToolResultContent(message: AgentChatMessage, compact: (text: string) => string): AgentChatMessage {
    if (!Array.isArray(message.content)) {
        return { ...message, content: compact(String(message.content)) };
    }
    return {
        ...message,
        content: message.content.map((b) => (b.type === 'tool_result' ? { ...b, content: compact(b.content) } : b))
    };
}

/** How {@link CompactAnsweredToolCallArguments} decides what to shorten. */
export interface ToolCallArgumentCompaction {
    /** The most recent call turns left untouched — the model may still be working from them. */
    KeepRecentCallTurns: number;
    /** A string argument shorter than this is kept. */
    MinChars: number;
}

/** The defaults for {@link CompactAnsweredToolCallArguments}. */
export const DEFAULT_TOOL_CALL_ARGUMENT_COMPACTION: Readonly<ToolCallArgumentCompaction> = Object.freeze({ KeepRecentCallTurns: 2, MinChars: 2000 });

/** One call with its large string arguments replaced by a stub; the same call when nothing was large. */
function compactCallArguments(call: ChatToolCall, minChars: number): ChatToolCall {
    let changed = false;
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(call.arguments ?? {})) {
        if (typeof value === 'string' && value.length >= minChars) {
            args[key] = `[content omitted: ${value.length.toLocaleString('en-US')} characters sent to ${call.name}]`;
            changed = true;
        } else {
            args[key] = value;
        }
    }
    if (!changed) {
        return call;
    }
    // The provider signature was minted for the original arguments. Without it, Gemini replays the
    // call under its documented placeholder signature, which always validates.
    const { providerMetadata: _signed, ...unsigned } = call;
    return { ...unsigned, arguments: args };
}

/**
 * Shortens the large string arguments of older tool calls in place — a 25k-character `write_file`
 * argument otherwise travels on every later turn.
 *
 * Only call turns older than the most recent `KeepRecentCallTurns` are touched, so every call
 * still being answered or worked from keeps its arguments; the call id, name and small arguments
 * always stay. A compacted turn also loses its provider reasoning and signatures, which were
 * minted for the arguments as sent.
 *
 * @param messages The conversation, changed in place
 * @param options What to shorten
 * @returns How many calls were compacted
 */
export function CompactAnsweredToolCallArguments(messages: AgentChatMessage[], options: ToolCallArgumentCompaction = DEFAULT_TOOL_CALL_ARGUMENT_COMPACTION): number {
    const callTurns = messages.map((m, i) => (m.role === 'assistant' && m.toolCalls?.length ? i : -1)).filter((i) => i >= 0);
    let compacted = 0;
    for (const index of callTurns.slice(0, Math.max(0, callTurns.length - options.KeepRecentCallTurns))) {
        const turn = messages[index];
        const calls = (turn.toolCalls ?? []).map((call) => compactCallArguments(call, options.MinChars));
        const changed = calls.filter((call, i) => call !== turn.toolCalls?.[i]).length;
        if (changed > 0) {
            const { reasoning: _reasoning, ...rest } = turn;
            messages[index] = { ...rest, toolCalls: calls };
            compacted += changed;
        }
    }
    return compacted;
}

/** @deprecated Use {@link CompactToolResultContent}. */
export function compactToolResultContent(message: AgentChatMessage, compact: (text: string) => string): AgentChatMessage {
    return CompactToolResultContent(message, compact);
}
