/**
 * Small fragmented MP4 pieces for the avatar tests, shaped as a Gemini Live avatar sends them: an init segment whose
 * tracks the reader in `@memberjunction/ai` reads (H.264 `avc1.42c01f`, with or without an AAC-LC `mp4a.40.2` track),
 * and media fragments. Nothing here decodes; the pieces only need to be read and routed.
 */
import { Fmp4PieceToVideoFrame, type RealtimeFmp4VideoFrame } from '@memberjunction/ai';

/** The MSE type of an init segment with video alone. */
export const VIDEO_ONLY_MP4_TYPE = 'video/mp4; codecs="avc1.42c01f"';

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
}

function ascii(text: string): Uint8Array {
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = concat(...payload);
    return concat(u32(8 + body.length), ascii(type), body);
}

/** A full box: version 0, no flags. */
function fullBox(type: string, ...payload: Uint8Array[]): Uint8Array {
    return box(type, new Uint8Array(4), ...payload);
}

/** A track whose `mdhd` gives `timescale` units a second, as Gemini's avatar tracks do (90 kHz video, 24 kHz audio). */
function trak(id: number, handler: string, entry: Uint8Array, timescale: number): Uint8Array {
    const tkhd = fullBox('tkhd', new Uint8Array(8), u32(id), new Uint8Array(68));
    const hdlr = fullBox('hdlr', u32(0), ascii(handler), new Uint8Array(13));
    const stbl = box('stbl', fullBox('stsd', u32(1), entry));
    const mdhd = fullBox('mdhd', new Uint8Array(8), u32(timescale), new Uint8Array(8));
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', stbl)));
}

/** One 24 fps video frame at the video track's 90 kHz timescale, as Gemini writes each video fragment. */
const VIDEO_FRAME_UNITS = 3750;
/** One AAC frame at the audio track's 24 kHz timescale. */
const AUDIO_FRAME_UNITS = 1024;

/** The seconds of video one {@link AvatarVideoFragment} frame carries. */
export const AVATAR_FRAME_SECONDS = VIDEO_FRAME_UNITS / 90000;

/** A track fragment: `tfhd` (default-base-is-moof, a default sample duration) and a `trun` of `samples` samples. */
function traf(trackID: number, sampleUnits: number, samples: number): Uint8Array {
    const tfhd = box('tfhd', Uint8Array.of(0, 0x02, 0x00, 0x08), u32(trackID), u32(sampleUnits));
    const trun = box('trun', Uint8Array.of(0, 0, 0, 0x01), u32(samples), u32(0));
    return box('traf', tfhd, trun);
}

const AVC1 = box('avc1', new Uint8Array(6), Uint8Array.of(0, 1), new Uint8Array(70), box('avcC', Uint8Array.of(1, 0x42, 0xc0, 0x1f, 0xff, 0xe0, 0)));
/** ES descriptor (25 bytes) → decoder config (17: AAC, 0x40) → AudioSpecificConfig 0x13 0x08 (AAC-LC); SL config. */
const ESDS = fullBox(
    'esds',
    Uint8Array.of(0x03, 25, 0, 1, 0, 0x04, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 2, 0x13, 0x08, 0x06, 1, 2)
);
const MP4A = box('mp4a', new Uint8Array(6), Uint8Array.of(0, 1), new Uint8Array(8), Uint8Array.of(0, 1, 0, 16), new Uint8Array(4), u32(24000 * 65536), ESDS);

/**
 * An init segment (`ftyp` + `moov`): an H.264 video track at `videoTimescale` units a second (Gemini's 90 kHz by
 * default), and an AAC-LC audio track at 24 kHz unless `audio` is false.
 */
export function AvatarInitSegment(audio = true, videoTimescale = 90000): ArrayBuffer {
    const video = trak(1, 'vide', AVC1, videoTimescale);
    const traks = audio ? [video, trak(2, 'soun', MP4A, 24000)] : [video];
    return concat(box('ftyp', ascii('iso5'), u32(512)), box('moov', fullBox('mvhd', new Uint8Array(96)), ...traks)).slice().buffer;
}

/** A media fragment (`moof` + `mdat`) with no samples; `sequence` makes each one's bytes distinct. */
export function AvatarFragment(sequence = 1): ArrayBuffer {
    return concat(box('moof', fullBox('mfhd', u32(sequence))), box('mdat', u32(sequence))).slice().buffer;
}

/** A video fragment of `frames` 24 fps frames ({@link AVATAR_FRAME_SECONDS} each), as Gemini sends one per frame. */
export function AvatarVideoFragment(frames = 1, sequence = 1): ArrayBuffer {
    return concat(box('moof', fullBox('mfhd', u32(sequence)), traf(1, VIDEO_FRAME_UNITS, frames)), box('mdat', u32(sequence))).slice().buffer;
}

/**
 * A one-frame video fragment that Core's reader can time: its `tfdt` puts the frame at `decodeUnits` of the 90 kHz video
 * track, and its `tfhd` default flags mark it a key frame or not.
 */
export function AvatarTimedVideoFragment(decodeUnits: number, keyFrame = true): ArrayBuffer {
    const payload = new Uint8Array(4);
    const tfhd = box('tfhd', Uint8Array.of(0, 0x02, 0x00, 0x38), u32(1), u32(VIDEO_FRAME_UNITS), u32(payload.length), u32(keyFrame ? 0 : 0x1_0000));
    const tfdt = fullBox('tfdt', u32(decodeUnits));
    const moofOf = (dataOffset: number): Uint8Array =>
        box('moof', fullBox('mfhd', u32(1)), box('traf', tfhd, tfdt, box('trun', Uint8Array.of(0, 0, 0, 0x01), u32(1), u32(dataOffset))));
    const moofLength = moofOf(0).length;
    return concat(moofOf(moofLength + 8), box('mdat', payload)).slice().buffer;
}

/** An audio-only fragment of a muxed avatar (Gemini alternates video and audio fragments): one AAC frame, no video. */
export function AvatarAudioFragment(sequence = 1): ArrayBuffer {
    return concat(box('moof', fullBox('mfhd', u32(sequence)), traf(2, AUDIO_FRAME_UNITS, 1)), box('mdat', u32(sequence))).slice().buffer;
}

/** A media segment that opens with `styp`, as CMAF writers send it. */
export function AvatarStypFragment(): ArrayBuffer {
    return concat(box('styp', ascii('msdh')), box('moof', fullBox('mfhd', u32(1))), box('mdat', u32(0))).slice().buffer;
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
