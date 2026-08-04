import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Per-user persistence for in-progress (un-sent) composer drafts, so a message the
 * user was writing survives conversation switches, page refreshes, and devices.
 *
 * Storage: ONE `MJ: User Settings` row via {@link UserInfoEngine} (never
 * localStorage — see the root CLAUDE.md persistence rule), key
 * {@link COMPOSER_DRAFTS_SETTING}, value = a JSON map of
 * `'new' | <conversationId-lowercased>` → the SERIALIZED draft (the composer's
 * `getPlainTextWithJsonMentions()` format, so mention pills round-trip losslessly
 * through the editor's rehydrating `writeValue`).
 *
 * Contracts:
 *  - Writes while typing are debounced (`SetSettingDebounced`); {@link Flush}
 *    persists immediately (blur / conversation switch).
 *  - Sending a message calls {@link ClearDraft}, which DELETES the key from the
 *    map and persists — the map only ever holds live drafts.
 *  - Empty/whitespace drafts are treated as clears; drafts are capped at
 *    {@link MAX_DRAFT_LENGTH}; the map keeps at most {@link MAX_DRAFTS} entries
 *    (least-recently-updated evicted).
 *  - The setting is read ONCE per session (UserInfoEngine's cache makes this a
 *    sync hit anyway); the in-memory map is authoritative afterwards. Multi-tab
 *    is last-write-wins by design.
 */
export class ComposerDraftStore {
    /** The single User Setting key holding all drafts. */
    public static readonly COMPOSER_DRAFTS_SETTING = 'mj.chat.drafts.v1';
    /** Map key for the new-conversation (not-yet-created) composer. */
    public static readonly NEW_CONVERSATION_KEY = 'new';
    /** Most drafts retained; least-recently-updated evicted beyond this. */
    public static readonly MAX_DRAFTS = 20;
    /** Per-draft length cap (chars of serialized text). */
    public static readonly MAX_DRAFT_LENGTH = 16_000;

    private drafts = new Map<string, string>(); // insertion order = LRU order
    private loaded = false;

    /** Normalizes a conversation id (null = the new-conversation composer) to its map key. */
    public static KeyFor(conversationId: string | null | undefined): string {
        return conversationId ? conversationId.trim().toLowerCase() : ComposerDraftStore.NEW_CONVERSATION_KEY;
    }

    /** The stored draft for a conversation (or the new-convo composer), if any. */
    public GetDraft(conversationId: string | null | undefined): string | null {
        this.ensureLoaded();
        return this.drafts.get(ComposerDraftStore.KeyFor(conversationId)) ?? null;
    }

    /**
     * Records the current draft (debounced persistence). Empty text clears the
     * entry instead — the map never holds blank drafts.
     */
    public SetDraft(conversationId: string | null | undefined, serializedText: string): void {
        this.ensureLoaded();
        const key = ComposerDraftStore.KeyFor(conversationId);
        const text = (serializedText ?? '').trim().length === 0
            ? ''
            : serializedText.substring(0, ComposerDraftStore.MAX_DRAFT_LENGTH);
        if (text.length === 0) {
            if (!this.drafts.delete(key)) {
                return; // nothing stored and nothing to store — no write needed
            }
        } else {
            if (this.drafts.get(key) === text) {
                return; // unchanged — skip the write
            }
            this.drafts.delete(key); // re-insert to refresh LRU position
            this.drafts.set(key, text);
            this.evictBeyondCap();
        }
        console.log(`[Drafts] SetDraft('${key}'): ${text.length} chars → debounced persist (${this.drafts.size} draft(s))`);
        UserInfoEngine.Instance.SetSettingDebounced(ComposerDraftStore.COMPOSER_DRAFTS_SETTING, this.serialize());
    }

    /** Deletes a conversation's draft (message sent / draft abandoned) and persists immediately. */
    public ClearDraft(conversationId: string | null | undefined): void {
        this.ensureLoaded();
        if (this.drafts.delete(ComposerDraftStore.KeyFor(conversationId))) {
            void UserInfoEngine.Instance.SetSetting(ComposerDraftStore.COMPOSER_DRAFTS_SETTING, this.serialize());
        }
    }

    /** Persists the current map immediately (blur / conversation switch / teardown). */
    public Flush(): void {
        if (!this.loaded) {
            return; // nothing ever read or written
        }
        console.log(`[Drafts] Flush: persisting ${this.drafts.size} draft(s) immediately`);
        void UserInfoEngine.Instance.SetSetting(ComposerDraftStore.COMPOSER_DRAFTS_SETTING, this.serialize())
            .then((ok) => { if (!ok) console.warn('[Drafts] Flush: SetSetting reported failure'); })
            .catch((e) => console.warn('[Drafts] Flush: SetSetting threw', e));
    }

    private ensureLoaded(): void {
        if (this.loaded) {
            return;
        }
        this.loaded = true;
        try {
            const raw = UserInfoEngine.Instance.GetSetting(ComposerDraftStore.COMPOSER_DRAFTS_SETTING);
            if (raw) {
                const parsed = JSON.parse(raw) as Record<string, string>;
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === 'string' && value.trim().length > 0) {
                        this.drafts.set(key, value);
                    }
                }
            }
        } catch {
            // Corrupt/legacy payload — start clean; the next write repairs the row.
            this.drafts.clear();
        }
    }

    private evictBeyondCap(): void {
        while (this.drafts.size > ComposerDraftStore.MAX_DRAFTS) {
            const oldest = this.drafts.keys().next().value as string | undefined;
            if (oldest === undefined) {
                break;
            }
            this.drafts.delete(oldest);
        }
    }

    private serialize(): string {
        return JSON.stringify(Object.fromEntries(this.drafts));
    }
}
