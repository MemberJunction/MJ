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
export function buildAssistantToolCallTurn(turn: NativeAssistantTurn): AgentChatMessage {
    return {
        role: 'assistant',
        content: turn.text ?? '',
        toolCalls: turn.toolCalls,
        ...(turn.reasoning?.length ? { reasoning: turn.reasoning } : {})
    };
}

/** One `tool` turn with a `tool_result` block per result, paired to its call by id. */
export function buildToolResultTurn(results: readonly NativeToolResult[], metadata: AgentChatMessageMetadata | undefined): AgentChatMessage {
    const content: ChatMessageContentBlock[] = results.map((r) => ({
        type: 'tool_result',
        content: r.content,
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        isError: r.isError
    }));
    return { role: 'tool', content, metadata };
}

/**
 * Compaction for tool turns: shrink each block's text and keep the block structure — a tool turn
 * whose content became a plain string would be rejected by every provider.
 */
export function compactToolResultContent(message: AgentChatMessage, compact: (text: string) => string): AgentChatMessage {
    if (!Array.isArray(message.content)) {
        return { ...message, content: compact(String(message.content)) };
    }
    return {
        ...message,
        content: message.content.map((b) => (b.type === 'tool_result' ? { ...b, content: compact(b.content) } : b))
    };
}
