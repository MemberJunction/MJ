/**
 * Minimal fragmented-MP4 pieces for avatar tests: an init segment with a video track (1, 90 kHz) and an audio track
 * (2, 24 kHz), and one-sample fragments whose durations the floor gate counts.
 */

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
}

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = concat(...payload);
    return concat(u32(8 + body.length), ascii(type), body);
}

const fullBox = (type: string, flags: number, ...payload: Uint8Array[]): Uint8Array => box(type, u32(flags), ...payload);

/** A video frame's size in pixels. */
export interface AvatarVideoSize {
    Width: number;
    Height: number;
}

/** An H.264 sample entry (`avc1`) that gives only the frame size: the visual sample entry's 78 bytes, no `avcC`. */
function avc1(size: AvatarVideoSize): Uint8Array {
    const fields = new Uint8Array(78);
    const view = new DataView(fields.buffer);
    view.setUint16(6, 1); // data_reference_index
    view.setUint16(24, size.Width);
    view.setUint16(26, size.Height);
    return box('avc1', fields);
}

function trak(id: number, handler: string, timescale: number, entry?: Uint8Array): Uint8Array {
    const mdhd = fullBox('mdhd', 0, u32(0), u32(0), u32(timescale), u32(0), u32(0));
    const hdlr = fullBox('hdlr', 0, u32(0), ascii(handler), new Uint8Array(13));
    const stsd = entry ? fullBox('stsd', 0, u32(1), entry) : fullBox('stsd', 0, u32(0));
    return box('trak', fullBox('tkhd', 0, new Uint8Array(8), u32(id), new Uint8Array(68)), box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd))));
}

/** The video track's id. */
export const VIDEO_TRACK = 1;
/** The audio track's id. */
export const AUDIO_TRACK = 2;

/**
 * An init segment: video track 1 at 90 kHz, audio track 2 at 24 kHz.
 *
 * @param videoSize When given, the video track's sample entry gives this frame size; otherwise it has no sample entry.
 */
export function AvatarInitPiece(videoSize?: AvatarVideoSize): ArrayBuffer {
    const video = trak(VIDEO_TRACK, 'vide', 90000, videoSize ? avc1(videoSize) : undefined);
    return concat(box('ftyp', ascii('iso5'), u32(512)), box('moov', video, trak(AUDIO_TRACK, 'soun', 24000))).slice().buffer;
}

/** `sample_is_non_sync_sample` in a sample's flags. */
const NON_SYNC_SAMPLE = 0x1_0000;

/**
 * A fragment with one sample on `track` lasting `ms` (default base is the moof; durations and sizes in tfhd).
 *
 * @param options `KeyFrame: false` marks the sample non-sync (tfhd default flags); by default no flags are written, so
 *   the sample reads as a key frame.
 */
export function AvatarFragmentPiece(track: number, ms: number, options: { KeyFrame?: boolean } = {}): ArrayBuffer {
    const timescale = track === VIDEO_TRACK ? 90000 : 24000;
    const duration = Math.round((ms / 1000) * timescale);
    const payload = new Uint8Array([1, 2, 3]);
    const tfhd = options.KeyFrame === false
        ? fullBox('tfhd', 0x2_0038, u32(track), u32(duration), u32(payload.length), u32(NON_SYNC_SAMPLE))
        : fullBox('tfhd', 0x2_0018, u32(track), u32(duration), u32(payload.length));
    const traf = (dataOffset: number): Uint8Array => box('traf', tfhd, fullBox('tfdt', 0, u32(0)), fullBox('trun', 0x1, u32(1), u32(dataOffset)));
    const moofLength = box('moof', traf(0)).length;
    return concat(box('moof', traf(moofLength + 8)), box('mdat', payload)).slice().buffer;
}

/** A piece that opens like an init segment (`ftyp`) but holds no `moov`, so no reader can read its tracks. */
export function UnreadableAvatarInitPiece(): ArrayBuffer {
    return box('ftyp', ascii('iso5'), u32(512)).slice().buffer;
}
