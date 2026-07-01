/**
 * @fileoverview Per-call WebSocket-media pump registry for the Vonage telephony ingress.
 *
 * This is the server half of the Vonage media plane: it implements the provider package's
 * `IVonageMediaPump` seam (which `RealVonageBindings` drives) on top of the live bidirectional media
 * websockets MJAPI accepts at `WSS /telephony/vonage/media`. It exists because of the same lifecycle
 * gap the Twilio ingress has: when an INBOUND call's answer webhook fires, the bridge session starts and
 * `RealVonageBindings` registers its inbound-audio handler — but Vonage has not yet opened the media
 * websocket (it does so only AFTER the answer-webhook's `connect`-websocket NCCO response). The registry
 * bridges that gap by buffering handler registrations + outbound frames per call UUID and binding them to
 * the socket once it connects (matched on the call UUID Vonage forwards on the websocket handshake).
 *
 * Pure + unit-testable: the websocket is injected as the minimal {@link ITelephonyMediaSocket} surface,
 * so the registry's buffering / dispatch logic is exercised with a fake socket and no `ws` install or
 * network.
 *
 * @module @memberjunction/server/telephony
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
 * 20 ms slice = 8000 Hz × 0.020 s = 160 samples × 2 bytes = **320 bytes**. The realtime model emits audio
 * in arbitrary-size deltas; the bridge resamples each whole delta to 8 kHz, so the registry MUST re-slice
 * into these fixed frames before sending. Handing Vonage one oversized blob per delta garbles playback and
 * (worse) defeats barge-in: `{"action":"clear"}` can drop QUEUED frames but not a giant in-flight one.
 */
const OUTBOUND_FRAME_BYTES = 320;

/** One call's media channel: its socket (once connected), handlers, and pending outbound audio. */
interface CallMediaChannel {
    socket?: ITelephonyMediaSocket;
    /** Inbound audio handlers registered by RealVonageBindings (may predate the socket). */
    audioHandlers: Array<(pcm: ArrayBuffer) => void>;
    /** Inbound control-event handlers (DTMF / connected / close) registered by RealVonageBindings. */
    eventHandlers: Array<(event: VonageControlEvent) => void>;
    /** Whole 20 ms (320-byte) outbound frames produced before the socket connected — flushed on AttachSocket. */
    outboundBuffer: Uint8Array[];
    /** Carry-over outbound bytes that didn't fill a whole 320-byte frame yet (prepended to the next delta). */
    partial: Uint8Array;
}

/**
 * Coordinates Vonage media websockets with the bridge bindings, keyed by call UUID. One instance per
 * server, shared between the inbound-webhook service (which binds `RealVonageBindings` over this as the
 * `IVonageMediaPump`) and the WSS server (which attaches sockets + dispatches inbound audio/events).
 *
 * Models Vonage's wire split: outbound audio → binary frames; inbound binary frames → audio handlers;
 * inbound JSON text frames → parsed {@link VonageControlEvent}s → event handlers. There is no base64
 * envelope or μ-law transcode — that's the Twilio path, not Vonage's.
 */
export class VonageCallMediaRegistry implements IVonageMediaPump {
    private readonly channels = new Map<string, CallMediaChannel>();

    /** Ensures a channel exists for a call (called when a bridge session for the call starts). */
    public RegisterCall(callUuid: string): void {
        this.ensureChannel(callUuid);
    }

    // ── IVonageMediaPump ─────────────────────────────────────────────────────────

    /**
     * @inheritdoc — re-slices the (already-8 kHz) delta into fixed 320-byte / 20 ms frames before sending,
     * carrying any sub-frame remainder into the next delta so the stream stays continuous (no silence gaps).
     * Each whole frame is sent immediately if the socket is live, else buffered for {@link AttachSocket}.
     */
    public SendAudio(callUuid: string, pcm: ArrayBuffer): void {
        const channel = this.ensureChannel(callUuid);
        const incoming = new Uint8Array(pcm);
        const data = channel.partial.length > 0 ? concatBytes(channel.partial, incoming) : incoming;

        let offset = 0;
        while (data.length - offset >= OUTBOUND_FRAME_BYTES) {
            // `.slice` returns a fresh copy, so a buffered frame never retains the larger backing buffer.
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

    /** @inheritdoc — stores the audio handler so frames delivered before AND after socket connect reach it. */
    public OnAudio(callUuid: string, handler: (pcm: ArrayBuffer) => void): void {
        this.ensureChannel(callUuid).audioHandlers.push(handler);
    }

    /** @inheritdoc — stores the control-event handler (DTMF / connected / close). */
    public OnEvent(callUuid: string, handler: (event: VonageControlEvent) => void): void {
        this.ensureChannel(callUuid).eventHandlers.push(handler);
    }

    /**
     * @inheritdoc — barge-in flush: drop any outbound audio buffered locally (socket not yet connected) AND,
     * if the socket is live, send Vonage's `{"action":"clear"}` text command to discard its playback queue.
     * Safe to call for an unknown/uninitialized call (no-op).
     */
    public Clear(callUuid: string): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        channel.outboundBuffer.length = 0;
        channel.partial = new Uint8Array(0); // drop the half-built frame too, or it would prepend to the next turn
        channel.socket?.sendText(JSON.stringify({ action: 'clear' }));
    }

    // ── WSS-server side ─────────────────────────────────────────────────────────

    /**
     * Binds a connected media socket to a call, flushing any outbound audio produced while the socket
     * was still connecting. Called by the WSS server once it resolves the call UUID for the socket (from
     * the `call_uuid` query param the answer NCCO embedded on the media URL).
     */
    public AttachSocket(callUuid: string, socket: ITelephonyMediaSocket): void {
        const channel = this.ensureChannel(callUuid);
        channel.socket = socket;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.sendBinary(frame);
        }
    }

    /** Dispatches one inbound binary audio frame (raw L16 PCM) to all audio handlers for the call. */
    public DispatchInboundAudio(callUuid: string, pcm: ArrayBuffer): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        for (const handler of channel.audioHandlers) {
            handler(pcm);
        }
    }

    /** Dispatches one inbound control event (parsed from a JSON text frame) to all event handlers for the call. */
    public DispatchInboundEvent(callUuid: string, event: VonageControlEvent): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        for (const handler of channel.eventHandlers) {
            handler(event);
        }
    }

    /** Tears down a call's channel and closes its socket (called on socket close / call end). */
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

    /** Whether a channel is currently tracked for the call (test/observability helper). */
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

/** Concatenates two byte arrays into a fresh `Uint8Array` (the carry-over remainder + the next delta). */
function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}
