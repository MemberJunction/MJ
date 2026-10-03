/**
 * @fileoverview Server-side channel plugin for the **Identity Verification** channel — the generic,
 * opt-in channel through which a realtime agent helps a person (often an anonymous widget guest) prove
 * they control an email address without leaving the call.
 *
 * Paired with the browser's `IdentityVerificationChannel` client plugin through the seeded
 * `MJ: AI Agent Channels` row (`Name: 'IdentityVerification'`,
 * `ServerPluginClass: 'IdentityVerificationChannelServer'`, `ClientPluginClass: 'IdentityVerificationChannel'`).
 *
 * **Why the server half is intentionally thin, and validates nothing beyond scope.** The channel's verbs
 * are executed in the browser, which then calls the verification operations
 * (`RequestRealtimeSessionVerification`, `SubmitRealtimeSessionVerificationCode`) on the session's own
 * principal. Those operations — not this plugin — are the security boundary: domain policy, rate limits,
 * code hashing, expiry and deadline extension all live in the verification service, and the server never
 * trusts anything the client says about verification state. A server tool here would only be a second,
 * weaker door to the same room, and a state of record would put an email address (PII) onto the session's
 * channel row for no benefit — the session's verification state is already stored, hashed where it must
 * be, on the session itself. So the plugin completes the registry pairing (so the channel is discoverable
 * and scoped like every other) and contributes no server tools and no persisted state.
 *
 * "Scope" is the only thing that applies server-side: whether the channel is in a session at all is decided
 * by the channel-scoping cascade (`channels.config.IdentityVerification`, opt-in by default) and the
 * registry's kill switch, both resolved before this plugin is ever created.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { BaseRealtimeChannelServer, RealtimeToolDefinition } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** The stable channel name, matching the seeded `MJ: AI Agent Channels` row. */
export const IDENTITY_VERIFICATION_CHANNEL_NAME = 'IdentityVerification';

/**
 * Server half of the Identity Verification channel. One instance per realtime session (created by
 * `RealtimeChannelServerHost` from the channel registry — never construct directly).
 */
@RegisterClass(BaseRealtimeChannelServer, 'IdentityVerificationChannelServer')
export class IdentityVerificationChannelServer extends BaseRealtimeChannelServer {
    /** Matches the seeded `MJ: AI Agent Channels` row's `Name`. */
    public get ChannelName(): string {
        return IDENTITY_VERIFICATION_CHANNEL_NAME;
    }

    /** No server-executed tools: every verb runs in the browser, and the verification operations are the boundary. */
    public override GetServerToolDefinitions(): RealtimeToolDefinition[] {
        return [];
    }

    /**
     * Persists nothing. The channel's state is a name and an email in a form; the session's verification
     * state of record is stored server-side by the verification service. Returning `null` also means a
     * session resume never rehydrates a half-filled form onto a new session.
     *
     * @returns `null` — never persist.
     */
    public override async OnChannelStateSave(): Promise<string | null> {
        return null;
    }
}

/**
 * Tree-shaking prevention for {@link IdentityVerificationChannelServer}'s `@RegisterClass` registration.
 * Called from a static code path in the server host so the registration always executes.
 */
export function LoadIdentityVerificationChannelServer(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
