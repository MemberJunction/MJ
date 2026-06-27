/**
 * @fileoverview Per-call media-stream pump registry for the RingCentral telephony ingress.
 *
 * This is the server half of the RingCentral media plane: it implements the provider package's
 * `IRingCentralMediaPump` seam (which `RealRingCentralBindings` drives) on top of the live media
 * websockets MJAPI accepts at `WSS /telephony/ringcentral/media`. It exists because of the same
 * lifecycle gap the Twilio registry bridges: when an INBOUND call's Call-Control notification fires,
 * the bridge session starts and `RealRingCentralBindings` registers its inbound-audio handler — but
 * RingCentral has not yet opened the media stream for the telephony session. The registry buffers
 * handler registrations + outbound frames per telephony-session id and binds them to the socket once
 * it connects (matched on the `start` frame's session id).
 *
 * Pure + unit-testable: the websocket is injected as the minimal {@link ITelephonyMediaSocket} surface,
 * so the registry's buffering / dispatch logic is exercised with a fake socket and no `ws` install or
 * network.
 *
 * @module @memberjunction/server/telephony
 */

import type { RingCentralMediaFrame, IRingCentralMediaPump } from '@memberjunction/ai-bridge-ringcentral';

/**
 * The minimal websocket surface the registry drives — a structural subset of a `ws` socket, so the
 * registry never imports `ws` and is testable with a fake. Outbound frames are sent as JSON strings.
 */
export interface ITelephonyMediaSocket {
    /** Sends a serialized outbound media frame on the session's socket. */
    send(data: string): void;
    /** Closes the socket (best-effort; called on call end). */
    close(): void;
}

/** One session's media channel: its socket (once connected), handlers, and pending sends. */
interface SessionMediaChannel {
    socket?: ITelephonyMediaSocket;
    /** Inbound-frame handlers registered by RealRingCentralBindings (may predate the socket). */
    frameHandlers: Array<(frame: RingCentralMediaFrame) => void>;
    /** Outbound frames produced before the socket connected — flushed on AttachSocket. */
    outboundBuffer: RingCentralMediaFrame[];
}

/**
 * Coordinates media sockets with the bridge bindings, keyed by RingCentral telephony-session id. One
 * instance per server, shared between the inbound-webhook service (which binds `RealRingCentralBindings`
 * over this as the `IRingCentralMediaPump`) and the WSS server (which attaches sockets + dispatches
 * inbound frames).
 */
export class RingCentralCallMediaRegistry implements IRingCentralMediaPump {
    private readonly channels = new Map<string, SessionMediaChannel>();

    /** Ensures a channel exists for a session (called when a bridge session for the call starts). */
    public RegisterCall(sessionId: string): void {
        this.ensureChannel(sessionId);
    }

    // ── IRingCentralMediaPump ────────────────────────────────────────────────────

    /** @inheritdoc — buffers when the socket has not yet connected; sends immediately once it has. */
    public Send(sessionId: string, frame: RingCentralMediaFrame): void {
        const channel = this.ensureChannel(sessionId);
        if (channel.socket) {
            channel.socket.send(JSON.stringify(frame));
        } else {
            channel.outboundBuffer.push(frame);
        }
    }

    /** @inheritdoc — stores the handler so frames delivered before AND after socket connect reach it. */
    public OnFrame(sessionId: string, handler: (frame: RingCentralMediaFrame) => void): void {
        this.ensureChannel(sessionId).frameHandlers.push(handler);
    }

    // ── WSS-server side ───────────────────────────────────────────────────────────

    /**
     * Binds a connected media socket to a session, flushing any outbound frames produced while the
     * socket was still connecting. Called by the WSS server on the `start` frame.
     */
    public AttachSocket(sessionId: string, socket: ITelephonyMediaSocket): void {
        const channel = this.ensureChannel(sessionId);
        channel.socket = socket;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.send(JSON.stringify(frame));
        }
    }

    /** Dispatches one inbound media frame to all registered handlers for the session. */
    public DispatchInbound(sessionId: string, frame: RingCentralMediaFrame): void {
        const channel = this.channels.get(sessionId);
        if (!channel) {
            return;
        }
        for (const handler of channel.frameHandlers) {
            handler(frame);
        }
    }

    /** Tears down a session's channel and closes its socket (called on socket close / call end). */
    public EndCall(sessionId: string): void {
        const channel = this.channels.get(sessionId);
        if (!channel) {
            return;
        }
        try {
            channel.socket?.close();
        } catch {
            /* best-effort */
        }
        this.channels.delete(sessionId);
    }

    /** Whether a channel is currently tracked for the session (test/observability helper). */
    public HasCall(sessionId: string): boolean {
        return this.channels.has(sessionId);
    }

    private ensureChannel(sessionId: string): SessionMediaChannel {
        let channel = this.channels.get(sessionId);
        if (!channel) {
            channel = { frameHandlers: [], outboundBuffer: [] };
            this.channels.set(sessionId, channel);
        }
        return channel;
    }
}
