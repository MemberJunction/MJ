/**
 * @fileoverview FRAGMENTED MP4 READER: reads the pieces of a fragmented MP4 stream as a realtime model sends them. A
 * Gemini Live avatar arrives as an init segment (`ftyp` + `moov`) followed by media fragments (`moof` + `mdat`), each
 * piece in its own part.
 *
 * - {@link SniffFmp4Piece} says what a piece opens with, from the type of its first box alone. In an avatar session a
 *   part this recognizes is a piece of the avatar, whatever MIME type the part names.
 * - {@link ReadFmp4Init} reads the tracks an init segment declares: each one's id, its handler (`vide` for video,
 *   `soun` for audio), its codec as RFC 6381 writes it (`avc1.42c01f`, `mp4a.40.2`), its timescale and its sample
 *   defaults (`trex`). The browser client follows the handlers (does the video carry the voice?) and opens its Media
 *   Source buffer with the codecs. For a decoder it also reads an H.264 track's size and parameter sets (`avcC`) and an
 *   AAC track's AudioSpecificConfig (`esds`).
 * - {@link Fmp4VideoSeconds} and {@link Fmp4AudioSeconds} say how many seconds of video or audio a piece carries, from
 *   its sample durations on the init's track of that kind. A session counts the avatar video it generated with the
 *   first; a meeting's floor gate counts how long an avatar piece speaks with the second.
 * - {@link ReadFmp4Fragment} reads a media fragment's samples: track, decode time (`tfdt`), duration, size, whether it
 *   is a key frame, and its bytes.
 * - {@link AvccToAnnexB} and {@link AdtsHeader} turn samples into the elementary streams a decoder reads: H.264 Annex B
 *   (start codes, parameter sets before a key frame, an access unit delimiter after each frame so the decoder closes
 *   the frame at once) and AAC with an ADTS header per frame.
 *
 * Pure: no DOM and no Node APIs, so a browser and a server read the same pieces with the same code. A box whose size
 * runs past the box or piece that holds it, or a track without the boxes that identify it, reads as `null`: the reader
 * never guesses.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/** What a piece of fragmented MP4 opens with: an init segment (`ftyp` or `moov`), or a media segment (`styp` or `moof`). */
export type Fmp4PieceKind = 'init' | 'fragment';

/** An H.264 track's decoder configuration, from its `avcC` record. */
export interface Fmp4AvcConfig {
    /** Bytes in each NAL unit's length prefix inside a sample: 1, 2 or 4. */
    NalLengthSize: number;
    /** The sequence parameter sets, each a NAL unit without a start code. */
    Sps: Uint8Array[];
    /** The picture parameter sets, each a NAL unit without a start code. */
    Pps: Uint8Array[];
}

/** An AAC track's decoder configuration, from the AudioSpecificConfig in its `esds` box. */
export interface Fmp4AacConfig {
    /** The audio object type: 2 for AAC-LC. */
    ObjectType: number;
    /** The sampling frequency index (ISO/IEC 14496-3), or 15 when the rate is written out. */
    SampleRateIndex: number;
    /** The sample rate, in Hz. */
    SampleRate: number;
    /** The channel configuration: 1 for mono, 2 for stereo. */
    Channels: number;
    /** Samples per channel each frame decodes to: 1024, or 960 when the config's frame length flag is set. */
    FrameLength: number;
}

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
    /**
     * The track's timescale (`mdhd`): how many units of the track's media time make a second. Its fragments' sample
     * durations count in these units. `undefined` when the `mdhd` box is missing or says 0.
     */
    Timescale?: number;
    /**
     * The sample duration the init's `trex` box gives the track's fragments, in its timescale, used when a fragment
     * gives none of its own. `undefined` when the init gives none (or gives 0).
     */
    DefaultSampleDuration?: number;
    /** The sample size (bytes) the init's `trex` box gives the track's fragments; `undefined` when it gives none (or 0). */
    DefaultSampleSize?: number;
    /** The sample flags (`sample_flags`) the init's `trex` box gives the track's fragments; `undefined` when none (or 0). */
    DefaultSampleFlags?: number;
    /** A video track's width in pixels, from its sample entry. */
    Width?: number;
    /** A video track's height in pixels, from its sample entry. */
    Height?: number;
    /** An H.264 track's parameter sets and NAL length size. */
    Avc?: Fmp4AvcConfig;
    /** An AAC track's AudioSpecificConfig, read. */
    Aac?: Fmp4AacConfig;
}

/** What an init segment declares. */
export interface Fmp4Init {
    /** The tracks, in the order the `moov` box lists them. */
    Tracks: Fmp4Track[];
}

/** One sample of a media fragment. */
export interface Fmp4Sample {
    /** The track the sample belongs to. */
    TrackID: number;
    /** When it is decoded, in its track's timescale: the fragment's `tfdt` plus the durations of the samples before it. */
    DecodeTime: number;
    /** Presentation time minus decode time, in the track's timescale (0 when the run writes no offsets). */
    CompositionOffset: number;
    /** Its duration, in the track's timescale. */
    Duration: number;
    /** Its size, in bytes. */
    Size: number;
    /** Whether it is a sync sample (a key frame): its flags do not mark it as a non-sync sample. */
    IsSync: boolean;
    /** Its bytes, a view into the piece; `null` when the piece does not hold them (a `moof` without its `mdat`). */
    Data: Uint8Array | null;
}

/** What a media fragment holds. */
export interface Fmp4Fragment {
    /** The samples of every track run, in the order the `moof` boxes list them. */
    Samples: Fmp4Sample[];
}

/** One H.264 access unit in Annex B form. */
export interface Fmp4AnnexBFrame {
    /** The frame's NAL units with start codes, and an access unit delimiter after them. */
    Data: Uint8Array;
    /** Whether the frame holds an IDR slice (a key frame), so a decoder can start at it. */
    IsKeyFrame: boolean;
}

/** One box: its type, and where its payload starts and ends in the bytes being read. */
interface Fmp4Box {
    /** The four-character type, such as `moov`. */
    Type: string;
    /** The offset of the box's first byte (its header). */
    Offset: number;
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

/** A `tfhd` box, read: its track, where its data offsets count from, and the defaults its runs fall back to. */
interface TrackFragmentHeader {
    TrackID: number;
    /** An explicit base data offset: an offset into a whole file, which a piece of a stream can't resolve. */
    BaseDataOffset?: number;
    /** Whether the data offsets count from the `moof` box's first byte (else from where the previous track fragment's data ended). */
    DefaultBaseIsMoof: boolean;
    DefaultDuration?: number;
    DefaultSize?: number;
    DefaultFlags?: number;
}

/** A `trun` box's layout: its fields ahead of the sample records, and where the records are. */
interface TrackRunLayout {
    Version: number;
    Flags: number;
    /** How many samples the run declares. */
    Count: number;
    /** The run's data offset, from the track fragment's base, when it gives one. */
    DataOffset?: number;
    /** The first sample's flags, when the run gives them. */
    FirstSampleFlags?: number;
    /** Where the first sample's record starts. */
    FirstRecord: number;
    /** The bytes in each sample's record. */
    RecordBytes: number;
}

/** What the samples of one track run start from: the track fragment's header, its track, decode time and data position. */
interface TrackRunContext {
    Header: TrackFragmentHeader;
    /** The track the init declares for the fragment, whose `trex` defaults apply. */
    Track?: Fmp4Track;
    /** Where the run's data offset counts from: the `moof` box's first byte, or where the previous track fragment's data ended. */
    BaseOffset: number;
    /** The decode time of the run's first sample. */
    DecodeTime: number;
    /** Where the run's sample data starts when the run gives no data offset. */
    DataPosition: number;
}

/** A track's sample defaults from the init's `trex` box. */
type TrexDefaults = Pick<Fmp4Track, 'DefaultSampleDuration' | 'DefaultSampleSize' | 'DefaultSampleFlags'>;

/** A box header: a 32-bit size and the type. */
const BOX_HEADER_BYTES = 8;
/** A box header whose 32-bit size is 1: a 64-bit size follows the type. */
const LARGE_BOX_HEADER_BYTES = 16;
/** A full box's version and flags, ahead of its fields. */
const FULL_BOX_HEADER_BYTES = 4;
/** A visual sample entry's fields (ISO/IEC 14496-12), ahead of its child boxes such as `avcC`. */
const VISUAL_SAMPLE_ENTRY_BYTES = 78;
/** Where a visual sample entry's width is, after its reserved and pre-defined fields; the height follows it. */
const VISUAL_SAMPLE_ENTRY_WIDTH_OFFSET = 24;
/** An audio sample entry's fields (version 0), ahead of its child boxes such as `esds`. */
const AUDIO_SAMPLE_ENTRY_BYTES = 28;
/** A DecoderConfigDescriptor's fixed fields, ahead of its DecoderSpecificInfo. */
const DECODER_CONFIG_BYTES = 13;
/** The object type indication of MPEG-4 audio (AAC), which RFC 6381 writes as `mp4a.40.<audio object type>`. */
const MPEG4_AUDIO_OBJECT_TYPE = 0x40;
const ES_DESCRIPTOR_TAG = 0x03;
const DECODER_CONFIG_DESCRIPTOR_TAG = 0x04;
const DECODER_SPECIFIC_INFO_TAG = 0x05;
/** `sample_is_non_sync_sample` in a sample's flags. */
const SAMPLE_IS_NON_SYNC = 0x1_0000;
/** The most samples one track run may declare: a run whose entries carry no fields would otherwise be bounded by nothing. */
const MAX_RUN_SAMPLES = 0x1_0000;
/** The AAC sampling frequency table (ISO/IEC 14496-3), indexed by the sampling frequency index. */
const AAC_SAMPLE_RATES: readonly number[] = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/** The sampling frequency index that means the rate is written out in 24 bits. */
const AAC_EXPLICIT_RATE_INDEX = 15;
/** Audio object types whose AudioSpecificConfig continues with a GASpecificConfig (and its frame length flag). */
const AAC_GA_OBJECT_TYPES: ReadonlySet<number> = new Set([1, 2, 3, 4, 6, 7, 17, 19, 20, 21, 22, 23]);
/** An ADTS header without a CRC. */
const ADTS_HEADER_BYTES = 7;
/** The largest ADTS frame, header included: its length field has 13 bits. */
const ADTS_MAX_FRAME_BYTES = 0x1fff;
/** An Annex B start code. */
const START_CODE: readonly number[] = [0, 0, 0, 1];
/** An access unit delimiter NAL unit (type 9, any slice type), with its start code. */
const ACCESS_UNIT_DELIMITER: readonly number[] = [0, 0, 0, 1, 0x09, 0xf0];
const NAL_TYPE_IDR = 5;
const NAL_TYPE_SPS = 7;

/** `tfhd` flags (ISO/IEC 14496-12). */
const TFHD = {
    BaseDataOffset: 0x1,
    SampleDescriptionIndex: 0x2,
    DefaultDuration: 0x8,
    DefaultSize: 0x10,
    DefaultFlags: 0x20,
    DefaultBaseIsMoof: 0x2_0000,
} as const;

/** `trun` flags (ISO/IEC 14496-12). */
const TRUN = {
    DataOffset: 0x1,
    FirstSampleFlags: 0x4,
    Duration: 0x100,
    Size: 0x200,
    Flags: 0x400,
    CompositionOffset: 0x800,
} as const;

/** The `trun` flags that each add four bytes to every sample's record, in record order. */
const TRUN_SAMPLE_FIELDS: readonly number[] = [TRUN.Duration, TRUN.Size, TRUN.Flags, TRUN.CompositionOffset];

/**
 * What a piece of fragmented MP4 opens with, read from the type of its first box (bytes 4 to 8): `'init'` for `ftyp`, or
 * for `moov` (an init segment sent without its `ftyp`), `'fragment'` for `moof` or `styp`, and `null` for anything else,
 * such as raw PCM audio.
 *
 * @param bytes The piece, as an `ArrayBuffer` or a view of one (a `Uint8Array`, a Node `Buffer`).
 */
export function SniffFmp4Piece(bytes: ArrayBuffer | ArrayBufferView): Fmp4PieceKind | null {
    const view = viewOf(bytes);
    if (view.byteLength < BOX_HEADER_BYTES) {
        return null;
    }
    const type = fourCC(view, 4);
    if (type === 'ftyp' || type === 'moov') {
        return 'init';
    }
    return type === 'moof' || type === 'styp' ? 'fragment' : null;
}

/**
 * Reads the tracks an init segment declares. `null` when the piece holds no `moov` box, when a box's size runs past
 * what holds it, or when a track lacks the `tkhd` or `hdlr` box that identifies it. A track whose sample entry this
 * reader does not know is still listed, without a codec. Parameter sets and the AudioSpecificConfig are copied, so the
 * result outlives the piece's buffer (which a caller may transfer to another thread).
 *
 * @param bytes The init segment (`ftyp` + `moov`), as an `ArrayBuffer` or a view of one.
 */
export function ReadFmp4Init(bytes: ArrayBuffer | ArrayBufferView): Fmp4Init | null {
    const view = viewOf(bytes);
    const moov = readBoxes(view, 0, view.byteLength)?.find((box) => box.Type === 'moov');
    const moovBoxes = moov ? childBoxes(view, moov) : null;
    if (!moovBoxes) {
        return null;
    }
    const defaults = readTrexDefaults(view, moovBoxes.find((box) => box.Type === 'mvex'));
    const tracks: Fmp4Track[] = [];
    for (const trak of moovBoxes.filter((box) => box.Type === 'trak')) {
        const track = readTrack(view, trak, defaults);
        if (!track) {
            return null;
        }
        tracks.push(track);
    }
    return { Tracks: tracks };
}

/**
 * The seconds of video a piece of the stream carries: the durations of its samples on the init's video track, in that
 * track's timescale (`mdhd`), summed over every `moof` box in the piece. A sample's duration comes from its `trun`
 * record, else the fragment's `tfhd` default, else the init's `trex` default. Another track's fragments add nothing,
 * so an audio-only fragment of a muxed stream reads as 0, and so does a piece without a `moof` box (an init segment).
 *
 * `null` when the init declares no video track with a timescale, or the piece cannot be read: a box whose size runs
 * past what holds it, a fragment without a readable `tfhd`, or video samples that no box gives a duration.
 *
 * @param bytes A piece of the stream, as an `ArrayBuffer` or a view of one.
 * @param init What the stream's init segment declares ({@link ReadFmp4Init}).
 */
export function Fmp4VideoSeconds(bytes: ArrayBuffer | ArrayBufferView, init: Fmp4Init): number | null {
    return trackSeconds(bytes, init, 'vide');
}

/**
 * The seconds of audio a piece of the stream carries, as {@link Fmp4VideoSeconds} counts video: its samples' durations
 * on the init's audio track. An avatar's audio track is its voice, so this is how long the piece speaks. `null` when
 * the init declares no audio track with a timescale, or the piece cannot be read.
 *
 * @param bytes A piece of the stream, as an `ArrayBuffer` or a view of one.
 * @param init What the stream's init segment declares ({@link ReadFmp4Init}).
 */
export function Fmp4AudioSeconds(bytes: ArrayBuffer | ArrayBufferView, init: Fmp4Init): number | null {
    return trackSeconds(bytes, init, 'soun');
}

/**
 * Reads the samples of a media fragment: every `moof` in the piece, every track fragment in it, every sample of every
 * track run, with decode times from `tfdt` and the init's `trex` defaults where a fragment names none. `null` when the
 * piece holds no `moof`, a box's size runs past what holds it, a track fragment lacks its `tfhd` or `tfdt`, a track run
 * runs past its box, or a sample has no size anywhere. A track fragment that sets an explicit base data offset (an
 * offset into a whole file, not a piece) also reads as `null`.
 *
 * @param bytes The media fragment (`moof` + `mdat`, optionally after a `styp`), as an `ArrayBuffer` or a view of one.
 * @param init The stream's init segment, read: its `trex` defaults apply to the samples.
 */
export function ReadFmp4Fragment(bytes: ArrayBuffer | ArrayBufferView, init: Fmp4Init | null): Fmp4Fragment | null {
    const view = viewOf(bytes);
    const moofs = readBoxes(view, 0, view.byteLength)?.filter((box) => box.Type === 'moof');
    if (!moofs || moofs.length === 0) {
        return null;
    }
    const samples: Fmp4Sample[] = [];
    for (const moof of moofs) {
        const read = readMovieFragment(view, moof, init);
        if (!read) {
            return null;
        }
        samples.push(...read);
    }
    return { Samples: samples };
}

/**
 * Turns one H.264 sample from MP4's length-prefixed NAL units into Annex B: a start code before each NAL unit, the
 * track's parameter sets before an IDR frame that carries none of its own, and an access unit delimiter after the
 * frame, so a decoder reading a stream closes the frame without waiting for the next one. `null` when a length prefix
 * runs past the sample.
 *
 * @param data The sample's bytes.
 * @param avc The track's decoder configuration.
 */
export function AvccToAnnexB(data: Uint8Array, avc: Fmp4AvcConfig): Fmp4AnnexBFrame | null {
    const nals = splitLengthPrefixed(data, avc.NalLengthSize);
    if (!nals) {
        return null;
    }
    const types = nals.map((nal) => nal[0] & 0x1f);
    const isKeyFrame = types.includes(NAL_TYPE_IDR);
    const parameterSets = isKeyFrame && !types.includes(NAL_TYPE_SPS) ? [...avc.Sps, ...avc.Pps] : [];
    const units = [...parameterSets, ...nals];
    const size = units.reduce((total, nal) => total + START_CODE.length + nal.length, ACCESS_UNIT_DELIMITER.length);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const nal of units) {
        out.set(START_CODE, offset);
        out.set(nal, offset + START_CODE.length);
        offset += START_CODE.length + nal.length;
    }
    out.set(ACCESS_UNIT_DELIMITER, offset);
    return { Data: out, IsKeyFrame: isKeyFrame };
}

/**
 * The 7-byte ADTS header (no CRC) that lets a decoder read one raw AAC frame from a stream. `null` for a configuration
 * ADTS cannot describe (an object type above 4, a written-out sample rate, a channel configuration outside 1 to 7) or a
 * frame too large for its 13-bit length.
 *
 * @param aac The track's AudioSpecificConfig, read.
 * @param payloadBytes The raw AAC frame's size in bytes.
 */
export function AdtsHeader(aac: Fmp4AacConfig, payloadBytes: number): Uint8Array | null {
    const frameBytes = ADTS_HEADER_BYTES + payloadBytes;
    const describable = aac.ObjectType >= 1 && aac.ObjectType <= 4 && aac.SampleRateIndex < AAC_SAMPLE_RATES.length && aac.Channels >= 1 && aac.Channels <= 7;
    if (!describable || payloadBytes < 0 || frameBytes > ADTS_MAX_FRAME_BYTES) {
        return null;
    }
    const profile = aac.ObjectType - 1;
    return Uint8Array.from([
        0xff,
        0xf1, // syncword end, MPEG-4, layer 0, no CRC
        (profile << 6) | (aac.SampleRateIndex << 2) | (aac.Channels >> 2),
        ((aac.Channels & 0x3) << 6) | (frameBytes >> 11),
        (frameBytes >> 3) & 0xff,
        ((frameBytes & 0x7) << 5) | 0x1f, // buffer fullness 0x7FF: VBR
        0xfc, // the rest of the fullness, one raw data block
    ]);
}

/** A `DataView` over exactly the given bytes, whether they came as a buffer or as a view into a larger one. */
function viewOf(bytes: ArrayBuffer | ArrayBufferView): DataView {
    return ArrayBuffer.isView(bytes) ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes);
}

/** The four-character code at `offset`. */
function fourCC(view: DataView, offset: number): string {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

/** The bytes from `start` to `end` of the view, copied, so they outlive the view's buffer. */
function copyBytes(view: DataView, start: number, end: number): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset + start, end - start).slice();
}

/** An unsigned 64-bit field as a number (exact below 2^53, which media times stay under). */
function readUint64(view: DataView, offset: number): number {
    return view.getUint32(offset) * 0x1_0000_0000 + view.getUint32(offset + 4);
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
        size = readUint64(view, offset + 8);
        headerBytes = LARGE_BOX_HEADER_BYTES;
    } else if (size32 === 0) {
        size = end - offset;
    }
    if (size < headerBytes || size > end - offset) {
        return null;
    }
    return { Type: fourCC(view, offset + 4), Offset: offset, Start: offset + headerBytes, End: offset + size };
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

// ── Init segment ───────────────────────────────────────────────────────────────

/**
 * One `trak` box as a track: its id, handler, codec, timescale, `trex` sample defaults and decoder configuration.
 * `null` without a readable `tkhd` and `hdlr`.
 */
function readTrack(view: DataView, trak: Fmp4Box, trexDefaults: Map<number, TrexDefaults>): Fmp4Track | null {
    const tkhd = findChild(view, trak, 'tkhd');
    const mdia = findChild(view, trak, 'mdia');
    const hdlr = mdia ? findChild(view, mdia, 'hdlr') : null;
    const trackID = tkhd ? readTrackID(view, tkhd) : null;
    const handler = hdlr ? readHandler(view, hdlr) : null;
    if (!mdia || trackID === null || handler === null) {
        return null;
    }
    const mdhd = findChild(view, mdia, 'mdhd');
    const stsd = findPath(view, mdia, 'minf', 'stbl', 'stsd');
    const entry = stsd ? readBoxes(view, stsd.Start + FULL_BOX_HEADER_BYTES + 4, stsd.End)?.[0] : undefined;
    return {
        TrackID: trackID,
        Handler: handler,
        Codec: entry ? readCodec(view, entry) : undefined,
        Timescale: mdhd ? readTimescale(view, mdhd) : undefined,
        ...trexDefaults.get(trackID),
        ...(entry ? readDecoderConfig(view, entry) : {}),
    };
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

/** `mdhd`'s timescale: after the version and flags, and the creation and modification times (64-bit in version 1). */
function readTimescale(view: DataView, mdhd: Fmp4Box): number | undefined {
    if (mdhd.End - mdhd.Start < FULL_BOX_HEADER_BYTES) {
        return undefined;
    }
    const offset = mdhd.Start + FULL_BOX_HEADER_BYTES + (view.getUint8(mdhd.Start) === 1 ? 16 : 8);
    const timescale = offset + 4 <= mdhd.End ? view.getUint32(offset) : 0;
    return timescale > 0 ? timescale : undefined;
}

/** The codec of a sample entry, when this reader knows it. */
function readCodec(view: DataView, entry: Fmp4Box): string | undefined {
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

/** What a decoder needs from a sample entry: an H.264 entry's size and `avcC`, or an AAC entry's AudioSpecificConfig. */
function readDecoderConfig(view: DataView, entry: Fmp4Box): Pick<Fmp4Track, 'Width' | 'Height' | 'Avc' | 'Aac'> {
    if (entry.Type === 'avc1' || entry.Type === 'avc3') {
        const avcC = findChild(view, entry, 'avcC', VISUAL_SAMPLE_ENTRY_BYTES);
        const avc = avcC ? readAvcConfig(view, avcC) : null;
        return { ...readVisualSize(view, entry), ...(avc ? { Avc: avc } : {}) };
    }
    if (entry.Type === 'mp4a') {
        const aac = readAacConfig(view, entry);
        return aac ? { Aac: aac } : {};
    }
    return {};
}

/** A visual sample entry's width and height, when both are set. */
function readVisualSize(view: DataView, entry: Fmp4Box): Pick<Fmp4Track, 'Width' | 'Height'> {
    const offset = entry.Start + VISUAL_SAMPLE_ENTRY_WIDTH_OFFSET;
    if (offset + 4 > entry.End) {
        return {};
    }
    const width = view.getUint16(offset);
    const height = view.getUint16(offset + 2);
    return width > 0 && height > 0 ? { Width: width, Height: height } : {};
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

/**
 * An `avcC` record's NAL length size and parameter sets: after the version, profile, constraints and level, a byte
 * whose low two bits are the length size minus one, then the SPS count (low five bits) and each SPS with a 16-bit
 * length, then the PPS count and each PPS. `null` when a length runs past the record.
 */
function readAvcConfig(view: DataView, avcC: Fmp4Box): Fmp4AvcConfig | null {
    if (avcC.End - avcC.Start < 6) {
        return null;
    }
    const nalLengthSize = (view.getUint8(avcC.Start + 4) & 0x3) + 1;
    const sps = readParameterSets(view, avcC.Start + 6, avcC.End, view.getUint8(avcC.Start + 5) & 0x1f);
    if (!sps || sps.End >= avcC.End) {
        return null;
    }
    const pps = readParameterSets(view, sps.End + 1, avcC.End, view.getUint8(sps.End));
    return pps && nalLengthSize !== 3 ? { NalLengthSize: nalLengthSize, Sps: sps.Sets, Pps: pps.Sets } : null;
}

/** `count` parameter sets, each a 16-bit length then the NAL unit, from `start`; copied. `null` when one runs past `end`. */
function readParameterSets(view: DataView, start: number, end: number, count: number): { Sets: Uint8Array[]; End: number } | null {
    const sets: Uint8Array[] = [];
    let offset = start;
    for (let i = 0; i < count; i++) {
        if (offset + 2 > end || offset + 2 + view.getUint16(offset) > end) {
            return null;
        }
        const length = view.getUint16(offset);
        sets.push(copyBytes(view, offset + 2, offset + 2 + length));
        offset += 2 + length;
    }
    return { Sets: sets, End: offset };
}

/** An AAC entry's codec from its `esds` box: `mp4a.40.<audio object type>`, such as `mp4a.40.2` for AAC-LC. */
function aacCodec(view: DataView, entry: Fmp4Box): string | undefined {
    const config = readEsdsDecoderConfig(view, entry);
    if (!config || config.ObjectType !== MPEG4_AUDIO_OBJECT_TYPE || !config.SpecificInfo) {
        return undefined;
    }
    const objectType = readAudioObjectType(view, config.SpecificInfo);
    return objectType === undefined ? undefined : `mp4a.40.${objectType}`;
}

/** An AAC entry's AudioSpecificConfig, read; `null` for audio that is not MPEG-4 audio or has no specific info. */
function readAacConfig(view: DataView, entry: Fmp4Box): Fmp4AacConfig | null {
    const config = readEsdsDecoderConfig(view, entry);
    if (!config || config.ObjectType !== MPEG4_AUDIO_OBJECT_TYPE || !config.SpecificInfo) {
        return null;
    }
    return readAudioSpecificConfig(view, config.SpecificInfo);
}

/** An audio entry's `esds` decoder config: the object type indication, and the DecoderSpecificInfo when one is given. */
function readEsdsDecoderConfig(view: DataView, entry: Fmp4Box): { ObjectType: number; SpecificInfo?: Mpeg4Descriptor } | null {
    const esds = findChild(view, entry, 'esds', AUDIO_SAMPLE_ENTRY_BYTES);
    const es = esds ? readDescriptor(view, esds.Start + FULL_BOX_HEADER_BYTES, esds.End) : null;
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
        SpecificInfo: specific?.Tag === DECODER_SPECIFIC_INFO_TAG ? specific : undefined,
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
    const bits = new BitReader(view, info.Start, info.End);
    return readObjectTypeBits(bits) ?? undefined;
}

/** The audio object type at the reader's position (five bits, escape 31 → 32 + six bits); `null` past the end. */
function readObjectTypeBits(bits: BitReader): number | null {
    const objectType = bits.Read(5);
    if (objectType !== 31) {
        return objectType;
    }
    const escaped = bits.Read(6);
    return escaped === null ? null : 32 + escaped;
}

/**
 * AudioSpecificConfig's object type, sampling frequency (an index into the standard table, or 15 and the rate in 24
 * bits), channel configuration and, for the general audio types, the frame length flag (960 samples instead of 1024).
 * `null` when it ends early or names a reserved frequency index.
 */
function readAudioSpecificConfig(view: DataView, info: Mpeg4Descriptor): Fmp4AacConfig | null {
    const bits = new BitReader(view, info.Start, info.End);
    const objectType = readObjectTypeBits(bits);
    const rateIndex = bits.Read(4);
    const explicitRate = rateIndex === AAC_EXPLICIT_RATE_INDEX ? bits.Read(24) : null;
    const channels = bits.Read(4);
    const sampleRate = rateIndex === AAC_EXPLICIT_RATE_INDEX ? explicitRate : rateIndex !== null ? AAC_SAMPLE_RATES[rateIndex] : undefined;
    if (objectType === null || rateIndex === null || channels === null || !sampleRate) {
        return null;
    }
    const shortFrames = AAC_GA_OBJECT_TYPES.has(objectType) && bits.Read(1) === 1;
    return { ObjectType: objectType, SampleRateIndex: rateIndex, SampleRate: sampleRate, Channels: channels, FrameLength: shortFrames ? 960 : 1024 };
}

/**
 * The sample defaults each `trex` box in `mvex` gives a track: after the track id and a sample description index, the
 * default duration, size and flags, each kept when above 0.
 */
function readTrexDefaults(view: DataView, mvex: Fmp4Box | undefined): Map<number, TrexDefaults> {
    const defaults = new Map<number, TrexDefaults>();
    const trexes = (mvex ? childBoxes(view, mvex) : null)?.filter((box) => box.Type === 'trex') ?? [];
    for (const trex of trexes) {
        const fields = trex.Start + FULL_BOX_HEADER_BYTES;
        if (fields + 4 > trex.End) {
            continue;
        }
        const positive = (at: number): number | undefined => (fields + at + 4 <= trex.End && view.getUint32(fields + at) > 0 ? view.getUint32(fields + at) : undefined);
        defaults.set(view.getUint32(fields), { DefaultSampleDuration: positive(8), DefaultSampleSize: positive(12), DefaultSampleFlags: positive(16) });
    }
    return defaults;
}

// ── Durations ──────────────────────────────────────────────────────────────────

/** The seconds a piece carries on the init's first track with `handler`, or `null` (see {@link Fmp4VideoSeconds}). */
function trackSeconds(bytes: ArrayBuffer | ArrayBufferView, init: Fmp4Init, handler: string): number | null {
    const track = init.Tracks.find((candidate) => candidate.Handler === handler);
    if (!track?.Timescale) {
        return null;
    }
    const view = viewOf(bytes);
    const moofs = readBoxes(view, 0, view.byteLength)?.filter((box) => box.Type === 'moof');
    const units = moofs ? sumOrNull(moofs, (moof) => moofDuration(view, moof, track)) : null;
    return units === null ? null : units / track.Timescale;
}

/** The sample durations `track` has in one `moof` box, in its timescale: 0 when the box holds no fragment of it. */
function moofDuration(view: DataView, moof: Fmp4Box, track: Fmp4Track): number | null {
    const trafs = childBoxes(view, moof)?.filter((box) => box.Type === 'traf');
    return trafs ? sumOrNull(trafs, (traf) => trafDuration(view, traf, track)) : null;
}

/** One track fragment's (`traf`) sample durations: 0 when it belongs to another track. */
function trafDuration(view: DataView, traf: Fmp4Box, track: Fmp4Track): number | null {
    const boxes = childBoxes(view, traf);
    const tfhd = boxes?.find((box) => box.Type === 'tfhd');
    const header = tfhd ? readTfhd(view, tfhd) : null;
    if (!boxes || !header) {
        return null;
    }
    if (header.TrackID !== track.TrackID) {
        return 0;
    }
    const defaultDuration = header.DefaultDuration ?? track.DefaultSampleDuration;
    return sumOrNull(boxes.filter((box) => box.Type === 'trun'), (trun) => trunDuration(view, trun, defaultDuration));
}

/**
 * A `trun` box's sample durations added up: each sample's own when its records carry one, else the sample count times
 * the default. `null` when there is no default to fall back on, or the run's fields or records run past the box.
 */
function trunDuration(view: DataView, trun: Fmp4Box, defaultDuration: number | undefined): number | null {
    const layout = readTrackRunLayout(view, trun);
    if (!layout) {
        return null;
    }
    if (!(layout.Flags & TRUN.Duration)) {
        return defaultDuration === undefined ? null : layout.Count * defaultDuration;
    }
    let units = 0;
    for (let i = 0; i < layout.Count; i++) {
        units += view.getUint32(layout.FirstRecord + i * layout.RecordBytes);
    }
    return units;
}

/** The sum of `read` over `items`, or `null` as soon as one of them reads `null`. */
function sumOrNull<T>(items: readonly T[], read: (item: T) => number | null): number | null {
    let total = 0;
    for (const item of items) {
        const value = read(item);
        if (value === null) {
            return null;
        }
        total += value;
    }
    return total;
}

// ── Media fragments ────────────────────────────────────────────────────────────

/** The samples of one `moof`'s track fragments; `null` when one is unreadable. */
function readMovieFragment(view: DataView, moof: Fmp4Box, init: Fmp4Init | null): Fmp4Sample[] | null {
    const trafs = childBoxes(view, moof)?.filter((box) => box.Type === 'traf');
    if (!trafs) {
        return null;
    }
    const samples: Fmp4Sample[] = [];
    let previousDataEnd = moof.Offset;
    for (const traf of trafs) {
        const read = readTrackFragment(view, traf, moof, previousDataEnd, init);
        if (!read) {
            return null;
        }
        samples.push(...read.Samples);
        previousDataEnd = read.DataEnd;
    }
    return samples;
}

/** One `traf`: its header, its decode time and its runs' samples, and where its data ends (the next traf's default base). */
function readTrackFragment(view: DataView, traf: Fmp4Box, moof: Fmp4Box, previousDataEnd: number, init: Fmp4Init | null): { Samples: Fmp4Sample[]; DataEnd: number } | null {
    const children = childBoxes(view, traf);
    const tfhdBox = children?.find((box) => box.Type === 'tfhd');
    const tfdtBox = children?.find((box) => box.Type === 'tfdt');
    const header = tfhdBox ? readTfhd(view, tfhdBox) : null;
    const decodeTime = tfdtBox ? readDecodeTime(view, tfdtBox) : null;
    if (!children || !header || header.BaseDataOffset !== undefined || decodeTime === null) {
        return null;
    }
    const baseOffset = header.DefaultBaseIsMoof ? moof.Offset : previousDataEnd;
    const track = init?.Tracks.find((t) => t.TrackID === header.TrackID);
    const context: TrackRunContext = { Header: header, Track: track, BaseOffset: baseOffset, DecodeTime: decodeTime, DataPosition: baseOffset };
    const samples: Fmp4Sample[] = [];
    for (const trun of children.filter((box) => box.Type === 'trun')) {
        const run = readTrackRun(view, trun, context);
        if (!run) {
            return null;
        }
        samples.push(...run);
    }
    return { Samples: samples, DataEnd: context.DataPosition };
}

/** A full box's 24 bits of flags, after its version byte. */
function readFlags(view: DataView, box: Fmp4Box): number {
    return (view.getUint8(box.Start + 1) << 16) | (view.getUint8(box.Start + 2) << 8) | view.getUint8(box.Start + 3);
}

/**
 * A `tfhd` box, read: its track id, then the fields its flags announce (a 64-bit base data offset, a sample description
 * index, the default sample duration, size and flags). `null` when a field runs past the box.
 */
function readTfhd(view: DataView, tfhd: Fmp4Box): TrackFragmentHeader | null {
    const flags = readFlags(view, tfhd);
    let offset = tfhd.Start + FULL_BOX_HEADER_BYTES;
    if (offset + 4 > tfhd.End) {
        return null;
    }
    const header: TrackFragmentHeader = { TrackID: view.getUint32(offset), DefaultBaseIsMoof: (flags & TFHD.DefaultBaseIsMoof) !== 0 };
    offset += 4;
    if (flags & TFHD.BaseDataOffset) {
        if (offset + 8 > tfhd.End) {
            return null;
        }
        header.BaseDataOffset = readUint64(view, offset);
        offset += 8;
    }
    offset += flags & TFHD.SampleDescriptionIndex ? 4 : 0;
    const fields: Array<[number, 'DefaultDuration' | 'DefaultSize' | 'DefaultFlags']> = [
        [TFHD.DefaultDuration, 'DefaultDuration'],
        [TFHD.DefaultSize, 'DefaultSize'],
        [TFHD.DefaultFlags, 'DefaultFlags'],
    ];
    for (const [flag, field] of fields) {
        if (flags & flag) {
            if (offset + 4 > tfhd.End) {
                return null;
            }
            header[field] = view.getUint32(offset);
            offset += 4;
        }
    }
    return header;
}

/** `tfdt`'s base media decode time: 32-bit in version 0, 64-bit in version 1. `null` when it runs short. */
function readDecodeTime(view: DataView, tfdt: Fmp4Box): number | null {
    const version = view.getUint8(tfdt.Start);
    const offset = tfdt.Start + FULL_BOX_HEADER_BYTES;
    if (offset + (version === 1 ? 8 : 4) > tfdt.End) {
        return null;
    }
    return version === 1 ? readUint64(view, offset) : view.getUint32(offset);
}

/**
 * A `trun` box's layout: the sample count, the data offset and first sample's flags when its flags announce them, and
 * where its sample records are. `null` when its fields or records run past the box, or it declares more samples than
 * {@link MAX_RUN_SAMPLES}.
 */
function readTrackRunLayout(view: DataView, trun: Fmp4Box): TrackRunLayout | null {
    const flags = readFlags(view, trun);
    let offset = trun.Start + FULL_BOX_HEADER_BYTES;
    const fixedBytes = 4 + (flags & TRUN.DataOffset ? 4 : 0) + (flags & TRUN.FirstSampleFlags ? 4 : 0);
    const recordBytes = 4 * TRUN_SAMPLE_FIELDS.filter((field) => flags & field).length;
    if (offset + fixedBytes > trun.End) {
        return null;
    }
    const count = view.getUint32(offset);
    if (count > MAX_RUN_SAMPLES || offset + fixedBytes + count * recordBytes > trun.End) {
        return null;
    }
    offset += 4;
    const dataOffset = flags & TRUN.DataOffset ? view.getInt32(offset) : undefined;
    offset += dataOffset === undefined ? 0 : 4;
    const firstSampleFlags = flags & TRUN.FirstSampleFlags ? view.getUint32(offset) : undefined;
    offset += firstSampleFlags === undefined ? 0 : 4;
    return { Version: view.getUint8(trun.Start), Flags: flags, Count: count, DataOffset: dataOffset, FirstSampleFlags: firstSampleFlags, FirstRecord: offset, RecordBytes: recordBytes };
}

/**
 * One `trun` box's samples, advancing the context's decode time and data position past them. `null` when the run's
 * fields run past its box or a sample has no size.
 */
function readTrackRun(view: DataView, trun: Fmp4Box, context: TrackRunContext): Fmp4Sample[] | null {
    const layout = readTrackRunLayout(view, trun);
    if (!layout) {
        return null;
    }
    if (layout.DataOffset !== undefined) {
        context.DataPosition = context.BaseOffset + layout.DataOffset;
    }
    const samples: Fmp4Sample[] = [];
    for (let i = 0; i < layout.Count; i++) {
        const sample = readRunSample(view, layout, i, context);
        if (!sample) {
            return null;
        }
        samples.push(sample);
    }
    return samples;
}

/** The run's `index`-th sample, with defaults from the track fragment and the init's track; advances the context. */
function readRunSample(view: DataView, layout: TrackRunLayout, index: number, context: TrackRunContext): Fmp4Sample | null {
    const { Header: header, Track: track } = context;
    let position = layout.FirstRecord + index * layout.RecordBytes;
    const field = (flag: number): number | undefined => {
        if (!(layout.Flags & flag)) {
            return undefined;
        }
        position += 4;
        return flag === TRUN.CompositionOffset && layout.Version === 1 ? view.getInt32(position - 4) : view.getUint32(position - 4);
    };
    const duration = field(TRUN.Duration) ?? header.DefaultDuration ?? track?.DefaultSampleDuration ?? 0;
    const size = field(TRUN.Size) ?? header.DefaultSize ?? track?.DefaultSampleSize;
    const firstSampleFlags = index === 0 ? layout.FirstSampleFlags : undefined;
    const sampleFlags = field(TRUN.Flags) ?? firstSampleFlags ?? header.DefaultFlags ?? track?.DefaultSampleFlags ?? 0;
    const compositionOffset = field(TRUN.CompositionOffset) ?? 0;
    if (size === undefined) {
        return null;
    }
    const start = context.DataPosition;
    const inPiece = start >= 0 && start + size <= view.byteLength;
    const sample: Fmp4Sample = {
        TrackID: header.TrackID,
        DecodeTime: context.DecodeTime,
        CompositionOffset: compositionOffset,
        Duration: duration,
        Size: size,
        IsSync: (sampleFlags & SAMPLE_IS_NON_SYNC) === 0,
        Data: inPiece ? new Uint8Array(view.buffer, view.byteOffset + start, size) : null,
    };
    context.DecodeTime += duration;
    context.DataPosition += size;
    return sample;
}

// ── Elementary streams ─────────────────────────────────────────────────────────

/** A sample's NAL units, split at their length prefixes; `null` when a prefix or a unit runs past the sample. */
function splitLengthPrefixed(data: Uint8Array, lengthSize: number): Uint8Array[] | null {
    const nals: Uint8Array[] = [];
    let offset = 0;
    while (offset < data.length) {
        if (offset + lengthSize > data.length) {
            return null;
        }
        let length = 0;
        for (let i = 0; i < lengthSize; i++) {
            length = length * 256 + data[offset + i];
        }
        offset += lengthSize;
        if (length === 0 || offset + length > data.length) {
            return null;
        }
        nals.push(data.subarray(offset, offset + length));
        offset += length;
    }
    return nals;
}

/** Reads big-endian bit fields from a range of bytes. */
class BitReader {
    private position: number;

    constructor(
        private readonly view: DataView,
        start: number,
        private readonly end: number
    ) {
        this.position = start * 8;
    }

    /** The next `count` bits (at most 32) as a number, or `null` when fewer remain. */
    public Read(count: number): number | null {
        if (this.position + count > this.end * 8) {
            return null;
        }
        let value = 0;
        for (let i = 0; i < count; i++) {
            const byte = this.view.getUint8(this.position >> 3);
            value = value * 2 + ((byte >> (7 - (this.position & 7))) & 1);
            this.position++;
        }
        return value;
    }
}

/** A byte as two lowercase hex digits. */
function hex2(value: number): string {
    return value.toString(16).padStart(2, '0');
}
