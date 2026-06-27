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

import type { VonageMediaFrame, IVonageMediaPump } from '@memberjunction/ai-bridge-vonage';

/**
 * The minimal websocket surface the registry drives — a structural subset of a `ws` socket, so the
 * registry never imports `ws` and is testable with a fake. Outbound frames are sent as JSON strings.
 */
export interface ITelephonyMediaSocket {
    /** Sends a serialized outbound media frame on the call's socket. */
    send(data: string): void;
    /** Closes the socket (best-effort; called on call end). */
    close(): void;
}

/** One call's media channel: its socket (once connected), handlers, and pending outbound sends. */
interface CallMediaChannel {
    socket?: ITelephonyMediaSocket;
    /** Inbound-frame handlers registered by RealVonageBindings (may predate the socket). */
    frameHandlers: Array<(frame: VonageMediaFrame) => void>;
    /** Outbound frames produced before the socket connected — flushed on AttachSocket. */
    outboundBuffer: VonageMediaFrame[];
}

/**
 * Coordinates Vonage media websockets with the bridge bindings, keyed by call UUID. One instance per
 * server, shared between the inbound-webhook service (which binds `RealVonageBindings` over this as the
 * `IVonageMediaPump`) and the WSS server (which attaches sockets + dispatches inbound frames).
 */
export class VonageCallMediaRegistry implements IVonageMediaPump {
    private readonly channels = new Map<string, CallMediaChannel>();

    /** Ensures a channel exists for a call (called when a bridge session for the call starts). */
    public RegisterCall(callUuid: string): void {
        this.ensureChannel(callUuid);
    }

    // ── IVonageMediaPump ─────────────────────────────────────────────────────────

    /** @inheritdoc — buffers when the socket has not yet connected; sends immediately once it has. */
    public Send(callUuid: string, frame: VonageMediaFrame): void {
        const channel = this.ensureChannel(callUuid);
        if (channel.socket) {
            channel.socket.send(JSON.stringify(frame));
        } else {
            channel.outboundBuffer.push(frame);
        }
    }

    /** @inheritdoc — stores the handler so frames delivered before AND after socket connect reach it. */
    public OnFrame(callUuid: string, handler: (frame: VonageMediaFrame) => void): void {
        this.ensureChannel(callUuid).frameHandlers.push(handler);
    }

    // ── WSS-server side ─────────────────────────────────────────────────────────

    /**
     * Binds a connected media socket to a call, flushing any outbound frames produced while the socket
     * was still connecting. Called by the WSS server once it resolves the call UUID for the socket (from
     * the headers Vonage forwards on the `connect`-websocket handshake).
     */
    public AttachSocket(callUuid: string, socket: ITelephonyMediaSocket): void {
        const channel = this.ensureChannel(callUuid);
        channel.socket = socket;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.send(JSON.stringify(frame));
        }
    }

    /** Dispatches one inbound media frame to all registered handlers for the call. */
    public DispatchInbound(callUuid: string, frame: VonageMediaFrame): void {
        const channel = this.channels.get(callUuid);
        if (!channel) {
            return;
        }
        for (const handler of channel.frameHandlers) {
            handler(frame);
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
            channel = { frameHandlers: [], outboundBuffer: [] };
            this.channels.set(callUuid, channel);
        }
        return channel;
    }
}
