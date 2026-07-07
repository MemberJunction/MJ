/**
 * @fileoverview Per-call ACS application-hosted-media pump registry for the Teams meetings ingress.
 *
 * This is the server half of the Teams audio plane — the analogue of {@link TwilioCallMediaRegistry} for
 * telephony. It implements the Teams provider package's `IAcsMediaPump` seam (which `PumpBackedAcsMedia` →
 * `RealTeamsBindings` drive) on top of the live ACS application-hosted-media audio socket(s) the server owns.
 *
 * Like telephony, there is a lifecycle gap: when a meeting bridge session starts, `RealTeamsBindings`
 * registers its inbound-audio handler before the ACS media socket has connected its inbound stream. The
 * registry bridges that gap by buffering handler registrations + outbound PCM per call id and binding them to
 * the media transport once it attaches (the server's native ACS media adapter calls {@link AttachTransport}
 * when the application-hosted-media socket is up for the call).
 *
 * Pure + unit-testable: the media transport is injected as the minimal {@link IAcsMediaTransport} surface, so
 * the registry's buffering / dispatch logic is exercised with a fake transport and no ACS install or network.
 *
 * @module @memberjunction/server/telephony
 */

import type { AcsInboundAudioFrame, IAcsMediaPump } from '@memberjunction/ai-bridge-teams';

/**
 * The minimal ACS media-transport surface the registry drives — a structural subset of the server's native
 * application-hosted-media socket adapter, so the registry never imports the ACS SDK and is testable with a
 * fake. Outbound frames are raw PCM16 `ArrayBuffer`s for the call.
 */
export interface IAcsMediaTransport {
    /** Sends one outbound PCM16 frame on the call's application-hosted-media outbound audio socket. */
    sendAudioFrame(pcm: ArrayBuffer): void;
    /** Closes the call's media transport (best-effort; called on call end). */
    close(): void;
}

/** One call's audio channel: its transport (once attached), inbound handlers, hand-raise handlers, pending sends. */
interface CallAudioChannel {
    transport?: IAcsMediaTransport;
    /** Inbound per-participant audio handlers registered by RealTeamsBindings (may predate the transport). */
    frameHandlers: Array<(frame: AcsInboundAudioFrame) => void>;
    /** Raised-hand handlers (Teams hand-raise is partial; may never fire). */
    handRaiseHandlers: Array<(participantId: string, raised: boolean) => void>;
    /** Outbound PCM produced before the transport attached — flushed on AttachTransport. */
    outboundBuffer: ArrayBuffer[];
}

/**
 * Coordinates ACS application-hosted-media transports with the bridge bindings, keyed by Graph call id. One
 * instance per server, shared between the meetings service (which binds `PumpBackedAcsMedia` over this as the
 * `IAcsMediaPump`) and the server's native ACS media adapter (which attaches transports + dispatches inbound
 * audio).
 */
export class TeamsAcsMediaRegistry implements IAcsMediaPump {
    private readonly channels = new Map<string, CallAudioChannel>();

    /**
     * @param SampleRate The ACS audio-socket sample rate in Hz (the application-hosted-media PCM rate the
     *   server negotiates). Drives T0 resampling in `RealTeamsBindings`. Defaults to 16000.
     */
    constructor(public readonly SampleRate = 16000) {}

    /** Ensures a channel exists for a call (called when a meeting bridge session for the call starts). */
    public RegisterCall(callId: string): void {
        this.ensureChannel(callId);
    }

    // ── IAcsMediaPump ─────────────────────────────────────────────────────────────

    /** @inheritdoc — buffers when the transport has not yet attached; sends immediately once it has. */
    public Send(callId: string, pcm: ArrayBuffer): void {
        const channel = this.ensureChannel(callId);
        if (channel.transport) {
            channel.transport.sendAudioFrame(pcm);
        } else {
            channel.outboundBuffer.push(pcm);
        }
    }

    /** @inheritdoc — stores the handler so frames delivered before AND after transport attach reach it. */
    public OnFrame(callId: string, handler: (frame: AcsInboundAudioFrame) => void): void {
        this.ensureChannel(callId).frameHandlers.push(handler);
    }

    /** @inheritdoc — stores the hand-raise handler (Teams hand-raise is partial; tolerated if it never fires). */
    public OnHandRaise(callId: string, handler: (participantId: string, raised: boolean) => void): void {
        this.ensureChannel(callId).handRaiseHandlers.push(handler);
    }

    // ── native-adapter side ─────────────────────────────────────────────────────

    /**
     * Binds a connected ACS media transport to a call, flushing any outbound PCM produced while the transport
     * was still connecting. Called by the server's native ACS media adapter once the application-hosted-media
     * socket is up for the call.
     */
    public AttachTransport(callId: string, transport: IAcsMediaTransport): void {
        const channel = this.ensureChannel(callId);
        channel.transport = transport;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const pcm of buffered) {
            transport.sendAudioFrame(pcm);
        }
    }

    /** Dispatches one inbound per-participant audio frame to all registered handlers for the call. */
    public DispatchInbound(callId: string, frame: AcsInboundAudioFrame): void {
        const channel = this.channels.get(callId);
        if (!channel) {
            return;
        }
        for (const handler of channel.frameHandlers) {
            handler(frame);
        }
    }

    /** Dispatches one raised-hand signal to all registered hand-raise handlers for the call. */
    public DispatchHandRaise(callId: string, participantId: string, raised: boolean): void {
        const channel = this.channels.get(callId);
        if (!channel) {
            return;
        }
        for (const handler of channel.handRaiseHandlers) {
            handler(participantId, raised);
        }
    }

    /** Tears down a call's channel and closes its transport (called on call end / meeting ended). */
    public EndCall(callId: string): void {
        const channel = this.channels.get(callId);
        if (!channel) {
            return;
        }
        try {
            channel.transport?.close();
        } catch {
            /* best-effort */
        }
        this.channels.delete(callId);
    }

    /** Whether a channel is currently tracked for the call (test/observability helper). */
    public HasCall(callId: string): boolean {
        return this.channels.has(callId);
    }

    private ensureChannel(callId: string): CallAudioChannel {
        let channel = this.channels.get(callId);
        if (!channel) {
            channel = { frameHandlers: [], handRaiseHandlers: [], outboundBuffer: [] };
            this.channels.set(callId, channel);
        }
        return channel;
    }
}
