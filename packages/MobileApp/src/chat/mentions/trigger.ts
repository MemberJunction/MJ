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

/**
 * Reads the first agent mention out of composer text, if there is one.
 *
 * A deliberately small, synchronous scan rather than a call into the runtime parser: the composer
 * needs this on every keystroke to decide what the `/` picker should offer, and the answer only
 * depends on tokens the composer itself inserted.
 *
 * @param text The composer's current text.
 * @returns The mentioned agent's id, or `null` when none is present.
 */
export function MentionedAgentId(text: string): string | null {
    for (const match of text.matchAll(/@(\{[^}]+\})/g)) {
        try {
            const payload = JSON.parse(match[1]) as { type?: string; id?: string };
            if (payload.type === 'agent' && payload.id) return payload.id;
        } catch {
            // A partially-typed token is not a mention yet.
        }
    }
    return null;
}

/** A mention the user inserted, tracked so display text can be turned back into wire format. */
export type InsertedMention = {
    /** Discriminator — `agent`, `user`, `entity`, `query`, `skill`. */
    Type: string;
    /** Record id. */
    ID: string;
    /** The name as shown, and as it appears in the composer's text. */
    Name: string;
    /**
     * The trigger character it was inserted with.
     *
     * Kept so the draft reads the way the user invoked it — a skill picked from `/` shows as
     * `/Summarize`, not `@Summarize`. The WIRE format is always `@{…}` regardless; this is purely
     * what the human sees, and what {@link SerializeDraft} looks for when converting back.
     */
    Prefix: MentionTriggerChar;
};

/**
 * Re-serializes a readable draft into the wire format before sending.
 *
 * The composer deliberately holds READABLE text — `@Sage what is on my plate` — because a
 * `TextInput` can only show its own string, and showing `@{"type":"agent","id":"AA6A…"}` while
 * someone types is indefensible. The web solves the same problem with chip elements in a
 * contenteditable; React Native has no such affordance, so the composer tracks what it inserted and
 * converts at the boundary.
 *
 * Each mention is matched ONCE, in order, against its own `@Name`. A mention the user has since
 * deleted simply fails to match and is dropped — which is the correct reading of "they removed it".
 *
 * @param text The readable draft.
 * @param mentions The mentions inserted into it, oldest first.
 * @returns The draft with each surviving mention replaced by its JSON token.
 */
export function SerializeDraft(text: string, mentions: InsertedMention[]): string {
    let out = text;
    for (const m of mentions) {
        const display = `${m.Prefix}${m.Name}`;
        const at = out.indexOf(display);
        if (at === -1) continue;   // the user deleted it
        out = out.slice(0, at) + SerializeMention(m.Type, m.ID, m.Name) + out.slice(at + display.length);
    }
    return out;
}
