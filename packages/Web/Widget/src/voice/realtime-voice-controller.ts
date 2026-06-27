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
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import type { IVoiceController, VoiceControllerCallbacks, WidgetVoiceState } from './voice-controller.js';
import { VoiceAbuseGuard, type VoiceAbuseLimits } from './voice-abuse-guard.js';

/** What the realtime mint returns to the client (the provider driver name + its session config). */
export interface VoiceMintResult {
    /** Driver key for ClassFactory.CreateInstance(BaseRealtimeClient, Provider) — e.g. 'openai'. */
    provider: string;
    /** Provider-specific ephemeral session config (carries the ephemeral credential). */
    sessionConfig: ClientRealtimeSessionConfig;
}

/** Mints a realtime session for the pinned agent using the guest token (live: GraphQL mutation). */
export type VoiceMintFn = () => Promise<VoiceMintResult>;

/** How often to poll the abuse guard while a voice session is live. */
const GUARD_POLL_MS = 5_000;

/** Reuses the shipped realtime client stack for the widget's voice modality. */
export class RealtimeVoiceController implements IVoiceController {
    private client: BaseRealtimeClient | null = null;
    private micStream: MediaStream | null = null;
    private guardTimer: ReturnType<typeof setInterval> | null = null;
    private active = false;

    constructor(
        private readonly mint: VoiceMintFn,
        private readonly limits?: VoiceAbuseLimits,
    ) {}

    public get IsActive(): boolean {
        return this.active;
    }

    public async Start(callbacks: VoiceControllerCallbacks): Promise<void> {
        callbacks.onState('connecting');
        const guard = new VoiceAbuseGuard(this.limits);

        const minted = await this.mint();
        const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, minted.provider);
        if (!client) {
            callbacks.onState('error');
            callbacks.onEnded('No realtime driver available for this provider.');
            return;
        }
        this.client = client;
        this.wireClient(client, callbacks, guard);

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
