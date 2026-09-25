import { Pcm16ToFloat32 } from './pcmUtils';
import { IRealtimeAudioMeter, RealtimeAudioMeter } from './audioMeter';

/**
 * The playback contract for a client-owned realtime audio plane: schedules raw PCM16 chunks
 * for gapless playout and reports whether audio is AUDIBLY playing. Production is
 * {@link RealtimePcmPlayback} (Web Audio, playhead-clock scheduling); tests inject a fake with
 * a controllable `IsPlaying`.
 *
 * Shared by every websocket driver whose audio plane is client-owned (Gemini Live, ElevenLabs
 * Agents) — WebRTC drivers (OpenAI) get playback from the peer connection instead and don't
 * use this.
 */
export interface IRealtimePcmPlayback {
    /** Schedules a raw PCM16 mono chunk back-to-back after any already-queued audio. */
    Enqueue(pcm16: ArrayBuffer): void;
    /** Stops + clears every scheduled source (barge-in / interruption). */
    Flush(): void;
    /**
     * Silences / restores what reaches the SPEAKER without touching the schedule: audio keeps
     * being enqueued and played out (so {@link IsPlaying} and any meter stay honest), the
     * listener just doesn't hear it. This is the local "speaker mute" — nothing about it is
     * visible to the provider.
     */
    SetMuted(muted: boolean): void;
    /** `true` while {@link SetMuted} has silenced the speaker. */
    readonly IsMuted: boolean;
    /** `true` while scheduled audio is audibly playing (playhead ahead of the context clock). */
    readonly IsPlaying: boolean;
    /** Flushes and releases the underlying audio context. */
    Close(): void;
    /**
     * OPTIONAL: creates an {@link IRealtimeAudioMeter} tapping this engine's output — the
     * AGENT-audio side of the call UI's audio-reactive visuals. Drivers feed it to
     * `BaseRealtimeClient`'s audio-activity surface. Optional so test fakes (and minimal
     * implementations) stay valid; callers use `playback.CreateMeter?.() ?? null`.
     */
    CreateMeter?(): IRealtimeAudioMeter | null;
}

/**
 * Web Audio playout scheduler for raw PCM16 model audio at a driver-supplied sample rate.
 *
 * Chunks are wrapped in `AudioBuffer`s and scheduled back-to-back against a **playhead clock**:
 * each chunk starts at `max(playheadTime, currentTime)` and advances the playhead by its
 * duration, producing gapless playout regardless of network jitter. {@link IsPlaying} is
 * computed directly from that clock — the playhead being ahead of `currentTime` (with live
 * sources) means audio is audibly coming out of the speaker. On interruption, {@link Flush}
 * stops every scheduled source and rewinds the playhead.
 *
 * Generalized from the Gemini driver's original 24 kHz-fixed engine: the sample rate is now a
 * constructor parameter so providers that negotiate their output format at session start
 * (e.g. ElevenLabs' `agent_output_audio_format`) can construct the playout engine with the
 * negotiated rate.
 */
export class RealtimePcmPlayback implements IRealtimePcmPlayback {
    private context: AudioContext;
    private sampleRate: number;
    /**
     * Master gain every source routes through (instead of the destination directly) —
     * the single tap point {@link CreateMeter} analyses without altering the audio path.
     */
    private masterGain: GainNode;
    /**
     * The speaker-mute stage, DOWNSTREAM of {@link masterGain}: `masterGain → outputGain →
     * destination`. Muting drives this gain to 0, so the meter tapped at `masterGain` keeps
     * seeing the agent's voice (the call UI's audio-reactive visuals stay alive) while the
     * listener hears nothing.
     */
    private outputGain: GainNode;
    private muted = false;
    /** The absolute context time up to which audio has been scheduled. */
    private playheadTime = 0;
    /** Sources scheduled and not yet ended (so Flush can stop them). */
    private activeSources = new Set<AudioBufferSourceNode>();

    /**
     * @param sampleRate The PCM16 sample rate (Hz) of the chunks this engine will play
     *   (e.g. 24000 for Gemini Live, the negotiated `agent_output_audio_format` rate for
     *   ElevenLabs).
     */
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.context = new AudioContext({ sampleRate });
        this.masterGain = this.context.createGain();
        this.outputGain = this.context.createGain();
        this.masterGain.connect(this.outputGain);
        this.outputGain.connect(this.context.destination);
    }

    /** @inheritdoc */
    public Enqueue(pcm16: ArrayBuffer): void {
        const samples = Pcm16ToFloat32(pcm16);
        if (samples.length === 0) {
            return;
        }
        const buffer = this.context.createBuffer(1, samples.length, this.sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.masterGain);
        source.onended = () => this.activeSources.delete(source);
        this.activeSources.add(source);
        const startAt = Math.max(this.playheadTime, this.context.currentTime);
        source.start(startAt);
        this.playheadTime = startAt + buffer.duration;
    }

    /** @inheritdoc */
    public Flush(): void {
        for (const source of this.activeSources) {
            try {
                source.stop();
            } catch {
                /* source never started or already stopped — fine */
            }
        }
        this.activeSources.clear();
        this.playheadTime = 0;
    }

    /** @inheritdoc */
    public get IsPlaying(): boolean {
        return this.activeSources.size > 0 && this.playheadTime > this.context.currentTime;
    }

    /** @inheritdoc */
    public SetMuted(muted: boolean): void {
        this.muted = muted;
        this.outputGain.gain.value = muted ? 0 : 1;
    }

    /** @inheritdoc */
    public get IsMuted(): boolean {
        return this.muted;
    }

    /** @inheritdoc */
    public CreateMeter(): IRealtimeAudioMeter | null {
        return RealtimeAudioMeter.ForContextNode(this.context, this.masterGain);
    }

    /** @inheritdoc */
    public Close(): void {
        this.Flush();
        void this.context.close();
    }
}
