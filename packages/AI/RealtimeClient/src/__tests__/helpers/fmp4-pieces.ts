/**
 * Small fragmented MP4 pieces for the avatar tests, shaped as a Gemini Live avatar sends them: an init segment whose
 * tracks the reader in `@memberjunction/ai` reads (H.264 `avc1.42c01f`, with or without an AAC-LC `mp4a.40.2` track),
 * and media fragments. Nothing here decodes; the pieces only need to be read and routed.
 */

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

function trak(id: number, handler: string, entry: Uint8Array): Uint8Array {
    const tkhd = fullBox('tkhd', new Uint8Array(8), u32(id), new Uint8Array(68));
    const hdlr = fullBox('hdlr', u32(0), ascii(handler), new Uint8Array(13));
    const stbl = box('stbl', fullBox('stsd', u32(1), entry));
    return box('trak', tkhd, box('mdia', fullBox('mdhd', new Uint8Array(20)), hdlr, box('minf', stbl)));
}

const AVC1 = box('avc1', new Uint8Array(6), Uint8Array.of(0, 1), new Uint8Array(70), box('avcC', Uint8Array.of(1, 0x42, 0xc0, 0x1f, 0xff, 0xe0, 0)));
/** ES descriptor (25 bytes) → decoder config (17: AAC, 0x40) → AudioSpecificConfig 0x13 0x08 (AAC-LC); SL config. */
const ESDS = fullBox(
    'esds',
    Uint8Array.of(0x03, 25, 0, 1, 0, 0x04, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 2, 0x13, 0x08, 0x06, 1, 2)
);
const MP4A = box('mp4a', new Uint8Array(6), Uint8Array.of(0, 1), new Uint8Array(8), Uint8Array.of(0, 1, 0, 16), new Uint8Array(4), u32(24000 * 65536), ESDS);

/** An init segment (`ftyp` + `moov`): an H.264 video track, and an AAC-LC audio track unless `audio` is false. */
export function AvatarInitSegment(audio = true): ArrayBuffer {
    const traks = audio ? [trak(1, 'vide', AVC1), trak(2, 'soun', MP4A)] : [trak(1, 'vide', AVC1)];
    return concat(box('ftyp', ascii('iso5'), u32(512)), box('moov', fullBox('mvhd', new Uint8Array(96)), ...traks)).slice().buffer;
}

/** A media fragment (`moof` + `mdat`); `sequence` makes each one's bytes distinct. */
export function AvatarFragment(sequence = 1): ArrayBuffer {
    return concat(box('moof', fullBox('mfhd', u32(sequence))), box('mdat', u32(sequence))).slice().buffer;
}

/** A media segment that opens with `styp`, as CMAF writers send it. */
export function AvatarStypFragment(): ArrayBuffer {
    return concat(box('styp', ascii('msdh')), box('moof', fullBox('mfhd', u32(1))), box('mdat', u32(0))).slice().buffer;
}

/** A piece as a Gemini part carries it: base64. */
export function PieceToBase64(piece: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(piece)));
}
