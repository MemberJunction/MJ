/**
 * @fileoverview Server-side channel plugin for the **headless** Client Context channel — the live
 * wire that streams the user's app context (where they are, what they see, the available client-tool
 * and agent manifest) to the realtime co-agent, and through which the model's single stable
 * `ContextTool` proxy drives in-app actions.
 *
 * Paired with the browser's `ClientContextChannel` client plugin through the seeded
 * `MJ: AI Agent Channels` row (`Name: 'ClientContextChannel'`, `IsHeadless: 1`,
 * `ServerPluginClass: 'ClientContextChannelServer'`, `ClientPluginClass: 'ClientContextChannel'`).
 *
 * **Why the server half is intentionally thin.** This channel is *headless* (it never mounts a tab)
 * and *ephemeral* (it persists no state of record — it is a live wire, not a document like the
 * whiteboard). In the client-direct topology the work lives in the browser: the client plugin
 * publishes context deltas via the provider's `SendContextNote` and executes `ContextTool` calls
 * locally through the unified client-tool resolver (`ResolveClientTools` in
 * `@memberjunction/ai-core-plus`) with no server round-trip. The server half exists to (a) complete
 * the channel registry pairing so the channel is discoverable/loadable like every other channel, and
 * (b) be the home for any *future* server-side context tooling. It contributes no server tools today
 * and saves no state — both base defaults, made explicit here.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { BaseRealtimeChannelServer, RealtimeToolDefinition } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** The stable channel name, matching the seeded `MJ: AI Agent Channels` row. */
export const CLIENT_CONTEXT_CHANNEL_NAME = 'ClientContextChannel';

/**
 * Server half of the headless Client Context channel. One instance per realtime session (created by
 * `RealtimeChannelServerHost` from the channel registry — never construct directly).
 *
 * Contributes **no server tools** ({@link GetServerToolDefinitions} returns `[]`) — the channel's
 * `ContextTool` and client tools execute client-side — and persists **no state of record**
 * ({@link OnChannelStateSave} returns `null`, the "keep nothing / live-only" posture), so a session
 * resume never tries to rehydrate it.
 */
@RegisterClass(BaseRealtimeChannelServer, 'ClientContextChannelServer')
export class ClientContextChannelServer extends BaseRealtimeChannelServer {
    /** Matches the seeded `MJ: AI Agent Channels` row's `Name`. */
    public get ChannelName(): string {
        return CLIENT_CONTEXT_CHANNEL_NAME;
    }

    /**
     * No server-executed tools: the channel's stable `ContextTool` proxy and all surface client tools
     * execute in the browser via the unified client-tool resolver. Explicit `[]` documents the intent.
     */
    public override GetServerToolDefinitions(): RealtimeToolDefinition[] {
        return [];
    }

    /**
     * Live-only channel: it carries no state of record (it is a wire, not a document), so a landed
     * state save is intentionally not persisted. Returning `null` keeps nothing — a session resume
     * never rehydrates this channel.
     *
     * @returns `null` — never persist.
     */
    public override async OnChannelStateSave(): Promise<string | null> {
        return null;
    }
}

/**
 * Tree-shaking prevention for {@link ClientContextChannelServer}'s `@RegisterClass` registration.
 * Called from a static code path in the server host so the registration always executes — mirroring
 * every other `Load...()` in the realtime stack.
 */
export function LoadClientContextChannelServer(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
