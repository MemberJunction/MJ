/**
 * @fileoverview REALTIME VIDEO OUTPUT: the frames a realtime model's video output arrives in.
 *
 * A model's video (a live avatar, generated video) comes in one of three forms, and each {@link RealtimeVideoFrame} says
 * which (`Kind`) and in what format (`MimeType`):
 * - `'fmp4'`: a piece of fragmented MP4 as the model sent it, an init segment or a media fragment. A Gemini Live avatar
 *   arrives this way, with its voice on the MP4's audio track. {@link Fmp4PieceToVideoFrame} builds one from a part.
 * - `'chunk'`: one encoded frame (H.264 in Annex B form, VP8, VP9, AV1), as a browser's `VideoDecoder` takes it.
 * - `'image'`: one still picture (JPEG, PNG, WebP).
 *
 * A server-side session hands its frames to the host through `IRealtimeSession.OnVideoFrame`; a browser client driver
 * hands them to its video player. Frames going the other way (a camera or a screen, to the model) are
 * `RealtimeInputFrame`s, whose size and rate math is in `realtimeVideoFrames.ts`.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

import { ReadFmp4Fragment, ReadFmp4Init, SniffFmp4Piece, type Fmp4Init, type Fmp4PieceKind } from './fmp4Reader';

/** What a {@link RealtimeVideoFrame} carries: a piece of fragmented MP4, one encoded frame, or one still image. */
export type RealtimeVideoFrameKind = 'fmp4' | 'chunk' | 'image';

/** The fields every {@link RealtimeVideoFrame} has. */
export interface RealtimeVideoFrameBase {
    /** The bytes. A consumer may transfer the buffer to another thread: read what you need before handing it on. */
    Data: ArrayBuffer;
    /**
     * The format: `'video/mp4'` for an fMP4 piece; for a chunk, its codec (`'video/vp8'`,
     * `'video/h264; codecs="avc1.42e01f"'`); for an image, its type (`'image/jpeg'`).
     */
    MimeType: string;
    /**
     * When the frame shows, in milliseconds on the stream's own media timeline, not wall-clock time. The voice that goes
     * with it is on the same timeline: a player shows the frame when the voice reaches this time. A new stream (an fMP4
     * init segment, or a key frame whose time goes backwards) may restart it.
     */
    PresentationTimeMs?: number;
    /** Whether a decoder can start here: a key frame, or an fMP4 fragment whose first video sample is one. */
    KeyFrame?: boolean;
    /** The picture's width in pixels, when known. */
    Width?: number;
    /** The picture's height in pixels, when known. */
    Height?: number;
}

/**
 * A piece of a fragmented MP4 stream as the model sent it. Its tracks may include the voice (a Gemini avatar's MP4 has
 * an AAC track): then the voice does not also come as PCM.
 */
export interface RealtimeFmp4VideoFrame extends RealtimeVideoFrameBase {
    Kind: 'fmp4';
    /** `'init'`: an init segment (`ftyp` + `moov`). `'fragment'`: media data (`moof` + `mdat`, or a part of one). */
    Piece: Fmp4PieceKind;
}

/**
 * One encoded video frame, as WebCodecs takes it: H.264 in Annex B form (start codes, with the SPS and PPS before each
 * key frame), or VP8, VP9 or AV1 as raw frames. Carries no voice.
 */
export interface RealtimeChunkVideoFrame extends RealtimeVideoFrameBase {
    Kind: 'chunk';
    /** Required for a chunk: a decoder needs every chunk's time. */
    PresentationTimeMs: number;
    /** Required for a chunk: a decoder can only start at a key frame. */
    KeyFrame: boolean;
}

/** One still picture. Every image stands alone, as a key frame does. Carries no voice. */
export interface RealtimeImageVideoFrame extends RealtimeVideoFrameBase {
    Kind: 'image';
}

/** One frame of a model's video output. */
export type RealtimeVideoFrame = RealtimeFmp4VideoFrame | RealtimeChunkVideoFrame | RealtimeImageVideoFrame;

/** The MIME type of an fMP4 frame whose part named no type, or named another one. */
const FMP4_MIME_TYPE = 'video/mp4';

/** `video/mp4`, alone or with parameters (`video/mp4; codecs="avc1.42c01f"`), in any case. */
const FMP4_MIME_PATTERN = /^video\/mp4\s*(;|$)/i;

/**
 * A piece of fragmented MP4 as a frame: `Piece` from its first box; for an init segment, `Width` and `Height` from its
 * video track; for a fragment, `PresentationTimeMs` and `KeyFrame` from its first video sample, timed by `init`'s video
 * track. A fragment without a video sample (an audio-only fragment of a muxed stream), one before any init, or one that
 * can't be read gets neither: it still plays.
 *
 * The MIME type stays as the provider sent it when it names `video/mp4`; otherwise it is `'video/mp4'`. Bytes labelled
 * `video/mp4` that open with no MP4 box (a lone `mdat`) are a fragment.
 *
 * @param data The piece.
 * @param mimeType Its MIME type, when the provider named one.
 * @param init The stream's latest init segment, read; `null` before the first.
 * @returns The frame, or `null` when the bytes are neither labelled `video/mp4` nor open with an MP4 box.
 */
export function Fmp4PieceToVideoFrame(data: ArrayBuffer, mimeType: string | undefined, init: Fmp4Init | null): RealtimeFmp4VideoFrame | null {
    const label = mimeType?.trim() ?? '';
    const labelledMp4 = FMP4_MIME_PATTERN.test(label);
    const piece = SniffFmp4Piece(data) ?? (labelledMp4 ? 'fragment' : null);
    if (!piece) {
        return null;
    }
    const frame: RealtimeFmp4VideoFrame = { Kind: 'fmp4', Piece: piece, Data: data, MimeType: labelledMp4 ? label : FMP4_MIME_TYPE };
    return { ...frame, ...(piece === 'init' ? initPictureSize(data) : fragmentTiming(data, init)) };
}

/** An init segment's picture size, from its video track's sample entry; nothing when it declares none. */
function initPictureSize(data: ArrayBuffer): Pick<RealtimeVideoFrameBase, 'Width' | 'Height'> {
    const video = ReadFmp4Init(data)?.Tracks.find((track) => track.Handler === 'vide');
    return video?.Width && video.Height ? { Width: video.Width, Height: video.Height } : {};
}

/**
 * A fragment's time and key-frame flag, from its first sample on the init's video track: its decode time plus its
 * composition offset, in the track's timescale. Nothing when the init declares no timed video track, or the fragment
 * holds no readable video sample.
 */
function fragmentTiming(data: ArrayBuffer, init: Fmp4Init | null): Pick<RealtimeVideoFrameBase, 'PresentationTimeMs' | 'KeyFrame'> {
    const video = init?.Tracks.find((track) => track.Handler === 'vide');
    if (!video?.Timescale) {
        return {};
    }
    const first = ReadFmp4Fragment(data, init)?.Samples.find((sample) => sample.TrackID === video.TrackID);
    return first ? { PresentationTimeMs: ((first.DecodeTime + first.CompositionOffset) / video.Timescale) * 1000, KeyFrame: first.IsSync } : {};
}
