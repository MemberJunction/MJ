/**
 * @fileoverview When each frame of an agent's avatar is shown: the voice is the master clock, and a frame is due when the
 * voice's playout reaches the frame's own timestamp (`tfdt`), never by arrival order. Google's avatar starts its video
 * 85 ms after its audio (the AAC priming), so placing frames by arrival puts the face that far off the voice.
 *
 * - **Where audio plays.** The bot's voice track plays one queue of audio. Every decoded piece of the avatar's voice is
 *   anchored where it entered that queue ({@link AvatarMediaClock.NoteAudio}): the audio at stream time `Time` plays once
 *   `EnqueuedMs` of the queue has played. Contiguous pieces extend their anchor; a gap in the stream's time, or other
 *   audio queued in between, starts a new one.
 * - **Epochs.** A barge-in resets the clock: what was decoded before plays nowhere, and its frames are stale. A new init
 *   segment, or a timestamp that goes backwards (a new turn restarting its times), starts a new segment of the timeline;
 *   frames are matched only to audio of the same epoch, and earlier segments still play out.
 * - **Frames without audio.** A frame whose epoch has had no audio for {@link AVATAR_AUDIO_WAIT_LIMIT_MS}, or that lies
 *   more than {@link AVATAR_IDLE_GAP_S} past the last audio (idle frames between turns, if Google sends any), is not tied
 *   to the voice: the publisher paces it by its own timestamps.
 *
 * Pure: no timers and no media, so every rule is tested directly.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

/** How long frames may wait for the first audio of their epoch (ms) before they are paced without it. */
export const AVATAR_AUDIO_WAIT_LIMIT_MS = 500;

/** How far past the last queued audio (s) a frame counts as idle video rather than video waiting for its audio. */
export const AVATAR_IDLE_GAP_S = 0.5;

/** How far apart two audio pieces may be (s) and still be one contiguous run: under a sample at 8 kHz. */
const CONTIGUOUS_TOLERANCE_S = 0.0001;

/** Room for this many timestamp segments in one generation's epoch numbers. */
const SEGMENTS_PER_GENERATION = 1_000_000;

/** How many audio runs the clock remembers: a turn is usually one run, so this covers many turns of queued frames. */
const MAX_ANCHORS = 64;

/** What the clock says about one frame. */
export type AvatarFrameTiming =
    /** From before the last reset (a barge-in or a new stream): never shown. */
    | { Kind: 'stale' }
    /** Due once the voice has played `DueAtPlayedMs` of its queue. */
    | { Kind: 'synced'; DueAtPlayedMs: number }
    /** Its audio is not queued yet: it waits. */
    | { Kind: 'waiting' }
    /** No audio will come for it: shown at the pace of its own timestamps. */
    | { Kind: 'unsynced' };

/** Where a run of contiguous audio entered the voice queue. */
interface AudioAnchor {
    Epoch: number;
    /** The run's first stream time (s). */
    Time: number;
    /** The run's end on the stream's timeline (s). */
    EndTime: number;
    /** How much audio the queue had taken before the run (ms): the run's first sample plays once this much has played. */
    EnqueuedMs: number;
}

/** One track's position on its timeline, to see a timestamp go backwards. */
interface TrackTimeline {
    Segment: number;
    LastTime: number | null;
}

/** Places an avatar's frames against its voice's playout. One per avatar stream. */
export class AvatarMediaClock {
    private generation = 0;
    private anchors: AudioAnchor[] = [];
    private audio: TrackTimeline = { Segment: 0, LastTime: null };
    private video: TrackTimeline = { Segment: 0, LastTime: null };

    /**
     * @param leadMs How much earlier than its audio a frame is shown, to make up for the video path's longer encode and
     *   jitter buffer in the room. 0 until a live run measures it.
     */
    constructor(private readonly leadMs = 0) {}

    /** A barge-in: everything decoded before is stale, and the timelines start over. */
    public Reset(): void {
        this.generation++;
        this.anchors = [];
        this.audio = { Segment: 0, LastTime: null };
        this.video = { Segment: 0, LastTime: null };
    }

    /**
     * A new init segment: what comes next is a new stream, whose times may start over. Both tracks move to a new segment;
     * what was decoded before still plays (a turn's tail keeps its frames while the next turn's stream begins).
     */
    public NewStream(): void {
        this.audio = { Segment: this.audio.Segment + 1, LastTime: null };
        this.video = { Segment: this.video.Segment + 1, LastTime: null };
    }

    /**
     * The epoch a sample belongs to, from its track and stream time: the current generation, and a new segment whenever
     * the track's time goes backwards.
     *
     * @param kind The sample's track.
     * @param time Its presentation time (s).
     */
    public EpochFor(kind: 'audio' | 'video', time: number): number {
        const timeline = kind === 'audio' ? this.audio : this.video;
        if (timeline.LastTime !== null && time < timeline.LastTime) {
            timeline.Segment++;
        }
        timeline.LastTime = time;
        return this.generation * SEGMENTS_PER_GENERATION + timeline.Segment;
    }

    /**
     * Records that a piece of the avatar's voice entered the voice queue: its stream time and length, and how much the
     * queue had taken before it. Stale pieces are ignored (the caller does not queue them).
     *
     * @param epoch The piece's epoch.
     * @param time Its stream time (s).
     * @param durationS Its length (s).
     * @param enqueuedMs The queue's total before it (ms).
     */
    public NoteAudio(epoch: number, time: number, durationS: number, enqueuedMs: number): void {
        const last = this.anchors[this.anchors.length - 1];
        const contiguous =
            last !== undefined &&
            last.Epoch === epoch &&
            Math.abs(time - last.EndTime) < CONTIGUOUS_TOLERANCE_S &&
            Math.abs(enqueuedMs - (last.EnqueuedMs + (last.EndTime - last.Time) * 1000)) < 1;
        if (contiguous) {
            last.EndTime = time + durationS;
            return;
        }
        this.anchors.push({ Epoch: epoch, Time: time, EndTime: time + durationS, EnqueuedMs: enqueuedMs });
        if (this.anchors.length > MAX_ANCHORS) {
            this.anchors.shift();
        }
    }

    /** Whether a piece of this epoch is stale (decoded before the last reset). */
    public IsStale(epoch: number): boolean {
        return Math.floor(epoch / SEGMENTS_PER_GENERATION) < this.generation;
    }

    /**
     * When a frame is due.
     *
     * @param epoch The frame's epoch.
     * @param time Its presentation time (s).
     * @param waitedMs How long it has waited since it was decoded (ms).
     */
    public Timing(epoch: number, time: number, waitedMs: number): AvatarFrameTiming {
        if (this.IsStale(epoch)) {
            return { Kind: 'stale' };
        }
        const runs = this.anchors.filter((a) => a.Epoch === epoch);
        if (runs.length === 0) {
            return waitedMs >= AVATAR_AUDIO_WAIT_LIMIT_MS ? { Kind: 'unsynced' } : { Kind: 'waiting' };
        }
        if (time > runs[runs.length - 1].EndTime + AVATAR_IDLE_GAP_S) {
            return { Kind: 'unsynced' };
        }
        const anchor = [...runs].reverse().find((a) => a.Time <= time) ?? runs[0];
        return { Kind: 'synced', DueAtPlayedMs: anchor.EnqueuedMs + (time - anchor.Time) * 1000 - this.leadMs };
    }
}
