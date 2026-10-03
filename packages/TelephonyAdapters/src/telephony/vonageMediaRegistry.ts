/**
 * @fileoverview Per-call WebSocket-media pump registry for the Vonage telephony ingress.
 *
 * Mirrors the Twilio registry's contract (see `twilioMediaRegistry.ts`): sockets are authenticated against a
 * per-call token MJ registered, never replace an attached socket, never create state for an unregistered
 * call, and both pre-attach / pre-handler buffers are bounded.
 *
 * **Vonage-specific: outbound correlation.** An outbound call's UUID is not known until `createCall`
 * resolves, yet Vonage may open the media websocket before that response is processed. So an outbound call is
 * first registered under a **correlation id** carried in the websocket URI (`mj_cid`); once the UUID is known
 * ({@link BindOutboundCall}) the correlation id becomes an alias of it and the channel — socket, buffers and
 * all — moves under the UUID. Every method accepts either id.
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogStatus } from '@memberjunction/core';
import type { VonageControlEvent, IVonageMediaPump } from '@memberjunction/ai-bridge-vonage';
import { ExpectedCallStore } from './mediaSocketAuth.js';

/**
 * The minimal websocket surface the registry drives — a structural subset of a `ws` socket, so the
 * registry never imports `ws` and is testable with a fake. Vonage audio is sent as BINARY frames (raw
 * L16 PCM); the registry never sends text frames outbound (Vonage's media socket only accepts audio).
 */
export interface ITelephonyMediaSocket {
    /** Sends one outbound BINARY audio frame (raw L16 PCM) on the call's socket. */
    sendBinary(data: Uint8Array): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Sends one outbound TEXT control frame (JSON command, e.g. `{"action":"clear"}`) on the call's socket. */
    sendText(data: string): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Closes the socket (best-effort; called on call end). */
    close(): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * The exact byte size of one outbound audio frame Vonage expects on the `audio/l16;rate=8000` leg: a
 * 20 ms slice = 8000 Hz × 0.020 s = 160 samples × 2 bytes = **320 bytes**.
 */
const OUTBOUND_FRAME_BYTES = 320;

/** Default outbound pre-attach cap: 500 frames ≈ 10 s of 20 ms audio. */
const DEFAULT_MAX_OUTBOUND_BUFFER_FRAMES = 500;

/** Default inbound pre-handler audio cap: 5 s of 8 kHz 16-bit mono PCM (16 000 bytes/s). */
const DEFAULT_MAX_EARLY_INBOUND_BYTES = 5 * 16_000;

/** Default inbound pre-handler control-event cap (events are tiny and rare — DTMF, connected, close). */
const DEFAULT_MAX_EARLY_INBOUND_EVENTS = 50;

/** Tunables for {@link VonageCallMediaRegistry}. */
export interface VonageMediaRegistryOptions {
    /** Max outbound 320-byte frames held before the socket connects (default 500 ≈ 10 s). */
    MaxOutboundBufferFrames?: number;
    /** Max inbound audio bytes held before the bridge registers its handlers (default 80 000 ≈ 5 s). */
    MaxEarlyInboundBytes?: number;
    /** How long an expected call may wait for its socket (default {@link DEFAULT_EXPECTATION_TTL_MS}). */
    ExpectationTtlMs?: number;
}

/** Which identifier a connecting socket claims: an inbound call UUID, or an outbound correlation id. */
export interface VonageSocketCallRef {
    /** The `call_uuid` query param (inbound calls). */
    CallUuid?: string;
    /** The `mj_cid` query param (outbound calls). */
    CorrelationId?: string;
}

/** The verdict of {@link VonageCallMediaRegistry.TryAttachSocket}. */
export type VonageAttachResult =
    | { Ok: true; CallKey: string }
    | { Ok: false; Reason: 'unknown-call' | 'bad-token' | 'already-attached' };

/** One call's media channel: its socket (once connected), handlers, and pending frames in both directions. */
interface CallMediaChannel {
    socket?: ITelephonyMediaSocket;
    audioHandlers: Array<(pcm: ArrayBuffer) => void>;
    eventHandlers: Array<(event: VonageControlEvent) => void>;
    outboundBuffer: Uint8Array[];
    partial: Uint8Array;
    earlyAudio: ArrayBuffer[];
    earlyAudioBytes: number;
    earlyEvents: VonageControlEvent[];
    outboundOverflowLogged: boolean;
    inboundOverflowLogged: boolean;
}

/**
 * Coordinates Vonage media websockets with the bridge bindings, keyed by call UUID (or, for an outbound call
 * whose UUID is not yet known, its correlation id).
 */
export class VonageCallMediaRegistry implements IVonageMediaPump {
    private readonly channels = new Map<string, CallMediaChannel>();
    private readonly aliases = new Map<string, string>();
    private readonly expected: ExpectedCallStore;
    private readonly maxOutboundBufferFrames: number;
    private readonly maxEarlyInboundBytes: number;
    private connectTimeoutListener?: (callKey: string) => void;
    private callRegisteredListener?: (callUuid: string) => void;

    constructor(options: VonageMediaRegistryOptions = {}) {
        this.maxOutboundBufferFrames = options.MaxOutboundBufferFrames ?? DEFAULT_MAX_OUTBOUND_BUFFER_FRAMES;
        this.maxEarlyInboundBytes = options.MaxEarlyInboundBytes ?? DEFAULT_MAX_EARLY_INBOUND_BYTES;
        this.expected = new ExpectedCallStore((callKey) => this.handleConnectTimeout(callKey), options.ExpectationTtlMs);
    }

    /** Ensures a channel exists for a call (called when a bridge session for the call starts). */
    public RegisterCall(callUuid: string): void {
        this.ensureChannel(callUuid);
    }

    // ── Authentication / expectation ────────────────────────────────────────────

    /** Registers an INBOUND call MJ accepted, with the token its media socket must present. */
    public ExpectCall(callUuid: string, token: string, ttlMs?: number): void {
        this.ensureChannel(callUuid);
        this.expected.Expect(callUuid, token, ttlMs);
        this.callRegisteredListener?.(callUuid);
    }

    /**
     * Registers the listener told the moment a call's UUID becomes known to MJ — {@link ExpectCall} for an
     * inbound call, {@link BindOutboundCall} for an outbound one (the instant `createCall` yields the UUID,
     * which is earlier than the bridge session finishing its start). One listener; the latest wins.
     */
    public OnCallRegistered(listener: (callUuid: string) => void): void {
        this.callRegisteredListener = listener;
    }

    /** @inheritdoc — registers an OUTBOUND call under its correlation id, before `createCall` is issued. */
    public ExpectOutboundCall(correlationId: string, token: string, ttlMs?: number): void {
        this.ensureChannel(correlationId);
        this.expected.Expect(correlationId, token, ttlMs);
    }

    /**
     * @inheritdoc — makes the correlation id an alias of the real call UUID and moves the channel (socket,
     * handlers, buffers) under the UUID. Safe whether or not the socket has already connected.
     */
    public BindOutboundCall(correlationId: string, callUuid: string): void {
        if (correlationId === callUuid) {
            return;
        }
        this.aliases.set(correlationId, callUuid);
        this.moveChannel(correlationId, callUuid);
        this.expected.Rekey(correlationId, callUuid);
        this.callRegisteredListener?.(callUuid);
    }

    /** @inheritdoc — `createCall` failed: nothing will ever connect, so drop the expectation and channel. */
    public AbandonOutboundCall(correlationId: string): void {
        this.EndCall(correlationId);
    }

    /**
     * Registers the listener told when a call's media socket never connected within its TTL — the call has
     * been dropped from the registry and the owner should end the session. One listener; the latest wins.
     * The key passed is the call UUID once known, otherwise the correlation id.
     */
    public OnConnectTimeout(listener: (callKey: string) => void): void {
        this.connectTimeoutListener = listener;
    }

    /**
     * Authenticates and binds a connected media socket to a call MJ registered. A refused socket is NOT
     * attached and changes no state; the caller closes it.
     *
     * @param ref The id the socket claims (`call_uuid` for inbound, `mj_cid` for outbound).
     * @param token The `mj_token` query param (absent ⇒ refused).
     * @param socket The connected socket.
     * @returns The channel key to dispatch under (`CallKey`), or why the socket was refused.
     */
    public TryAttachSocket(ref: VonageSocketCallRef, token: string | undefined, socket: ITelephonyMediaSocket): VonageAttachResult {
        const claimed = ref.CallUuid ?? ref.CorrelationId;
        if (!claimed) {
            return { Ok: false, Reason: 'unknown-call' };
        }
        const callKey = this.canon(claimed);
        const verdict = this.expected.Verify(callKey, token);
        const channel = this.channels.get(callKey);
        if (!verdict.Ok) {
            return verdict;
        }
        if (!channel) {
            return { Ok: false, Reason: 'unknown-call' };
        }
        this.expected.MarkAttached(callKey);
        channel.socket = socket;
        this.flushOutbound(channel, socket);
        return { Ok: true, CallKey: callKey };
    }

    // ── IVonageMediaPump ─────────────────────────────────────────────────────────

    public SendAudio(callUuid: string, pcm: ArrayBuffer): void {
        const channel = this.ensureChannel(this.canon(callUuid));
        const incoming = new Uint8Array(pcm);
        const data = channel.partial.length > 0 ? concatBytes(channel.partial, incoming) : incoming;

        let offset = 0;
        while (data.length - offset >= OUTBOUND_FRAME_BYTES) {
            const frame = data.slice(offset, offset + OUTBOUND_FRAME_BYTES);
            offset += OUTBOUND_FRAME_BYTES;
            if (channel.socket) {
                channel.socket.sendBinary(frame);
            } else {
                this.bufferOutbound(callUuid, channel, frame);
            }
        }

        channel.partial = offset < data.length ? data.slice(offset) : new Uint8Array(0);
    }

    /** @inheritdoc — also replays inbound audio that arrived before the first handler registered. */
    public OnAudio(callUuid: string, handler: (pcm: ArrayBuffer) => void): void {
        const channel = this.ensureChannel(this.canon(callUuid));
        channel.audioHandlers.push(handler);
        for (const pcm of channel.earlyAudio) {
            handler(pcm);
        }
    }

    /** @inheritdoc — also replays control events that arrived before the first handler registered. */
    public OnEvent(callUuid: string, handler: (event: VonageControlEvent) => void): void {
        const channel = this.ensureChannel(this.canon(callUuid));
        channel.eventHandlers.push(handler);
        for (const event of channel.earlyEvents) {
            handler(event);
        }
    }

    public Clear(callUuid: string): void {
        const channel = this.channels.get(this.canon(callUuid));
        if (!channel) {
            return;
        }
        channel.outboundBuffer.length = 0;
        channel.partial = new Uint8Array(0);
        channel.socket?.sendText(JSON.stringify({ action: 'clear' }));
    }

    // ── WSS-server side ─────────────────────────────────────────────────────────

    public DispatchInboundAudio(callUuid: string, pcm: ArrayBuffer): void {
        const key = this.canon(callUuid);
        const channel = this.channels.get(key);
        if (!channel) {
            return;
        }
        if (channel.audioHandlers.length === 0) {
            this.bufferEarlyAudio(key, channel, pcm);
            return;
        }
        for (const handler of channel.audioHandlers) {
            handler(pcm);
        }
    }

    public DispatchInboundEvent(callUuid: string, event: VonageControlEvent): void {
        const key = this.canon(callUuid);
        const channel = this.channels.get(key);
        if (!channel) {
            return;
        }
        if (channel.eventHandlers.length === 0) {
            if (channel.earlyEvents.length < DEFAULT_MAX_EARLY_INBOUND_EVENTS) {
                channel.earlyEvents.push(event);
            }
            return;
        }
        for (const handler of channel.eventHandlers) {
            handler(event);
        }
    }

    public EndCall(callUuid: string): void {
        const key = this.canon(callUuid);
        this.expected.Forget(key);
        const channel = this.channels.get(key);
        this.dropAliasesTo(key);
        if (!channel) {
            return;
        }
        try {
            channel.socket?.close();
        } catch {
            /* best-effort */
        }
        this.channels.delete(key);
    }

    public HasCall(callUuid: string): boolean {
        return this.channels.has(this.canon(callUuid));
    }

    /** Whether MJ is still waiting for (or has already authenticated) a socket for the call. */
    public IsExpected(callUuid: string): boolean {
        return this.expected.Has(this.canon(callUuid));
    }

    /** Cancels every outstanding connect timer (server shutdown). */
    public Dispose(): void {
        this.expected.Clear();
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Resolves a correlation id to the call UUID it was bound to (identity for anything else). */
    private canon(id: string): string {
        return this.aliases.get(id) ?? id;
    }

    /** Removes every alias that points at the (now ended) call so the table cannot grow without bound. */
    private dropAliasesTo(callKey: string): void {
        for (const [alias, target] of this.aliases) {
            if (alias === callKey || target === callKey) {
                this.aliases.delete(alias);
            }
        }
    }

    /** Connect TTL elapsed with no socket: free the channel, then tell the owner so it can end the session. */
    private handleConnectTimeout(callKey: string): void {
        LogStatus(`[Telephony][Vonage] media socket never connected for call ${callKey}; dropping its channel.`);
        this.EndCall(callKey);
        this.connectTimeoutListener?.(callKey);
    }

    /** Moves a channel from one key to another, merging into an existing destination channel if there is one. */
    private moveChannel(fromKey: string, toKey: string): void {
        const from = this.channels.get(fromKey);
        if (!from) {
            return;
        }
        this.channels.delete(fromKey);
        const to = this.channels.get(toKey);
        if (!to) {
            this.channels.set(toKey, from);
            return;
        }
        to.socket = to.socket ?? from.socket;
        to.audioHandlers.push(...from.audioHandlers);
        to.eventHandlers.push(...from.eventHandlers);
        to.outboundBuffer.unshift(...from.outboundBuffer);
        to.earlyAudio.unshift(...from.earlyAudio);
        to.earlyAudioBytes += from.earlyAudioBytes;
        to.earlyEvents.unshift(...from.earlyEvents);
    }

    /** Adds an outbound frame to the pre-attach buffer, dropping the oldest (and warning once) at the cap. */
    private bufferOutbound(callKey: string, channel: CallMediaChannel, frame: Uint8Array): void {
        channel.outboundBuffer.push(frame);
        if (channel.outboundBuffer.length > this.maxOutboundBufferFrames) {
            channel.outboundBuffer.shift();
            if (!channel.outboundOverflowLogged) {
                channel.outboundOverflowLogged = true;
                LogStatus(`[Telephony][Vonage] outbound audio buffer full for call ${callKey} before the media socket connected; dropping oldest frames.`);
            }
        }
    }

    /** Adds inbound audio to the pre-handler buffer, dropping the oldest (and warning once) past the byte cap. */
    private bufferEarlyAudio(callKey: string, channel: CallMediaChannel, pcm: ArrayBuffer): void {
        channel.earlyAudio.push(pcm);
        channel.earlyAudioBytes += pcm.byteLength;
        while (channel.earlyAudioBytes > this.maxEarlyInboundBytes && channel.earlyAudio.length > 1) {
            const dropped = channel.earlyAudio.shift();
            channel.earlyAudioBytes -= dropped?.byteLength ?? 0;
            if (!channel.inboundOverflowLogged) {
                channel.inboundOverflowLogged = true;
                LogStatus(`[Telephony][Vonage] inbound audio buffer full for call ${callKey} before the bridge session was ready; dropping oldest audio.`);
            }
        }
    }

    /** Sends the frames the agent produced before the socket existed, oldest first. */
    private flushOutbound(channel: CallMediaChannel, socket: ITelephonyMediaSocket): void {
        const buffered = channel.outboundBuffer.splice(0, channel.outboundBuffer.length);
        for (const frame of buffered) {
            socket.sendBinary(frame);
        }
    }

    private ensureChannel(callKey: string): CallMediaChannel {
        let channel = this.channels.get(callKey);
        if (!channel) {
            channel = {
                audioHandlers: [],
                eventHandlers: [],
                outboundBuffer: [],
                partial: new Uint8Array(0),
                earlyAudio: [],
                earlyAudioBytes: 0,
                earlyEvents: [],
                outboundOverflowLogged: false,
                inboundOverflowLogged: false,
            };
            this.channels.set(callKey, channel);
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
