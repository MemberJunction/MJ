/**
 * @fileoverview Per-call Media-Streams pump registry for the Twilio telephony ingress.
 *
 * This is the server half of the Twilio media plane: it implements the provider package's
 * `ITwilioMediaPump` seam (which `RealTwilioBindings` drives) on top of the live Media-Streams
 * websockets MJAPI accepts at `WSS /telephony/twilio/media`. It exists because of a lifecycle gap:
 * when an INBOUND call's webhook fires, the bridge session starts and `RealTwilioBindings` registers
 * its inbound-audio handler — but Twilio has not yet opened the media websocket (it does so only AFTER
 * the webhook's `<Connect><Stream>` TwiML response). The registry bridges that gap by buffering
 * handler registrations + outbound frames per Call SID and binding them to the socket once it connects.
 *
 * **Authentication.** A socket attaches only to a call MJ itself registered ({@link ExpectCall}) and only
 * with that call's secret token (see {@link ExpectedCallStore}). It never replaces an already-attached
 * socket and never creates state for a call MJ did not register.
 *
 * **Buffering, in both directions, is bounded.**
 * - Outbound frames the agent produces before the socket connects are held (capped) and flushed on attach,
 *   re-addressed to the real `streamSid` (they were encoded before it was known).
 * - Inbound frames that arrive before the bridge session has registered its handlers (the webhook now
 *   answers before the session finishes starting) are held (capped) and replayed to each handler as it
 *   registers.
 *
 * Pure + unit-testable: the websocket is injected as the minimal {@link ITelephonyMediaSocket} surface,
 * so the registry's logic is exercised with a fake socket and no `ws` install or network.
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError, LogStatus } from '@memberjunction/core';
import type { TwilioMediaFrame } from '@memberjunction/ai-bridge-twilio';
import type { ITwilioMediaPump } from '@memberjunction/ai-bridge-twilio';
import { ExpectedCallStore, type SocketAuthResult } from './mediaSocketAuth.js';

/**
 * The minimal websocket surface the registry drives — a structural subset of a `ws` socket, so the
 * registry never imports `ws` and is testable with a fake. Outbound frames are sent as JSON strings.
 */
export interface ITelephonyMediaSocket {
    /** Sends a serialized outbound Media-Streams frame on the call's socket. */
    send(data: string): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Closes the socket (best-effort; called on call end). */
    close(): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Tunables for {@link TwilioCallMediaRegistry} (defaults are sized for 20 ms Media-Streams frames). */
export interface TwilioMediaRegistryOptions {
    /** Max outbound frames held before the socket connects (default 500 ≈ 10 s of 20 ms frames). */
    MaxOutboundBufferFrames?: number;
    /** Max inbound frames held before the bridge registers its handlers (default 250 ≈ 5 s of 20 ms frames). */
    MaxEarlyInboundFrames?: number;
    /** How long an expected call may wait for its socket (default {@link DEFAULT_EXPECTATION_TTL_MS}). */
    ExpectationTtlMs?: number;
}

/** Default outbound pre-attach cap: 10 s of 20 ms frames. */
const DEFAULT_MAX_OUTBOUND_BUFFER_FRAMES = 500;

/** Default inbound pre-handler cap: 5 s of 20 ms frames. */
const DEFAULT_MAX_EARLY_INBOUND_FRAMES = 250;

/** One call's media channel: its socket (once connected), captured stream SID, handlers, and pending frames. */
interface CallMediaChannel {
    socket?: ITelephonyMediaSocket;
    streamSid?: string;
    /** Inbound-frame handlers registered by RealTwilioBindings (may predate the socket). */
    frameHandlers: Array<(frame: TwilioMediaFrame) => void>;
    /** Outbound frames produced before the socket connected — flushed (with the real streamSid) on attach. */
    outboundBuffer: TwilioMediaFrame[];
    /** Inbound frames that arrived before any handler registered — replayed to each handler as it registers. */
    earlyInbound: TwilioMediaFrame[];
    /** Whether the one-per-call "buffer overflowed, dropping oldest" warning has been emitted for each buffer. */
    outboundOverflowLogged: boolean;
    inboundOverflowLogged: boolean;
}

/**
 * Coordinates Media-Streams sockets with the bridge bindings, keyed by Call SID. One instance per
 * server, shared between the inbound-webhook service (which binds `RealTwilioBindings` over this as the
 * `ITwilioMediaPump`) and the WSS server (which attaches sockets + dispatches inbound frames).
 */
export class TwilioCallMediaRegistry implements ITwilioMediaPump {
    private readonly channels = new Map<string, CallMediaChannel>();
    private readonly expected: ExpectedCallStore;
    private readonly maxOutboundBufferFrames: number;
    private readonly maxEarlyInboundFrames: number;
    private connectTimeoutListener?: (callSid: string) => void;
    private callRegisteredListener?: (callSid: string) => void;

    constructor(options: TwilioMediaRegistryOptions = {}) {
        this.maxOutboundBufferFrames = options.MaxOutboundBufferFrames ?? DEFAULT_MAX_OUTBOUND_BUFFER_FRAMES;
        this.maxEarlyInboundFrames = options.MaxEarlyInboundFrames ?? DEFAULT_MAX_EARLY_INBOUND_FRAMES;
        this.expected = new ExpectedCallStore((callSid) => this.handleConnectTimeout(callSid), options.ExpectationTtlMs);
    }

    /** Ensures a channel exists for a call (called when a bridge session for the call starts). */
    public RegisterCall(callSid: string): void {
        this.ensureChannel(callSid);
    }

    /**
     * Registers a call MJ accepted or placed, together with the secret token its media socket must present.
     * Creates the call's channel so frames and handlers can be staged before the socket connects.
     *
     * @param callSid The Twilio Call SID.
     * @param token The per-call secret (also embedded in the TwiML `<Parameter name="mjToken">`).
     * @param ttlMs Optional override of how long to wait for the socket.
     */
    public ExpectCall(callSid: string, token: string, ttlMs?: number): void {
        this.ensureChannel(callSid);
        this.expected.Expect(callSid, token, ttlMs);
        this.callRegisteredListener?.(callSid);
    }

    /**
     * Registers the listener told the moment a call becomes known to MJ ({@link ExpectCall}) — for an outbound
     * call that is the instant the carrier REST response yields the Call SID, which is earlier than the bridge
     * session finishing its start. One listener; the latest wins.
     */
    public OnCallRegistered(listener: (callSid: string) => void): void {
        this.callRegisteredListener = listener;
    }

    /**
     * Registers the listener told when a call's media socket never connected within its TTL — the call has
     * been dropped from the registry and the owner should end the session. One listener; the latest wins.
     */
    public OnConnectTimeout(listener: (callSid: string) => void): void {
        this.connectTimeoutListener = listener;
    }

    // ── ITwilioMediaPump ─────────────────────────────────────────────────────────

    /**
     * @inheritdoc — buffers (bounded) when the socket has not yet connected; sends immediately once it has.
     * Discards the buffer on 'clear'.
     */
    public Send(callSid: string, frame: TwilioMediaFrame): void {
        const channel = this.ensureChannel(callSid);
        if (frame.event === 'clear') {
            channel.outboundBuffer.length = 0;
        }
        if (channel.socket) {
            channel.socket.send(JSON.stringify(frame));
        } else if (frame.event !== 'clear') {
            this.bufferOutbound(callSid, channel, frame);
        }
    }

    /**
     * @inheritdoc — stores the handler so frames delivered before AND after socket connect reach it, and
     * replays any inbound frames that arrived before the first handler registered.
     */
    public OnFrame(callSid: string, handler: (frame: TwilioMediaFrame) => void): void {
        const channel = this.ensureChannel(callSid);
        channel.frameHandlers.push(handler);
        for (const frame of channel.earlyInbound) {
            handler(frame);
        }
    }

    /** @inheritdoc — the captured stream SID, or `''` until the `start` frame arrives. */
    public GetStreamSid(callSid: string): string {
        return this.channels.get(callSid)?.streamSid ?? '';
    }

    // ── WSS-server side ─────────────────────────────────────────────────────────

    /**
     * Authenticates and binds a connected Media-Streams socket (and its captured stream SID) to a call,
     * flushing any outbound frames produced while the socket was still connecting. Called by the WSS server
     * on the `start` frame. A refused socket is NOT attached and changes no state; the caller closes it.
     *
     * @param callSid The Call SID claimed by the `start` frame.
     * @param token The `mjToken` custom parameter from the `start` frame (absent ⇒ refused).
     * @param socket The connected socket.
     * @param streamSid The stream SID from the `start` frame.
     * @returns `{Ok:true}`, or why the socket was refused (`unknown-call` | `bad-token` | `already-attached`).
     */
    public TryAttachSocket(callSid: string, token: string | undefined, socket: ITelephonyMediaSocket, streamSid: string): SocketAuthResult {
        const verdict = this.expected.Verify(callSid, token);
        const channel = this.channels.get(callSid);
        if (!verdict.Ok || !channel) {
            return verdict.Ok ? { Ok: false, Reason: 'unknown-call' } : verdict;
        }
        this.expected.MarkAttached(callSid);
        channel.socket = socket;
        channel.streamSid = streamSid;
        this.flushOutbound(channel, socket, streamSid);
        return { Ok: true };
    }

    /** Dispatches one inbound Media-Streams frame to all registered handlers for the call (or buffers it early). */
    public DispatchInbound(callSid: string, frame: TwilioMediaFrame): void {
        const channel = this.channels.get(callSid);
        if (!channel) {
            return;
        }
        if (frame.event === 'start' && frame.streamSid) {
            channel.streamSid = frame.streamSid;
        }
        if (channel.frameHandlers.length === 0) {
            this.bufferEarlyInbound(callSid, channel, frame);
            return;
        }
        for (const handler of channel.frameHandlers) {
            handler(frame);
        }
    }

    /** Tears down a call's channel and closes its socket (called on socket close / call end). */
    public EndCall(callSid: string): void {
        this.expected.Forget(callSid);
        const channel = this.channels.get(callSid);
        if (!channel) {
            return;
        }
        try {
            channel.socket?.close();
        } catch (err) {
            LogError(`[TwilioMediaRegistry] Error closing socket for call ${callSid}`, undefined, err);
        }
        this.channels.delete(callSid);
    }

    /** Whether a channel is currently tracked for the call (test/observability helper). */
    public HasCall(callSid: string): boolean {
        return this.channels.has(callSid);
    }

    /** Whether MJ is still waiting for (or has already authenticated) a socket for the call. */
    public IsExpected(callSid: string): boolean {
        return this.expected.Has(callSid);
    }

    /** Cancels every outstanding connect timer (server shutdown). */
    public Dispose(): void {
        this.expected.Clear();
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Connect TTL elapsed with no socket: free the channel, then tell the owner so it can end the session. */
    private handleConnectTimeout(callSid: string): void {
        LogStatus(`[Telephony][Twilio] media socket never connected for call ${callSid}; dropping its channel.`);
        this.EndCall(callSid);
        this.connectTimeoutListener?.(callSid);
    }

    /** Adds an outbound frame to the pre-attach buffer, dropping the oldest (and warning once) at the cap. */
    private bufferOutbound(callSid: string, channel: CallMediaChannel, frame: TwilioMediaFrame): void {
        channel.outboundBuffer.push(frame);
        if (channel.outboundBuffer.length > this.maxOutboundBufferFrames) {
            channel.outboundBuffer.shift();
            if (!channel.outboundOverflowLogged) {
                channel.outboundOverflowLogged = true;
                LogStatus(`[Telephony][Twilio] outbound audio buffer full for call ${callSid} before the media socket connected; dropping oldest frames.`);
            }
        }
    }

    /** Adds an inbound frame to the pre-handler buffer, dropping the oldest (and warning once) at the cap. */
    private bufferEarlyInbound(callSid: string, channel: CallMediaChannel, frame: TwilioMediaFrame): void {
        channel.earlyInbound.push(frame);
        if (channel.earlyInbound.length > this.maxEarlyInboundFrames) {
            channel.earlyInbound.shift();
            if (!channel.inboundOverflowLogged) {
                channel.inboundOverflowLogged = true;
                LogStatus(`[Telephony][Twilio] inbound audio buffer full for call ${callSid} before the bridge session was ready; dropping oldest frames.`);
            }
        }
    }

    /**
     * Sends the frames the agent produced before the socket existed. They were encoded when `GetStreamSid`
     * still returned `''`, which Twilio rejects — so each is re-addressed to the real stream SID first.
     */
    private flushOutbound(channel: CallMediaChannel, socket: ITelephonyMediaSocket, streamSid: string): void {
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.send(JSON.stringify({ ...frame, streamSid }));
        }
    }

    private ensureChannel(callSid: string): CallMediaChannel {
        let channel = this.channels.get(callSid);
        if (!channel) {
            channel = {
                frameHandlers: [],
                outboundBuffer: [],
                earlyInbound: [],
                outboundOverflowLogged: false,
                inboundOverflowLogged: false,
            };
            this.channels.set(callSid, channel);
        }
        return channel;
    }
}
