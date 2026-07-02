/**
 * @fileoverview Server-side channel plugin for the live Whiteboard — the reference
 * `BaseRealtimeChannelServer` implementation, paired with the browser's
 * `RealtimeWhiteboardChannel` client plugin through the seeded `MJ: AI Agent Channels` row
 * (`Name: 'Whiteboard'`, `ServerPluginClass: 'WhiteboardChannelServer'`,
 * `ClientPluginClass: 'RealtimeWhiteboardChannel'`).
 *
 * Deliberately small and honest about its job: the whiteboard executes entirely client-side, so
 * the server half's real value is guarding the **persisted state of record** — the
 * `MJ: AI Agent Session Channels.Config` blob a future resume rehydrates through the client
 * plugin's `RestoreState`. This plugin validates that every save the client lands is parseable
 * board JSON (flagging corrupt payloads loudly instead of discovering them at the next resume)
 * and normalizes valid payloads to a canonical compact serialization.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';

/**
 * Server half of the Whiteboard interactive channel. One instance per realtime session (created
 * by `RealtimeChannelServerHost` from the channel registry — never construct directly).
 *
 * Behavior on each landed state save ({@link OnChannelStateSave}):
 *  - payload parses to a JSON **object** → persist the canonical compact re-serialization
 *    (`JSON.stringify(parsed)`), or the original when already canonical;
 *  - payload is malformed JSON or a non-object (array/primitive) → log loudly and keep the
 *    original unchanged — persistence is never blocked, and the client's `RestoreState` contract
 *    is tolerant of bad payloads, so flag-don't-drop is the safe posture.
 */
@RegisterClass(BaseRealtimeChannelServer, 'WhiteboardChannelServer')
export class WhiteboardChannelServer extends BaseRealtimeChannelServer {
    /** Matches the seeded `MJ: AI Agent Channels` row's `Name`. */
    public get ChannelName(): string {
        return 'Whiteboard';
    }

    /**
     * Validates + canonicalizes a landed board-state save (see the class doc for the contract).
     *
     * @param stateJson The serialized board scene the client submitted.
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

    /** Flags a corrupt board payload — kept loud so it is caught before the next resume, not at it. */
    private logInvalidState(problem: string): void {
        const sessionID = this.Context?.AgentSessionID ?? 'unknown';
        LogError(
            `[WhiteboardChannelServer] Board state save for session ${sessionID} ${problem} — ` +
                'persisting the payload unchanged; a future resume will start with a fresh board.',
        );
    }
}

/**
 * Tree-shaking prevention for {@link WhiteboardChannelServer}'s `@RegisterClass` registration.
 * Called from a static code path in the server host (MJServer's `agentSessions` module) so the
 * registration always executes — mirroring every other `Load...()` in the realtime stack.
 */
export function LoadWhiteboardChannelServer(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
