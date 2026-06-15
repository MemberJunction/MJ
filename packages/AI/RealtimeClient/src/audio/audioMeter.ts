/**
 * @fileoverview AUDIO ACTIVITY METERING for realtime clients — the Web Audio tap behind
 * the call UI's audio-reactive visuals (the hero orb that "vibrates like a speaker cone"
 * and the true-spectrum EQ bars).
 *
 * One meter wraps one `AnalyserNode` over either:
 *  - a `MediaStream` ({@link RealtimeAudioMeter.ForStream} — the mic everywhere; the remote
 *    WebRTC stream on OpenAI), or
 *  - a node inside an EXISTING audio graph ({@link RealtimeAudioMeter.ForContextNode} — the
 *    shared {@link RealtimePcmPlayback} master gain on the client-owned-audio drivers:
 *    Gemini Live, ElevenLabs Agents, AssemblyAI).
 *
 * Construction is DEFENSIVE by contract: in environments without Web Audio (unit tests,
 * SSR) the factories return `null` and callers degrade to "no metering" — the call UI then
 * keeps its turn-state-driven animations. The DSP math ({@link ComputeRmsLevel},
 * {@link BucketizeFrequencyData}) is exported pure so it unit-tests without Web Audio.
 */

/** The number of frequency bins the call UI's EQ renders (and meters therefore produce). */
export const REALTIME_AUDIO_BIN_COUNT = 9;

/**
 * RMS level (0..1) of byte TIME-DOMAIN samples as `AnalyserNode.getByteTimeDomainData`
 * delivers them: bytes centered on 128 (silence) spanning 0..255. Pure — unit-testable
 * without Web Audio. Perceptual boost (×1.6, clamped) keeps normal speech visually alive
 * without pinning shouts.
 */
export function ComputeRmsLevel(timeDomainBytes: Uint8Array): number {
    if (timeDomainBytes.length === 0) {
        return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < timeDomainBytes.length; i++) {
        const centered = (timeDomainBytes[i] - 128) / 128;
        sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / timeDomainBytes.length);
    return Math.min(1, rms * 1.6);
}

/**
 * Averages byte FREQUENCY data (`AnalyserNode.getByteFrequencyData`, 0..255 per bin) into
 * `count` equal buckets normalized 0..1. Only the lower ~70% of the spectrum is used —
 * voice energy lives there; the top bins are mostly hiss and would flatten the display.
 * Pure — unit-testable without Web Audio.
 */
export function BucketizeFrequencyData(frequencyBytes: Uint8Array, count: number = REALTIME_AUDIO_BIN_COUNT): number[] {
    const bins: number[] = new Array<number>(count).fill(0);
    if (frequencyBytes.length === 0 || count <= 0) {
        return bins;
    }
    const usable = Math.max(count, Math.floor(frequencyBytes.length * 0.7));
    const perBucket = usable / count;
    for (let b = 0; b < count; b++) {
        const start = Math.floor(b * perBucket);
        const end = Math.max(start + 1, Math.floor((b + 1) * perBucket));
        let sum = 0;
        for (let i = start; i < end && i < frequencyBytes.length; i++) {
            sum += frequencyBytes[i];
        }
        bins[b] = Math.min(1, sum / ((end - start) * 255));
    }
    return bins;
}

/**
 * The level/spectrum surface one direction of audio exposes. Narrow interface so unit
 * tests can substitute fakes for the Web Audio-backed {@link RealtimeAudioMeter}.
 */
export interface IRealtimeAudioMeter {
    /** Instantaneous RMS level, 0..1 (0 = silence). */
    Level(): number;
    /** The current spectrum as `count` normalized bins (default {@link REALTIME_AUDIO_BIN_COUNT}). */
    Bins(count?: number): number[];
    /** Releases the analyser (and the meter-owned `AudioContext`, when it created one). */
    Close(): void;
}

/**
 * `AnalyserNode`-backed audio meter. Use the static factories — they are defensive
 * (return `null` where Web Audio is unavailable) and encode the two ownership modes:
 * stream meters own a private `AudioContext`; graph meters tap a context the caller owns
 * (and Close never closes it).
 */
export class RealtimeAudioMeter implements IRealtimeAudioMeter {
    private readonly analyser: AnalyserNode;
    /** A context this meter created and therefore owns (closed in {@link Close}), or null. */
    private readonly ownedContext: AudioContext | null;
    /** Cloned tracks this meter owns (stopped in {@link Close}); empty when it taps tracks it doesn't own. */
    private readonly ownedTracks: MediaStreamTrack[];
    private readonly timeDomain: Uint8Array<ArrayBuffer>;
    private readonly frequency: Uint8Array<ArrayBuffer>;
    private closed = false;

    private constructor(analyser: AnalyserNode, ownedContext: AudioContext | null, ownedTracks: MediaStreamTrack[] = []) {
        this.analyser = analyser;
        this.ownedContext = ownedContext;
        this.ownedTracks = ownedTracks;
        this.timeDomain = new Uint8Array(analyser.fftSize);
        this.frequency = new Uint8Array(analyser.frequencyBinCount);
    }

    /**
     * Shared builder: taps `stream` with a private `AudioContext` + analyser-only sink. A fresh
     * `AudioContext` starts SUSPENDED and, with no destination route, nothing auto-starts its clock —
     * so the analyser would read pure silence forever; we resume it (the session always starts from a
     * user gesture, so this is permitted). `ownedTracks` are clones this meter must stop on Close.
     */
    private static buildStreamMeter(stream: MediaStream, ownedTracks: MediaStreamTrack[]): RealtimeAudioMeter {
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = RealtimeAudioMeter.createAnalyser(context);
        source.connect(analyser);
        if (context.state === 'suspended') {
            void context.resume();
        }
        return new RealtimeAudioMeter(analyser, context, ownedTracks);
    }

    /**
     * Meters a `MediaStream` (e.g. a remote WebRTC stream) via a private `AudioContext`. Returns
     * `null` when Web Audio / the stream isn't usable (tests, SSR, stopped tracks) — callers treat
     * null as "no metering available". For the LOCAL microphone use {@link ForMicStream} instead.
     */
    public static ForStream(stream: MediaStream): RealtimeAudioMeter | null {
        try {
            return RealtimeAudioMeter.buildStreamMeter(stream, []);
        } catch {
            return null;
        }
    }

    /**
     * Meters the LOCAL microphone. Identical to {@link ForStream} EXCEPT it taps a CLONE of the mic's
     * audio track(s), not the track(s) themselves.
     *
     * Why the clone matters: the WebRTC realtime drivers add the mic track to an `RTCPeerConnection`
     * (`pc.addTrack`). Once a local track feeds the WebRTC pipeline, Chromium reads pure SILENCE from a
     * parallel `MediaStreamAudioSourceNode` over the SAME track — so the "Listening" meter never moves
     * while the user speaks even though the mic is live. A cloned track is independent of the PC sender
     * and meters reliably; it is stopped in {@link Close}. Harmless for the WS drivers (the clone is just
     * an extra short-lived track). Returns `null` when Web Audio / the stream has no usable audio track.
     */
    public static ForMicStream(stream: MediaStream): RealtimeAudioMeter | null {
        try {
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                return null;
            }
            const clones = audioTracks.map((t) => t.clone());
            return RealtimeAudioMeter.buildStreamMeter(new MediaStream(clones), clones);
        } catch {
            return null;
        }
    }

    /**
     * Meters a node inside an EXISTING graph (e.g. {@link RealtimePcmPlayback}'s master
     * gain). The caller keeps ownership of the context — {@link Close} only disconnects
     * the analyser. Returns `null` when the analyser can't be created.
     */
    public static ForContextNode(context: AudioContext, source: AudioNode): RealtimeAudioMeter | null {
        try {
            const analyser = RealtimeAudioMeter.createAnalyser(context);
            source.connect(analyser);
            return new RealtimeAudioMeter(analyser, null);
        } catch {
            return null;
        }
    }

    private static createAnalyser(context: AudioContext): AnalyserNode {
        const analyser = context.createAnalyser();
        analyser.fftSize = 256; // 128 frequency bins — plenty for a 9-bar EQ, cheap to read
        analyser.smoothingTimeConstant = 0.55;
        return analyser;
    }

    /** @inheritdoc */
    public Level(): number {
        if (this.closed) {
            return 0;
        }
        this.analyser.getByteTimeDomainData(this.timeDomain);
        return ComputeRmsLevel(this.timeDomain);
    }

    /** @inheritdoc */
    public Bins(count: number = REALTIME_AUDIO_BIN_COUNT): number[] {
        if (this.closed) {
            return new Array<number>(count).fill(0);
        }
        this.analyser.getByteFrequencyData(this.frequency);
        return BucketizeFrequencyData(this.frequency, count);
    }

    /** @inheritdoc */
    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        try {
            this.analyser.disconnect();
        } catch {
            /* already disconnected */
        }
        // Stop any cloned tracks this meter owns (mic-meter clones) so they don't linger.
        for (const track of this.ownedTracks) {
            try {
                track.stop();
            } catch {
                /* already stopped */
            }
        }
        if (this.ownedContext) {
            void this.ownedContext.close();
        }
    }
}
