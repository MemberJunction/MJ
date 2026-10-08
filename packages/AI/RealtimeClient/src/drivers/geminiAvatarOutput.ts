/**
 * @fileoverview The avatar half of a Gemini Live browser session: where each model part goes once the server has granted
 * an avatar and the host shows it, and what each turn boundary does to the avatar's video and voice.
 *
 * - **Parts.** A `video/*` part goes to the video player. A PCM part follows the voice rule below. A part with no MIME
 *   type is video when it opens with an MP4 box (`ftyp`, `moof`, `styp`) and PCM otherwise. Any other type is dropped
 *   and reported once.
 * - **Who carries the voice.** The grant says whether the avatar's MP4 carries the voice (`audioMuxed`); the session's
 *   first readable init segment decides: an audio track means it does, none means the video plays muted and the voice
 *   comes as PCM. A disagreement with the grant is logged once.
 * - **The voice rule.** When the video carries the voice, a PCM part plays only while the turn has no video yet; the
 *   turn's first video part flushes the PCM the turn queued, and later PCM in that turn is dropped (reported once), so
 *   the voice never plays twice. Otherwise PCM always plays, not lip-synced to the video; one line per turn logs how far
 *   apart the two started.
 * - **Turns.** `generationComplete` ends the turn's video, so it plays to its true end and holds the last frame;
 *   `turnComplete` is the fallback. `interrupted` stops the video at once and drops the turn's late parts until its
 *   `turnComplete`. A resume lets a turn the drop cut off play out what arrived, without a flush.
 *
 * @module @memberjunction/ai-realtime-client
 */
import { IsPcmAudioMimeType, ReadFmp4Init, SniffFmp4Piece } from '@memberjunction/ai';
import type { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import type { MediaVideoSource } from '../media/model';
import type { IAvatarVideoPlayout } from '../media/videoPlayout';

/** The avatar block the server minted into the session config (`{ output: true, encoding, audioMuxed }`), as read. */
export interface GeminiAvatarGrant {
    /** The MSE type the model's profile names for the avatar, or `null` when it names none. */
    Encoding: string | null;
    /** Whether the profile says the avatar's MP4 carries the voice. */
    AudioMuxed: boolean;
}

/** What the current turn has done so far. */
interface AvatarTurn {
    /** A video part arrived in this turn. */
    HasVideo: boolean;
    /** PCM was queued in this turn. */
    HasVoice: boolean;
    /** The player was told this turn's media is all in, or a barge-in stopped it. */
    VideoEnded: boolean;
    /** From `interrupted` until this turn's `turnComplete`: media parts are dropped. */
    Dropping: boolean;
    /** When the turn's first PCM part arrived (epoch ms), for the separate-voice log. */
    VoiceStartedAt: number | null;
    /** When the turn's first video part arrived (epoch ms), for the separate-voice log. */
    VideoStartedAt: number | null;
}

/** How a part plays: as the avatar's video, as PCM voice, or not at all. */
type AvatarPartKind = 'video' | 'voice' | 'other';

function newTurn(): AvatarTurn {
    return { HasVideo: false, HasVoice: false, VideoEnded: false, Dropping: false, VoiceStartedAt: null, VideoStartedAt: null };
}

/**
 * Routes a Gemini Live avatar session's model parts to the avatar's video player and the session's PCM playback, and
 * applies each turn boundary to both. The Gemini client creates one at connect, only when the server granted an avatar
 * and the host established the outbound video track.
 */
export class GeminiAvatarOutput {
    private readonly reported = new Set<string>();
    private turn: AvatarTurn = newTurn();
    /** Whether the avatar's video carries the voice: the grant's word until the first readable init segment decides. */
    private videoCarriesVoice: boolean;
    private voiceDecided = false;

    /**
     * @param playout The avatar's video player, created with `CarriesVoice` from the grant.
     * @param voice The session's PCM playback.
     * @param grant What the server minted.
     */
    constructor(
        private readonly playout: IAvatarVideoPlayout,
        private readonly voice: IRealtimePcmPlayback,
        private readonly grant: GeminiAvatarGrant
    ) {
        this.videoCarriesVoice = grant.AudioMuxed;
    }

    /** The avatar's video, for the host. */
    public get Source(): MediaVideoSource {
        return this.playout.Source;
    }

    /** Whether the avatar's video plays with media buffered ahead of the playhead. */
    public get IsPlaying(): boolean {
        return this.playout.IsPlaying;
    }

    /**
     * Plays one model part, or drops it. Returns whether it plays, as video or as voice: the caller then counts the turn's
     * generation as started.
     *
     * @param mimeType The part's `inlineData.mimeType`, when it names one.
     * @param data The part's bytes.
     */
    public Accept(mimeType: string | undefined, data: ArrayBuffer): boolean {
        if (this.turn.Dropping) {
            return false;
        }
        const kind = GeminiAvatarOutput.kindOf(mimeType, data);
        if (kind === 'video') {
            this.acceptVideo(data);
            return true;
        }
        if (kind === 'voice') {
            return this.acceptVoice(data);
        }
        this.reportOnce(`type:${mimeType}`, `[GeminiRealtimeClient] Dropped model output of type ${mimeType}: an avatar session plays its video and PCM audio only.`);
        return false;
    }

    /** `generationComplete`: the turn's media is all in, so its video plays to the true end and holds the last frame. */
    public GenerationComplete(): void {
        this.endTurnVideo();
    }

    /** `turnComplete`: ends the turn's video if `generationComplete` didn't, ends a barge-in's drop window, starts a new turn. */
    public TurnComplete(): void {
        this.endTurnVideo();
        this.turn = newTurn();
    }

    /**
     * `interrupted`: the user cut the turn off. Stops its video now (the last frame stays) and drops its late parts until
     * its `turnComplete`. The caller flushes the PCM.
     */
    public Interrupted(): void {
        this.playout.Flush();
        this.turn.VideoEnded = true;
        this.turn.Dropping = true;
    }

    /** The client cancelled the response (`CancelActiveResponse`): stops the video now. The caller flushes the PCM. */
    public Cancel(): void {
        this.playout.Flush();
    }

    /**
     * The session resumed on a new connection, where a turn the drop cut off never completes: its video plays out what
     * arrived and holds the last frame (no flush), and a new turn starts.
     */
    public Resumed(): void {
        this.endTurnVideo();
        this.turn = newTurn();
    }

    /** Stops the video and releases its element. */
    public Dispose(): void {
        this.playout.Dispose();
    }

    private static kindOf(mimeType: string | undefined, data: ArrayBuffer): AvatarPartKind {
        if (!mimeType) {
            return SniffFmp4Piece(data) ? 'video' : 'voice';
        }
        if (/^video\//i.test(mimeType.trim())) {
            return 'video';
        }
        return IsPcmAudioMimeType(mimeType) ? 'voice' : 'other';
    }

    private acceptVideo(piece: ArrayBuffer): void {
        if (!this.voiceDecided && SniffFmp4Piece(piece) === 'init') {
            this.followInit(piece);
        }
        if (!this.turn.HasVideo) {
            this.startTurnVideo();
        }
        // More media came, so the turn's video is not over even if generationComplete said so.
        this.turn.VideoEnded = false;
        this.playout.Append(piece);
    }

    /** The turn's first video part: when the video carries the voice, PCM the turn queued would double it, so it stops. */
    private startTurnVideo(): void {
        this.turn.HasVideo = true;
        this.turn.VideoStartedAt = Date.now();
        if (this.videoCarriesVoice && this.turn.HasVoice) {
            this.voice.Flush();
        }
        this.logSeparateVoiceOffset();
    }

    private acceptVoice(pcm: ArrayBuffer): boolean {
        if (this.videoCarriesVoice && this.turn.HasVideo) {
            this.reportOnce('pcm-with-video', '[GeminiRealtimeClient] Dropped PCM audio in a turn whose avatar video carries the voice.');
            return false;
        }
        this.voice.Enqueue(pcm);
        if (!this.turn.HasVoice) {
            this.turn.HasVoice = true;
            this.turn.VoiceStartedAt = Date.now();
            this.logSeparateVoiceOffset();
        }
        return true;
    }

    /**
     * Follows the session's first readable init segment: an audio track means the video carries the voice; none means the
     * video plays muted and the voice comes as PCM. Logged once when that disagrees with the grant.
     */
    private followInit(init: ArrayBuffer): void {
        const tracks = ReadFmp4Init(init)?.Tracks;
        if (!tracks) {
            return;
        }
        this.voiceDecided = true;
        const hasAudio = tracks.some((track) => track.Handler === 'soun');
        if (hasAudio === this.videoCarriesVoice) {
            return;
        }
        this.videoCarriesVoice = hasAudio;
        this.playout.CarriesVoice = hasAudio;
        const following = hasAudio ? 'its audio is the voice' : 'it plays muted and the voice plays as PCM';
        console.warn(
            `[GeminiRealtimeClient] The avatar's video ${hasAudio ? 'has an' : 'has no'} audio track, but the session config said ` +
                `audioMuxed: ${this.grant.AudioMuxed}. Following the video: ${following}.`
        );
    }

    /** Separate voice: one line per turn with how far apart the voice and the video started (they are not lip-synced). */
    private logSeparateVoiceOffset(): void {
        const voiceAt = this.turn.VoiceStartedAt;
        const videoAt = this.turn.VideoStartedAt;
        if (this.videoCarriesVoice || voiceAt === null || videoAt === null) {
            return;
        }
        const offset = videoAt - voiceAt;
        const order = offset >= 0 ? 'after' : 'before';
        console.info(`[GeminiRealtimeClient] Avatar turn: the video started ${Math.abs(offset)} ms ${order} the voice (separate audio, not lip-synced).`);
    }

    private endTurnVideo(): void {
        if (this.turn.HasVideo && !this.turn.VideoEnded) {
            this.turn.VideoEnded = true;
            this.playout.EndOfTurn();
        }
    }

    private reportOnce(key: string, message: string): void {
        if (this.reported.has(key)) {
            return;
        }
        this.reported.add(key);
        console.warn(message);
    }
}
