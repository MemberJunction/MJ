/**
 * Small fragmented MP4 pieces for the avatar tests, shaped as a Gemini Live avatar sends them. The init segment, video
 * and audio fragments are the video conformance kit's fixtures (`src/testing/conformanceFixtures.ts`), kept here under
 * the names these tests use; the sample-less fragment, the timed fragment and the `styp` segment are built here from the
 * kit's box builders. Nothing here decodes; the pieces only need to be read and routed.
 */
import { Fmp4PieceToVideoFrame, type RealtimeFmp4VideoFrame } from '@memberjunction/ai';
import {
    AsciiBytes,
    ConcatBytes,
    CONFORMANCE_FMP4_FRAME_SECONDS,
    ConformanceFmp4AudioFragment,
    ConformanceFmp4InitSegment,
    ConformanceFmp4VideoFragment,
    Mp4Box,
    Mp4FullBox,
    Uint32Bytes,
} from '../../testing/conformanceFixtures';

/** The MSE type of an init segment with video alone. */
export const VIDEO_ONLY_MP4_TYPE = 'video/mp4; codecs="avc1.42c01f"';

/** One 24 fps video frame at the video track's 90 kHz timescale, as Gemini writes each video fragment. */
const VIDEO_FRAME_UNITS = 3750;

/** The seconds of video one {@link AvatarVideoFragment} frame carries. */
export const AVATAR_FRAME_SECONDS = CONFORMANCE_FMP4_FRAME_SECONDS;

/**
 * An init segment (`ftyp` + `moov`): an H.264 video track at `videoTimescale` units a second (Gemini's 90 kHz by
 * default), and an AAC-LC audio track at 24 kHz unless `audio` is false.
 */
export const AvatarInitSegment = ConformanceFmp4InitSegment;

/** A video fragment of `frames` 24 fps frames ({@link AVATAR_FRAME_SECONDS} each), as Gemini sends one per frame. */
export const AvatarVideoFragment = ConformanceFmp4VideoFragment;

/** An audio-only fragment of a muxed avatar (Gemini alternates video and audio fragments): one AAC frame, no video. */
export const AvatarAudioFragment = ConformanceFmp4AudioFragment;

/** A media fragment (`moof` + `mdat`) with no samples; `sequence` makes each one's bytes distinct. */
export function AvatarFragment(sequence = 1): ArrayBuffer {
    return ConcatBytes(Mp4Box('moof', Mp4FullBox('mfhd', Uint32Bytes(sequence))), Mp4Box('mdat', Uint32Bytes(sequence))).slice().buffer;
}

/**
 * A one-frame video fragment that Core's reader can time: its `tfdt` puts the frame at `decodeUnits` of the 90 kHz video
 * track, and its `tfhd` default flags mark it a key frame or not.
 */
export function AvatarTimedVideoFragment(decodeUnits: number, keyFrame = true): ArrayBuffer {
    const payload = new Uint8Array(4);
    const tfhd = Mp4Box(
        'tfhd',
        Uint8Array.of(0, 0x02, 0x00, 0x38),
        Uint32Bytes(1),
        Uint32Bytes(VIDEO_FRAME_UNITS),
        Uint32Bytes(payload.length),
        Uint32Bytes(keyFrame ? 0 : 0x1_0000)
    );
    const tfdt = Mp4FullBox('tfdt', Uint32Bytes(decodeUnits));
    const moofOf = (dataOffset: number): Uint8Array =>
        Mp4Box('moof', Mp4FullBox('mfhd', Uint32Bytes(1)), Mp4Box('traf', tfhd, tfdt, Mp4Box('trun', Uint8Array.of(0, 0, 0, 0x01), Uint32Bytes(1), Uint32Bytes(dataOffset))));
    const moofLength = moofOf(0).length;
    return ConcatBytes(moofOf(moofLength + 8), Mp4Box('mdat', payload)).slice().buffer;
}

/** A media segment that opens with `styp`, as CMAF writers send it. */
export function AvatarStypFragment(): ArrayBuffer {
    return ConcatBytes(Mp4Box('styp', AsciiBytes('msdh')), Mp4Box('moof', Mp4FullBox('mfhd', Uint32Bytes(1))), Mp4Box('mdat', Uint32Bytes(0))).slice().buffer;
}

/** A piece as a Gemini part carries it: base64. */
export function PieceToBase64(piece: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(piece)));
}

/** A piece as a driver hands it to the player: an fMP4 frame, built by Core's `Fmp4PieceToVideoFrame`. */
export function PieceFrame(piece: ArrayBuffer, mimeType = 'video/mp4'): RealtimeFmp4VideoFrame {
    const frame = Fmp4PieceToVideoFrame(piece, mimeType, null);
    if (!frame) {
        throw new Error('The piece is not fragmented MP4.');
    }
    return frame;
}
