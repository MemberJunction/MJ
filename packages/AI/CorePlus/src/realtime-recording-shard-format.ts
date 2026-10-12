/**
 * MJOPUS1: the binary wire format of one realtime-recording shard.
 *
 * A client-direct realtime call is recorded in the browser as one continuous Opus packet stream
 * (one encoder per call). That stream is cut into ~5 s shards, each uploaded independently, so a
 * crash or closed tab loses at most the unsent tail. The browser recorder, the MJAPI REST routes
 * and server-side assembly all share this format, which is why it lives in this platform-free
 * package.
 *
 * Why not Ogg: a single encoder spans every shard, so a shard is a slice of a packet stream, not a
 * self-contained stream. Ogg would force per-shard page headers, granule positions and CRCs that
 * would be re-derived and discarded on the server. Length-prefixed raw packets are enough, and the
 * explicit `StartSample`/`SampleCount` keep timing exact without consulting the wall clock.
 *
 * Layout (all integers little-endian):
 *
 * | Offset | Size | Field                                   |
 * |--------|------|-----------------------------------------|
 * | 0      | 7    | ASCII magic `MJOPUS1`                   |
 * | 7      | 1    | u8 format version (1)                   |
 * | 8      | 4    | u32 shard index                         |
 * | 12     | 4    | u32 start sample, low 32 bits           |
 * | 16     | 4    | u32 start sample, high 32 bits          |
 * | 20     | 4    | u32 sample count                        |
 * | 24     | 4    | u32 packet count                        |
 * | 28     | ...  | per packet: u16 length, then the bytes  |
 *
 * `StartSample` is split in two u32s because a call longer than a day exceeds 2^32 samples at
 * 48 kHz; it is validated to be a safe integer so it round-trips through a JS number exactly.
 *
 * @module @memberjunction/ai-core-plus
 */

/** Capture and shard timing rate. Every shard's sample counts are in this unit. */
export const RECORDING_SAMPLE_RATE = 48000;
/** One Opus frame: 20 ms at 48 kHz. */
export const RECORDING_FRAME_SAMPLES = 960;
/** Packets in a full 5 s shard window. */
export const RECORDING_SHARD_WINDOW_PACKETS = 250;
/** Upper bound on a shard request body. */
export const RECORDING_SHARD_MAX_BYTES = 128 * 1024;
/** Upper bound on a terminal (keepalive) request body, which must fit the browser's keepalive budget. */
export const RECORDING_TERMINAL_MAX_BYTES = 48 * 1024;
/** Fixed header size in bytes. */
export const RECORDING_SHARD_HEADER_BYTES = 28;
/** Largest packet libopus can emit (RFC 6716: 1275 bytes). */
export const RECORDING_MAX_OPUS_PACKET_BYTES = 1275;
/** Current wire format version. */
export const RECORDING_SHARD_FORMAT_VERSION = 1;
/** ASCII magic at the start of every shard. */
export const RECORDING_SHARD_MAGIC = 'MJOPUS1';

const MAGIC_LENGTH = 7;
const VERSION_OFFSET = 7;
const SHARD_INDEX_OFFSET = 8;
const START_LOW_OFFSET = 12;
const START_HIGH_OFFSET = 16;
const SAMPLE_COUNT_OFFSET = 20;
const PACKET_COUNT_OFFSET = 24;
const PACKET_LENGTH_PREFIX_BYTES = 2;
const U32_RANGE = 2 ** 32;
const U16_MAX = 0xffff;
/** A shard may exceed one window (a VBR-sealed or merged shard), but never by more than this factor. */
const MAX_PACKETS_PER_SHARD = 2 * RECORDING_SHARD_WINDOW_PACKETS;

/** The fixed-size part of a shard. */
export interface RecordingShardHeader {
    /** Zero-based position of this shard in the call's shard sequence. */
    ShardIndex: number;
    /** Sample offset (48 kHz) of the shard's first frame from the start of the recording. */
    StartSample: number;
    /** Audio samples this shard covers; at most `PacketCount * 960`. */
    SampleCount: number;
    /** Number of Opus packets that follow the header. */
    PacketCount: number;
}

/** A shard header plus its Opus packets. Parsed packets may be views into the input buffer. */
export interface RecordingShardContents extends RecordingShardHeader {
    Packets: Uint8Array[];
}

/** Thrown when shard bytes or shard contents violate the MJOPUS1 format. */
export class RecordingShardFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RecordingShardFormatError';
    }
}

function assertU32(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0 || value >= U32_RANGE) {
        throw new RecordingShardFormatError(`${field} must be an unsigned 32-bit integer, got ${value}`);
    }
}

function assertSafeStartSample(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RecordingShardFormatError(`start sample must be a non-negative safe integer, got ${value}`);
    }
}

/** Checks the cross-field invariants shared by encode and parse (header only, no packet bytes). */
function assertHeaderConsistent(header: RecordingShardHeader): void {
    assertU32(header.ShardIndex, 'shard index');
    assertSafeStartSample(header.StartSample);
    assertU32(header.SampleCount, 'sample count');
    assertU32(header.PacketCount, 'packet count');
    if (header.PacketCount > MAX_PACKETS_PER_SHARD) {
        throw new RecordingShardFormatError(
            `packet count ${header.PacketCount} exceeds the maximum of ${MAX_PACKETS_PER_SHARD} per shard`
        );
    }
    if (header.SampleCount > header.PacketCount * RECORDING_FRAME_SAMPLES) {
        throw new RecordingShardFormatError(
            `sample count ${header.SampleCount} exceeds what ${header.PacketCount} packets can carry`
        );
    }
}

/**
 * Serializes a shard to MJOPUS1 bytes.
 *
 * The encoder deliberately enforces only what the byte layout itself needs (u16 packet lengths,
 * header consistency); the Opus packet-size ceiling is enforced by {@link ParseRecordingShard},
 * the trust boundary where untrusted bytes arrive.
 *
 * @throws RecordingShardFormatError when `PacketCount` disagrees with `Packets`, a header field is
 *   out of range, or a packet length cannot be stored in a u16 (or is zero).
 */
export function EncodeRecordingShard(shard: RecordingShardContents): Uint8Array {
    if (shard.PacketCount !== shard.Packets.length) {
        throw new RecordingShardFormatError(
            `packet count ${shard.PacketCount} does not match the ${shard.Packets.length} packets supplied`
        );
    }
    assertHeaderConsistent(shard);

    let total = RECORDING_SHARD_HEADER_BYTES;
    for (const packet of shard.Packets) {
        if (packet.length < 1 || packet.length > U16_MAX) {
            throw new RecordingShardFormatError(`packet length ${packet.length} cannot be encoded`);
        }
        total += PACKET_LENGTH_PREFIX_BYTES + packet.length;
    }

    const bytes = new Uint8Array(total);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < MAGIC_LENGTH; i++) {
        bytes[i] = RECORDING_SHARD_MAGIC.charCodeAt(i);
    }
    view.setUint8(VERSION_OFFSET, RECORDING_SHARD_FORMAT_VERSION);
    view.setUint32(SHARD_INDEX_OFFSET, shard.ShardIndex, true);
    view.setUint32(START_LOW_OFFSET, shard.StartSample % U32_RANGE, true);
    view.setUint32(START_HIGH_OFFSET, Math.floor(shard.StartSample / U32_RANGE), true);
    view.setUint32(SAMPLE_COUNT_OFFSET, shard.SampleCount, true);
    view.setUint32(PACKET_COUNT_OFFSET, shard.PacketCount, true);

    let offset = RECORDING_SHARD_HEADER_BYTES;
    for (const packet of shard.Packets) {
        view.setUint16(offset, packet.length, true);
        bytes.set(packet, offset + PACKET_LENGTH_PREFIX_BYTES);
        offset += PACKET_LENGTH_PREFIX_BYTES + packet.length;
    }
    return bytes;
}

/**
 * Parses and validates MJOPUS1 bytes. Returned packets are subarray views of `bytes`, so the
 * caller must not mutate or reuse the input buffer while they are in use.
 *
 * @throws RecordingShardFormatError on any structural violation (magic, version, truncation,
 *   trailing bytes, bad packet length, inconsistent counts, unsafe start sample).
 */
export function ParseRecordingShard(bytes: Uint8Array): RecordingShardContents {
    if (bytes.length < RECORDING_SHARD_HEADER_BYTES) {
        throw new RecordingShardFormatError(
            `shard is truncated: ${bytes.length} bytes is shorter than the ${RECORDING_SHARD_HEADER_BYTES}-byte header`
        );
    }
    for (let i = 0; i < MAGIC_LENGTH; i++) {
        if (bytes[i] !== RECORDING_SHARD_MAGIC.charCodeAt(i)) {
            throw new RecordingShardFormatError(`bad magic: expected ${RECORDING_SHARD_MAGIC}`);
        }
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint8(VERSION_OFFSET);
    if (version !== RECORDING_SHARD_FORMAT_VERSION) {
        throw new RecordingShardFormatError(
            `unsupported format version ${version}, expected ${RECORDING_SHARD_FORMAT_VERSION}`
        );
    }

    const startLow = view.getUint32(START_LOW_OFFSET, true);
    const startHigh = view.getUint32(START_HIGH_OFFSET, true);
    const header: RecordingShardHeader = {
        ShardIndex: view.getUint32(SHARD_INDEX_OFFSET, true),
        // Float math is exact here: high * 2^32 + low is only trusted after the safe-integer check below.
        StartSample: startHigh * U32_RANGE + startLow,
        SampleCount: view.getUint32(SAMPLE_COUNT_OFFSET, true),
        PacketCount: view.getUint32(PACKET_COUNT_OFFSET, true),
    };
    assertHeaderConsistent(header);

    const packets: Uint8Array[] = [];
    let offset = RECORDING_SHARD_HEADER_BYTES;
    for (let i = 0; i < header.PacketCount; i++) {
        if (offset + PACKET_LENGTH_PREFIX_BYTES > bytes.length) {
            throw new RecordingShardFormatError(`shard is truncated: packet ${i} has no length prefix`);
        }
        const length = view.getUint16(offset, true);
        if (length < 1 || length > RECORDING_MAX_OPUS_PACKET_BYTES) {
            throw new RecordingShardFormatError(`invalid packet length ${length} in packet ${i}`);
        }
        offset += PACKET_LENGTH_PREFIX_BYTES;
        if (offset + length > bytes.length) {
            throw new RecordingShardFormatError(`shard is truncated: packet ${i} needs ${length} bytes`);
        }
        packets.push(bytes.subarray(offset, offset + length));
        offset += length;
    }
    if (offset !== bytes.length) {
        throw new RecordingShardFormatError(`${bytes.length - offset} trailing bytes after the last packet`);
    }
    return { ...header, Packets: packets };
}
