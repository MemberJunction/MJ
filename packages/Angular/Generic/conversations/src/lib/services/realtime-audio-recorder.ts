import { encodePcm16Wav, PeakAccumulator } from './realtime-pcm-wav';

/**
 * Browser-side audio recorder for a CLIENT-DIRECT realtime voice session.
 *
 * Mixes the user's microphone stream with the agent's remote-audio stream (when the driver
 * exposes one — `OpenAIRealtimeClient.GetRemoteMediaStream()`) into a single mono **WAV** (16-bit
 * PCM) blob via the Web Audio API. Rather than a `MediaRecorder` (which only emits webm/opus —
 * header-less, no duration/cues, so HTTP-range seeking is unreliable), the mix is routed into an
 * {@link AudioWorkletNode} (preferred) or a {@link ScriptProcessorNode} (fallback) that captures
 * Float32 PCM frames. PCM is accumulated in memory and encoded as a seekable RIFF/WAVE file at
 * {@link Stop}. WAV's header carries the exact duration and maps byte-offset → time linearly, so
 * range seeking is exact and waveform peaks are computed cheaply during capture. The tradeoff is
 * size (PCM WAV is larger than opus) — acceptable for these short session recordings.
 *
 * Robust + MVP by design — every step degrades gracefully:
 * - No `AudioContext` (server-side render / unsupported env) → the recorder disables itself
 *   ({@link IsRecording} stays `false`, {@link Stop} resolves `null`); the voice call proceeds.
 * - No `AudioWorkletNode` AND no `ScriptProcessorNode` → disables itself rather than throwing.
 * - No remote stream (non-WebRTC drivers, or the track hasn't landed yet) → records mic only.
 * - Any construction/start error is logged and disables the recorder rather than throwing into
 *   the session-start path.
 *
 * Not an Angular service: it owns transient per-session media plumbing the
 * {@link RealtimeSessionService} creates and discards per call, so a plain class is the right
 * shape (no DI, no singleton).
 */
export class RealtimeAudioRecorder {
    /** The container/codec we now produce — a seekable mono 16-bit PCM WAV. */
    private static readonly WavMimeType = 'audio/wav';
    /** Target waveform-peak resolution (buckets) across the whole recording. */
    private static readonly PeakBuckets = 600;
    /** PCM frame size for the ScriptProcessor fallback (worklet uses its native 128-frame quantum). */
    private static readonly ScriptProcessorBufferSize = 4096;
    /** Inline AudioWorklet processor: forwards each 128-frame mono input block to the main thread. */
    private static readonly WorkletProcessorSource = `
        class MJPcmCaptureProcessor extends AudioWorkletProcessor {
            process(inputs) {
                const input = inputs[0];
                if (input && input[0] && input[0].length > 0) {
                    // Copy out of the reused worklet buffer before posting.
                    this.port.postMessage(input[0].slice(0));
                }
                return true;
            }
        }
        registerProcessor('mj-pcm-capture', MJPcmCaptureProcessor);
    `;

    private audioContext: AudioContext | null = null;
    private destination: MediaStreamAudioDestinationNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private scriptNode: ScriptProcessorNode | null = null;
    /** Captured mono Float32 PCM frames (in capture order); concatenated + encoded to WAV at Stop. */
    private pcmFrames: Float32Array[] = [];
    /** Total captured sample count across {@link pcmFrames} (kept in step to avoid re-summing). */
    private totalSamples = 0;
    /** Streaming waveform-peak accumulator — bounded regardless of recording length. */
    private peaks = new PeakAccumulator(RealtimeAudioRecorder.PeakBuckets);
    /** Final normalized peaks, snapshotted at {@link Stop} so {@link GetPeaks} survives cleanup. */
    private finalPeaks: number[] = [];
    private recording = false;

    /** True once the agent's remote stream has been wired into the mix (prevents double-attach). */
    private remoteAttached = false;
    /** A remote stream handed to AttachRemoteStream before the audio graph was ready; wired at setup. */
    private pendingRemoteStream: MediaStream | null = null;

    /** Sample index up to which crash-recovery shards have already been emitted (the segment cursor). */
    private flushedSampleCount = 0;

    /** Wall-clock ms at recording start; anchors {@link NowOffsetMs}. 0 before {@link Start}. */
    private startedAtMs = 0;

    /** Sample rate of the capturing {@link AudioContext}; 0 before {@link Start}. Needed to wrap shards. */
    private sampleRate = 0;

    /** True while a recorder is actively capturing. */
    public get IsRecording(): boolean {
        return this.recording;
    }

    /** Wall-clock ms when recording started (0 before {@link Start}). */
    public get StartedAtMs(): number {
        return this.startedAtMs;
    }

    /**
     * The container/codec the active recording uses. Always `'audio/wav'` once recording (empty
     * string before {@link Start} / when disabled) — the consolidated upload and the WAV-wrapped
     * crash-recovery shards are all 16-bit PCM WAV.
     */
    public get MimeType(): string {
        return this.recording ? RealtimeAudioRecorder.WavMimeType : '';
    }

    /**
     * The captured AudioContext sample rate (0 before {@link Start} / when disabled). Exposed so a
     * recovery path can WAV-wrap the raw-PCM shards with the correct rate.
     */
    public get SampleRate(): number {
        return this.sampleRate;
    }

    /**
     * Begins recording a mix of `micStream` and (when present) `remoteStream`. Best-effort:
     * a missing `AudioContext` / no worklet+scriptprocessor support / any setup failure disables
     * the recorder silently (logged) so the live call is never blocked.
     *
     * @param micStream The user's microphone capture stream (required).
     * @param remoteStream The agent's remote-audio stream, or `null` for mic-only capture.
     */
    public Start(micStream: MediaStream, remoteStream: MediaStream | null): void {
        if (this.recording) {
            return;
        }
        if (typeof AudioContext === 'undefined') {
            console.warn('[RealtimeAudioRecorder] AudioContext unavailable — recording disabled for this session.');
            return;
        }
        // Mark recording + stamp t0 SYNCHRONOUSLY so a caller that checks IsRecording immediately after
        // Start() (the session service does) sees `true`, even though the audio-graph setup
        // (AudioContext.resume + worklet module load) completes asynchronously below. Without this the
        // caller discards the recorder before it finishes starting and nothing is ever uploaded.
        this.startedAtMs = Date.now();
        this.finalPeaks = [];
        this.recording = true;
        // Fire-and-forget the async setup (it must `await audioContext.resume()` + worklet load); any
        // failure disables the recorder rather than throwing into the session-start path.
        void this.startMixedRecording(micStream, remoteStream).catch((error) => {
            console.warn('[RealtimeAudioRecorder] Failed to start recording — disabling for this session:', error);
            this.cleanup();
        });
    }

    /**
     * Wires the agent's remote-audio stream into the live mix once it arrives. The WebRTC
     * `ontrack` that delivers the agent voice usually lands AFTER recording has already begun
     * (mic-only), so the session attaches it here when it lands. Idempotent, and safe to call
     * before the audio graph finishes its async setup (the stream is connected once ready).
     */
    public AttachRemoteStream(stream: MediaStream): void {
        if (this.remoteAttached || stream.getAudioTracks().length === 0) {
            return;
        }
        if (this.audioContext && this.captureNode()) {
            this.connectStream(this.audioContext, stream);
            this.remoteAttached = true;
        } else {
            // Audio-graph setup still in flight (awaiting resume / worklet load) — connect at setup.
            this.pendingRemoteStream = stream;
        }
    }

    /**
     * Returns a Blob of the raw PCM captured since the last call (a window of header-less,
     * little-endian PCM16 bytes), advancing the segment cursor. `null` when nothing new. Used to
     * upload crash-recovery shards mid-call. NOTE: shards are header-less raw PCM (NOT individually
     * playable WAV) — recovery is concatenation in order, then WAV-wrapping with {@link SampleRate}.
     * The canonical consolidated file is still authored as a single WAV from full memory at {@link Stop}.
     */
    public SnapshotNewSegment(): Blob | null {
        if (!this.recording || this.flushedSampleCount >= this.totalSamples) {
            return null;
        }
        const fresh = this.collectSamples(this.flushedSampleCount, this.totalSamples);
        this.flushedSampleCount = this.totalSamples;
        if (fresh.length === 0) {
            return null;
        }
        const pcm16 = this.floatToPcm16Bytes(fresh);
        return new Blob([pcm16], { type: 'application/octet-stream' });
    }

    /** Ms elapsed since recording started (>= 0); 0 when not recording. */
    public NowOffsetMs(): number {
        if (this.startedAtMs === 0) {
            return 0;
        }
        return Math.max(0, Date.now() - this.startedAtMs);
    }

    /**
     * The downsampled waveform peaks (each 0..1, max-abs per bucket, ~{@link RealtimeAudioRecorder.PeakBuckets}
     * buckets across the whole recording). Computed incrementally during capture so it's cheap and
     * bounded regardless of length. Returns `[]` before any audio / for a silent recording. Safe to
     * call after {@link Stop} — the peaks are snapshotted there before {@link cleanup} clears state.
     */
    public GetPeaks(): number[] {
        return this.recording ? this.peaks.Normalize() : this.finalPeaks;
    }

    /**
     * Stops recording and resolves the captured audio as a single mono 16-bit PCM **WAV**
     * {@link Blob}, then releases the audio graph. Resolves `null` when nothing was recorded
     * (recorder disabled, or no samples captured). Safe to call when not recording.
     */
    public async Stop(): Promise<Blob | null> {
        if (!this.recording) {
            this.cleanup();
            return null;
        }
        // Detach the capture node so no further frames arrive while we assemble the file. Snapshot the
        // peaks BEFORE cleanup so GetPeaks() still returns them for the post-Stop upload.
        this.recording = false;
        this.finalPeaks = this.peaks.Normalize();
        const blob = this.encodeWavBlob();
        this.cleanup();
        return blob;
    }

    /** Wires up the Web Audio mix graph + PCM capture node (worklet preferred) and starts capture. */
    private async startMixedRecording(micStream: MediaStream, remoteStream: MediaStream | null): Promise<void> {
        const audioContext = new AudioContext();
        // CRITICAL: browsers create an AudioContext in the `suspended` state under the autoplay policy.
        // Without resuming it, the mix graph never processes audio and we capture only silence. Starting
        // a voice call is a user gesture, so resume() succeeds here.
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        const destination = audioContext.createMediaStreamDestination();
        // Publish the context + sample rate BEFORE wiring the remote so a concurrent AttachRemoteStream()
        // (the agent track can land during the awaits above) sees a ready graph to connect to.
        this.audioContext = audioContext;
        this.destination = destination;
        this.sampleRate = audioContext.sampleRate;

        // Build the PCM capture node: AudioWorklet preferred, ScriptProcessor fallback. Either way the
        // node both pulls audio from the mix AND drives the destination so the graph keeps processing.
        await this.createCaptureNode(audioContext, destination);

        this.connectStream(audioContext, micStream);
        // Connect the agent's stream if it was passed now, or if AttachRemoteStream() stashed one while
        // we were setting up. Either way, capture the agent voice — not just the mic.
        const remote = remoteStream ?? this.pendingRemoteStream;
        this.pendingRemoteStream = null;
        if (remote && remote.getAudioTracks().length > 0) {
            this.connectStream(audioContext, remote);
            this.remoteAttached = true;
        }
    }

    /**
     * Creates the PCM capture node and inserts it into the graph: sources → captureNode → destination.
     * Prefers an {@link AudioWorkletNode} (off-main-thread, no deprecation); falls back to a
     * {@link ScriptProcessorNode} where worklets are unavailable. Throws when neither is supported
     * (caught by {@link Start}, which then disables the recorder).
     */
    private async createCaptureNode(audioContext: AudioContext, destination: MediaStreamAudioDestinationNode): Promise<void> {
        if (await this.tryCreateWorkletNode(audioContext, destination)) {
            return;
        }
        this.createScriptProcessorNode(audioContext, destination);
    }

    /** Attempts to build the AudioWorklet capture node; returns `false` (no throw) when unsupported. */
    private async tryCreateWorkletNode(audioContext: AudioContext, destination: MediaStreamAudioDestinationNode): Promise<boolean> {
        if (!audioContext.audioWorklet || typeof AudioWorkletNode === 'undefined' || typeof Blob === 'undefined') {
            return false;
        }
        try {
            const moduleUrl = URL.createObjectURL(
                new Blob([RealtimeAudioRecorder.WorkletProcessorSource], { type: 'application/javascript' }),
            );
            try {
                await audioContext.audioWorklet.addModule(moduleUrl);
            } finally {
                URL.revokeObjectURL(moduleUrl);
            }
            const node = new AudioWorkletNode(audioContext, 'mj-pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1 });
            node.port.onmessage = (event: MessageEvent<Float32Array>) => this.captureFrame(event.data);
            node.connect(destination);
            this.workletNode = node;
            return true;
        } catch (error) {
            console.warn('[RealtimeAudioRecorder] AudioWorklet unavailable — falling back to ScriptProcessor:', error);
            return false;
        }
    }

    /** Builds the ScriptProcessor fallback capture node and inserts it into the graph. */
    private createScriptProcessorNode(audioContext: AudioContext, destination: MediaStreamAudioDestinationNode): void {
        if (typeof audioContext.createScriptProcessor !== 'function') {
            throw new Error('Neither AudioWorklet nor ScriptProcessor is supported');
        }
        const node = audioContext.createScriptProcessor(RealtimeAudioRecorder.ScriptProcessorBufferSize, 1, 1);
        node.onaudioprocess = (event: AudioProcessingEvent) => {
            // Copy out of the reused input buffer before retaining.
            this.captureFrame(event.inputBuffer.getChannelData(0).slice(0));
        };
        // ScriptProcessor only fires onaudioprocess while connected to the destination.
        node.connect(destination);
        this.scriptNode = node;
    }

    /** The active capture node (worklet or script processor), or `null` before setup. */
    private captureNode(): AudioNode | null {
        return this.workletNode ?? this.scriptNode;
    }

    /** Absorbs one captured PCM frame: accumulate samples + update the bounded peak array. */
    private captureFrame(frame: Float32Array): void {
        if (!this.recording || frame.length === 0) {
            return;
        }
        // Defensive copy — worklet/script buffers are reused by the engine.
        const copy = frame.slice(0);
        this.pcmFrames.push(copy);
        this.totalSamples += copy.length;
        this.peaks.Push(copy);
    }

    /** Routes one stream's audio tracks into the capture node (no-op when track-less / no node). */
    private connectStream(audioContext: AudioContext, stream: MediaStream): void {
        const node = this.captureNode();
        if (!node || stream.getAudioTracks().length === 0) {
            return;
        }
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(node);
    }

    /** Concatenates a half-open sample range [from, to) across the captured frames into one Float32Array. */
    private collectSamples(from: number, to: number): Float32Array {
        const out = new Float32Array(Math.max(0, to - from));
        if (out.length === 0) {
            return out;
        }
        let cursor = 0; // absolute sample index at the start of the current frame
        let written = 0;
        for (const frame of this.pcmFrames) {
            const frameStart = cursor;
            const frameEnd = cursor + frame.length;
            cursor = frameEnd;
            if (frameEnd <= from) {
                continue; // entirely before the window
            }
            if (frameStart >= to) {
                break; // entirely after the window
            }
            const sliceStart = Math.max(0, from - frameStart);
            const sliceEnd = Math.min(frame.length, to - frameStart);
            for (let i = sliceStart; i < sliceEnd; i++) {
                out[written++] = frame[i];
            }
        }
        return written === out.length ? out : out.subarray(0, written);
    }

    /**
     * Converts a mono Float32 buffer to a little-endian PCM16 `ArrayBuffer` (for raw crash-recovery
     * shards). Returns the backing `ArrayBuffer` directly so it's a valid `BlobPart`.
     */
    private floatToPcm16Bytes(samples: Float32Array): ArrayBuffer {
        const buffer = new ArrayBuffer(samples.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i] < -1 ? -1 : samples[i] > 1 ? 1 : samples[i];
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return buffer;
    }

    /** Encodes all accumulated PCM into a single seekable WAV blob, or `null` when nothing captured. */
    private encodeWavBlob(): Blob | null {
        if (this.totalSamples === 0 || this.sampleRate === 0) {
            return null;
        }
        const all = this.collectSamples(0, this.totalSamples);
        const wav = encodePcm16Wav(all, this.sampleRate);
        return new Blob([wav], { type: RealtimeAudioRecorder.WavMimeType });
    }

    /** Releases the audio graph + capture node and resets state. Idempotent. */
    private cleanup(): void {
        this.recording = false;
        this.pcmFrames = [];
        this.totalSamples = 0;
        this.flushedSampleCount = 0;
        this.sampleRate = 0;
        this.peaks = new PeakAccumulator(RealtimeAudioRecorder.PeakBuckets);
        this.remoteAttached = false;
        this.pendingRemoteStream = null;
        if (this.workletNode) {
            this.workletNode.port.onmessage = null;
            try { this.workletNode.disconnect(); } catch { /* already disconnected */ }
            this.workletNode = null;
        }
        if (this.scriptNode) {
            this.scriptNode.onaudioprocess = null;
            try { this.scriptNode.disconnect(); } catch { /* already disconnected */ }
            this.scriptNode = null;
        }
        this.destination = null;
        if (this.audioContext) {
            void this.audioContext.close().catch(() => { /* already closed */ });
            this.audioContext = null;
        }
    }
}
