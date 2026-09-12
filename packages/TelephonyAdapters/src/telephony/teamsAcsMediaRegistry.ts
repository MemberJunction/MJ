/**
 * @fileoverview Per-call ACS application-hosted-media pump registry for the Teams meetings ingress.
 *
 * @module @memberjunction/telephony-adapters
 */

import type { AcsInboundAudioFrame, IAcsMediaPump } from '@memberjunction/ai-bridge-teams';

/**
 * The minimal ACS media-transport surface the registry drives.
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
    frameHandlers: Array<(frame: AcsInboundAudioFrame) => void>;
    handRaiseHandlers: Array<(participantId: string, raised: boolean) => void>;
    outboundBuffer: ArrayBuffer[];
}

/**
 * Coordinates ACS application-hosted-media transports with the bridge bindings, keyed by Graph call id.
 */
export class TeamsAcsMediaRegistry implements IAcsMediaPump {
    private readonly channels = new Map<string, CallAudioChannel>();

    constructor(public readonly SampleRate = 16000) {}

    /** Ensures a channel exists for a call (called when a meeting bridge session for the call starts). */
    public RegisterCall(callId: string): void {
        this.ensureChannel(callId);
    }

    // ── IAcsMediaPump ─────────────────────────────────────────────────────────────

    public Send(callId: string, pcm: ArrayBuffer): void {
        const channel = this.ensureChannel(callId);
        if (channel.transport) {
            channel.transport.sendAudioFrame(pcm);
        } else {
            channel.outboundBuffer.push(pcm);
        }
    }

    public OnFrame(callId: string, handler: (frame: AcsInboundAudioFrame) => void): void {
        this.ensureChannel(callId).frameHandlers.push(handler);
    }

    public OnHandRaise(callId: string, handler: (participantId: string, raised: boolean) => void): void {
        this.ensureChannel(callId).handRaiseHandlers.push(handler);
    }

    // ── native-adapter side ─────────────────────────────────────────────────────

    public AttachTransport(callId: string, transport: IAcsMediaTransport): void {
        const channel = this.ensureChannel(callId);
        channel.transport = transport;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const pcm of buffered) {
            transport.sendAudioFrame(pcm);
        }
    }

    public DispatchInbound(callId: string, frame: AcsInboundAudioFrame): void {
        const channel = this.channels.get(callId);
        if (!channel) {
            return;
        }
        for (const handler of channel.frameHandlers) {
            handler(frame);
        }
    }

    public DispatchHandRaise(callId: string, participantId: string, raised: boolean): void {
        const channel = this.channels.get(callId);
        if (!channel) {
            return;
        }
        for (const handler of channel.handRaiseHandlers) {
            handler(participantId, raised);
        }
    }

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
