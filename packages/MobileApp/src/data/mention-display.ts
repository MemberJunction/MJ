import { ConversationsRuntime, MentionAutocomplete } from '@memberjunction/conversations-runtime';

/**
 * @fileoverview Turning stored mention tokens back into readable text.
 *
 * A mention is stored in the message body as JSON — `@{"type":"agent","id":"E7B3…","name":"Sage"}`
 * — because that is what makes routing exact and portable between surfaces. It is emphatically not
 * what a person should read.
 *
 * The web runs every message body through `ConversationUtility.ToPlainText` before display. Mobile
 * did not, so every mention a user inserted appeared in the thread as a raw JSON blob: in the
 * optimistic bubble, in the persisted message, and in every renderer. The feature looked broken the
 * instant it was used.
 *
 * This is the single conversion point, applied where a view model is built rather than in each
 * renderer, so a new renderer cannot forget it.
 */

/**
 * Renders mention tokens in a message body as `@Name`.
 *
 * Tolerant by design: unparseable or partially-written tokens are left as-is rather than throwing,
 * because this runs on every message including ones being typed.
 *
 * @param text A message body, possibly containing `@{"type":…}` tokens.
 * @returns The same text with tokens replaced by their display names.
 */
export function MentionsToPlainText(text: string | null | undefined): string {
    if (!text) return '';
    if (!text.includes('@{')) return text;   // the overwhelmingly common case — no work to do
    try {
        // The agent/user lists are optional: the runtime reads `name` straight off each token, and
        // only needs the rosters to resolve LEGACY `@Name` text, which is already display-ready.
        return ConversationsRuntime.Instance.Mentions.toPlainText(text);
    } catch {
        return text;
    }
}

/**
 * Forgets the mention engine's cached, permission-filtered rosters.
 *
 * `MentionAutocomplete` is a process-wide singleton whose `initialize` short-circuits once warm, so
 * without this the agent and skill lists built for one user are served to the next one who signs in
 * on the same device. The engine's own `refresh` re-reads for a given user; this clears it outright,
 * which is what a sign-out means — there is no user to re-read for yet.
 */
export function ResetMentionCaches(): void {
    const engine = MentionAutocomplete.Instance as unknown as {
        isInitialized: boolean;
        initializationPromise: Promise<void> | null;
    };
    engine.isInitialized = false;
    engine.initializationPromise = null;
}
