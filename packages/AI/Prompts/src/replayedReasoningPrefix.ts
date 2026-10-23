/**
 * @fileoverview The part of a request a replayed reasoning block is bound to, beyond the messages.
 *
 * Some providers (Anthropic on Claude 5.x) accept a replayed reasoning block only while the system
 * prompt, the tool list and every message before it are unchanged since the turn that produced it.
 * The agent can compare the messages itself. The system prompt is rendered here and the tools are
 * finalized here, so the comparison of those two happens here, on the request as it is sent.
 */
import { createHash } from 'crypto';
import type { ChatMessage, ChatParams, ChatResult } from '@memberjunction/ai';

const sentPrefixFingerprints = new WeakMap<ChatResult, string>();

/** A fingerprint of a request's system prompt and tool declarations. */
export function ReplayedReasoningPrefixFingerprint(chatParams: ChatParams): string {
    const system = chatParams.messages.filter((m) => m.role === 'system').map((m) => m.content);
    const tools = (chatParams.tools ?? []).map((t) => [t.name, t.description, t.inputSchema]);
    return createHash('sha256').update(JSON.stringify([system, tools])).digest('hex');
}

/** Records the fingerprint of the request a result answered. */
export function RecordSentPrefixFingerprint(result: ChatResult, fingerprint: string): void {
    sentPrefixFingerprints.set(result, fingerprint);
}

/** The fingerprint of the system prompt and tools the request behind `result` was sent with. */
export function GetSentPrefixFingerprint(result: ChatResult | null | undefined): string | undefined {
    return result ? sentPrefixFingerprints.get(result) : undefined;
}

/** The messages with every replayed reasoning block removed; the input is not changed. */
export function WithoutReplayedReasoning(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((m) => {
        if (!m.reasoning) {
            return m;
        }
        const { reasoning: _dropped, ...rest } = m;
        return rest;
    });
}
