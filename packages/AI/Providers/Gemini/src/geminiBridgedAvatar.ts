/**
 * @fileoverview The avatar half of a server-side (bridged) Gemini Live session whose host publishes the avatar into a
 * meeting room: where each model part goes, what each turn boundary does, and how many seconds of avatar video the
 * session generated.
 *
 * - **Parts.** A `video/*` part is a piece of the avatar's fragmented MP4 and goes to the host. A part with no MIME type
 *   is the avatar's when it opens with an MP4 box (`ftyp`, `moof`, `styp`), PCM otherwise. A PCM part plays as the voice
 *   only while the turn has no video yet: the MP4's audio track carries the voice, so later PCM in the turn would play
 *   it twice and is dropped (reported once). Any other type is dropped and reported once.
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

import { Fmp4VideoSeconds, IsPcmAudioMimeType, ReadFmp4Init, SniffFmp4Piece, type Fmp4Init, type RealtimeAvatarMediaChunk } from '@memberjunction/ai';

/** The MIME type of the avatar's pieces when a part names none. */
const AVATAR_PIECE_MIME_TYPE = 'video/mp4';

/** Where a bridged avatar session's media and usage go. */
export interface GeminiBridgedAvatarSinks {
    /** A piece of the avatar's fragmented MP4, in the order the model sent it. */
    OnAvatar(chunk: RealtimeAvatarMediaChunk): void;
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
            this.acceptAvatar(mimeType?.trim() || AVATAR_PIECE_MIME_TYPE, data);
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

    private static kindOf(mimeType: string | undefined, data: ArrayBuffer): BridgedPartKind {
        if (!mimeType?.trim()) {
            return SniffFmp4Piece(data) ? 'avatar' : 'voice';
        }
        if (/^video\//i.test(mimeType.trim())) {
            return 'avatar';
        }
        return IsPcmAudioMimeType(mimeType) ? 'voice' : 'other';
    }

    /** Counts the piece's video seconds (before the host may take the buffer), then hands it on. */
    private acceptAvatar(mimeType: string, data: ArrayBuffer): void {
        const kind = SniffFmp4Piece(data);
        if (kind === 'init') {
            this.init = ReadFmp4Init(data) ?? this.init;
        } else if (kind === 'fragment' && !this.turn.GenerationEnded && this.init) {
            this.pendingVideoSeconds += Fmp4VideoSeconds(data, this.init) ?? 0;
        }
        this.turn.HasVideo = true;
        this.sinks.OnAvatar({ Data: data, MimeType: mimeType });
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
