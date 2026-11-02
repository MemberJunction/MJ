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
     * Queued PCM16 byte chunks (at the codec rate) not yet sent — drained one `packetSize` frame per tick
     * without O(N^2) concatenation on enqueue.
     */
    private chunks: Uint8Array[] = [];
    private chunkIndex = 0;
    private headOffset = 0;
    private bufferedBytes = 0;

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
    public Start(): void {
        if (this.timer === null) {
            this.timer = setInterval(() => this.Tick(), RTP_FRAME_MS);
        }
    }

    /** @deprecated Use {@link Start}. */
    public start(): void {
        return this.Start();
    }

    /** Appends one outbound PCM16 frame (the model's voice, already at the codec rate) to the send queue in O(1). */
    public Enqueue(pcm: ArrayBuffer): void {
        if (pcm.byteLength === 0) {
            return;
        }
        this.chunks.push(new Uint8Array(pcm));
        this.bufferedBytes += pcm.byteLength;
    }

    /** @deprecated Use {@link Enqueue}. */
    public enqueue(pcm: ArrayBuffer): void {
        return this.Enqueue(pcm);
    }

    /**
     * Barge-in: drop all queued (not-yet-sent) audio so the agent goes silent immediately. The softphone
     * has no internal outbound buffer to clear — once {@link tick} has sent a frame it's on the wire — so
     * dropping the local queue is the whole flush.
     */
    public Flush(): void {
        this.chunks = [];
        this.chunkIndex = 0;
        this.headOffset = 0;
        this.bufferedBytes = 0;
    }

    /** @deprecated Use {@link Flush}. */
    public flush(): void {
        return this.Flush();
    }

    /** Stops the clock and drops any queued audio. Called on hangup / call end. */
    public Stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.Flush();
    }

    /** @deprecated Use {@link Stop}. */
    public stop(): void {
        return this.Stop();
    }

    /**
     * Sends exactly one frame if a whole `packetSize` chunk is queued and the call is live; otherwise a
     * no-op (silence is simply the absence of packets — RTP needs no filler). Public so tests drive the
     * clock deterministically.
     */
    public Tick(): void {
        const size = this.packetSize;
        if (this.session.disposed || this.bufferedBytes < size) {
            return;
        }
        const frame = this.dequeueFrame(size);
        this.sendFrame(frame);
    }

    /** Pulls `size` bytes from the head of the chunk queue, using a zero-copy subarray when contained in one chunk. */
    private dequeueFrame(size: number): Uint8Array {
        const head = this.chunks[this.chunkIndex];
        const availableInHead = head.length - this.headOffset;
        if (availableInHead >= size) {
            const frame = head.subarray(this.headOffset, this.headOffset + size);
            this.headOffset += size;
            this.bufferedBytes -= size;
            if (this.headOffset === head.length) {
                this.advanceChunk();
            }
            return frame;
        }

        const frame = new Uint8Array(size);
        let written = 0;
        while (written < size) {
            const current = this.chunks[this.chunkIndex];
            const rem = current.length - this.headOffset;
            const take = Math.min(rem, size - written);
            frame.set(current.subarray(this.headOffset, this.headOffset + take), written);
            written += take;
            this.headOffset += take;
            this.bufferedBytes -= take;
            if (this.headOffset === current.length) {
                this.advanceChunk();
            }
        }
        return frame;
    }

    private advanceChunk(): void {
        this.chunkIndex++;
        this.headOffset = 0;
        if (this.chunkIndex === this.chunks.length) {
            this.chunks = [];
            this.chunkIndex = 0;
        } else if (this.chunkIndex >= 64) {
            this.chunks = this.chunks.slice(this.chunkIndex);
            this.chunkIndex = 0;
        }
    }

    /** @deprecated Use {@link Tick}. */
    public tick(): void {
        return this.Tick();
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
