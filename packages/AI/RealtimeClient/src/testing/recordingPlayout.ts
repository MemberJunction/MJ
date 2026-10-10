/**
 * @fileoverview The kit's recorders: a video player and a PCM playback that play nothing and write down, in order, what
 * the driver did with them. A harness wires them into the driver's creation seams, so the kit checks the driver's
 * obligations to the avatar's video and voice whatever decodes them in a browser.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import type { RealtimeVideoFrame } from '@memberjunction/ai';
import type { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import type { MediaVideoSource } from '../media/model';
import type { IPlaybackClock } from '../media/playbackClock';
import type { IAvatarVideoPlayout, VideoPlayoutOptions, VideoPlayoutProblem } from '../media/videoPlayout';
import { RealtimeVideoConformanceTimeline } from './conformanceTimeline';

/**
 * A video player that records what the driver does with it: each frame appended, each end of turn, flush and dispose.
 *
 * `IsPlaying` models the element: true once a piece is appended, false after a flush, a dispose or
 * {@link FinishPlaying}. An end of turn leaves it playing (the element plays out what it has). `FramesAhead` models the
 * playhead the same way: every frame appended since the last flush, dispose or {@link FinishPlaying} is still to play.
 */
export class RecordingVideoPlayout implements IAvatarVideoPlayout {
    /** The video to show. The same object every time, so a check can tell this player's video from another's. */
    public readonly Source: MediaVideoSource = { Kind: 'element', Attach: () => () => undefined };
    private carriesVoice: boolean;
    private playing = false;
    private framesAhead = 0;

    /**
     * @param Options What the driver created the player with.
     * @param Timeline Where the player records; a timeline of its own when absent.
     * @param Index This player's number in its session, from 0.
     */
    constructor(
        public readonly Options: VideoPlayoutOptions,
        public readonly Timeline: RealtimeVideoConformanceTimeline = new RealtimeVideoConformanceTimeline(),
        public readonly Index: number = 0
    ) {
        this.carriesVoice = Options.CarriesVoice ?? true;
        Timeline.Record({ Kind: 'player-created', Player: Index, Options });
    }

    /** Whether the player plays forward with media buffered ahead of its playhead. */
    public get IsPlaying(): boolean {
        return this.playing;
    }

    /** How many of the frames appended are still to play: those since the last flush, dispose or {@link FinishPlaying}. */
    public get FramesAhead(): number {
        return this.framesAhead;
    }

    /** Whether the player plays the video's audio; `false` mutes it. Each change is recorded. */
    public get CarriesVoice(): boolean {
        return this.carriesVoice;
    }
    public set CarriesVoice(value: boolean) {
        this.carriesVoice = value;
        this.Timeline.Record({ Kind: 'player-carries-voice', Player: this.Index, CarriesVoice: value });
    }

    /** Records the frame; the player now plays, and the frame is still to play. */
    public Append(frame: RealtimeVideoFrame): void {
        this.Timeline.Record({ Kind: 'player-append', Player: this.Index, Frame: frame });
        this.playing = true;
        this.framesAhead++;
    }

    /** Records the end of the turn's video. */
    public EndOfTurn(): void {
        this.Timeline.Record({ Kind: 'player-end-of-turn', Player: this.Index });
    }

    /** Records the flush; the player stops, and drops every frame still to play. */
    public Flush(): void {
        this.Timeline.Record({ Kind: 'player-flush', Player: this.Index });
        this.playing = false;
        this.framesAhead = 0;
    }

    /** The recorder reports no problems: it plays nothing. Returns the function that removes the handler. */
    public OnProblem(_handler: (problem: VideoPlayoutProblem, message: string) => void): () => void {
        return () => undefined;
    }

    /** Records the dispose; the player stops, with nothing left to play. */
    public Dispose(): void {
        this.Timeline.Record({ Kind: 'player-dispose', Player: this.Index });
        this.playing = false;
        this.framesAhead = 0;
    }

    /** Models the element reaching the end of what it was given: it stops playing, every frame played. Not recorded. */
    public FinishPlaying(): void {
        this.playing = false;
        this.framesAhead = 0;
    }
}

/**
 * A PCM playback that records what the driver queues and flushes. `IsPlaying` is true once PCM is queued, false after a
 * flush, a close or {@link FinishPlaying}.
 *
 * It is also a playback clock, as `RealtimePcmPlayback` is, so a driver can hand it to its video player as
 * `VideoPlayoutOptions.Clock`. It plays nothing, so its clock is a model: {@link CurrentTimeMs} reads the media time of the
 * last chunk queued with one, as if that chunk were being heard, and `null` before one, after an untimed chunk and once
 * the voice stops.
 */
export class RecordingPcmPlayback implements IRealtimePcmPlayback, IPlaybackClock {
    private playing = false;
    private heardMs: number | null = null;

    /** @param Timeline Where the playback records; a timeline of its own when absent. */
    constructor(public readonly Timeline: RealtimeVideoConformanceTimeline = new RealtimeVideoConformanceTimeline()) {}

    /** Whether queued PCM is playing. */
    public get IsPlaying(): boolean {
        return this.playing;
    }

    /** The media time (ms) of the voice heard now, as the recorder models it; `null` while no timed voice plays. */
    public get CurrentTimeMs(): number | null {
        return this.playing ? this.heardMs : null;
    }

    /** Records the chunk and its media time; the voice now plays. */
    public Enqueue(pcm16: ArrayBuffer, mediaTimeMs?: number): void {
        const timed = typeof mediaTimeMs === 'number';
        this.Timeline.Record(timed ? { Kind: 'voice-enqueue', Data: pcm16, MediaTimeMs: mediaTimeMs } : { Kind: 'voice-enqueue', Data: pcm16 });
        this.heardMs = timed ? mediaTimeMs : null;
        this.playing = true;
    }

    /** Records the flush; the voice stops. */
    public Flush(): void {
        this.Timeline.Record({ Kind: 'voice-flush' });
        this.playing = false;
    }

    /** Records the close; the voice stops. */
    public Close(): void {
        this.Timeline.Record({ Kind: 'voice-close' });
        this.playing = false;
    }

    /** Models the queued PCM running out: the voice stops. Not recorded. */
    public FinishPlaying(): void {
        this.playing = false;
    }
}
