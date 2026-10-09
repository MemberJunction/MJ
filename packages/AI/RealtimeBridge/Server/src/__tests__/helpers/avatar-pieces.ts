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

function trak(id: number, handler: string, timescale: number): Uint8Array {
    const mdhd = fullBox('mdhd', 0, u32(0), u32(0), u32(timescale), u32(0), u32(0));
    const hdlr = fullBox('hdlr', 0, u32(0), ascii(handler), new Uint8Array(13));
    return box('trak', fullBox('tkhd', 0, new Uint8Array(8), u32(id), new Uint8Array(68)), box('mdia', mdhd, hdlr, box('minf', box('stbl', fullBox('stsd', 0, u32(0))))));
}

/** The video track's id. */
export const VIDEO_TRACK = 1;
/** The audio track's id. */
export const AUDIO_TRACK = 2;

/** An init segment: video track 1 at 90 kHz, audio track 2 at 24 kHz. */
export function AvatarInitPiece(): ArrayBuffer {
    return concat(box('ftyp', ascii('iso5'), u32(512)), box('moov', trak(VIDEO_TRACK, 'vide', 90000), trak(AUDIO_TRACK, 'soun', 24000))).slice().buffer;
}

/** A fragment with one sample on `track` lasting `ms` (default base is the moof; durations and sizes in tfhd). */
export function AvatarFragmentPiece(track: number, ms: number): ArrayBuffer {
    const timescale = track === VIDEO_TRACK ? 90000 : 24000;
    const duration = Math.round((ms / 1000) * timescale);
    const payload = new Uint8Array([1, 2, 3]);
    const traf = (dataOffset: number): Uint8Array =>
        box('traf', fullBox('tfhd', 0x2_0018, u32(track), u32(duration), u32(payload.length)), fullBox('tfdt', 0, u32(0)), fullBox('trun', 0x1, u32(1), u32(dataOffset)));
    const moofLength = box('moof', traf(0)).length;
    return concat(box('moof', traf(moofLength + 8)), box('mdat', payload)).slice().buffer;
}
