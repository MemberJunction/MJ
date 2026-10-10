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
 *
 * The second half of the file is the SMOOTHING every meter display shares, also pure: a noise gate
 * ({@link GateAudioLevel}), the attack/decay step ({@link SmoothAudioLevel}, {@link SmoothAudioBars}),
 * bars synthesized from a level for sources with no spectrum ({@link SynthesizeAudioBars}), and
 * {@link AudioLevelSmoother}, which puts them together for one source. Each display passes its own attack
 * and decay, so unifying the code changed nothing on screen.
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

// ── Smoothing: the pure math every meter display shares ─────────────────────────────────────

/** Attack the call overlay uses: how far a rising level moves toward its target in one step. */
export const DEFAULT_AUDIO_ATTACK = 0.5;

/** Decay the call overlay uses: how far a falling level moves toward its target in one step. */
export const DEFAULT_AUDIO_DECAY = 0.12;

/**
 * Soft-knee noise gate: a level at or below `gate` is silence (0); above it, the rest of the range rescales
 * to 0..1, so the gate never visibly clips the bottom off real speech. Pure.
 */
export function GateAudioLevel(level: number, gate: number): number {
    if (!Number.isFinite(level) || level <= gate) {
        return 0;
    }
    return Math.min(1, (level - gate) / (1 - gate));
}

/**
 * One smoothing step from `previous` toward `next`: by `attack` while rising, so speech onset reads at once,
 * and by `decay` while falling, so the level rings down instead of snapping shut. Clamped to 0..1. Pure.
 */
export function SmoothAudioLevel(previous: number, next: number, attack: number = DEFAULT_AUDIO_ATTACK, decay: number = DEFAULT_AUDIO_DECAY): number {
    const factor = next > previous ? attack : decay;
    return Math.min(1, Math.max(0, previous + (next - previous) * factor));
}

/**
 * One smoothing step for every bar: toward its target, or toward silence when there is no target. Pure.
 *
 * @param previous The bars now.
 * @param target The bars to move toward (a missing entry counts as 0), or `null` to fall toward silence.
 */
export function SmoothAudioBars(
    previous: readonly number[],
    target: readonly number[] | null,
    attack: number = DEFAULT_AUDIO_ATTACK,
    decay: number = DEFAULT_AUDIO_DECAY
): number[] {
    return previous.map((bar, i) => SmoothAudioLevel(bar, target?.[i] ?? 0, attack, decay));
}

/**
 * Bars for a source that reports only a level, such as a LiveKit participant: center bars taller than the
 * edges, with a little per-bar variation so they don't move in lockstep. Pure.
 */
export function SynthesizeAudioBars(level: number, count: number): number[] {
    const center = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => {
        const distance = center > 0 ? Math.abs(i - center) / center : 0;
        const shape = 1 - distance * 0.55;
        const variation = 0.85 + 0.15 * Math.sin(i * 1.7 + level * 6);
        return level * shape * variation;
    });
}

export interface AudioLevelSmootherOptions {
    /** How many bars each frame carries. */
    BarCount: number;
    /** See {@link SmoothAudioLevel}. Defaults to {@link DEFAULT_AUDIO_ATTACK}. */
    Attack?: number;
    /** See {@link SmoothAudioLevel}. Defaults to {@link DEFAULT_AUDIO_DECAY}. */
    Decay?: number;
    /** A smoothed level below this reads as silence: the frame's level is 0 and the bars fall. Defaults to 0. */
    SilenceFloor?: number;
}

/** One smoothed frame for a level display. */
export interface AudioLevelFrame {
    /** The smoothed level, 0..1; 0 while silent. */
    Level: number;
    /** The smoothed bars, each 0..1. */
    Bars: number[];
    /** Whether the smoothed level is under the silence floor. */
    IsSilent: boolean;
}

/**
 * Smooths one audio source for display. Feed it the latest level (0..1) each animation frame, with the
 * source's spectrum bars when it has them (an analyser tap); without them, bars are synthesized from the
 * level ({@link SynthesizeAudioBars}). Pure: no Web Audio, no clock.
 */
export class AudioLevelSmoother {
    private level = 0;
    private bars: number[];

    constructor(private readonly options: AudioLevelSmootherOptions) {
        this.bars = new Array<number>(options.BarCount).fill(0);
    }

    /**
     * Folds in the latest level, and the source's spectrum bars when it has them.
     *
     * @param level The latest raw level, 0..1 (clamped).
     * @param spectrum The source's current spectrum bars, or nothing to synthesize bars from the level.
     */
    public Next(level: number, spectrum?: readonly number[] | null): AudioLevelFrame {
        const attack = this.options.Attack ?? DEFAULT_AUDIO_ATTACK;
        const decay = this.options.Decay ?? DEFAULT_AUDIO_DECAY;
        this.level = SmoothAudioLevel(this.level, Math.max(0, Math.min(1, level)), attack, decay);
        const isSilent = this.level < (this.options.SilenceFloor ?? 0);
        const target = isSilent ? null : (spectrum ?? SynthesizeAudioBars(this.level, this.options.BarCount));
        this.bars = SmoothAudioBars(this.bars, target, attack, decay);
        return { Level: isSilent ? 0 : this.level, Bars: [...this.bars], IsSilent: isSilent };
    }

    /** Returns to silence. */
    public Reset(): void {
        this.level = 0;
        this.bars = new Array<number>(this.options.BarCount).fill(0);
    }
}
