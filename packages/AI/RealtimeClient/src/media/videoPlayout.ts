/**
 * @fileoverview VIDEO PLAYOUT: plays a model's video into one `<video>` element at a time, whatever form it arrives in.
 * A provider hands each frame to {@link VideoPlayout.Append} as a `RealtimeVideoFrame` from `@memberjunction/ai`; a
 * renderer shows {@link VideoPlayout.Source} with `AttachVideoSource`.
 *
 * - **A decoder per frame type.** The player keeps one decoder at a time, chosen from the page's
 *   {@link VideoFrameDecoderRegistry} by the frame's kind and MIME type: `'mse-fmp4'` plays fragmented MP4 (a Gemini Live
 *   avatar) through Media Source Extensions, `'webcodecs'` plays encoded chunks (H.264, VP8, VP9, AV1) through WebCodecs,
 *   `'image'` plays still images. A frame of another type switches decoders; a type no decoder plays is dropped and
 *   reported once (`'no-decoder'`).
 * - **Ready before the first frame.** When an element is attached first, the player starts the decoder for its
 *   configured type ({@link VideoPlayoutOptions.MimeType}), so MSE has its media source open when the first piece comes.
 *   A configured type no decoder plays reports `'unsupported'` and leaves the element alone.
 * - **Fallback.** A decoder that gives up (`Failed`) is disposed and not chosen again for that type; the next one that can
 *   play it starts at the next init segment or key frame. Out of decoders, frames of that type are dropped; the voice is
 *   unaffected, and the tile's stall fallback shows in place of the video.
 * - **The voice.** An avatar's MP4 carries its voice, so the MSE decoder unmutes the element and
 *   {@link VideoPlayout.IsPlaying} says whether the agent is audibly speaking. When the voice plays elsewhere,
 *   {@link VideoPlayout.CarriesVoice} `false` mutes the element. Chunk and image decoders carry no voice.
 *   {@link VideoPlayoutOptions.OnElementAttached} lets the realtime client route the element's audio into its own Web
 *   Audio graph, so its meter and its recording carry the avatar's voice.
 * - **Lip sync.** With {@link VideoPlayoutOptions.Clock}, the voice's playback clock, the chunk and image decoders show
 *   each frame when the voice reaches its `PresentationTimeMs`. MSE needs no clock: an MP4 that carries the voice keeps
 *   voice and face together on its own timestamps.
 * - **End of turn, barge-in, gaps.** {@link VideoPlayout.EndOfTurn} lets playback run to the true end of the turn;
 *   {@link VideoPlayout.Flush} drops everything not yet played; between turns, or while a connection resumes, the element
 *   holds the last frame. Each decoder does this its own way.
 * - **Browsers.** {@link VideoPlayout.IsSupported} says, at once, whether some decoder can play a type here.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import { SniffFmp4Piece, type RealtimeVideoFrame, type RealtimeVideoFrameKind } from '@memberjunction/ai';
import type { MediaVideoSource } from './model';
import type { IPlaybackClock } from './playbackClock';
import type { IVideoFrameDecoder, VideoFrameDecoderContext } from './videoFrameDecoder';
import { VideoFrameDecoderRegistry } from './videoFrameDecoderRegistry';
import { FrameKindOfMimeType, FrameTypeKey } from './decoders/videoMimeTypes';

/** The type of a Gemini Live avatar: H.264 Constrained Baseline 3.1 video, AAC-LC audio. */
export const GEMINI_AVATAR_MP4_TYPE = 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"';

/** Seconds of already-played media kept behind the playhead before it is removed. */
const DEFAULT_BACK_BUFFER_SECONDS = 10;

export interface VideoPlayoutOptions {
    /**
     * The type, with codecs, the player expects: the decoder for it starts when an element is attached, before any frame
     * arrives, and the MSE source buffer opens with it until an init segment names its own codecs (or names one the reader
     * doesn't know). Defaults to {@link GEMINI_AVATAR_MP4_TYPE}.
     */
    MimeType?: string;
    /** Seconds of played media to keep behind the playhead. Defaults to 10. */
    BackBufferSeconds?: number;
    /**
     * Whether the element plays the media's audio. Defaults to `true`: an avatar's MP4 carries its voice. `false`
     * mutes the element, for a voice that plays elsewhere. {@link VideoPlayout.CarriesVoice} changes it later.
     */
    CarriesVoice?: boolean;
    /**
     * Called with each element the player takes over, before playback starts, such as to route the element's audio
     * into a Web Audio graph. A player that moves to another element calls it again with that one.
     */
    OnElementAttached?: (element: HTMLVideoElement) => void;
    /**
     * The voice's playback clock, for lip sync: the chunk and image decoders show each frame when the voice reaches its
     * `PresentationTimeMs`. Give it when the driver times its PCM (`IRealtimePcmPlayback.Enqueue(pcm16, mediaTimeMs)`) and
     * its frames on one media timeline; `RealtimePcmPlayback` is such a clock. Without it, frames go by their own times.
     * MSE ignores it.
     */
    Clock?: IPlaybackClock;
}

/** Why playout reported a problem. */
export type VideoPlayoutProblem =
    /** The browser cannot play this type: no decoder plays the configured type, or a decoder can't decode the stream's codec. */
    | 'unsupported'
    /** No decoder in this browser plays the frame's kind and type; it was dropped. */
    | 'no-decoder'
    /** A media fragment arrived before any init segment, or an encoded chunk before any key frame, and was dropped. */
    | 'fragment-before-init'
    /** The browser rejected a piece (decode error, or out of buffer space after trimming). */
    | 'append-failed'
    /** Media arrived faster than it could be played, or while no element was attached, and the oldest was dropped. */
    | 'pending-overflow';

/** Whether a piece is an MP4 init segment: its first box is `ftyp`. */
export function IsMp4InitSegment(piece: ArrayBuffer): boolean {
    return SniffFmp4Piece(piece) === 'init';
}

/**
 * What a realtime driver needs from an avatar's video player: {@link VideoPlayout} in a browser, a fake in tests.
 */
export interface IAvatarVideoPlayout {
    /** The video to show. A driver hands it to the host once. */
    readonly Source: MediaVideoSource;
    /** Whether it plays forward with media buffered ahead of the playhead: the avatar is audibly speaking. */
    readonly IsPlaying: boolean;
    /**
     * Where the playhead is, in frames: how many of the frames handed to {@link Append} are still to play (waiting,
     * being decoded or appended, or buffered ahead of the playhead). A frame that was dropped, or that no decoder plays,
     * is not counted. Frames play in the order they were handed over, so the frames ahead are the latest ones handed
     * over, less any of those that were dropped: a driver that counts what it hands over can tell whether a given frame
     * has played.
     */
    readonly FramesAhead: number;
    /** Whether the element plays the media's audio; `false` mutes it. */
    CarriesVoice: boolean;
    /**
     * Hands over one frame, in the order they arrived: a piece of fragmented MP4 (an init segment or a media fragment),
     * an encoded chunk or an image. A frame the player has no decoder for is dropped and reported once (`'no-decoder'`).
     */
    Append(frame: RealtimeVideoFrame): void;
    /** The turn's last piece has arrived: playback runs to its true end and holds the last frame. */
    EndOfTurn(): void;
    /** Barge-in: drops everything not yet played and stops at once, holding the last frame. */
    Flush(): void;
    /** Reports problems, once per kind. Returns a function that removes the handler. */
    OnProblem(handler: (problem: VideoPlayoutProblem, message: string) => void): () => void;
    /** Stops playout and releases the element. */
    Dispose(): void;
}

/** The decoder the player is using, and the frame type it was chosen for. */
interface ActiveDecoder {
    /** The frame type: its kind and MIME essence. */
    Type: string;
    /** The registration's name. */
    Name: string;
    Decoder: IVideoFrameDecoder;
}

/** Plays a model's video frames into one `<video>` element at a time, through the decoder each frame type needs. */
export class VideoPlayout implements IAvatarVideoPlayout {
    private readonly mimeType: string;
    private readonly backBufferSeconds: number;
    private readonly onElementAttached: ((element: HTMLVideoElement) => void) | undefined;
    private readonly clock: IPlaybackClock | undefined;
    private readonly problemHandlers = new Set<(problem: VideoPlayoutProblem, message: string) => void>();
    private readonly reported = new Set<VideoPlayoutProblem>();
    /** Decoders that gave up, by frame type: they are not chosen again for it. */
    private readonly failed = new Map<string, Set<string>>();
    private carriesVoice: boolean;
    private element: HTMLVideoElement | null = null;
    private active: ActiveDecoder | null = null;
    private disposed = false;

    /** Whether some decoder can play `mimeType` in this browser, answered at once (for negotiation, before connect). */
    public static IsSupported(mimeType: string = GEMINI_AVATAR_MP4_TYPE): boolean {
        const kind = FrameKindOfMimeType(mimeType);
        return kind !== null && VideoFrameDecoderRegistry.Instance.Candidates(kind, mimeType).length > 0;
    }

    constructor(options: VideoPlayoutOptions = {}) {
        this.mimeType = options.MimeType ?? GEMINI_AVATAR_MP4_TYPE;
        this.backBufferSeconds = options.BackBufferSeconds ?? DEFAULT_BACK_BUFFER_SECONDS;
        this.carriesVoice = options.CarriesVoice ?? true;
        this.onElementAttached = options.OnElementAttached;
        this.clock = options.Clock;
    }

    /** The video to show: the player takes over the element it is attached to. */
    public get Source(): MediaVideoSource {
        return { Kind: 'element', Attach: (element) => this.attach(element) };
    }

    /**
     * Whether the element plays the media's audio. `false` mutes it: the voice plays elsewhere, such as separate PCM
     * audio when the MP4 has no audio track. Takes effect at once on an attached element.
     */
    public get CarriesVoice(): boolean {
        return this.carriesVoice;
    }
    public set CarriesVoice(value: boolean) {
        this.carriesVoice = value;
        if (this.element) {
            this.element.muted = !value;
        }
    }

    /** Whether the decoder's own audio is audibly playing: an MP4 that carries the voice, buffered ahead of the playhead. */
    public get IsPlaying(): boolean {
        return this.active?.Decoder.IsPlaying ?? false;
    }

    /**
     * How many of the frames handed over are still to play, as the decoder in use counts them. Frames a decoder that
     * gave up held, and frames no decoder plays, never play, so they are not counted.
     */
    public get FramesAhead(): number {
        return this.active?.Decoder.FramesAhead ?? 0;
    }

    /**
     * Hands over one frame, in the order they arrived, to the decoder for its type: the one in use, or the first the
     * registry offers. A frame no decoder plays is dropped and reported once (`'no-decoder'`).
     */
    public Append(frame: RealtimeVideoFrame): void {
        if (this.disposed) {
            return;
        }
        const decoder = this.decoderFor(frame.Kind, frame.MimeType);
        if (!decoder) {
            // A frame it can't play adds no media: the decoder in use, and a turn it was about to end, carry on.
            this.report('no-decoder', `No decoder in this browser plays ${frame.Kind} frames of type ${frame.MimeType}; the frame was dropped.`);
            return;
        }
        decoder.Append(frame);
    }

    /** The turn's last frame has arrived: playback runs to its true end and holds the last frame. */
    public EndOfTurn(): void {
        this.active?.Decoder.EndOfTurn();
    }

    /** Barge-in: drops everything not yet played and stops at once. The last frame stays on screen. */
    public Flush(): void {
        this.active?.Decoder.Flush();
    }

    /** Reports problems, once per kind. Returns a function that removes the handler. */
    public OnProblem(handler: (problem: VideoPlayoutProblem, message: string) => void): () => void {
        this.problemHandlers.add(handler);
        return () => this.problemHandlers.delete(handler);
    }

    /** Stops playout, releases the element and disposes the decoder. */
    public Dispose(): void {
        this.disposed = true;
        this.releaseDecoder();
        this.element = null;
        this.problemHandlers.clear();
    }

    private attach(element: HTMLVideoElement): () => void {
        if (this.disposed) {
            return () => undefined;
        }
        this.detachElement();
        const decoder = this.active?.Decoder ?? this.startConfiguredDecoder();
        if (!decoder) {
            this.report('unsupported', `This browser cannot play ${this.mimeType}: no decoder plays it.`);
            return () => undefined;
        }
        this.element = element;
        decoder.Attach(element);
        return () => {
            if (this.element === element) {
                this.detachElement();
            }
        };
    }

    private detachElement(): void {
        if (this.element) {
            this.active?.Decoder.Detach();
            this.element = null;
        }
    }

    /** The decoder for the configured type, started before any frame so it is ready when the first one comes. */
    private startConfiguredDecoder(): IVideoFrameDecoder | null {
        const kind = FrameKindOfMimeType(this.mimeType);
        return kind ? this.decoderFor(kind, this.mimeType) : null;
    }

    /** The decoder for a frame type: the one in use when it plays that type, else a new one from the registry. */
    private decoderFor(kind: RealtimeVideoFrameKind, mimeType: string): IVideoFrameDecoder | null {
        const type = FrameTypeKey(kind, mimeType);
        if (this.active?.Type === type) {
            return this.active.Decoder;
        }
        const failed = this.failed.get(type);
        const registration = VideoFrameDecoderRegistry.Instance.Candidates(kind, mimeType).find((candidate) => !failed?.has(candidate.Name));
        if (!registration) {
            return null;
        }
        this.releaseDecoder();
        const decoder = registration.Create(this.contextFor(type, registration.Name));
        this.active = { Type: type, Name: registration.Name, Decoder: decoder };
        if (this.element) {
            decoder.Attach(this.element);
        }
        return decoder;
    }

    /** What a decoder chosen for `type` plays with and reports through. */
    private contextFor(type: string, name: string): VideoFrameDecoderContext {
        const carriesVoice = (): boolean => this.carriesVoice;
        return {
            MimeType: this.mimeType,
            BackBufferSeconds: this.backBufferSeconds,
            get CarriesVoice(): boolean {
                return carriesVoice();
            },
            OnElementAttached: this.onElementAttached,
            Clock: this.clock,
            Report: (problem, message) => this.report(problem, message),
            Failed: (message) => this.decoderFailed(type, name, message),
        };
    }

    /** A decoder gave up: it is disposed and not chosen again for its type. The next frame of the type picks another. */
    private decoderFailed(type: string, name: string, message: string): void {
        console.warn(`[VideoPlayout] The ${name} decoder stopped: ${message}`);
        const failed = this.failed.get(type) ?? new Set<string>();
        failed.add(name);
        this.failed.set(type, failed);
        if (this.active?.Type === type && this.active.Name === name) {
            this.releaseDecoder();
        }
    }

    private releaseDecoder(): void {
        const active = this.active;
        this.active = null;
        active?.Decoder.Dispose();
    }

    private report(problem: VideoPlayoutProblem, message: string): void {
        if (this.reported.has(problem)) {
            return;
        }
        this.reported.add(problem);
        console.warn(`[VideoPlayout] ${message}`);
        for (const handler of [...this.problemHandlers]) {
            handler(problem, message);
        }
    }
}
