/**
 * @fileoverview VIDEO FRAME DECODERS: what plays one kind of `RealtimeVideoFrame` into a `<video>` element for
 * {@link VideoPlayout}, and how a decoder is offered to the player.
 *
 * The player keeps one decoder at a time. For each frame it picks, from the {@link VideoFrameDecoderRegistry}, the first
 * registration of the frame's kind that can play its MIME type, and hands the decoder a {@link VideoFrameDecoderContext}:
 * the player's settings and where to report. A decoder plays into the host's element, whatever it decodes with, so the
 * host shows every kind of video the same way.
 *
 * Built in: `'mse-fmp4'` (fragmented MP4 through Media Source Extensions), `'webcodecs'` (encoded chunks through a
 * WebCodecs `VideoDecoder`) and `'image'` (still images through `createImageBitmap`).
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import type { RealtimeVideoFrame, RealtimeVideoFrameKind } from '@memberjunction/ai';
import type { VideoPlayoutProblem } from './videoPlayout';

/** What a decoder plays with and reports through. The player gives one to each decoder it creates. */
export interface VideoFrameDecoderContext {
    /**
     * The player's configured type (`VideoPlayoutOptions.MimeType`), with its codecs: what a decoder that opens by type
     * (MSE) opens with until a frame says more.
     */
    readonly MimeType: string;
    /** Seconds of played media a buffering decoder keeps behind the playhead (`VideoPlayoutOptions.BackBufferSeconds`). */
    readonly BackBufferSeconds: number;
    /** Whether the element plays the media's own audio (an avatar MP4's voice). The player keeps it current. */
    readonly CarriesVoice: boolean;
    /**
     * The element hook from `VideoPlayoutOptions.OnElementAttached`: the voice's route into Web Audio. A decoder whose media
     * carries audio calls it with each element it takes over, before playback starts.
     */
    OnElementAttached?(element: HTMLVideoElement): void;
    /** Reports a problem. The player passes each kind on once. */
    Report(problem: VideoPlayoutProblem, message: string): void;
    /**
     * The decoder can't go on (its browser decoder closed for good, or the browser can't decode the stream's codec). The
     * player disposes it and picks the next decoder that can play the frame's type; out of decoders, frames of that type are
     * dropped.
     */
    Failed(message: string): void;
}

/** Plays one kind of frame into a `<video>` element. The player creates one at a time and moves it between elements. */
export interface IVideoFrameDecoder {
    /** Takes the element over and shows its video there, keeping the frames it holds and the last one shown. */
    Attach(element: HTMLVideoElement): void;
    /** Lets the element go (the tile moved or closed). The decoder keeps what it holds for the next element. */
    Detach(): void;
    /** Takes one frame of its kind, in the order they arrived. */
    Append(frame: RealtimeVideoFrame): void;
    /** The turn's last frame has arrived: everything that came plays to the end, then the last frame holds. */
    EndOfTurn(): void;
    /** Barge-in: drops what isn't shown yet. The last frame shown stays on screen. */
    Flush(): void;
    /** Whether the decoder's own audio is audibly playing (an MP4 that carries the voice); `false` for decoders without audio. */
    readonly IsPlaying: boolean;
    /** Stops, releases the element and frees what it holds. */
    Dispose(): void;
}

/** One decoder the registry can create. */
export interface VideoFrameDecoderRegistration {
    /** Its name, unique in the registry: registering the same name again replaces it. Built in: `'mse-fmp4'`, `'webcodecs'`, `'image'`. */
    Name: string;
    /** The kind of frame it plays. */
    Kind: RealtimeVideoFrameKind;
    /** Among the decoders that can play a type, a higher priority is tried first. The built-ins have 0. */
    Priority: number;
    /**
     * Whether it can play frames of this MIME type in this browser, answered at once. A decoder whose exact answer needs an
     * asynchronous check answers from what it can see now, and calls `Failed` later if the check says no.
     */
    CanPlay(mimeType: string): boolean;
    /** A new decoder, for one player. */
    Create(context: VideoFrameDecoderContext): IVideoFrameDecoder;
}
