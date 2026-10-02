/**
 * @fileoverview Detecting a turn that answered on BOTH channels.
 * @module @memberjunction/ai-agents
 */

/**
 * Whether assistant content is a Loop envelope — a JSON object carrying `taskComplete`,
 * `nextStep` or `payloadChangeRequest` — allowing for a markdown fence.
 *
 * Used on native turns that made tool calls: if this is ALSO true, the model gave two answers and
 * the loop's tool-call-wins rule discards one. The eval's normalizer applies the same test
 * independently (it must stay framework-free), so keep the two in step if this changes.
 *
 * @param content The assistant message content — a string, or an array of content blocks
 */
export function LooksLikeLoopEnvelope(content: unknown): boolean {
    let text: string;
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        text = content
            .filter((block): block is { type: string; content: string } =>
                typeof block === 'object' && block !== null
                && (block as { type?: unknown }).type === 'text'
                && typeof (block as { content?: unknown }).content === 'string')
            .map((block) => block.content)
            .join('');
    } else {
        return false;
    }
    const stripped = text.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    if (!stripped.startsWith('{')) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(stripped);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            && ('taskComplete' in parsed || 'nextStep' in parsed || 'payloadChangeRequest' in parsed);
    } catch {
        return false;
    }
}

/** @deprecated Use {@link LooksLikeLoopEnvelope}. */
export function looksLikeLoopEnvelope(content: unknown): boolean {
    return LooksLikeLoopEnvelope(content);
}
