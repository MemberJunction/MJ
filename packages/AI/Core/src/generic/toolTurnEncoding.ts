/**
 * Re-encodes native tool turns as plain text — the form a model sees when it is NOT given tool
 * declarations.
 *
 * A conversation that ran natively holds an assistant turn carrying `toolCalls` and a `tool` turn of
 * `tool_result` blocks. Providers accept those only alongside tool declarations (and Gemini also
 * polices their order), so a request that strips the declarations but keeps the turns fails for a
 * second, unrelated reason. The call turn keeps its prose and states each call it made as
 * `[Called <tool>(<arguments>)]`, with long arguments clipped, so the history still says what was
 * asked for; each result becomes a user message of the loop's
 * `[Action Result] <tool> succeeded|failed. <content>` form.
 *
 * Used by the prompt runner's native→envelope fallback and by the eval harness, which writes each
 * multi-turn case once in the neutral tool form and renders it per arm.
 *
 * @module generic/toolTurnEncoding
 */
import type { ChatMessage, ChatMessageContentBlock, ChatToolCall } from './chat.types';

/** Prefix of the user message a tool result becomes. */
export const ACTION_RESULT_TEXT_PREFIX = '[Action Result]';

/** Longest argument text a call keeps when written out as text; the rest is elided. */
export const CALL_ARGUMENT_TEXT_LIMIT = 300;

/** One call as text: `[Called name({...})]`, its arguments as compact JSON, clipped. */
export function DescribeToolCallAsText(call: ChatToolCall): string {
    const args = JSON.stringify(call.arguments ?? {});
    const clipped = args.length > CALL_ARGUMENT_TEXT_LIMIT ? `${args.slice(0, CALL_ARGUMENT_TEXT_LIMIT)}… (${args.length} characters)` : args;
    return `[Called ${call.name}(${clipped})]`;
}

/** The prose of a message whose content may be a string or content blocks (text blocks only). */
function proseOf(content: ChatMessage['content']): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return (content as ChatMessageContentBlock[]).filter((b) => b.type === 'text').map((b) => b.content).join('\n');
}

/**
 * Returns a copy of `messages` with every native tool turn rendered as text. Messages that carry no
 * tool turn are passed through untouched (same object), so an already-textual history is unchanged.
 */
export function EncodeToolTurnsAsText(messages: readonly ChatMessage[]): ChatMessage[] {
    const out: ChatMessage[] = [];
    for (const m of messages) {
        if (m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0) {
            const prose = proseOf(m.content).trim();
            const calls = (m.toolCalls ?? []).map(DescribeToolCallAsText).join('\n');
            out.push({ role: 'assistant', content: prose ? `${prose}\n${calls}` : calls });
            continue;
        }
        if (m.role === 'tool') {
            const blocks = (Array.isArray(m.content) ? m.content : []) as ChatMessageContentBlock[];
            const results = blocks.filter((x) => x.type === 'tool_result');
            if (results.length === 0) {
                // A tool turn does not always hold tool_result blocks: `compactToolResultContent`
                // rewrites one whose content was not an array into a plain string. Dropping it here
                // would erase the action's outcome from the very history the model is being asked to
                // continue from, so keep whatever prose it carries.
                const prose = proseOf(m.content);
                if (prose.trim()) out.push({ role: 'user', content: `${ACTION_RESULT_TEXT_PREFIX} ${prose}` });
                continue;
            }
            for (const b of results) {
                out.push({ role: 'user', content: `${ACTION_RESULT_TEXT_PREFIX} ${b.toolName ?? 'tool'} ${b.isError ? 'failed' : 'succeeded'}. ${b.content}` });
            }
            continue;
        }
        out.push(m);
    }
    return out;
}
