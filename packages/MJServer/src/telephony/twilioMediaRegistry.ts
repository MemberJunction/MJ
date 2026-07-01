/**
 * @fileoverview Per-call Media-Streams pump registry for the Twilio telephony ingress.
 *
 * This is the server half of the Twilio media plane: it implements the provider package's
 * `ITwilioMediaPump` seam (which `RealTwilioBindings` drives) on top of the live Media-Streams
 * websockets MJAPI accepts at `WSS /telephony/twilio/media`. It exists because of a lifecycle gap:
 * when an INBOUND call's webhook fires, the bridge session starts and `RealTwilioBindings` registers
 * its inbound-audio handler — but Twilio has not yet opened the media websocket (it does so only AFTER
 * the webhook's `<Connect><Stream>` TwiML response). The registry bridges that gap by buffering
 * handler registrations + outbound frames per Call SID and binding them to the socket once it connects
 * (matched on the `start` frame's Call SID).
 *
 * Pure + unit-testable: the websocket is injected as the minimal {@link ITelephonyMediaSocket} surface,
 * so the registry's buffering / dispatch / stream-SID capture logic is exercised with a fake socket and
 * no `ws` install or network.
 *
 * @module @memberjunction/server/telephony
 */

import type { TwilioMediaFrame } from '@memberjunction/ai-bridge-twilio';
import type { ITwilioMediaPump } from '@memberjunction/ai-bridge-twilio';

/**
 * The minimal websocket surface the registry drives — a structural subset of a `ws` socket, so the
 * registry never imports `ws` and is testable with a fake. Outbound frames are sent as JSON strings.
 */
export interface ITelephonyMediaSocket {
    /** Sends a serialized outbound Media-Streams frame on the call's socket. */
    send(data: string): void;
    /** Closes the socket (best-effort; called on call end). */
    close(): void;
}

/** One call's media channel: its socket (once connected), captured stream SID, handlers, and pending sends. */
interface CallMediaChannel {
    socket?: ITelephonyMediaSocket;
    streamSid?: string;
    /** Inbound-frame handlers registered by RealTwilioBindings (may predate the socket). */
    frameHandlers: Array<(frame: TwilioMediaFrame) => void>;
    /** Outbound frames produced before the socket connected — flushed on AttachSocket. */
    outboundBuffer: TwilioMediaFrame[];
}

/**
 * Coordinates Media-Streams sockets with the bridge bindings, keyed by Call SID. One instance per
 * server, shared between the inbound-webhook service (which binds `RealTwilioBindings` over this as the
 * `ITwilioMediaPump`) and the WSS server (which attaches sockets + dispatches inbound frames).
 */
export class TwilioCallMediaRegistry implements ITwilioMediaPump {
    private readonly channels = new Map<string, CallMediaChannel>();

    /** Ensures a channel exists for a call (called when a bridge session for the call starts). */
    public RegisterCall(callSid: string): void {
        this.ensureChannel(callSid);
    }

    // ── ITwilioMediaPump ─────────────────────────────────────────────────────────

    /** @inheritdoc — buffers when the socket has not yet connected; sends immediately once it has. */
    public Send(callSid: string, frame: TwilioMediaFrame): void {
        const channel = this.ensureChannel(callSid);
        if (channel.socket) {
            channel.socket.send(JSON.stringify(frame));
        } else {
            channel.outboundBuffer.push(frame);
        }
    }

    /** @inheritdoc — stores the handler so frames delivered before AND after socket connect reach it. */
    public OnFrame(callSid: string, handler: (frame: TwilioMediaFrame) => void): void {
        this.ensureChannel(callSid).frameHandlers.push(handler);
    }

    /** @inheritdoc — the captured stream SID, or `''` until the `start` frame arrives. */
    public GetStreamSid(callSid: string): string {
        return this.channels.get(callSid)?.streamSid ?? '';
    }

    // ── WSS-server side ─────────────────────────────────────────────────────────

    /**
     * Binds a connected Media-Streams socket (and its captured stream SID) to a call, flushing any
     * outbound frames produced while the socket was still connecting. Called by the WSS server on the
     * `start` frame.
     */
    public AttachSocket(callSid: string, socket: ITelephonyMediaSocket, streamSid: string): void {
        const channel = this.ensureChannel(callSid);
        channel.socket = socket;
        channel.streamSid = streamSid;
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.send(JSON.stringify(frame));
        }
    }

    /** Dispatches one inbound Media-Streams frame to all registered handlers for the call. */
    public DispatchInbound(callSid: string, frame: TwilioMediaFrame): void {
        const channel = this.channels.get(callSid);
        if (!channel) {
            return;
        }
        if (frame.event === 'start' && frame.streamSid) {
            channel.streamSid = frame.streamSid;
        }
        for (const handler of channel.frameHandlers) {
            handler(frame);
        }
    }

    /** Tears down a call's channel and closes its socket (called on socket close / call end). */
    public EndCall(callSid: string): void {
        const channel = this.channels.get(callSid);
        if (!channel) {
            return;
        }
        try {
            channel.socket?.close();
        } catch {
            /* best-effort */
        }
        this.channels.delete(callSid);
    }

    /** Whether a channel is currently tracked for the call (test/observability helper). */
    public HasCall(callSid: string): boolean {
        return this.channels.has(callSid);
    }

    private ensureChannel(callSid: string): CallMediaChannel {
        let channel = this.channels.get(callSid);
        if (!channel) {
            channel = { frameHandlers: [], outboundBuffer: [] };
            this.channels.set(callSid, channel);
        }
        return channel;
    }
}
