import { Pcm16ToFloat32 } from './pcmUtils';
import { IRealtimeAudioMeter, RealtimeAudioMeter } from './audioMeter';
import { MediaElementAudioRouter } from './mediaElementAudioRouter';

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
    /**
     * OPTIONAL: the agent's output audio as a `MediaStream`, so a host can mix the agent voice
     * into a recording (issue #5153). Mirrors what WebRTC drivers get from the peer connection.
     * Optional so test fakes and environments without `MediaStreamAudioDestinationNode` stay
     * valid; callers use `playback.GetOutputStream?.() ?? null`.
     */
    GetOutputStream?(): MediaStream | null;
    /**
     * OPTIONAL: plays a media element's audio through this engine's output, so the agent meter
     * ({@link CreateMeter}) and the recording stream ({@link GetOutputStream}) carry it as they
     * carry PCM: an avatar's voice is in its video. Once per element for each engine; later calls
     * for the same element do nothing. An element shown in an earlier call works again in the
     * next. Optional so test fakes stay valid; callers use `playback.ConnectMediaElement?.(element)`.
     */
    ConnectMediaElement?(element: HTMLMediaElement): void;
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
     * Second sink fed by {@link masterGain} (alongside the speakers) that exposes the agent
     * audio as a `MediaStream`. Null where the context lacks `createMediaStreamDestination`.
     */
    private outputDestination: MediaStreamAudioDestinationNode | null = null;
    /** The absolute context time up to which audio has been scheduled. */
    private playheadTime = 0;
    /** Sources scheduled and not yet ended (so Flush can stop them). */
    private activeSources = new Set<AudioBufferSourceNode>();
    /** Elements {@link ConnectMediaElement} has taken in (or tried to), so each is taken in once. */
    private connectedElements = new WeakSet<HTMLMediaElement>();

    /**
     * @param sampleRate The PCM16 sample rate (Hz) of the chunks this engine will play
     *   (e.g. 24000 for Gemini Live, the negotiated `agent_output_audio_format` rate for
     *   ElevenLabs).
     */
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.context = new AudioContext({ sampleRate });
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        // Created eagerly so GetOutputStream stays a pure read. The feature-check covers older
        // environments where the node does not exist (recording then stays mic-only).
        if (typeof this.context.createMediaStreamDestination === 'function') {
            // Recording is best-effort and must never fail the call: a throw here would
            // propagate out of the driver's Connect and kill the voice session over a tap.
            try {
                const destination = this.context.createMediaStreamDestination();
                this.masterGain.connect(destination);
                this.outputDestination = destination;
            } catch (error) {
                console.warn(
                    '[RealtimePcmPlayback] Could not create the recording tap — agent audio will not be recordable this session:',
                    error
                );
            }
        }
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
    public CreateMeter(): IRealtimeAudioMeter | null {
        return RealtimeAudioMeter.ForContextNode(this.context, this.masterGain);
    }

    /**
     * The agent's output audio as a `MediaStream`, or `null` when unsupported. Hosts mix this
     * into a recording: WebRTC drivers get the agent voice from the peer connection, PCM
     * drivers (which play through Web Audio) must expose it from here. The stream lives on
     * this engine's own (e.g. 24 kHz) context, so consumers wrap it in a source node on THEIR
     * context rather than reusing this one.
     */
    public GetOutputStream(): MediaStream | null {
        return this.outputDestination?.stream ?? null;
    }

    /**
     * Takes a media element's audio into the master gain, beside the PCM sources: the speakers,
     * the meter and the recording tap then carry it. The audio arrives as the element's stream
     * from the page's {@link MediaElementAudioRouter}, which connects the element to Web Audio
     * once per page (a browser allows that once per element, ever), so the next call that shows
     * the same element takes its voice too. Once per element for this engine. When the router
     * can't route the element, it logs why; a failure here is logged too, never thrown: the call
     * goes on without that element's voice.
     */
    public ConnectMediaElement(element: HTMLMediaElement): void {
        if (this.connectedElements.has(element)) {
            return;
        }
        this.connectedElements.add(element);
        const stream = MediaElementAudioRouter.Instance.StreamFor(element);
        if (!stream) {
            return;
        }
        try {
            this.context.createMediaStreamSource(stream).connect(this.masterGain);
        } catch (error) {
            console.warn('[RealtimePcmPlayback] Could not take the media element\'s audio into the agent audio; the speakers, the meter and the recording miss its voice:', error);
        }
    }

    /** @inheritdoc */
    public Close(): void {
        this.Flush();
        void this.context.close();
    }
}
