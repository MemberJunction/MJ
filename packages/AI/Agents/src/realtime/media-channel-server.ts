/**
 * @fileoverview Server-side channel plugin for the live **Media** channel — the agent shows
 * images / video / audio / PDFs / web embeds to the user during a realtime conversation. Paired
 * with the browser's `RealtimeMediaChannel` client plugin through the seeded `MJ: AI Agent Channels`
 * row (`Name: 'Media'`, `ServerPluginClass: 'MediaChannelServer'`,
 * `ClientPluginClass: 'RealtimeMediaChannel'`).
 *
 * Like the Whiteboard, the Media channel executes entirely **client-side** (the client tools
 * `Media_ShowMedia` / `Media_PlayMedia` / `Media_Highlight` / `Media_CloseMedia` / `Media_ClearAll`
 * mutate a browser state engine that renders the media). The server half's job is to guard the
 * **persisted state of record** — the `MJ: AI Agent Session Channels.Config` blob a resume
 * rehydrates through the client's `RestoreState` — by validating that every landed save is a
 * parseable media-state object and normalizing it to a canonical compact serialization.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';

/**
 * Server half of the Media interactive channel. One instance per realtime session (created by
 * `RealtimeChannelServerHost` from the channel registry — never construct directly).
 *
 * On each landed state save ({@link OnChannelStateSave}):
 *  - payload parses to a JSON **object** → persist the canonical compact re-serialization;
 *  - payload is malformed JSON or a non-object → log loudly and keep the original unchanged
 *    (persistence is never blocked; the client's `RestoreState` is tolerant of bad payloads, so
 *    flag-don't-drop is the safe posture, matching `WhiteboardChannelServer`).
 */
@RegisterClass(BaseRealtimeChannelServer, 'MediaChannelServer')
export class MediaChannelServer extends BaseRealtimeChannelServer {
    /** Matches the seeded `MJ: AI Agent Channels` row's `Name`. */
    public get ChannelName(): string {
        return 'Media';
    }

    /**
     * Validates + canonicalizes a landed media-state save (see the class doc for the contract).
     *
     * @param stateJson The serialized media state the client submitted (`{ Items, ActiveItemId }`).
     * @returns The compact canonical JSON when the payload is a valid object and differs from the
     *   input; `null` (= keep the original) otherwise.
     */
    public override async OnChannelStateSave(stateJson: string): Promise<string | null> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(stateJson);
        } catch {
            this.logInvalidState('is not valid JSON');
            return null;
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            this.logInvalidState('is not a JSON object');
            return null;
        }
        const canonical = JSON.stringify(parsed);
        return canonical === stateJson ? null : canonical;
    }

    /** Flags a corrupt media payload — kept loud so it is caught before the next resume, not at it. */
    private logInvalidState(problem: string): void {
        const sessionID = this.Context?.AgentSessionID ?? 'unknown';
        LogError(
            `[MediaChannelServer] Media state save for session ${sessionID} ${problem} — ` +
                'persisting the payload unchanged; a future resume will start with a fresh media surface.',
        );
    }
}

/**
 * Tree-shaking prevention for {@link MediaChannelServer}'s `@RegisterClass` registration. Called
 * from a static code path in the server host (alongside `LoadWhiteboardChannelServer`) so the
 * registration always executes — mirroring every other `Load...()` in the realtime stack.
 */
export function LoadMediaChannelServer(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
