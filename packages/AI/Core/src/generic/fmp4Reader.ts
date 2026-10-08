/**
 * @fileoverview FRAGMENTED MP4 READER: reads the pieces of a fragmented MP4 stream as a realtime model sends them. A
 * Gemini Live avatar arrives as an init segment (`ftyp` + `moov`) followed by media fragments (`moof` + `mdat`), each
 * piece in its own part.
 *
 * - {@link SniffFmp4Piece} says what a piece opens with, from the type of its first box alone. A part that names no
 *   MIME type is video when this recognizes it.
 * - {@link ReadFmp4Init} reads the tracks an init segment declares: each one's id, its handler (`vide` for video,
 *   `soun` for audio) and its codec as RFC 6381 writes it (`avc1.42c01f`, `mp4a.40.2`). The browser client follows the
 *   handlers (does the video carry the voice?) and opens its Media Source buffer with the codecs.
 *
 * Pure: no DOM and no Node APIs, so a browser and a server read the same pieces with the same code. A box whose size
 * runs past the box or piece that holds it, or a track without the boxes that identify it, reads as `null`: the reader
 * never guesses.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/** What a piece of fragmented MP4 opens with: an init segment (`ftyp`), or a media segment (`styp` or `moof`). */
export type Fmp4PieceKind = 'init' | 'fragment';

/** One track an init segment declares. */
export interface Fmp4Track {
    /** The track's id (`tkhd`), which its fragments refer to. */
    TrackID: number;
    /** The track's handler (`hdlr`): `'vide'` for video, `'soun'` for audio, or another four-character code. */
    Handler: string;
    /**
     * The track's codec as RFC 6381 writes it, such as `'avc1.42c01f'` (from `avcC`) or `'mp4a.40.2'` (from `esds`).
     * `undefined` for a sample entry this reader does not know.
     */
    Codec?: string;
}

/** What an init segment declares. */
export interface Fmp4Init {
    /** The tracks, in the order the `moov` box lists them. */
    Tracks: Fmp4Track[];
}

/** One box: its type, and where its payload starts and ends in the bytes being read. */
interface Fmp4Box {
    /** The four-character type, such as `moov`. */
    Type: string;
    /** The offset of the first payload byte, after the header. */
    Start: number;
    /** The offset one past the box's last byte. */
    End: number;
}

/** An MPEG-4 descriptor inside an `esds` box: its tag, and where its payload starts and ends. */
interface Mpeg4Descriptor {
    Tag: number;
    Start: number;
    End: number;
}

/** A box header: a 32-bit size and the type. */
const BOX_HEADER_BYTES = 8;
/** A box header whose 32-bit size is 1: a 64-bit size follows the type. */
const LARGE_BOX_HEADER_BYTES = 16;
/** A full box's version and flags, ahead of its fields. */
const FULL_BOX_HEADER_BYTES = 4;
/** A visual sample entry's fields (ISO/IEC 14496-12), ahead of its child boxes such as `avcC`. */
const VISUAL_SAMPLE_ENTRY_BYTES = 78;
/** An audio sample entry's fields (version 0), ahead of its child boxes such as `esds`. */
const AUDIO_SAMPLE_ENTRY_BYTES = 28;
/** A DecoderConfigDescriptor's fixed fields, ahead of its DecoderSpecificInfo. */
const DECODER_CONFIG_BYTES = 13;
/** The object type indication of MPEG-4 audio (AAC), which RFC 6381 writes as `mp4a.40.<audio object type>`. */
const MPEG4_AUDIO_OBJECT_TYPE = 0x40;
const ES_DESCRIPTOR_TAG = 0x03;
const DECODER_CONFIG_DESCRIPTOR_TAG = 0x04;
const DECODER_SPECIFIC_INFO_TAG = 0x05;

/**
 * What a piece of fragmented MP4 opens with, read from the type of its first box (bytes 4 to 8): `'init'` for `ftyp`,
 * `'fragment'` for `moof` or `styp`, and `null` for anything else, such as raw PCM audio.
 *
 * @param bytes The piece, as an `ArrayBuffer` or a view of one (a `Uint8Array`, a Node `Buffer`).
 */
export function SniffFmp4Piece(bytes: ArrayBuffer | ArrayBufferView): Fmp4PieceKind | null {
    const view = viewOf(bytes);
    if (view.byteLength < BOX_HEADER_BYTES) {
        return null;
    }
    const type = fourCC(view, 4);
    if (type === 'ftyp') {
        return 'init';
    }
    return type === 'moof' || type === 'styp' ? 'fragment' : null;
}

/**
 * Reads the tracks an init segment declares. `null` when the piece holds no `moov` box, when a box's size runs past
 * what holds it, or when a track lacks the `tkhd` or `hdlr` box that identifies it. A track whose sample entry this
 * reader does not know is still listed, without a codec.
 *
 * @param bytes The init segment (`ftyp` + `moov`), as an `ArrayBuffer` or a view of one.
 */
export function ReadFmp4Init(bytes: ArrayBuffer | ArrayBufferView): Fmp4Init | null {
    const view = viewOf(bytes);
    const moov = readBoxes(view, 0, view.byteLength)?.find((box) => box.Type === 'moov');
    const traks = moov ? childBoxes(view, moov)?.filter((box) => box.Type === 'trak') : null;
    if (!traks) {
        return null;
    }
    const tracks: Fmp4Track[] = [];
    for (const trak of traks) {
        const track = readTrack(view, trak);
        if (!track) {
            return null;
        }
        tracks.push(track);
    }
    return { Tracks: tracks };
}

/** A `DataView` over exactly the given bytes, whether they came as a buffer or as a view into a larger one. */
function viewOf(bytes: ArrayBuffer | ArrayBufferView): DataView {
    return ArrayBuffer.isView(bytes) ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes);
}

/** The four-character code at `offset`. */
function fourCC(view: DataView, offset: number): string {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

/**
 * The box whose header starts at `offset`, inside a container that ends at `end`. Size 0 means the box runs to the end
 * of its container, size 1 that a 64-bit size follows the type. `null` when the size is smaller than the header or runs
 * past `end`.
 */
function readBoxAt(view: DataView, offset: number, end: number): Fmp4Box | null {
    const size32 = view.getUint32(offset);
    let headerBytes = BOX_HEADER_BYTES;
    let size = size32;
    if (size32 === 1) {
        if (end - offset < LARGE_BOX_HEADER_BYTES) {
            return null;
        }
        size = view.getUint32(offset + 8) * 0x1_0000_0000 + view.getUint32(offset + 12);
        headerBytes = LARGE_BOX_HEADER_BYTES;
    } else if (size32 === 0) {
        size = end - offset;
    }
    if (size < headerBytes || size > end - offset) {
        return null;
    }
    return { Type: fourCC(view, offset + 4), Start: offset + headerBytes, End: offset + size };
}

/**
 * The boxes laid end to end from `start` to `end`. Fewer bytes than a header at the end are ignored (some writers pad a
 * container with a zero terminator); a box that runs past `end` makes the whole level unreadable (`null`).
 */
function readBoxes(view: DataView, start: number, end: number): Fmp4Box[] | null {
    const boxes: Fmp4Box[] = [];
    let offset = start;
    while (end - offset >= BOX_HEADER_BYTES) {
        const box = readBoxAt(view, offset, end);
        if (!box) {
            return null;
        }
        boxes.push(box);
        offset = box.End;
    }
    return boxes;
}

/** The boxes inside `parent`, after `skip` bytes of the parent's own fields. */
function childBoxes(view: DataView, parent: Fmp4Box, skip = 0): Fmp4Box[] | null {
    return readBoxes(view, parent.Start + skip, parent.End);
}

/** The first box of type `type` inside `parent` (after `skip` bytes of fields), or `null`. */
function findChild(view: DataView, parent: Fmp4Box, type: string, skip = 0): Fmp4Box | null {
    return childBoxes(view, parent, skip)?.find((box) => box.Type === type) ?? null;
}

/** Follows a path of box types down from `parent`, such as `minf` → `stbl` → `stsd`. */
function findPath(view: DataView, parent: Fmp4Box, ...types: string[]): Fmp4Box | null {
    let box: Fmp4Box | null = parent;
    for (const type of types) {
        box = box ? findChild(view, box, type) : null;
    }
    return box;
}

/** One `trak` box as a track: its id, its handler and its codec. `null` without a readable `tkhd` and `hdlr`. */
function readTrack(view: DataView, trak: Fmp4Box): Fmp4Track | null {
    const tkhd = findChild(view, trak, 'tkhd');
    const mdia = findChild(view, trak, 'mdia');
    const hdlr = mdia ? findChild(view, mdia, 'hdlr') : null;
    const trackID = tkhd ? readTrackID(view, tkhd) : null;
    const handler = hdlr ? readHandler(view, hdlr) : null;
    if (trackID === null || handler === null) {
        return null;
    }
    const stsd = mdia ? findPath(view, mdia, 'minf', 'stbl', 'stsd') : null;
    return { TrackID: trackID, Handler: handler, Codec: stsd ? readCodec(view, stsd) : undefined };
}

/** `tkhd`'s track id: after the version and flags, and the creation and modification times (64-bit in version 1). */
function readTrackID(view: DataView, tkhd: Fmp4Box): number | null {
    if (tkhd.End - tkhd.Start < FULL_BOX_HEADER_BYTES) {
        return null;
    }
    const offset = tkhd.Start + FULL_BOX_HEADER_BYTES + (view.getUint8(tkhd.Start) === 1 ? 16 : 8);
    return offset + 4 <= tkhd.End ? view.getUint32(offset) : null;
}

/** `hdlr`'s handler type: after the version and flags, and a 32-bit `pre_defined`. */
function readHandler(view: DataView, hdlr: Fmp4Box): string | null {
    const offset = hdlr.Start + FULL_BOX_HEADER_BYTES + 4;
    return offset + 4 <= hdlr.End ? fourCC(view, offset) : null;
}

/** The codec of the first sample entry in `stsd` (after its version, flags and entry count), when this reader knows it. */
function readCodec(view: DataView, stsd: Fmp4Box): string | undefined {
    const entry = readBoxes(view, stsd.Start + FULL_BOX_HEADER_BYTES + 4, stsd.End)?.[0];
    if (!entry) {
        return undefined;
    }
    switch (entry.Type) {
        case 'avc1':
        case 'avc3':
            return avcCodec(view, entry);
        case 'mp4a':
            return aacCodec(view, entry);
        default:
            return undefined;
    }
}

/** An H.264 entry's codec from its `avcC` record: the profile, the constraint flags and the level, `avc1.42c01f`. */
function avcCodec(view: DataView, entry: Fmp4Box): string | undefined {
    const avcC = findChild(view, entry, 'avcC', VISUAL_SAMPLE_ENTRY_BYTES);
    if (!avcC || avcC.End - avcC.Start < 4) {
        return undefined;
    }
    const profile = hex2(view.getUint8(avcC.Start + 1));
    const constraints = hex2(view.getUint8(avcC.Start + 2));
    const level = hex2(view.getUint8(avcC.Start + 3));
    return `${entry.Type}.${profile}${constraints}${level}`;
}

/** An AAC entry's codec from its `esds` box: `mp4a.40.<audio object type>`, such as `mp4a.40.2` for AAC-LC. */
function aacCodec(view: DataView, entry: Fmp4Box): string | undefined {
    const esds = findChild(view, entry, 'esds', AUDIO_SAMPLE_ENTRY_BYTES);
    const config = esds ? readDecoderConfig(view, esds.Start + FULL_BOX_HEADER_BYTES, esds.End) : null;
    if (!config || config.ObjectType !== MPEG4_AUDIO_OBJECT_TYPE || config.AudioObjectType === undefined) {
        return undefined;
    }
    return `mp4a.40.${config.AudioObjectType}`;
}

/** The ES descriptor's decoder config: the object type indication, and the audio object type when one is given. */
function readDecoderConfig(view: DataView, start: number, end: number): { ObjectType: number; AudioObjectType?: number } | null {
    const es = readDescriptor(view, start, end);
    if (!es || es.Tag !== ES_DESCRIPTOR_TAG) {
        return null;
    }
    const decoderConfig = readDescriptor(view, esChildrenStart(view, es), es.End);
    if (!decoderConfig || decoderConfig.Tag !== DECODER_CONFIG_DESCRIPTOR_TAG || decoderConfig.End - decoderConfig.Start < DECODER_CONFIG_BYTES) {
        return null;
    }
    const specific = readDescriptor(view, decoderConfig.Start + DECODER_CONFIG_BYTES, decoderConfig.End);
    return {
        ObjectType: view.getUint8(decoderConfig.Start),
        AudioObjectType: specific?.Tag === DECODER_SPECIFIC_INFO_TAG ? readAudioObjectType(view, specific) : undefined,
    };
}

/**
 * The descriptor at `offset`: a tag, then a size of one to four bytes, seven bits each (a set high bit means another
 * byte follows). `null` when it runs past `end`.
 */
function readDescriptor(view: DataView, offset: number, end: number): Mpeg4Descriptor | null {
    let position = offset + 1;
    let size = 0;
    for (let i = 0; i < 4; i++) {
        if (position >= end) {
            return null;
        }
        const byte = view.getUint8(position++);
        size = (size << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            break;
        }
    }
    return position + size <= end ? { Tag: view.getUint8(offset), Start: position, End: position + size } : null;
}

/** Where an ES descriptor's own descriptors start: after its id and flags, and the fields its flags announce. */
function esChildrenStart(view: DataView, es: Mpeg4Descriptor): number {
    if (es.End - es.Start < 3) {
        return es.End;
    }
    const flags = view.getUint8(es.Start + 2);
    let offset = es.Start + 3;
    if (flags & 0x80) {
        offset += 2; // streamDependenceFlag: dependsOn_ES_ID
    }
    if (flags & 0x40) {
        offset = offset < es.End ? offset + 1 + view.getUint8(offset) : es.End; // URL_Flag: URLlength, URLstring
    }
    if (flags & 0x20) {
        offset += 2; // OCRstreamFlag: OCR_ES_Id
    }
    return offset;
}

/** AudioSpecificConfig's audio object type: five bits, or 32 plus the next six bits after the escape value 31. */
function readAudioObjectType(view: DataView, info: Mpeg4Descriptor): number | undefined {
    if (info.End - info.Start < 1) {
        return undefined;
    }
    const first = view.getUint8(info.Start);
    const objectType = first >> 3;
    if (objectType !== 31) {
        return objectType;
    }
    return info.End - info.Start < 2 ? undefined : 32 + (((first & 0x07) << 3) | (view.getUint8(info.Start + 1) >> 5));
}

/** A byte as two lowercase hex digits. */
function hex2(value: number): string {
    return value.toString(16).padStart(2, '0');
}
