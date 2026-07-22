/**
 * @fileoverview `RealtimeRtpSender` — the outbound audio clock for the RingCentral SIP-softphone path.
 *
 * The `ringcentral-softphone` SDK's only outbound abstraction (`Streamer`) fires a single fixed buffer
 * (a pre-recorded file) and cannot be fed incrementally — useless for a realtime agent whose voice
 * arrives as a live stream of arbitrary-size PCM deltas. This class is the missing piece: an
 * **appendable, self-paced RTP sender** that reimplements the per-frame body of `Streamer.sendPacket`
 * (verbatim from `ringcentral-softphone/src/call-session/streamer.ts`) over a growable queue.
 *
 * Per 20 ms tick it pulls exactly one `codec.packetSize` frame from the queue (PCM16 at the codec's
 * rate — OPUS/16000 → 640 bytes / 320 samples), encodes it, wraps it in an `RtpPacket` with the
 * advancing sequence-number / timestamp the call session tracks, and hands it to
 * {@link SoftphoneCallSession.sendPacket} (which SRTP-encrypts + sends, guarding on `disposed`). A
 * sub-frame remainder is held for the next tick so the stream stays gap-free.
 *
 * **Barge-in** is this class's job, not the SDK's: the softphone holds no outbound jitter buffer to
 * flush, so {@link flush} simply drops the queued (not-yet-sent) audio, going silent immediately.
 *
 * Pure + unit-testable: the RTP constructors are injected ({@link RtpConstructors}) and the 20 ms clock
 * is driven through {@link tick}, so tests pump frames deterministically with a fake session and no real
 * timer, `werift-rtp`, or network.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 */

import type { RtpConstructors, SoftphoneCallSession } from './softphone-types';

/** The RTP framing interval: one audio packet every 20 ms (the SDK's `Streamer` cadence). */
export const RTP_FRAME_MS = 20;

/**
 * An appendable, self-paced RTP audio sender over a live {@link SoftphoneCallSession}. Construct one per
 * call (after the session is live), {@link start} it, feed the agent's PCM via {@link enqueue}, {@link flush}
 * on barge-in, and {@link stop} on hangup.
 */
export class RealtimeRtpSender {
    /**
     * Queued PCM16 bytes (at the codec rate) not yet sent — drained one `packetSize` frame per tick.
     * Held as `Uint8Array` (not `Buffer`) to sidestep `@types/node`'s strict `Buffer<ArrayBufferLike>`
     * generic invariance; converted to a `Buffer` only at the encoder boundary.
     */
    private pending: Uint8Array = new Uint8Array(0);

    /** The 20 ms interval handle, or null when not running. */
    private timer: ReturnType<typeof setInterval> | null = null;

    /**
     * @param session The live softphone call session (provides the encoder, RTP counters, and `sendPacket`).
     * @param rtp The injected `werift-rtp` constructors (`RtpHeader` / `RtpPacket`).
     */
    constructor(
        private readonly session: SoftphoneCallSession,
        private readonly rtp: RtpConstructors,
    ) {}

    /** PCM bytes consumed per 20 ms frame for the call's codec (OPUS/16000 → 640). */
    private get packetSize(): number {
        return this.session.softphone.codec.packetSize;
    }

    /** Starts the 20 ms send clock (idempotent). No-op frames are skipped when the queue is short. */
    public start(): void {
        if (this.timer === null) {
            this.timer = setInterval(() => this.tick(), RTP_FRAME_MS);
        }
    }

    /** Appends one outbound PCM16 frame (the model's voice, already at the codec rate) to the send queue. */
    public enqueue(pcm: ArrayBuffer): void {
        if (pcm.byteLength === 0) {
            return;
        }
        const incoming = new Uint8Array(pcm);
        this.pending = this.pending.length === 0 ? incoming : concatBytes(this.pending, incoming);
    }

    /**
     * Barge-in: drop all queued (not-yet-sent) audio so the agent goes silent immediately. The softphone
     * has no internal outbound buffer to clear — once {@link tick} has sent a frame it's on the wire — so
     * dropping the local queue is the whole flush.
     */
    public flush(): void {
        this.pending = new Uint8Array(0);
    }

    /** Stops the clock and drops any queued audio. Called on hangup / call end. */
    public stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.pending = new Uint8Array(0);
    }

    /**
     * Sends exactly one frame if a whole `packetSize` chunk is queued and the call is live; otherwise a
     * no-op (silence is simply the absence of packets — RTP needs no filler). Public so tests drive the
     * clock deterministically.
     */
    public tick(): void {
        if (this.session.disposed || this.pending.length < this.packetSize) {
            return;
        }
        const frame = this.pending.subarray(0, this.packetSize);
        this.pending = this.pending.subarray(this.packetSize);
        this.sendFrame(frame);
    }

    /** Encodes + packetizes one PCM frame and advances the session's RTP counters (verbatim Streamer body). */
    private sendFrame(frame: Uint8Array): void {
        const codec = this.session.softphone.codec;
        // The encoder wants a Node `Buffer`; wrap the view (no copy) at this boundary only.
        const payload = this.session.encoder.encode(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
        const packet = new this.rtp.RtpPacket(
            new this.rtp.RtpHeader({
                version: 2,
                padding: false,
                paddingSize: 0,
                extension: false,
                marker: false,
                payloadOffset: 12,
                payloadType: codec.id,
                sequenceNumber: this.session.sequenceNumber,
                timestamp: this.session.timestamp,
                ssrc: this.session.ssrc,
                csrcLength: 0,
                csrc: [],
                extensionProfile: 48862,
                extensionLength: undefined,
                extensions: [],
            }),
            payload,
        );
        this.session.sendPacket(packet);
        this.session.sequenceNumber += 1;
        if (this.session.sequenceNumber > 65535) {
            this.session.sequenceNumber = 0;
        }
        this.session.timestamp += codec.timestampInterval;
    }
}

/** Concatenates two byte arrays into a fresh `Uint8Array` (the queued remainder + the next delta). */
function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}
