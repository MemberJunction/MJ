/**
 * @fileoverview Detecting an active mention trigger in composer text.
 *
 * Pure string logic, deliberately separated from any input component: it is the part with real
 * edge cases (an email address is not a mention, a trigger mid-word is not a trigger, a token the
 * user already inserted must not re-open the picker), and those are worth testing directly rather
 * than through a text field.
 *
 * The three trigger characters match the web composer exactly, because the wire format they
 * produce is shared — see `SerializeMention`.
 */

/** The characters that open a picker, and what each one searches. */
export type MentionTriggerChar = '@' | '#' | '/';

/** An open trigger the composer should be showing a picker for. */
export type ActiveMentionTrigger = {
    /** Which picker to show. */
    Trigger: MentionTriggerChar;
    /** Text typed after the trigger character, up to the caret. */
    Query: string;
    /** Index of the trigger character in the text — where replacement starts. */
    StartIndex: number;
    /** Caret index — where replacement ends. */
    EndIndex: number;
};

/**
 * A trigger only counts at the start of a word.
 *
 * Without this, `user@example.com` opens the agent picker on the `@`, and a URL path opens the
 * skill picker on every `/`. Both are things people type into a chat composer constantly.
 */
function isWordStart(text: string, index: number): boolean {
    if (index === 0) return true;
    return /\s/.test(text[index - 1]);
}

/**
 * Finds the trigger the caret is currently inside, if any.
 *
 * Scans back from the caret to the nearest trigger character at a word start, stopping at
 * whitespace — a query never spans a space, so finishing a word closes the picker the way it does
 * on the web.
 *
 * @param text The composer's full text.
 * @param caret Caret position (end of the selection).
 * @returns The active trigger, or `null` when the caret is not in one.
 */
export function FindActiveTrigger(text: string, caret: number): ActiveMentionTrigger | null {
    const end = Math.max(0, Math.min(caret, text.length));

    for (let i = end - 1; i >= 0; i--) {
        const ch = text[i];
        if (/\s/.test(ch)) return null;

        if (ch === '@' || ch === '#' || ch === '/') {
            if (!isWordStart(text, i)) return null;
            const query = text.slice(i + 1, end);
            // An already-inserted mention is a JSON token (`@{"type":…}`); the brace means the user
            // is inside a completed mention, not composing a new one.
            if (query.startsWith('{')) return null;
            return { Trigger: ch as MentionTriggerChar, Query: query, StartIndex: i, EndIndex: end };
        }
    }
    return null;
}

/**
 * Serializes a chosen suggestion into the wire format the runtime's `MentionParser` reads.
 *
 * Byte-identical to what the Angular editor produces, which is the point: a message composed on a
 * phone and one composed in a browser must be the same message. `MentionParser` resolves these
 * tokens into `agentMention` / `skillMentions` / `entityMentions`, which is how the phone gets the
 * same agent routing and the same `requestedSkillIDs` as the web with no mobile-specific handling
 * on the server.
 *
 * @param type The suggestion's type discriminator (`agent`, `user`, `entity`, `query`, `skill`).
 * @param id The record id the mention resolves to.
 * @param name The display name.
 * @param presetId Optional agent configuration preset travelling with the mention.
 */
export function SerializeMention(type: string, id: string, name: string, presetId?: string): string {
    const payload: Record<string, string> = { type, id, name };
    if (presetId) payload.configId = presetId;
    return `@${JSON.stringify(payload)}`;
}

/**
 * Replaces the active trigger's text with a serialized mention.
 *
 * @returns The new text and where the caret should land — after the inserted token and its
 *   trailing space, so typing continues naturally.
 */
export function ApplyMention(
    text: string,
    trigger: ActiveMentionTrigger,
    serialized: string,
): { Text: string; Caret: number } {
    const before = text.slice(0, trigger.StartIndex);
    const after = text.slice(trigger.EndIndex);
    const inserted = `${serialized} `;
    return {
        Text: `${before}${inserted}${after}`,
        Caret: before.length + inserted.length,
    };
}
