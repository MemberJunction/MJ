/**
 * @fileoverview Single source of truth for the `[seq N] Role: text` line format that
 * conversation history is rendered into before being fed to the summary prompts.
 *
 * The `[seq N]` marker shape is a CONTRACT shared with the seeded prompt templates
 * (`conversation-summary.template.md`, `summarize-range.template.md`) and with the
 * conversation-tool documentation shown to agents: summaries reference these markers,
 * and agents page exact messages back in via `getMessageBySequence` using the same
 * numbers. Every producer of these lines must go through {@link FormatSequencedHistoryLine}
 * so the marker shape and role vocabulary cannot drift between call sites.
 *
 * @module @memberjunction/ai-agents
 */

/**
 * Normalizes a role from EITHER vocabulary — chat roles (`user`/`assistant`/`system`)
 * or `ConversationDetail.Role` DB values (`User`/`AI`/`Error`) — into one label set,
 * so history lines read identically regardless of which path rendered them.
 */
export function NormalizeHistoryRoleLabel(role: string | null | undefined): string {
    switch ((role || '').trim().toLowerCase()) {
        case 'assistant':
        case 'ai':
            return 'Assistant';
        case 'system':
            return 'System';
        case 'error':
            return 'Error';
        default:
            return 'User';
    }
}

/**
 * Renders one sequenced conversation-history line: `[seq N] Role: text`.
 * Callers own any per-message or total-size capping — this function only owns the shape.
 */
export function FormatSequencedHistoryLine(sequence: number | undefined, role: string | null | undefined, text: string): string {
    return `[seq ${sequence}] ${NormalizeHistoryRoleLabel(role)}: ${text}`;
}
