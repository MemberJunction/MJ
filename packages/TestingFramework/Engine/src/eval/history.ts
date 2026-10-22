/**
 * history.ts — one multi-turn case, two history encodings.
 *
 * A multi-turn case is written ONCE, in the neutral tool form (an assistant turn carrying
 * `toolCalls`, then a `tool` turn of `tool_result` blocks). An arm that returns results natively
 * sends it as is. Every other arm sees the text form: the assistant's calls as
 * `[Called <tool>(<arguments>)]` on its turn, after any narration, and each result as the corpus's
 * `[Action Result] <tool> succeeded|failed. <content>` user message.
 */
import { EncodeToolTurnsAsText, type ChatMessage } from '@memberjunction/ai';

/**
 * The text rendering is Core's `EncodeToolTurnsAsText` — the same encoding the prompt runner's
 * native→envelope fallback applies, so the harness's envelope arms and the runner's fallback can
 * never drift apart.
 */
export function EncodeHistoryForArm(messages: ChatMessage[], nativeResults: boolean): ChatMessage[] {
    return nativeResults ? messages : EncodeToolTurnsAsText(messages);
}

/** @deprecated Use {@link EncodeHistoryForArm}. */
export function encodeHistoryForArm(messages: ChatMessage[], nativeResults: boolean): ChatMessage[] {
    return EncodeHistoryForArm(messages, nativeResults);
}
