/**
 * @fileoverview The **Remote Browser** server-side channel — a LIFECYCLE-ONLY interactive-channel plugin
 * for the CLIENT-DIRECT realtime topology.
 *
 * ## Why this plugin contributes NO server tools
 * Realtime sessions are **client-direct**: the model talks to the browser, and the agent's
 * browser-driving tools execute CLIENT-side (a separate client agent builds the
 * `RealtimeRemoteBrowserChannel.ApplyAgentTool` surface), exactly like the live Whiteboard. The
 * server is NOT in the model↔tool loop, so server-executed channel tools would never be relayed to it.
 * Each client-executed browser tool instead calls the `ExecuteRemoteBrowserAction` GraphQL mutation,
 * which drives the server-side {@link RemoteBrowserEngine}. This plugin therefore keeps
 * {@link BaseRealtimeChannelServer.GetServerToolDefinitions} at its default `[]` and owns only the
 * **session lifecycle**: when the agent session ends (or this plugin is disposed), it tears down any
 * browser the session lazily started via the mutation.
 *
 * The browser is started LAZILY by the mutation on first use — never here — so a realtime session that
 * never touches the browser never launches Chrome.
 *
 * @module @memberjunction/remote-browser-server
 * @author MemberJunction.com
 */

import { BaseRealtimeChannelServer, RealtimeChannelCloseReason } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { RemoteBrowserEngine } from './remote-browser-engine';

/** The channel name — matches the (seeded) `MJ: AI Agent Channels` row's `Name`. */
export const REMOTE_BROWSER_CHANNEL_NAME = 'Remote Browser';

/**
 * Server half of the Remote Browser interactive channel — ONE instance per realtime session, created by
 * `RealtimeChannelServerHost` from the channel registry (never constructed directly). Registered under
 * `'RemoteBrowserChannelServer'` so the seeded registry row resolves it via the ClassFactory.
 *
 * It is deliberately a **lifecycle-only** plugin: it contributes no server-executed tools (the agent's
 * browser tools are client-executed in the client-direct topology and reach the server through the
 * `ExecuteRemoteBrowserAction` mutation). Its sole job is teardown — when the session closes or the
 * plugin is disposed, end any browser the session lazily started so a leased Chrome is never leaked.
 */
@RegisterClass(BaseRealtimeChannelServer, 'RemoteBrowserChannelServer')
export class RemoteBrowserChannel extends BaseRealtimeChannelServer {
    /** @inheritdoc */
    public get ChannelName(): string {
        return REMOTE_BROWSER_CHANNEL_NAME;
    }

    /**
     * Session-closed hook (every close provenance funnels here). Tears down any browser this session
     * lazily started via the `ExecuteRemoteBrowserAction` mutation. Best-effort: teardown failures are
     * logged, never thrown, so a channel plugin can never break a closing session.
     *
     * @param _closeReason The persisted close provenance (unused — every reason tears the browser down).
     */
    public override async OnSessionClosed(_closeReason: RealtimeChannelCloseReason | null): Promise<void> {
        await this.endBrowserForSession();
    }

    /**
     * Disposal hook (fires after the host's post-close linger window). A safety net mirroring
     * {@link OnSessionClosed} — if the session somehow closed without it running, this still releases any
     * browser the session held. Idempotent against the engine's own no-op-when-absent teardown. MUST call
     * `super.Dispose()` to drop the bound context.
     */
    public override Dispose(): void {
        // Fire-and-forget: Dispose is synchronous by contract, but the engine teardown is async. We
        // intentionally do not await — the engine's teardown is internally tolerant and idempotent.
        void this.endBrowserForSession();
        super.Dispose();
    }

    /**
     * Ends the lazily-started browser (if any) for this plugin's bound agent session. No-op when no
     * context is bound. Tolerant of any engine teardown error (logged, never thrown).
     */
    private async endBrowserForSession(): Promise<void> {
        const agentSessionID = this.Context?.AgentSessionID;
        if (!agentSessionID) {
            return;
        }
        try {
            await RemoteBrowserEngine.Instance.EndSessionForAgentSession(agentSessionID);
        } catch (err) {
            LogError(
                `[RemoteBrowserChannel] Failed to end the remote browser for agent session ${agentSessionID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}

/**
 * Tree-shaking prevention for {@link RemoteBrowserChannel}'s `@RegisterClass` registration. Call from a
 * static code path so the registration is never eliminated by the bundler — mirroring every other
 * `Load…()` in the realtime stack.
 */
export function LoadRemoteBrowserChannel(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
