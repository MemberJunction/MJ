import { Pcm16ToFloat32 } from './pcmUtils';
import { IRealtimeAudioMeter, RealtimeAudioMeter } from './audioMeter';
import { MediaElementAudioRouter } from './mediaElementAudioRouter';
import type { IPlaybackClock } from '../media/playbackClock';

/** Played chunks are forgotten this long after they end, in seconds: longer than any output latency a clock subtracts. */
const ANCHOR_RETENTION_SECONDS = 2;

/** One scheduled chunk's place on the context's clock and on the stream's media timeline. */
interface ChunkAnchor {
    /** When it starts playing, in context time (seconds). */
    StartAt: number;
    /** How long it plays (seconds). */
    DurationS: number;
    /** Its first sample's media time (ms); `null` for untimed audio with no timed audio before it. */
    MediaMs: number | null;
}

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
    /**
     * Schedules a raw PCM16 mono chunk back-to-back after any already-queued audio.
     *
     * @param pcm16 The chunk.
     * @param mediaTimeMs Where the chunk starts on the stream's media timeline (ms), when the driver knows it: a playback
     *   that is also an `IPlaybackClock` then reads out the media time of the audio heard. A chunk without one continues
     *   the chunk before it.
     */
    Enqueue(pcm16: ArrayBuffer, mediaTimeMs?: number): void;
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
 * It is also the voice's **playback clock** ({@link IPlaybackClock}): each chunk enqueued with a media time keeps its
 * place on the context's clock, and {@link CurrentTimeMs} reads out the media time of the audio heard now (the context's
 * time less the output latency the browser reports). A video player given this clock shows each frame when the voice
 * reaches it.
 *
 * Generalized from the Gemini driver's original 24 kHz-fixed engine: the sample rate is now a
 * constructor parameter so providers that negotiate their output format at session start
 * (e.g. ElevenLabs' `agent_output_audio_format`) can construct the playout engine with the
 * negotiated rate.
 */
export class RealtimePcmPlayback implements IRealtimePcmPlayback, IPlaybackClock {
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
    /** Where each chunk scheduled and not long played sits on the context's clock and the media timeline, in order. */
    private anchors: ChunkAnchor[] = [];

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
    public Enqueue(pcm16: ArrayBuffer, mediaTimeMs?: number): void {
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
        this.anchor(startAt, buffer.duration, mediaTimeMs);
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
        this.anchors = [];
    }

    /**
     * The media time (ms) of the audio heard now: the context's time, less the output latency the browser reports
     * (`outputLatency` and `baseLatency`, where it has them), placed in the chunk playing then. `null` while nothing plays,
     * between chunks, or while the chunk playing carries no media time (untimed audio with no timed audio before it).
     */
    public get CurrentTimeMs(): number | null {
        const heard = this.context.currentTime - this.outputDelaySeconds();
        const playing = this.anchors.find((anchor) => anchor.StartAt <= heard && heard < anchor.StartAt + anchor.DurationS);
        if (!playing || playing.MediaMs === null) {
            return null;
        }
        return playing.MediaMs + (heard - playing.StartAt) * 1000;
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

    /**
     * Records where a chunk plays: its media time is the one given, else the end of the chunk before it, else `null`.
     * Chunks played more than {@link ANCHOR_RETENTION_SECONDS} ago are forgotten.
     */
    private anchor(startAt: number, durationS: number, mediaTimeMs: number | undefined): void {
        const previous = this.anchors[this.anchors.length - 1];
        const continued = previous && previous.MediaMs !== null ? previous.MediaMs + previous.DurationS * 1000 : null;
        const timed = typeof mediaTimeMs === 'number' && Number.isFinite(mediaTimeMs);
        this.anchors.push({ StartAt: startAt, DurationS: durationS, MediaMs: timed ? mediaTimeMs : continued });
        const forgetBefore = this.context.currentTime - ANCHOR_RETENTION_SECONDS;
        while (this.anchors.length > 1 && this.anchors[0].StartAt + this.anchors[0].DurationS < forgetBefore) {
            this.anchors.shift();
        }
    }

    /** How long audio takes from the context's clock to the speakers, in seconds, as far as the browser reports it. */
    private outputDelaySeconds(): number {
        const latency = (value: number | undefined): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
        return latency(this.context.outputLatency) + latency(this.context.baseLatency);
    }
}
