/**
 * @fileoverview Per-call WebSocket-media pump registry for the Vonage telephony ingress.
 *
 * @module @memberjunction/telephony-adapters
 */

import type { VonageControlEvent, IVonageMediaPump } from '@memberjunction/ai-bridge-vonage';

/**
 * The minimal websocket surface the registry drives — a structural subset of a `ws` socket, so the
 * registry never imports `ws` and is testable with a fake. Vonage audio is sent as BINARY frames (raw
 * L16 PCM); the registry never sends text frames outbound (Vonage's media socket only accepts audio).
 */
export interface ITelephonyMediaSocket {
    /** Sends one outbound BINARY audio frame (raw L16 PCM) on the call's socket. */
    sendBinary(data: Uint8Array): void;
    /** Sends one outbound TEXT control frame (JSON command, e.g. `{"action":"clear"}`) on the call's socket. */
    sendText(data: string): void;
    /** Closes the socket (best-effort; called on call end). */
    close(): void;
}

/**
 * The exact byte size of one outbound audio frame Vonage expects on the `audio/l16;rate=8000` leg: a
 * 20 ms slice = 8000 Hz × 0.020 s = 160 samples × 2 bytes = **320 bytes**.
 */
const OUTBOUND_FRAME_BYTES = 320;

/** One call's media channel: its socket (once connected), handlers, and pending outbound audio. */
interface CallMediaChannel {
    socket?: ITelephonyMediaSocket;
    audioHandlers: Array<(pcm: ArrayBuffer) => void>;
    eventHandlers: Array<(event: VonageControlEvent) => void>;
    outboundBuffer: Uint8Array[];
    partial: Uint8Array;
}

/**
 * Coordinates Vonage media websockets with the bridge bindings, keyed by call UUID.
 */
export class VonageCallMediaRegistry implements IVonageMediaPump {
    private readonly channels = new Map<string, CallMediaChannel>();

    /** Ensures a channel exists for a call (called when a bridge session for the call starts). */
    public RegisterCall(callUuid: string): void {
        this.ensureChannel(callUuid);
    }

    // ── IVonageMediaPump ─────────────────────────────────────────────────────────

    public SendAudio(callUuid: string, pcm: ArrayBuffer): void {
        const channel = this.ensureChannel(callUuid);
        const incoming = new Uint8Array(pcm);
        const data = channel.partial.length > 0 ? concatBytes(channel.partial, incoming) : incoming;

        let offset = 0;
        while (data.length - offset >= OUTBOUND_FRAME_BYTES) {
            const frame = data.slice(offset, offset + OUTBOUND_FRAME_BYTES);
            offset += OUTBOUND_FRAME_BYTES;
            if (channel.socket) {
                channel.socket.sendBinary(frame);
            } else {
                channel.outboundBuffer.push(frame);
            }
        }

        channel.partial = offset < data.length ? data.slice(offset) : new Uint8Array(0);
    }

    public OnAudio(callUuid: string, handler: (pcm: ArrayBuffer) => void): void {
        this.ensureChannel(callUuid).audioHandlers.push(handler);
    }

    public OnEvent(callUuid: string, handler: (event: VonageControlEvent) => void): void {
        this.ensureChannel(callUuid).eventHandlers.push(handler);
    }

    public Clear(callUuid: string): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        channel.outboundBuffer.length = 0;
        channel.partial = new Uint8Array(0);
        channel.socket?.sendText(JSON.stringify({ action: 'clear' }));
    }

    // ── WSS-server side ─────────────────────────────────────────────────────────

    public AttachSocket(callUuid: string, socket: ITelephonyMediaSocket): void {
        const channel = this.ensureChannel(callUuid);
        channel.socket = socket;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.sendBinary(frame);
        }
    }

    public DispatchInboundAudio(callUuid: string, pcm: ArrayBuffer): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        for (const handler of channel.audioHandlers) {
            handler(pcm);
        }
    }

    public DispatchInboundEvent(callUuid: string, event: VonageControlEvent): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        for (const handler of channel.eventHandlers) {
            handler(event);
        }
    }

    public EndCall(callUuid: string): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        try {
            channel.socket?.close();
        } catch {
            /* best-effort */
        }
        this.channels.delete(callUuid);
    }

    public HasCall(callUuid: string): boolean {
        return this.channels.has(callUuid);
    }

    private ensureChannel(callUuid: string): CallMediaChannel {
        let channel = this.channels.get(callUuid);
        if (!channel) {
            channel = { audioHandlers: [], eventHandlers: [], outboundBuffer: [], partial: new Uint8Array(0) };
            this.channels.set(callUuid, channel);
        }
        return channel;
    }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}
