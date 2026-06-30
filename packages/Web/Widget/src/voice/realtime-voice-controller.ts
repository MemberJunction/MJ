/**
 * @fileoverview Production voice controller — reuses `@memberjunction/ai-realtime-client`
 * (client-direct topology) VERBATIM (no new driver). It mints an ephemeral realtime
 * session (via an injected mint fn that calls the StartRealtimeClientSession mutation
 * with the guest token + the PINNED agent), resolves the provider driver through the
 * ClassFactory, acquires the mic, wires transcripts/usage/state, and enforces the
 * client-side `VoiceAbuseGuard` ceilings as defense-in-depth.
 *
 * NOTE: this path requires browser audio + a live MJAPI realtime mint; it is exercised
 * by W4's acceptance (gated on Auth0/MJAPI boot). Unit tests cover the abuse guard and
 * the widget UI via `MockVoiceController`.
 *
 * @module @memberjunction/web-widget
 */

import { MJGlobal } from '@memberjunction/global';
import type { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { BaseRealtimeClient, type RealtimeClientToolCall } from '@memberjunction/ai-realtime-client';
import type { IVoiceController, VoiceControllerCallbacks, WidgetVoiceState } from './voice-controller.js';
import { VoiceAbuseGuard, type VoiceAbuseLimits } from './voice-abuse-guard.js';
import { WidgetChannelHost } from './channels/widget-channel-host.js';
import type { WidgetChannelToolDefinition } from './channels/base-widget-channel.js';
// Side-effect import: registers the built-in framework-free channels with the ClassFactory. Lives in
// the (lazily-loaded) voice chunk, so it never weighs down the embed entry. Add new channels here.
import { LoadWidgetWhiteboardChannel } from './channels/whiteboard-channel.js';
LoadWidgetWhiteboardChannel();

/** What the realtime mint returns to the client (the provider driver name + its session config). */
export interface VoiceMintResult {
    /** Driver key for ClassFactory.CreateInstance(BaseRealtimeClient, Provider) — e.g. 'openai'. */
    provider: string;
    /** Provider-specific ephemeral session config (carries the ephemeral credential). */
    sessionConfig: ClientRealtimeSessionConfig;
    /** The durable AIAgentSession id — needed to relay non-channel (server) tool calls back to MJAPI. */
    agentSessionId: string;
}

/** Mints a realtime session for the pinned agent using the guest token (live: GraphQL mutation). */
export type VoiceMintFn = (clientTools: WidgetChannelToolDefinition[]) => Promise<VoiceMintResult>;

/**
 * Relays a NON-channel (server-executed) tool call — e.g. `invoke-target-agent` — back to MJAPI and
 * returns its result JSON. Injected so the controller stays free of the GraphQL client; the loader
 * supplies the live implementation (ExecuteRealtimeSessionTool). Absent in tests / channel-only setups.
 */
export type RelayToolFn = (agentSessionId: string, callId: string, toolName: string, argsJson: string) => Promise<string>;

/** How often to poll the abuse guard while a voice session is live. */
const GUARD_POLL_MS = 5_000;

/** Reuses the shipped realtime client stack for the widget's voice modality. */
export class RealtimeVoiceController implements IVoiceController {
    private client: BaseRealtimeClient | null = null;
    private micStream: MediaStream | null = null;
    private guardTimer: ReturnType<typeof setInterval> | null = null;
    private active = false;
    private channelHost: WidgetChannelHost | null = null;
    private agentSessionId = '';

    constructor(
        private readonly mint: VoiceMintFn,
        private readonly limits?: VoiceAbuseLimits,
        /** Interactive channels (by name) the widget may attach this session (from the minted session). */
        private readonly enabledChannels: readonly string[] = [],
        /** Live relay for non-channel tool calls; omitted when no channels are enabled (no OnToolCall wiring). */
        private readonly relayTool?: RelayToolFn,
    ) {}

    public get IsActive(): boolean {
        return this.active;
    }

    public async Start(callbacks: VoiceControllerCallbacks): Promise<void> {
        callbacks.onState('connecting');
        const guard = new VoiceAbuseGuard(this.limits);

        // Resolve the enabled interactive channels up front so their client tools are declared to the
        // model at mint. The perception seam delegates to the (soon-to-exist) realtime client.
        this.channelHost = new WidgetChannelHost(this.enabledChannels, {
            SendContextNote: (text: string) => this.client?.SendContextNote(text),
        });
        const channelTools = this.channelHost.HasChannels ? this.channelHost.GetToolDefinitions() : [];

        const minted = await this.mint(channelTools);
        this.agentSessionId = minted.agentSessionId;
        const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, minted.provider);
        if (!client) {
            callbacks.onState('error');
            callbacks.onEnded('No realtime driver available for this provider.');
            return;
        }
        this.client = client;
        this.wireClient(client, callbacks, guard);
        // Only intercept tool calls when channels are active — otherwise leave the prior behavior intact.
        if (this.channelHost.HasChannels) {
            this.wireToolCalls(client, callbacks);
        }

        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await client.Connect(minted.sessionConfig, this.micStream);

        this.active = true;
        guard.Start(Date.now());
        this.startGuardPolling(callbacks, guard);
    }

    public async Stop(): Promise<void> {
        await this.teardown();
    }

    /** Wires the realtime client's events to the widget callbacks + abuse guard. */
    private wireClient(client: BaseRealtimeClient, callbacks: VoiceControllerCallbacks, guard: VoiceAbuseGuard): void {
        client.OnStateChange((state) => callbacks.onState(this.mapState(state)));
        client.OnTranscript((t) =>
            callbacks.onTranscript({
                role: t.Role === 'Assistant' ? 'agent' : 'user',
                text: t.Text,
                isFinal: t.IsFinal,
            }),
        );
        client.OnUsage((u) => guard.AddUsage(u.OutputTokens));
        client.OnError((e) => {
            callbacks.onState('error');
            void this.teardown(callbacks, e.Message ?? 'Voice error.');
        });
    }

    /**
     * Routes the model's tool calls (wired only when channels are enabled): a channel-prefixed call is
     * applied LOCALLY to its surface (revealing it on first use) and the result fed straight back; any
     * other tool (e.g. `invoke-target-agent`) is RELAYED to MJAPI via the injected relay. Either way the
     * model always receives a tool result, so it never stalls.
     */
    private wireToolCalls(client: BaseRealtimeClient, callbacks: VoiceControllerCallbacks): void {
        client.OnToolCall((call: RealtimeClientToolCall) => {
            void this.handleToolCall(client, callbacks, call);
        });
    }

    /** Applies a channel tool locally or relays a server tool; always sends a tool result back. */
    private async handleToolCall(
        client: BaseRealtimeClient,
        callbacks: VoiceControllerCallbacks,
        call: RealtimeClientToolCall,
    ): Promise<void> {
        const channel = this.channelHost?.FindChannel(call.ToolName);
        if (channel) {
            // Reveal + bind the channel's surface the first time it's touched, THEN apply the tool (so the
            // very first draw lands on a mounted surface), and feed the result back to the model.
            const host = callbacks.getChannelSurface?.(channel.ChannelName, channel.SurfaceTitle);
            if (host) {
                this.channelHost!.BindSurface(channel, host);
            }
            client.SendToolResult(call.CallID, channel.ApplyAgentTool(call.ToolName, call.ArgumentsJson ?? '{}'));
            return;
        }
        // Non-channel tool → relay to the server (or report it can't be run, so the model recovers).
        if (this.relayTool && this.agentSessionId) {
            try {
                const resultJson = await this.relayTool(this.agentSessionId, call.CallID, call.ToolName, call.ArgumentsJson ?? '{}');
                client.SendToolResult(call.CallID, resultJson);
            } catch (e) {
                client.SendToolResult(call.CallID, JSON.stringify({ error: e instanceof Error ? e.message : 'tool relay failed' }));
            }
            return;
        }
        client.SendToolResult(call.CallID, JSON.stringify({ error: `tool '${call.ToolName}' is not available in this session` }));
    }

    /** Polls the abuse guard; aborts the session cleanly when a ceiling trips. */
    private startGuardPolling(callbacks: VoiceControllerCallbacks, guard: VoiceAbuseGuard): void {
        this.guardTimer = setInterval(() => {
            const reason = guard.ShouldAbort(Date.now());
            if (reason) {
                void this.teardown(callbacks, VoiceAbuseGuard.MessageFor(reason));
            }
        }, GUARD_POLL_MS);
    }

    /** Disconnects the client, stops mic tracks, clears the timer, and notifies once. */
    private async teardown(callbacks?: VoiceControllerCallbacks, endedReason?: string): Promise<void> {
        if (this.guardTimer) {
            clearInterval(this.guardTimer);
            this.guardTimer = null;
        }
        if (this.client) {
            try {
                await this.client.Disconnect();
            } catch {
                /* best-effort */
            }
            this.client = null;
        }
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.micStream = null;
        if (this.channelHost) {
            this.channelHost.Dispose();
            this.channelHost = null;
        }
        const wasActive = this.active;
        this.active = false;
        if (wasActive && callbacks) {
            callbacks.onState('ended');
            callbacks.onEnded(endedReason);
        }
    }

    private mapState(state: string): WidgetVoiceState {
        switch (state) {
            case 'connecting':
            case 'connected':
                return 'connecting';
            case 'listening':
                return 'listening';
            case 'speaking':
                return 'speaking';
            case 'closed':
                return 'ended';
            default:
                return 'error';
        }
    }
}
