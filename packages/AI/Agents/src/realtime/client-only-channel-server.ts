/**
 * @fileoverview A generic server half for channels that run entirely in the browser.
 *
 * `MJ: AI Agent Channels.ServerPluginClass` is `NOT NULL`: every channel in the registry names a server plugin, even a
 * channel whose verbs, state and surface all live in the client. Without this class each such channel (an Open App's
 * form channel, a game, a component host) would hand-write the same empty plugin. A client-only channel instead
 * points its registry row at this one:
 *
 * ```json
 * { "fields": { "Name": "YourChannel", "ServerPluginClass": "ClientOnlyChannelServer", "ClientPluginClass": "YourChannel", ... } }
 * ```
 *
 * The plugin takes its channel name from the registry row it was resolved for (see {@link ClientOnlyChannelServer.BindChannelName}),
 * so one registered class serves any number of channels and `RealtimeChannelServerHost` never reports a name mismatch.
 *
 * ## What it does
 *
 * - Completes the registry pairing, so the channel is discoverable, scoped and killable like every other.
 * - Contributes **no server tools** (`GetServerToolDefinitions()` is `[]`): every verb executes in the browser.
 * - Does **not interpret or rewrite** a state-of-record save (`OnChannelStateSave` returns `null`, which the host reads as
 *   "keep what the client sent").
 *
 * ## What it does not do
 *
 * - **It does not decide scope.** Whether the channel is in a session at all is resolved by the channel-scoping cascade
 *   (`channels.include` / `exclude` / the registry's `IsActive` kill switch) BEFORE the host creates any plugin, so there is
 *   nothing left for a plugin to validate.
 * - **It does not stop a save.** The host treats a plugin's `null` (and any thrown error) as "persist the original", so a
 *   server plugin cannot refuse state. Whether anything is persisted is decided by the CLIENT: a channel with no state of
 *   record (`SerializeState()` returns `null`, so it never requests a save) persists nothing. A channel that does request
 *   saves, such as an `AngularComponentChannel`, has its state stored on the session's channel row as submitted; if that state
 *   must not be stored, validate or redact it in a server plugin of your own (return a replacement) or do not save it.
 * - **It does not authorize anything.** If the channel's verbs call server operations, those operations are the security
 *   boundary (they run on the session's own principal); a client-only channel adds no door of its own.
 *
 * Use a dedicated server plugin instead when the channel needs server tools, a server-side state normalizer, or
 * session-lifecycle work.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { BaseRealtimeChannelServer, RealtimeToolDefinition } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** The `ServerPluginClass` key a client-only channel's registry row uses. */
export const CLIENT_ONLY_CHANNEL_SERVER_KEY = 'ClientOnlyChannelServer';

/**
 * Generic server half for a channel that runs entirely in the browser. One instance per realtime session (created by
 * `RealtimeChannelServerHost` from the channel registry; never construct directly).
 *
 * Subclass it only to pin a fixed {@link ChannelName} under a key of your own (as the built-in Interactive Component and
 * Identity Verification channels do, so their existing registry keys keep resolving); an Open App should simply use the
 * registered `ClientOnlyChannelServer` key.
 */
@RegisterClass(BaseRealtimeChannelServer, CLIENT_ONLY_CHANNEL_SERVER_KEY)
export class ClientOnlyChannelServer extends BaseRealtimeChannelServer {
    private boundChannelName: string | null = null;

    /**
     * The channel this instance serves: the registry row's `Name`, once the host has bound it; `''` before that. A subclass
     * that pins a fixed name overrides it.
     */
    public get ChannelName(): string {
        return this.boundChannelName ?? '';
    }

    /**
     * Tells the plugin which registry row it was resolved for. Called by `RealtimeChannelServerHost` right after it creates
     * the instance, so a single registered class can serve any client-only channel.
     *
     * @param channelName The registry row's `Name`.
     */
    public BindChannelName(channelName: string): void {
        this.boundChannelName = channelName;
    }

    /** No server-executed tools: every verb runs in the browser. */
    public override GetServerToolDefinitions(): RealtimeToolDefinition[] {
        return [];
    }

    /**
     * Does not interpret or rewrite a state save. `null` means "persist what the client submitted" (the host cannot refuse a
     * save through a plugin; see the file comment).
     *
     * @returns `null`.
     */
    public override async OnChannelStateSave(): Promise<string | null> {
        return null;
    }
}

/**
 * Tree-shaking prevention for {@link ClientOnlyChannelServer}'s `@RegisterClass` registration. Called from a static code
 * path in the server host (and, for the Interactive Component and Identity Verification plugins, from their own load
 * functions) so the registration always executes.
 */
export function LoadClientOnlyChannelServer(): void {
    // no-op: the import + call create a static reference bundlers cannot eliminate
}
