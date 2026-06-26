/**
 * Browser-side audio recorder for a CLIENT-DIRECT realtime voice session.
 *
 * Mixes the user's microphone stream with the agent's remote-audio stream (when the driver
 * exposes one — `OpenAIRealtimeClient.GetRemoteMediaStream()`) into a single Opus/WebM blob
 * via the Web Audio API and a {@link MediaRecorder}. The blob is uploaded by the host at
 * session end.
 *
 * Robust + MVP by design — every step degrades gracefully:
 * - No `MediaRecorder` / no supported codec → the recorder disables itself ({@link IsRecording}
 *   stays `false`, {@link Stop} resolves `null`); the voice call proceeds unaffected.
 * - No remote stream (non-WebRTC drivers, or the track hasn't landed yet) → records mic only.
 * - Any construction/start error is logged and disables the recorder rather than throwing into
 *   the session-start path.
 *
 * Not an Angular service: it owns transient per-session media plumbing the
 * {@link RealtimeSessionService} creates and discards per call, so a plain class is the right
 * shape (no DI, no singleton).
 */
export class RealtimeAudioRecorder {
    /** Preferred container/codec, with fallbacks tried in order when unsupported. */
    private static readonly CandidateMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];

    private audioContext: AudioContext | null = null;
    private destination: MediaStreamAudioDestinationNode | null = null;
    private recorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private recording = false;

    /** Wall-clock ms at recording start; anchors {@link NowOffsetMs}. 0 before {@link Start}. */
    private startedAtMs = 0;

    /** The negotiated MIME type the recorder actually used (for the upload's `mimeType`). */
    private mimeType = '';

    /** True while a recorder is actively capturing. */
    public get IsRecording(): boolean {
        return this.recording;
    }

    /** Wall-clock ms when recording started (0 before {@link Start}). */
    public get StartedAtMs(): number {
        return this.startedAtMs;
    }

    /** The container/codec the active recording uses (empty before {@link Start} / when disabled). */
    public get MimeType(): string {
        return this.mimeType;
    }

    /**
     * Begins recording a mix of `micStream` and (when present) `remoteStream`. Best-effort:
     * a missing `MediaRecorder`/codec or any setup failure disables the recorder silently
     * (logged) so the live call is never blocked.
     *
     * @param micStream The user's microphone capture stream (required).
     * @param remoteStream The agent's remote-audio stream, or `null` for mic-only capture.
     */
    public Start(micStream: MediaStream, remoteStream: MediaStream | null): void {
        if (this.recording) {
            return;
        }
        const mimeType = this.resolveSupportedMimeType();
        if (!mimeType) {
            console.warn('[RealtimeAudioRecorder] MediaRecorder/Opus unavailable — recording disabled for this session.');
            return;
        }
        try {
            this.startMixedRecording(micStream, remoteStream, mimeType);
        } catch (error) {
            console.warn('[RealtimeAudioRecorder] Failed to start recording — disabling for this session:', error);
            this.cleanup();
        }
    }

    /** Ms elapsed since recording started (>= 0); 0 when not recording. */
    public NowOffsetMs(): number {
        if (this.startedAtMs === 0) {
            return 0;
        }
        return Math.max(0, Date.now() - this.startedAtMs);
    }

    /**
     * Stops recording and resolves the captured audio as a single {@link Blob}, then releases
     * the audio graph. Resolves `null` when nothing was recorded (recorder disabled, or no
     * chunks captured). Safe to call when not recording.
     */
    public async Stop(): Promise<Blob | null> {
        const recorder = this.recorder;
        if (!recorder || !this.recording) {
            this.cleanup();
            return null;
        }
        const blob = await this.stopAndCollect(recorder);
        this.cleanup();
        return blob;
    }

    /** Wires up the Web Audio mix graph + MediaRecorder and starts capture. */
    private startMixedRecording(micStream: MediaStream, remoteStream: MediaStream | null, mimeType: string): void {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        this.connectStream(audioContext, destination, micStream);
        if (remoteStream) {
            this.connectStream(audioContext, destination, remoteStream);
        }

        const recorder = new MediaRecorder(destination.stream, { mimeType });
        recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data && event.data.size > 0) {
                this.chunks.push(event.data);
            }
        };

        this.audioContext = audioContext;
        this.destination = destination;
        this.recorder = recorder;
        this.mimeType = mimeType;
        this.chunks = [];
        this.startedAtMs = Date.now();
        this.recording = true;
        recorder.start();
    }

    /** Routes one stream's audio tracks into the shared mix destination (no-op when track-less). */
    private connectStream(audioContext: AudioContext, destination: MediaStreamAudioDestinationNode, stream: MediaStream): void {
        if (stream.getAudioTracks().length === 0) {
            return;
        }
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(destination);
    }

    /** Stops the recorder and resolves the assembled blob once its final data flushes. */
    private stopAndCollect(recorder: MediaRecorder): Promise<Blob | null> {
        return new Promise<Blob | null>((resolve) => {
            recorder.onstop = () => {
                if (this.chunks.length === 0) {
                    resolve(null);
                    return;
                }
                resolve(new Blob(this.chunks, { type: this.mimeType }));
            };
            try {
                recorder.stop();
            } catch (error) {
                console.warn('[RealtimeAudioRecorder] recorder.stop() threw:', error);
                resolve(this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null);
            }
        });
    }

    /** Picks the first supported candidate MIME type, or `''` when none / MediaRecorder is absent. */
    private resolveSupportedMimeType(): string {
        if (typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') {
            return '';
        }
        const isTypeSupported = MediaRecorder.isTypeSupported;
        if (typeof isTypeSupported !== 'function') {
            // No feature-detection API — optimistically use the default container.
            return RealtimeAudioRecorder.CandidateMimeTypes[0];
        }
        for (const candidate of RealtimeAudioRecorder.CandidateMimeTypes) {
            if (isTypeSupported(candidate)) {
                return candidate;
            }
        }
        return '';
    }

    /** Releases the audio graph + recorder and resets state. Idempotent. */
    private cleanup(): void {
        this.recording = false;
        this.recorder = null;
        this.destination = null;
        if (this.audioContext) {
            void this.audioContext.close().catch(() => { /* already closed */ });
            this.audioContext = null;
        }
    }
}
