/**
 * @fileoverview The media the video conformance kit sends as the model: tiny, synthetic, deterministic video in each
 * form a model's video comes in (Core's `RealtimeVideoFrame` kinds), and PCM chunks. Nothing here decodes; the frames
 * only need to be read (by `@memberjunction/ai`'s fMP4 reader) and routed.
 *
 * - **Fragmented MP4**, as a realtime avatar sends it: an init segment (`ftyp` + `moov`) with an H.264 `avc1.42c01f` video
 *   track at a 90 kHz timescale and an AAC-LC `mp4a.40.2` audio track at 24 kHz unless the video comes without the
 *   voice; video fragments (`moof` + `mdat`) of one sample per 24 fps frame, so each frame is
 *   {@link CONFORMANCE_FMP4_FRAME_SECONDS}; audio-only fragments of a muxed avatar, which carry no video seconds.
 * - **Encoded chunks** ({@link ConformanceChunkFrames}): opaque bytes labelled H.264, a key frame every 24, presentation
 *   times 24 to the second.
 * - **Images** ({@link ConformanceImageFrame}): JPEG start and end markers around a few bytes, 24 to the second.
 * - **PCM** chunks of 4 bytes, too short to ever be read as an MP4 box.
 *
 * Every kind is spaced 1/24 s apart, so a frame is {@link CONFORMANCE_FMP4_FRAME_SECONDS} whatever its kind. The box
 * builders are exported for this package's own tests; the `/testing` entry exports only the fixtures.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import {
    Fmp4PieceToVideoFrame,
    type RealtimeChunkVideoFrame,
    type RealtimeFmp4VideoFrame,
    type RealtimeImageVideoFrame,
} from '@memberjunction/ai';

/** One 24 fps video frame at the video track's 90 kHz timescale. */
const VIDEO_FRAME_UNITS = 3750;
/** The video track's timescale: units per second. */
const VIDEO_TIMESCALE = 90000;
/** One AAC frame at the audio track's 24 kHz timescale. */
const AUDIO_FRAME_UNITS = 1024;
/** The audio track's timescale. */
const AUDIO_TIMESCALE = 24000;

/** The seconds of video one frame carries, of any kind: 1/24. A {@link ConformanceFmp4VideoFragment} frame lasts this long. */
export const CONFORMANCE_FMP4_FRAME_SECONDS = VIDEO_FRAME_UNITS / VIDEO_TIMESCALE;

/** The H.264 type the kit's encoded chunks are labelled with: Constrained Baseline 3.0, as WebCodecs names it. */
const CHUNK_MIME_TYPE = 'video/h264; codecs="avc1.42e01f"';

/** How many chunks apart the kit's key frames are. */
const CHUNK_KEY_FRAME_INTERVAL = 24;

/** The type of the kit's images. */
const IMAGE_MIME_TYPE = 'image/jpeg';

/** Joins byte arrays end to end. */
export function ConcatBytes(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/** A big-endian 32-bit unsigned integer. */
export function Uint32Bytes(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
}

/** The bytes of an ASCII string, such as a box type. */
export function AsciiBytes(text: string): Uint8Array {
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

/** An MP4 box: its size, its four-character type, then its payload. */
export function Mp4Box(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = ConcatBytes(...payload);
    return ConcatBytes(Uint32Bytes(8 + body.length), AsciiBytes(type), body);
}

/** A full box: version 0, no flags, then the payload. */
export function Mp4FullBox(type: string, ...payload: Uint8Array[]): Uint8Array {
    return Mp4Box(type, new Uint8Array(4), ...payload);
}

/** A track whose `mdhd` gives `timescale` units a second. */
function trak(id: number, handler: string, entry: Uint8Array, timescale: number): Uint8Array {
    const tkhd = Mp4FullBox('tkhd', new Uint8Array(8), Uint32Bytes(id), new Uint8Array(68));
    const hdlr = Mp4FullBox('hdlr', Uint32Bytes(0), AsciiBytes(handler), new Uint8Array(13));
    const stbl = Mp4Box('stbl', Mp4FullBox('stsd', Uint32Bytes(1), entry));
    const mdhd = Mp4FullBox('mdhd', new Uint8Array(8), Uint32Bytes(timescale), new Uint8Array(8));
    return Mp4Box('trak', tkhd, Mp4Box('mdia', mdhd, hdlr, Mp4Box('minf', stbl)));
}

/** A track fragment: `tfhd` (default-base-is-moof, a default sample duration) and a `trun` of `samples` samples. */
function traf(trackID: number, sampleUnits: number, samples: number): Uint8Array {
    const tfhd = Mp4Box('tfhd', Uint8Array.of(0, 0x02, 0x00, 0x08), Uint32Bytes(trackID), Uint32Bytes(sampleUnits));
    const trun = Mp4Box('trun', Uint8Array.of(0, 0, 0, 0x01), Uint32Bytes(samples), Uint32Bytes(0));
    return Mp4Box('traf', tfhd, trun);
}

/** An H.264 sample entry whose `avcC` names Constrained Baseline 3.1 (`avc1.42c01f`). */
function avc1(): Uint8Array {
    return Mp4Box('avc1', new Uint8Array(6), Uint8Array.of(0, 1), new Uint8Array(70), Mp4Box('avcC', Uint8Array.of(1, 0x42, 0xc0, 0x1f, 0xff, 0xe0, 0)));
}

/** An AAC sample entry: ES descriptor → decoder config (AAC, 0x40) → AudioSpecificConfig 0x13 0x08 (AAC-LC) → SL config. */
function mp4a(): Uint8Array {
    const esds = Mp4FullBox(
        'esds',
        Uint8Array.of(0x03, 25, 0, 1, 0, 0x04, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 2, 0x13, 0x08, 0x06, 1, 2)
    );
    return Mp4Box('mp4a', new Uint8Array(6), Uint8Array.of(0, 1), new Uint8Array(8), Uint8Array.of(0, 1, 0, 16), new Uint8Array(4), Uint32Bytes(AUDIO_TIMESCALE * 65536), esds);
}

/** A copy of the bytes in an `ArrayBuffer` of their own. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer;
}

/**
 * An init segment (`ftyp` + `moov`): an H.264 video track at `videoTimescale` units a second, and an AAC-LC audio track
 * (the avatar's voice) unless `withAudio` is false.
 *
 * @param withAudio Whether the video carries the voice: an audio track beside the video. Default `true`.
 * @param videoTimescale The video track's units per second. Default 90 000, which times each frame at 1/24 s.
 */
export function ConformanceFmp4InitSegment(withAudio: boolean = true, videoTimescale: number = VIDEO_TIMESCALE): ArrayBuffer {
    const video = trak(1, 'vide', avc1(), videoTimescale);
    const traks = withAudio ? [video, trak(2, 'soun', mp4a(), AUDIO_TIMESCALE)] : [video];
    return toArrayBuffer(ConcatBytes(Mp4Box('ftyp', AsciiBytes('iso5'), Uint32Bytes(512)), Mp4Box('moov', Mp4FullBox('mvhd', new Uint8Array(96)), ...traks)));
}

/**
 * A video fragment (`moof` + `mdat`) of `frames` 24 fps frames, {@link CONFORMANCE_FMP4_FRAME_SECONDS} each under the
 * default init segment. `sequence` makes each fragment's bytes distinct.
 */
export function ConformanceFmp4VideoFragment(frames: number = 1, sequence: number = 1): ArrayBuffer {
    const moof = Mp4Box('moof', Mp4FullBox('mfhd', Uint32Bytes(sequence)), traf(1, VIDEO_FRAME_UNITS, frames));
    return toArrayBuffer(ConcatBytes(moof, Mp4Box('mdat', Uint32Bytes(sequence))));
}

/** An audio-only fragment of a muxed avatar: one AAC frame and no video, so it adds no video seconds. */
export function ConformanceFmp4AudioFragment(sequence: number = 1): ArrayBuffer {
    const moof = Mp4Box('moof', Mp4FullBox('mfhd', Uint32Bytes(sequence)), traf(2, AUDIO_FRAME_UNITS, 1));
    return toArrayBuffer(ConcatBytes(moof, Mp4Box('mdat', Uint32Bytes(sequence))));
}

/**
 * A 4-byte PCM16 chunk of the agent's voice. Too short to be read as an MP4 box, so a driver that sniffs bytes never
 * takes it for video. `seed` makes each chunk's bytes distinct.
 */
export function ConformancePcm(seed: number = 1): ArrayBuffer {
    return Uint8Array.of(seed & 0xff, 0, seed & 0xff, 0).buffer;
}

/** How to number and label {@link ConformanceChunkFrames}. */
export interface ConformanceChunkOptions {
    /** The first chunk's number in the stream, from 0: it sets its time, its bytes and whether it is a key frame. Default 0. */
    FirstIndex?: number;
    /** The chunks' type. Default `video/h264; codecs="avc1.42e01f"`. */
    MimeType?: string;
}

/**
 * `count` encoded chunks as a raw-frame provider sends them: each with distinct opaque bytes, its presentation time on a
 * 24 fps timeline (chunk `n` at `n` × 1000/24 ms), and a key frame every 24 (chunk 0, 24, 48 …). Nothing decodes them.
 */
export function ConformanceChunkFrames(count: number, options: ConformanceChunkOptions = {}): RealtimeChunkVideoFrame[] {
    const first = options.FirstIndex ?? 0;
    return Array.from({ length: count }, (_, i): RealtimeChunkVideoFrame => {
        const index = first + i;
        return {
            Kind: 'chunk',
            Data: Uint8Array.of(0, 0, 0, 1, 0x65, index & 0xff, (index >> 8) & 0xff).buffer,
            MimeType: options.MimeType ?? CHUNK_MIME_TYPE,
            PresentationTimeMs: FrameTimeMs(index),
            KeyFrame: index % CHUNK_KEY_FRAME_INTERVAL === 0,
        };
    });
}

/** Image `index` of a 24 fps stream: JPEG start and end markers around distinct bytes, timed at `index` × 1000/24 ms. */
export function ConformanceImageFrame(index: number = 0): RealtimeImageVideoFrame {
    return {
        Kind: 'image',
        Data: Uint8Array.of(0xff, 0xd8, index & 0xff, (index >> 8) & 0xff, 0xff, 0xd9).buffer,
        MimeType: IMAGE_MIME_TYPE,
        PresentationTimeMs: FrameTimeMs(index),
        KeyFrame: true,
    };
}

/**
 * A piece of fragmented MP4 as the frame a provider's driver builds from it (Core's `Fmp4PieceToVideoFrame`), labelled
 * `video/mp4`. For this package's own use; a harness gets the frames the kit sends.
 *
 * @throws When the piece is not fragmented MP4.
 */
export function Fmp4Frame(piece: ArrayBuffer): RealtimeFmp4VideoFrame {
    const frame = Fmp4PieceToVideoFrame(piece, 'video/mp4', null);
    if (!frame) {
        throw new Error('The piece is not fragmented MP4.');
    }
    return frame;
}

/** Frame `index`'s presentation time on the kit's 24 fps timeline, in ms. */
export function FrameTimeMs(index: number): number {
    return index * CONFORMANCE_FMP4_FRAME_SECONDS * 1000;
}
