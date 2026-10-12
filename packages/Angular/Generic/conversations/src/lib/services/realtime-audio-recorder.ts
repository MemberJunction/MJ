import { RECORDING_SAMPLE_RATE } from '@memberjunction/ai-core-plus';
import { IRealtimeSessionRecorder } from '@memberjunction/realtime-runtime';
import { LinearResampler } from './recording/linear-resampler';
import { IOpusPacketEncoder, SelectOpusPacketEncoder } from './recording/opus-packet-encoder';

/**
 * Browser-side audio recorder for a CLIENT-DIRECT realtime voice session, implementing the
 * runtime's {@link IRealtimeSessionRecorder} contract directly.
 *
 * Mixes the user's microphone with the agent's remote-audio stream (every driver exposes one via
 * `GetRemoteMediaStream()`: WebRTC drivers publish their remote track, PCM drivers — Gemini,
 * ElevenLabs, AssemblyAI, xAI, HuggingFace — publish their playout engine's output) in a Web Audio
 * graph, captures the mix as mono Float32 frames through an {@link AudioWorkletNode} (preferred) or a
 * {@link ScriptProcessorNode} (fallback), and feeds them to ONE continuous Opus encoder for the whole
 * call. The runtime pulls the encoded packets with {@link TakeEncodedPackets}, cuts them into shards
 * and uploads them as the call goes, so nothing is held in memory until the end.
 *
 * Timing is the 48 kHz sample clock: the graph asks for a 48 kHz context, and when the browser
 * refuses (or reports another rate) every frame is resampled to 48 kHz before encoding. The
 * captured-sample count drives {@link NowOffsetMs} and is what {@link Stop} resolves.
 *
 * Robust by design — every step degrades gracefully:
 * - No `AudioContext` (server-side render / unsupported env) → the recorder disables itself
 *   ({@link IsRecording} stays `false`, {@link Stop} resolves 0); the voice call proceeds.
 * - No `AudioWorkletNode` AND no `ScriptProcessorNode` → disables itself rather than throwing.
 * - A forced-48 kHz context that cannot take the microphone (Firefox rejects a source whose rate
 *   differs from its context's) → rebuilt once at the device rate with resampling.
 * - No remote stream yet (e.g. the WebRTC track hasn't landed) → records mic only until it does.
 * - A remote stream that can't be connected (e.g. a cross-sample-rate `createMediaStreamSource`
 *   rejection) → warns and records mic only; the mic recording is never lost to the agent stream.
 * - No usable encoder → logged, recording disabled for the call.
 *
 * Not an Angular service: it owns transient per-session media plumbing the runtime creates and
 * discards per call, so a plain class is the right shape (no DI, no singleton).
 */
export class RealtimeAudioRecorder implements IRealtimeSessionRecorder {
    /** PCM frame size for the ScriptProcessor fallback (worklet uses its native 128-frame quantum). */
    private static readonly scriptProcessorBufferSize = 4096;
    /**
     * Most 48 kHz audio held while the encoder is still being selected / loaded (10 s). Selection is
     * normally well under a second; past this the encoder is stuck, and later frames are dropped
     * (see {@link captureFrame} for why they are not counted either).
     */
    private static readonly maxPendingSamples = 10 * RECORDING_SAMPLE_RATE;
    /** Inline AudioWorklet processor: forwards each 128-frame mono input block to the main thread. */
    private static readonly workletProcessorSource = `
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
    /** Converts the context's rate to 48 kHz; `null` when the context already runs at 48 kHz. */
    private resampler: LinearResampler | null = null;
    private recording = false;

    /** True once the agent's remote stream has been wired into the mix (prevents double-attach). */
    private remoteAttached = false;
    /** A remote stream handed to AttachRemoteStream before the audio graph was ready; wired at setup. */
    private pendingRemoteStream: MediaStream | null = null;

    /** 48 kHz samples captured (post-resample) — the recording's clock. */
    private capturedSamples = 0;
    /** The call's encoder once selected; `null` while selecting, after a failure, or when not recording. */
    private encoder: IOpusPacketEncoder | null = null;
    /** Resolves to the encoder (or `null` on failure) — Stop awaits it so buffered audio still gets encoded. */
    private encoderReady: Promise<IOpusPacketEncoder | null> | null = null;
    /** 48 kHz frames captured before the encoder was ready, fed to it in order once it is. */
    private pendingFrames: Float32Array[] = [];
    private pendingSamples = 0;
    private pendingOverflowWarned = false;
    /** The first Stop's promise; later calls return it (idempotent). */
    private stopping: Promise<number> | null = null;

    /**
     * Bumped whenever the audio graph is released. The async graph setup snapshots it and, after each
     * await, gives up if it moved: a {@link Stop} that lands mid-setup can only release what setup has
     * already published, so setup must release the rest itself rather than build a live graph on a
     * stopped recorder.
     */
    private setupGeneration = 0;

    /** @param selectEncoder picks the call's Opus encoder; injectable for tests. */
    constructor(private readonly selectEncoder: () => Promise<IOpusPacketEncoder> = () => SelectOpusPacketEncoder()) {}

    /** True while a recorder is actively capturing. */
    public get IsRecording(): boolean {
        return this.recording;
    }

    /**
     * Begins recording a mix of `micStream` and (when present) `remoteStream`. Best-effort:
     * a missing `AudioContext` / no worklet+scriptprocessor support / any setup failure disables
     * the recorder (logged) so the live call is never blocked.
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
        // Mark recording SYNCHRONOUSLY so a caller that checks IsRecording immediately after Start()
        // (the runtime does) sees `true`, even though the audio graph and the encoder are set up
        // asynchronously below.
        this.recording = true;
        this.stopping = null;
        this.capturedSamples = 0;
        this.encoderReady = this.prepareEncoder();
        // Fire-and-forget the async setup (it must `await audioContext.resume()` + worklet load); any
        // failure disables the recorder rather than throwing into the session-start path.
        void this.startMixedRecording(micStream, remoteStream).catch((error) => {
            console.warn('[RealtimeAudioRecorder] Failed to start recording — disabling for this session:', error);
            this.disable();
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
            this.remoteAttached = this.connectRemoteStream(this.audioContext, stream);
        } else {
            // Audio-graph setup still in flight (awaiting resume / worklet load) — connect at setup.
            this.pendingRemoteStream = stream;
        }
    }

    /** Milliseconds of audio captured so far, on the 48 kHz sample clock (never wall clock). */
    public NowOffsetMs(): number {
        return (this.capturedSamples * 1000) / RECORDING_SAMPLE_RATE;
    }

    /** The Opus packets the encoder produced since the last call (also its final packets after {@link Stop}). */
    public TakeEncodedPackets(): Uint8Array[] {
        return this.encoder ? this.encoder.TakePackets() : [];
    }

    /**
     * Stops capture, waits for the encoder (encoding any audio buffered while it loaded), flushes and
     * closes it, and resolves the 48 kHz samples captured. The final packets stay available to
     * {@link TakeEncodedPackets}. Idempotent: every call resolves the same count; 0 when the recorder
     * never started.
     */
    public Stop(): Promise<number> {
        if (!this.stopping) {
            this.stopping = this.stopOnce();
        }
        return this.stopping;
    }

    private async stopOnce(): Promise<number> {
        this.recording = false;
        this.releaseGraph();
        const encoderReady = this.encoderReady;
        if (!encoderReady) {
            return this.capturedSamples;
        }
        const encoder = await encoderReady;
        if (encoder) {
            await encoder.Flush();
            encoder.Close();
        }
        return this.capturedSamples;
    }

    /**
     * Selects the encoder and feeds it what was captured meanwhile. A selection failure disables the
     * recorder: with no encoder nothing captured could ever reach the server.
     */
    private async prepareEncoder(): Promise<IOpusPacketEncoder | null> {
        let encoder: IOpusPacketEncoder;
        try {
            encoder = await this.selectEncoder();
        } catch (error) {
            console.warn('[RealtimeAudioRecorder] No Opus encoder available — recording disabled for this session:', error);
            this.disable();
            // Nothing captured can be encoded now, so report nothing recorded rather than a count with no audio.
            this.pendingFrames = [];
            this.pendingSamples = 0;
            this.capturedSamples = 0;
            return null;
        }
        this.encoder = encoder;
        for (const frame of this.pendingFrames) {
            encoder.Encode(frame);
        }
        this.pendingFrames = [];
        this.pendingSamples = 0;
        return encoder;
    }

    /** Builds the mix graph + capture node, retrying once at the device rate if 48 kHz cannot take the mic. */
    private async startMixedRecording(micStream: MediaStream, remoteStream: MediaStream | null): Promise<void> {
        const built = await this.buildGraph(micStream, remoteStream, true);
        if (built === 'mic-rejected') {
            await this.buildGraph(micStream, remoteStream, false);
        }
    }

    /**
     * Wires up the Web Audio mix graph + PCM capture node (worklet preferred) and starts capture.
     * Resolves `'mic-rejected'` when a forced-48 kHz context refused the microphone source (the graph
     * is released so the caller can rebuild at the device rate); otherwise `'done'`.
     */
    private async buildGraph(micStream: MediaStream, remoteStream: MediaStream | null, prefer48k: boolean): Promise<'done' | 'mic-rejected'> {
        const generation = this.setupGeneration;
        const audioContext = this.createAudioContext(prefer48k);
        const forced48k = prefer48k && audioContext.sampleRate === RECORDING_SAMPLE_RATE;
        // CRITICAL: browsers create an AudioContext in the `suspended` state under the autoplay policy.
        // Without resuming it, the mix graph never processes audio and we capture only silence. Starting
        // a voice call is a user gesture, so resume() succeeds here.
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        if (generation !== this.setupGeneration) {
            // Stopped while resuming: the context was never published, so releaseGraph() could not close it.
            this.closeContext(audioContext);
            return 'done';
        }
        const destination = audioContext.createMediaStreamDestination();
        // Publish the context BEFORE wiring the remote so a concurrent AttachRemoteStream() (the agent
        // track can land during the awaits above) sees a ready graph to connect to.
        this.audioContext = audioContext;
        this.destination = destination;
        this.resampler = audioContext.sampleRate === RECORDING_SAMPLE_RATE ? null : new LinearResampler(audioContext.sampleRate, RECORDING_SAMPLE_RATE);

        // Build the PCM capture node: AudioWorklet preferred, ScriptProcessor fallback. Either way the
        // node both pulls audio from the mix AND drives the destination so the graph keeps processing.
        await this.createCaptureNode(audioContext, destination);
        if (generation !== this.setupGeneration) {
            return 'done'; // Stopped while the capture node loaded: releaseGraph() already closed the published context.
        }

        try {
            this.connectStream(audioContext, micStream);
        } catch (error) {
            if (!forced48k) {
                throw error;
            }
            console.warn('[RealtimeAudioRecorder] The 48 kHz context rejected the microphone — rebuilding at the device rate with resampling:', error);
            // releaseGraph() forgets a stashed agent stream; the rebuild still has to connect it.
            const stashedRemote = this.pendingRemoteStream;
            this.releaseGraph();
            this.pendingRemoteStream = stashedRemote;
            return 'mic-rejected';
        }
        // Connect the agent's stream if it was passed now, or if AttachRemoteStream() stashed one while
        // we were setting up. Either way, capture the agent voice — not just the mic.
        const remote = remoteStream ?? this.pendingRemoteStream;
        this.pendingRemoteStream = null;
        if (remote && remote.getAudioTracks().length > 0) {
            this.remoteAttached = this.connectRemoteStream(audioContext, remote);
        }
        return 'done';
    }

    /**
     * A 48 kHz context when asked for and the browser allows it, else the device-rate default. A
     * browser that silently picks another rate is fine too: the resampler is chosen from the rate the
     * context actually reports.
     */
    private createAudioContext(prefer48k: boolean): AudioContext {
        if (prefer48k) {
            try {
                return new AudioContext({ sampleRate: RECORDING_SAMPLE_RATE });
            } catch (error) {
                console.warn('[RealtimeAudioRecorder] 48 kHz AudioContext refused — capturing at the device rate with resampling:', error);
            }
        }
        return new AudioContext();
    }

    /**
     * Connects the agent stream, degrading to mic-only on failure. Unlike the mic (whose failure
     * rightly disables the recorder), the agent stream is best-effort: a browser may reject it
     * (cross-sample-rate `NotSupportedError`) and that must not discard the user's recording.
     * Returns whether it was connected, so the caller only marks it attached on success.
     */
    private connectRemoteStream(audioContext: AudioContext, stream: MediaStream): boolean {
        try {
            this.connectStream(audioContext, stream);
            return true;
        } catch (error) {
            console.warn('[RealtimeAudioRecorder] Could not mix the agent stream into the recording — continuing mic-only:', error);
            return false;
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
                new Blob([RealtimeAudioRecorder.workletProcessorSource], { type: 'application/javascript' }),
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
        const node = audioContext.createScriptProcessor(RealtimeAudioRecorder.scriptProcessorBufferSize, 1, 1);
        node.onaudioprocess = (event: AudioProcessingEvent) => this.captureFrame(event.inputBuffer.getChannelData(0));
        // ScriptProcessor only fires onaudioprocess while connected to the destination.
        node.connect(destination);
        this.scriptNode = node;
    }

    /** The active capture node (worklet or script processor), or `null` before setup. */
    private captureNode(): AudioNode | null {
        return this.workletNode ?? this.scriptNode;
    }

    /**
     * Absorbs one captured frame: resample to 48 kHz, count it, and hand it to the encoder (or buffer
     * it while the encoder loads).
     *
     * Past the pending-buffer cap a frame is dropped AND not counted. Keeping the count equal to the
     * audio actually handed to the encoder is what lets the runtime trust `packets × 960 ≥ captured`
     * when it trims the final shard; a few lost seconds at the start of a call whose encoder never
     * loaded is the smaller harm.
     */
    private captureFrame(frame: Float32Array): void {
        if (!this.recording || frame.length === 0) {
            return;
        }
        // Copy out of the engine's reused buffer (a resampler output is already a fresh array).
        const samples = this.resampler ? this.resampler.Process(frame) : frame.slice(0);
        if (samples.length === 0) {
            return;
        }
        if (this.encoder) {
            this.encoder.Encode(samples);
        } else if (this.pendingSamples + samples.length <= RealtimeAudioRecorder.maxPendingSamples) {
            this.pendingFrames.push(samples);
            this.pendingSamples += samples.length;
        } else {
            if (!this.pendingOverflowWarned) {
                this.pendingOverflowWarned = true;
                console.warn(`[RealtimeAudioRecorder] Opus encoder still not ready after ${RealtimeAudioRecorder.maxPendingSamples / RECORDING_SAMPLE_RATE} s of audio — dropping audio until it is.`);
            }
            return;
        }
        this.capturedSamples += samples.length;
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

    /**
     * Turns recording off after a setup failure and releases the graph. Audio already captured stays
     * queued for the encoder, so a graph failure mid-call still keeps what was recorded before it.
     */
    private disable(): void {
        this.recording = false;
        this.releaseGraph();
    }

    /** Releases the audio graph + capture node. Idempotent; leaves the encoder and the sample count alone. */
    private releaseGraph(): void {
        this.setupGeneration++;
        this.remoteAttached = false;
        this.pendingRemoteStream = null;
        if (this.workletNode) {
            this.workletNode.port.onmessage = null;
            this.disconnectNode(this.workletNode);
            this.workletNode = null;
        }
        if (this.scriptNode) {
            this.scriptNode.onaudioprocess = null;
            this.disconnectNode(this.scriptNode);
            this.scriptNode = null;
        }
        this.destination = null;
        this.resampler = null;
        if (this.audioContext) {
            this.closeContext(this.audioContext);
            this.audioContext = null;
        }
    }

    private disconnectNode(node: AudioNode): void {
        try {
            node.disconnect();
        } catch (error) {
            // Expected when the node was never connected or is already disconnected; nothing to release.
            console.debug('[RealtimeAudioRecorder] Capture node disconnect skipped:', error);
        }
    }

    private closeContext(audioContext: AudioContext): void {
        void audioContext.close().catch((error: unknown) => {
            // A context that is already closed rejects here; the graph is released either way.
            console.debug('[RealtimeAudioRecorder] AudioContext close skipped:', error);
        });
    }
}
