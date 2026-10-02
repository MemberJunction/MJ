/**
 * @fileoverview Server-side channel plugin for the **Interactive Component** channel, the one that shows the user
 * any component artifact next to the call and lets the agent operate it.
 *
 * Paired with the browser's `RealtimeInteractiveComponentChannel` client plugin through the
 * `MJ: AI Agent Channels` row `Name: 'InteractiveComponent'`
 * (`ServerPluginClass: 'InteractiveComponentChannelServer'`, `ClientPluginClass: 'RealtimeInteractiveComponentChannel'`).
 *
 * **Why the server half is intentionally thin.** The channel's work happens where the component runs, in the
 * browser: the client plugin loads the artifact through the signed-in user's own session, renders it, derives the
 * agent's actions from the component's spec and drives it. Its contract is not known until a component is open,
 * so there is nothing to declare to the model as a native server tool; every action reaches the browser through
 * the stable `ContextTool` proxy. The server half exists to complete the channel registry pairing (so the channel
 * is discoverable and loadable like every other) and to say, explicitly, that it holds nothing: no server tools and
 * no state of record. Open components are live-only and are not restored when a session resumes.
 *
 * @module @memberjunction/ai-agents
 */

import { BaseRealtimeChannelServer, RealtimeToolDefinition } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** The stable channel name, matching the `MJ: AI Agent Channels` row. */
export const INTERACTIVE_COMPONENT_CHANNEL_NAME = 'InteractiveComponent';

/**
 * Server half of the Interactive Component channel. One instance per realtime session (created by
 * `RealtimeChannelServerHost` from the channel registry; never construct directly).
 */
@RegisterClass(BaseRealtimeChannelServer, 'InteractiveComponentChannelServer')
export class InteractiveComponentChannelServer extends BaseRealtimeChannelServer {
    /** Matches the registry row's `Name`. */
    public get ChannelName(): string {
        return INTERACTIVE_COMPONENT_CHANNEL_NAME;
    }

    /** No server-executed tools: every action is derived from the open component's spec and runs in the browser. */
    public override GetServerToolDefinitions(): RealtimeToolDefinition[] {
        return [];
    }

    /**
     * Live-only channel: which components are open is not state of record, so a landed save is not persisted and a
     * resumed session starts with nothing open.
     *
     * @returns `null`: never persist.
     */
    public override async OnChannelStateSave(): Promise<string | null> {
        return null;
    }
}

/**
 * Tree-shaking prevention for {@link InteractiveComponentChannelServer}'s `@RegisterClass` registration. Called from a
 * static code path in the server host so the registration always executes.
 */
export function LoadInteractiveComponentChannelServer(): void {
    // no-op: the import + call create a static reference bundlers cannot eliminate
}
