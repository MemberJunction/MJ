/**
 * @fileoverview Pure, zero-dependency server-side audio recording utility for
 * MemberJunction realtime sessions.
 *
 * Accumulates realtime PCM audio frames (model output + user input), mixes them
 * into a single mono PCM16 timeline, and encodes a canonical WAV file. The only
 * runtime dependency is the Node `Buffer` global — no external npm packages.
 *
 * @module @memberjunction/ai-agents/realtime/realtime-recording-capture
 */

/** Media kind tag stored on a realtime recording session. */
export type RealtimeRecordingMedia = 'Audio' | 'AudioVideo';

/**
 * Construction options for {@link RealtimeRecordingController}.
 */
export interface RealtimeRecordingOptions {
    /** Output (model) PCM sample rate in Hz. Default 24000 (OpenAI/Gemini emit 24k). */
    OutputSampleRate?: number;
    /** Input (user/mic) PCM sample rate in Hz. Default 24000 (OpenAI). Gemini input = 16000. */
    InputSampleRate?: number;
    /** Media kind tag stored on the session. Default 'Audio'. */
    Media?: RealtimeRecordingMedia;
    /** Injectable clock (ms epoch) for deterministic tests. Default () => Date.now(). */
    Now?: () => number;
}

/**
 * A single captured audio frame, tagged with its offset (ms) from the recording
 * start and the decoded little-endian PCM16 samples.
 */
interface CapturedFrame {
    offsetMs: number;
    samples: Int16Array;
}

/** Lowest value representable by signed 16-bit PCM. */
const PCM16_MIN = -32768;
/** Highest value representable by signed 16-bit PCM. */
const PCM16_MAX = 32767;
/** Canonical WAV/PCM header size in bytes. */
const WAV_HEADER_BYTES = 44;
/** Default waveform resolution (bucket count) produced by {@link RealtimeRecordingController.GetPeaks}. */
const DEFAULT_PEAK_BUCKETS = 600;

/**
 * Accumulates realtime PCM audio frames from both the model (outbound) and the
 * user (inbound) and mixes them into a single mono PCM16 WAV on demand.
 *
 * Lifecycle: construct → {@link Start} → {@link AppendOutbound}/{@link AppendInbound}
 * (many) → {@link Stop} → {@link EncodeWav}. {@link Reset} returns the instance to
 * a pristine state so it can be reused.
 */
export class RealtimeRecordingController {
    private outputSampleRate: number;
    private inputSampleRate: number;
    private media: RealtimeRecordingMedia;
    private now: () => number;

    private recording = false;
    private startedAt: Date | null = null;
    private startEpochMs: number | null = null;

    private outboundFrames: CapturedFrame[] = [];
    private inboundFrames: CapturedFrame[] = [];

    constructor(options?: RealtimeRecordingOptions) {
        this.outputSampleRate = options?.OutputSampleRate ?? 24000;
        this.inputSampleRate = options?.InputSampleRate ?? 24000;
        this.media = options?.Media ?? 'Audio';
        this.now = options?.Now ?? (() => Date.now());
    }

    /** Stamp t0 and begin accepting frames. Idempotent (second call is a no-op). */
    public Start(): void {
        if (this.recording) {
            return;
        }
        const epoch = this.now();
        this.startEpochMs = epoch;
        this.startedAt = new Date(epoch);
        this.recording = true;
    }

    /** Stop accepting frames. Idempotent. Does NOT clear buffers. */
    public Stop(): void {
        this.recording = false;
    }

    /** Clear all state so the instance can be reused. */
    public Reset(): void {
        this.recording = false;
        this.startedAt = null;
        this.startEpochMs = null;
        this.outboundFrames = [];
        this.inboundFrames = [];
    }

    public get IsRecording(): boolean {
        return this.recording;
    }

    /** The wall-clock moment {@link Start} stamped, or null if never started. */
    public get StartedAt(): Date | null {
        return this.startedAt;
    }

    public get Media(): RealtimeRecordingMedia {
        return this.media;
    }

    /** Whether any non-empty frame was captured. */
    public get HasAudio(): boolean {
        return this.frameHasSamples(this.outboundFrames) || this.frameHasSamples(this.inboundFrames);
    }

    /** ms since {@link Start} per the injected clock; 0 if not started (never negative). */
    public NowOffsetMs(): number {
        if (this.startEpochMs == null) {
            return 0;
        }
        const delta = this.now() - this.startEpochMs;
        return delta > 0 ? delta : 0;
    }

    /**
     * Append a model-output audio frame (ArrayBuffer of little-endian PCM16).
     * No-op if not recording or empty. The bytes are copied — the caller's
     * ArrayBuffer is not retained.
     */
    public AppendOutbound(chunk: ArrayBuffer): void {
        this.appendFrame(this.outboundFrames, chunk);
    }

    /** Append a user-input audio frame. Same contract as {@link AppendOutbound}. */
    public AppendInbound(chunk: ArrayBuffer): void {
        this.appendFrame(this.inboundFrames, chunk);
    }

    /**
     * Mix everything captured into a mono PCM16 WAV.
     * @returns The encoded buffer, duration, and sample rate; or null if {@link HasAudio} is false.
     */
    public EncodeWav(): { Buffer: Buffer; DurationMs: number; SampleRate: number } | null {
        const mixed = this.mixTimeline();
        if (!mixed) {
            return null;
        }
        const buffer = this.encodeWavBuffer(mixed.Pcm, mixed.SampleRate);
        const durationMs = (mixed.Pcm.length / mixed.SampleRate) * 1000;

        return { Buffer: buffer, DurationMs: durationMs, SampleRate: mixed.SampleRate };
    }

    /**
     * Compute capture-time waveform peaks from the accumulated PCM: a normalized `0..1` max-abs
     * amplitude per bucket (one bucket per rendered waveform bar). Mirrors the client-direct peak
     * math so server-bridged recordings render the same kind of waveform; the result is persisted
     * as a `peaks.json` sidecar so a viewer renders the waveform without re-decoding the audio.
     *
     * @param buckets Desired bucket count (waveform resolution). Default 600; clamped to `>= 1` and
     *   never exceeds the sample count (a short recording yields at most one peak per sample).
     * @returns A bounded array of normalized `0..1` peaks; `[]` when there is no audio (or silence).
     */
    public GetPeaks(buckets: number = DEFAULT_PEAK_BUCKETS): number[] {
        const mixed = this.mixTimeline();
        if (!mixed) {
            return [];
        }
        return this.computePeaks(mixed.Pcm, buckets);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /**
     * Mix all captured frames into a single mono PCM16 timeline at the output sample rate.
     * Shared by {@link EncodeWav} and {@link GetPeaks} so the WAV and the peaks describe the
     * exact same signal. Returns `null` when nothing was captured.
     */
    private mixTimeline(): { Pcm: Int16Array; SampleRate: number } | null {
        if (!this.HasAudio) {
            return null;
        }
        const targetRate = this.outputSampleRate;
        const timelineLength = this.computeTimelineLength(targetRate);
        if (timelineLength <= 0) {
            return null;
        }
        const accumulator = new Float64Array(timelineLength);
        this.mixFrames(accumulator, this.outboundFrames, targetRate, this.outputSampleRate);
        this.mixFrames(accumulator, this.inboundFrames, targetRate, this.inputSampleRate);
        return { Pcm: this.clampToInt16(accumulator), SampleRate: targetRate };
    }

    /**
     * Downsample a PCM16 timeline into `buckets` normalized `0..1` max-abs peaks. Contiguous,
     * index-ordered buckets; the loudest bucket becomes `1`. An all-silent timeline yields `[]`.
     */
    private computePeaks(pcm: Int16Array, buckets: number): number[] {
        const length = pcm.length;
        if (length === 0) {
            return [];
        }
        const count = Math.min(Math.max(1, Math.floor(buckets)), length);
        const out = new Array<number>(count).fill(0);
        let globalMax = 0;
        for (let b = 0; b < count; b++) {
            const start = Math.floor((b * length) / count);
            const end = b === count - 1 ? length : Math.floor(((b + 1) * length) / count);
            let localMax = 0;
            for (let i = start; i < end; i++) {
                const abs = Math.abs(pcm[i]);
                if (abs > localMax) {
                    localMax = abs;
                }
            }
            out[b] = localMax;
            if (localMax > globalMax) {
                globalMax = localMax;
            }
        }
        if (globalMax <= 0) {
            return [];
        }
        return out.map((v) => v / globalMax);
    }

    /** Decode + copy a chunk into a frame and push it onto the given list. */
    private appendFrame(list: CapturedFrame[], chunk: ArrayBuffer): void {
        if (!this.recording || chunk == null || chunk.byteLength < 2) {
            return;
        }
        const samples = this.decodePcm16(chunk);
        if (samples.length === 0) {
            return;
        }
        list.push({ offsetMs: this.NowOffsetMs(), samples });
    }

    /**
     * Decode a little-endian PCM16 ArrayBuffer into a copied Int16Array.
     * Odd-length buffers (not a multiple of 2) drop the trailing byte.
     */
    private decodePcm16(chunk: ArrayBuffer): Int16Array {
        const usableBytes = chunk.byteLength - (chunk.byteLength % 2);
        // Copy the bytes so later mutation of the caller's source is safe.
        const copy = chunk.slice(0, usableBytes);
        return new Int16Array(copy);
    }

    /** Whether any frame in the list carries at least one sample. */
    private frameHasSamples(list: CapturedFrame[]): boolean {
        return list.some((frame) => frame.samples.length > 0);
    }

    /** The number of target-rate samples a frame occupies (after any resample). */
    private frameTargetLength(frame: CapturedFrame, targetRate: number, sourceRate: number): number {
        if (sourceRate === targetRate) {
            return frame.samples.length;
        }
        return Math.round((frame.samples.length * targetRate) / sourceRate);
    }

    /** Start sample index for a frame given its offset and the target rate. */
    private frameStartSample(frame: CapturedFrame, targetRate: number): number {
        return Math.round((frame.offsetMs * targetRate) / 1000);
    }

    /** The total length (in target-rate samples) needed to cover the furthest frame end. */
    private computeTimelineLength(targetRate: number): number {
        let maxEnd = 0;
        const consider = (list: CapturedFrame[], sourceRate: number): void => {
            for (const frame of list) {
                if (frame.samples.length === 0) {
                    continue;
                }
                const start = this.frameStartSample(frame, targetRate);
                const end = start + this.frameTargetLength(frame, targetRate, sourceRate);
                if (end > maxEnd) {
                    maxEnd = end;
                }
            }
        };
        consider(this.outboundFrames, this.outputSampleRate);
        consider(this.inboundFrames, this.inputSampleRate);
        return maxEnd;
    }

    /** Sum each frame's (possibly resampled) samples into the mono accumulator. */
    private mixFrames(accumulator: Float64Array, list: CapturedFrame[], targetRate: number, sourceRate: number): void {
        for (const frame of list) {
            if (frame.samples.length === 0) {
                continue;
            }
            const start = this.frameStartSample(frame, targetRate);
            const resampled = sourceRate === targetRate ? frame.samples : this.resampleLinear(frame.samples, sourceRate, targetRate);
            for (let i = 0; i < resampled.length; i++) {
                const idx = start + i;
                if (idx >= 0 && idx < accumulator.length) {
                    accumulator[idx] += resampled[i];
                }
            }
        }
    }

    /**
     * Resample PCM16 samples from sourceRate to targetRate via simple linear
     * interpolation. Returns a Float64Array (caller sums into the accumulator).
     */
    private resampleLinear(samples: Int16Array, sourceRate: number, targetRate: number): Float64Array {
        const outLength = Math.round((samples.length * targetRate) / sourceRate);
        const out = new Float64Array(outLength);
        if (samples.length === 1) {
            out.fill(samples[0]);
            return out;
        }
        const ratio = (samples.length - 1) / Math.max(1, outLength - 1);
        for (let i = 0; i < outLength; i++) {
            const srcPos = i * ratio;
            const lower = Math.floor(srcPos);
            const upper = Math.min(lower + 1, samples.length - 1);
            const frac = srcPos - lower;
            out[i] = samples[lower] * (1 - frac) + samples[upper] * frac;
        }
        return out;
    }

    /** Clamp the float accumulator into the Int16 range and round to integers. */
    private clampToInt16(accumulator: Float64Array): Int16Array {
        const out = new Int16Array(accumulator.length);
        for (let i = 0; i < accumulator.length; i++) {
            let value = Math.round(accumulator[i]);
            if (value > PCM16_MAX) {
                value = PCM16_MAX;
            } else if (value < PCM16_MIN) {
                value = PCM16_MIN;
            }
            out[i] = value;
        }
        return out;
    }

    /** Build a canonical 44-byte WAV/PCM header followed by the sample data. */
    private encodeWavBuffer(pcm: Int16Array, sampleRate: number): Buffer {
        const numChannels = 1;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = pcm.length * bytesPerSample;
        const buffer = Buffer.alloc(WAV_HEADER_BYTES + dataSize);

        // RIFF chunk descriptor
        buffer.write('RIFF', 0, 'ascii');
        buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize = 36 + Subchunk2Size
        buffer.write('WAVE', 8, 'ascii');

        // fmt sub-chunk
        buffer.write('fmt ', 12, 'ascii');
        buffer.writeUInt32LE(16, 16); // Subchunk1Size for PCM
        buffer.writeUInt16LE(1, 20); // AudioFormat = PCM
        buffer.writeUInt16LE(numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(byteRate, 28);
        buffer.writeUInt16LE(blockAlign, 32);
        buffer.writeUInt16LE(bitsPerSample, 34);

        // data sub-chunk
        buffer.write('data', 36, 'ascii');
        buffer.writeUInt32LE(dataSize, 40);

        for (let i = 0; i < pcm.length; i++) {
            buffer.writeInt16LE(pcm[i], WAV_HEADER_BYTES + i * bytesPerSample);
        }

        return buffer;
    }
}
