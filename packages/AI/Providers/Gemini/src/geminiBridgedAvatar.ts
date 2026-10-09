/**
 * @fileoverview The avatar half of a server-side (bridged) Gemini Live session whose host publishes the avatar into a
 * meeting room: where each model part goes, what each turn boundary does, and how many seconds of avatar video the
 * session generated.
 *
 * - **Parts.** A part that opens with an MP4 box (`ftyp`, `moov`, `moof`, `styp`) is a piece of the avatar's fragmented
 *   MP4 whatever MIME type it names, and so is a `video/*` part. Each goes to the host as a `RealtimeVideoFrame` (Core's
 *   `Fmp4PieceToVideoFrame`: init or fragment, with its time and key-frame flag) typed `video/mp4`, keeping a `video/mp4`
 *   type's codecs, which is what the room's bridge publishes. A `video/*` part that is neither labelled `video/mp4` nor
 *   opens with an MP4 box is dropped and reported once per type. A part with no MIME type that is not MP4 is PCM. A PCM
 *   part plays as the voice only while the turn has no video yet: the MP4's audio track carries the voice, so later PCM
 *   in the turn would play it twice and is dropped (reported once). Any other part is dropped and reported once per
 *   type: unknown data never plays.
 * - **Turns.** From `interrupted` until that turn's `turnComplete`, media parts are dropped (Google sends
 *   `interrupted` before `turn_complete`; anything in between is stale after the barge-in).
 * - **Usage.** The seconds of avatar video generated in a turn (its video samples' durations, read from the fragments)
 *   are reported as deltas at the turn's end: `generationComplete`, `interrupted`, `turnComplete`, a resume, or the
 *   session's close. Video after `generationComplete` is forwarded (idle frames, if Google sends any) but not counted;
 *   an interrupted turn counts what arrived before the interruption.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */

import {
    Fmp4PieceToVideoFrame,
    Fmp4VideoSeconds,
    IsPcmAudioMimeType,
    ReadFmp4Init,
    SniffFmp4Piece,
    type Fmp4Init,
    type RealtimeVideoFrame,
} from '@memberjunction/ai';

/** Where a bridged avatar session's media and usage go. */
export interface GeminiBridgedAvatarSinks {
    /** A piece of the avatar's fragmented MP4 as a frame, in the order the model sent it. */
    OnVideoFrame(frame: RealtimeVideoFrame): void;
    /** PCM voice: a turn's audio before any of its video arrived. */
    OnPcm(pcm: ArrayBuffer): void;
    /** Seconds of avatar video generated since the last report (a delta, never a total). */
    OnVideoSeconds(seconds: number): void;
    /** One line about a part that was dropped; called once per kind of drop. */
    Report(message: string): void;
}

/** What the current turn has done so far. */
interface BridgedAvatarTurn {
    /** A piece of the avatar arrived in this turn: later PCM would double the voice. */
    HasVideo: boolean;
    /** `generationComplete` ended the turn's generation: later video (idle frames, if any) is not counted. */
    GenerationEnded: boolean;
    /** From `interrupted` until this turn's `turnComplete`: media parts are dropped. */
    Dropping: boolean;
}

/** How a part plays: as a piece of the avatar, as PCM voice, or not at all. */
type BridgedPartKind = 'avatar' | 'voice' | 'other';

function newTurn(): BridgedAvatarTurn {
    return { HasVideo: false, GenerationEnded: false, Dropping: false };
}

/**
 * Routes a granted bridged avatar session's model parts to the host (avatar pieces) and the session's audio output
 * (PCM before the turn's first video), applies each turn boundary, and reports the avatar video seconds generated.
 * The Gemini session creates one when the driver granted an avatar to a host that publishes it into a room.
 */
export class GeminiBridgedAvatarOutput {
    private readonly reported = new Set<string>();
    private turn: BridgedAvatarTurn = newTurn();
    /** The stream's latest readable init segment: its tracks and timescales let the fragments' durations be read. */
    private init: Fmp4Init | null = null;
    /** Avatar video seconds counted and not yet reported. */
    private pendingVideoSeconds = 0;

    /** @param sinks Where the media, the voice, the usage and the drop reports go. */
    constructor(private readonly sinks: GeminiBridgedAvatarSinks) {}

    /**
     * Plays one model part, or drops it.
     *
     * @param mimeType The part's `inlineData.mimeType`, when it names one.
     * @param data The part's bytes.
     */
    public Accept(mimeType: string | undefined, data: ArrayBuffer): void {
        if (this.turn.Dropping) {
            return;
        }
        const kind = GeminiBridgedAvatarOutput.kindOf(mimeType, data);
        if (kind === 'avatar') {
            this.acceptAvatar(mimeType, data);
        } else if (kind === 'voice') {
            this.acceptVoice(data);
        } else {
            this.reportOnce(`type:${mimeType}`, `[GeminiRealtime] Dropped model output of type ${mimeType}: an avatar session in a meeting plays its MP4 avatar and PCM audio only.`);
        }
    }

    /** `generationComplete`: the turn's media is all in. Its avatar seconds are reported; later video is not counted. */
    public GenerationComplete(): void {
        this.reportVideoSeconds();
        this.turn.GenerationEnded = true;
    }

    /** `turnComplete`: reports what is still uncounted, ends a barge-in's drop window, and starts a new turn. */
    public TurnComplete(): void {
        this.reportVideoSeconds();
        this.turn = newTurn();
    }

    /** `interrupted`: the turn counts what arrived; its late parts are dropped (and not counted) until its `turnComplete`. */
    public Interrupted(): void {
        this.reportVideoSeconds();
        this.turn.Dropping = true;
    }

    /** The session resumed on a new connection, where a turn the drop cut off never completes: a new turn starts. */
    public Resumed(): void {
        this.reportVideoSeconds();
        this.turn = newTurn();
    }

    /** The session is closing: what was generated and not yet reported is reported now. */
    public Close(): void {
        this.reportVideoSeconds();
    }

    /**
     * How a part plays. Its bytes decide first: a part that opens with an MP4 box is the avatar's whatever type it names,
     * since Google does not document the type of avatar parts. Then its type: none means PCM; a `video/*` type is the
     * avatar's (a `video/mp4` piece may start inside a box; any other video type that isn't MP4 is then dropped); a PCM
     * type is the voice; anything else never plays.
     */
    private static kindOf(mimeType: string | undefined, data: ArrayBuffer): BridgedPartKind {
        if (SniffFmp4Piece(data)) {
            return 'avatar';
        }
        const type = mimeType?.trim() ?? '';
        if (type.length === 0) {
            return 'voice';
        }
        if (/^video\//i.test(type)) {
            return 'avatar';
        }
        return IsPcmAudioMimeType(type) ? 'voice' : 'other';
    }

    /**
     * Makes the piece a frame, counts its video seconds (before the host may take the buffer), then hands it on. The frame
     * is typed `video/mp4`, keeping the part's own type when it names `video/mp4` with its codecs: the room's bridge
     * publishes a piece as the avatar only when its type is `video/mp4`, and every piece of the stream is. A piece that
     * isn't MP4 is dropped, reported once per type.
     */
    private acceptAvatar(mimeType: string | undefined, data: ArrayBuffer): void {
        const frame = Fmp4PieceToVideoFrame(data, mimeType, this.init);
        if (!frame) {
            const message = `[GeminiRealtime] Dropped model output of type ${mimeType}: it is not fragmented MP4, the only video an avatar plays.`;
            this.reportOnce(`type:${mimeType}`, message);
            return;
        }
        if (frame.Piece === 'init') {
            this.init = ReadFmp4Init(data) ?? this.init;
        } else if (!this.turn.GenerationEnded && this.init) {
            this.pendingVideoSeconds += Fmp4VideoSeconds(data, this.init) ?? 0;
        }
        this.turn.HasVideo = true;
        this.sinks.OnVideoFrame(frame);
    }

    private acceptVoice(pcm: ArrayBuffer): void {
        if (this.turn.HasVideo) {
            this.reportOnce('pcm-with-video', '[GeminiRealtime] Dropped PCM audio in a turn whose avatar video carries the voice.');
            return;
        }
        this.sinks.OnPcm(pcm);
    }

    private reportVideoSeconds(): void {
        if (this.pendingVideoSeconds <= 0) {
            return;
        }
        const seconds = this.pendingVideoSeconds;
        this.pendingVideoSeconds = 0;
        this.sinks.OnVideoSeconds(seconds);
    }

    private reportOnce(key: string, message: string): void {
        if (!this.reported.has(key)) {
            this.reported.add(key);
            this.sinks.Report(message);
        }
    }
}
