/**
 * @fileoverview Server-side assembly of a client-direct realtime recording from its `MJOPUS1` shard
 * ledger into `recording.wav` + `peaks.json`.
 *
 * The browser encodes the whole call with ONE Opus encoder and cuts the packet stream into ~5 s shards,
 * so the shards are slices of one stream, not standalone files. Assembly therefore decodes every packet,
 * in index order, with ONE decoder, and places each shard's audio at its own `StartSample` (48 kHz): the
 * timing comes from the shard headers, never from the wall clock, so transcript cues stay aligned even
 * when a shard is missing and its range is filled with silence.
 *
 * Two layers:
 * - {@link AssembleOpusRecordingPcm}, {@link ComputeRecordingPeaks}, {@link EncodePcm16Wav}: pure.
 * - {@link AssembleRealtimeRecordingFromLedger}: the orchestration a claimed assembly runs (load, decode,
 *   store, fenced finish). It never throws.
 *
 * @module @memberjunction/ai-agents
 */
import { endianness } from 'os';
import { Decoder } from '@evan/opus';
import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentSessionEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    ParseRecordingShard, RecordingShardContents, RecordingShardFormatError, RECORDING_SAMPLE_RATE, RECORDING_SHARD_WINDOW_PACKETS, RECORDING_FRAME_SAMPLES,
} from '@memberjunction/ai-core-plus';
import { IRealtimeRecordingLedger, LedgerShard, LedgerShardMetadata } from './realtime-recording-ledger';
import {
    LinkRecordingToSession, RecordingFolder, ResolveRecordingStorageAccountID, ResolveStorageAccountIDForProvider,
    WriteRecordingPeaksSidecar, WriteRecordingWavHeader, RECORDING_WAV_HEADER_BYTES,
} from './realtime-recording-store';

/** A silent range of the assembled recording and the shard indexes whose absence caused it. */
export interface RecordingGap {
    /** First silent sample (48 kHz). */
    startSample: number;
    /** Number of silent samples. */
    sampleCount: number;
    /** Missing shard indexes covered by the gap; empty when shards are present but do not abut. */
    indexes: number[];
}

/** Decodes one Opus packet at a time, keeping decoder state across calls (one stream). */
export interface IOpusPacketDecoder {
    /** Decodes one packet to mono PCM16 samples. The returned array is owned by the caller. */
    Decode(packet: Uint8Array): Int16Array;
    /**
     * Resets the decoder state. Called after a gap, so the previous shard's state (and packet-loss
     * concealment based on it) does not smear into the first frames after the gap.
     */
    Reset(): void;
}

/** A shard whose packets libopus could not decode; its whole range was left silent (and listed as a gap). */
export interface ShardDecodeFailure {
    ShardIndex: number;
    PacketIndex: number;
    Message: string;
}

/** Result of {@link AssembleOpusRecordingPcm}. */
export interface AssembledOpusRecording {
    /** Mono PCM16 at 48 kHz. On little-endian hosts this is a view over `Wav`'s data section. */
    Pcm: Int16Array;
    /** The recording as a canonical 44-byte-header mono PCM16 WAV holding `Pcm`. */
    Wav: Buffer;
    /** Silent ranges, in timeline order. */
    Gaps: RecordingGap[];
    /** Shards dropped because a packet failed to decode (each is also in `Gaps`). */
    DecodeFailures: ShardDecodeFailure[];
    /** True when the terminal counts are known and the timeline matches them (shard count == expected, length == captured). */
    /**
     * The gap of the run of missing indexes from 0 up to the first present shard (the whole timeline when
     * none is present), or null when shard 0 is present. One of `Gaps`; the only range
     * {@link FillGapsFromPreviousRecording} may reuse.
     */
    LeadingMissingRun: RecordingGap | null;
    TerminalMatched: boolean;
    /** `TerminalMatched` and no gaps: every expected range holds decoded (or reused, see {@link FillGapsFromPreviousRecording}) audio. */
    Complete: boolean;
}

/** A recording assembled earlier for the same session: its samples and the gaps it was finished with. */
export interface PreviousRecording {
    Pcm: Int16Array;
    Gaps: RecordingGap[];
}

/**
 * A deterministic assembly failure: re-running against the same data fails the same way (bounds
 * exceeded, overlapping or duplicate shards, no storage account, agent not loadable), so the recording
 * is finished as `Failed`. Any other error is treated as transient (see {@link AssembleRealtimeRecordingFromLedger}).
 */
export class RecordingAssemblyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RecordingAssemblyError';
    }
}

/**
 * Outcome of {@link AssembleRealtimeRecordingFromLedger}. `Retry`: a transient failure left the claim in
 * `Assembling` for a stale re-claim to retry.
 */
export type AssembleRealtimeRecordingOutcome = 'Complete' | 'Partial' | 'Failed' | 'Superseded' | 'Deferred' | 'Retry';

/** Input to {@link AssembleRealtimeRecordingFromLedger}. */
export interface AssembleRealtimeRecordingInput {
    SessionID: string;
    /** The version {@link IRealtimeRecordingLedger.ClaimAssembly} returned for this assembly. */
    Version: number;
    Ledger: IRealtimeRecordingLedger;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /**
     * Assemble what exists even when shards are missing (gaps become silence; the result is `Partial`).
     * Without it, an incomplete ledger hands the claim back (`Deferred`) so a later assembly can finish
     * it once the missing shards arrive or the grace period runs out.
     */
    ForcePartial?: boolean;
}

/**
 * Most shards one assembly accepts. At 5 s per shard this is ~2.8 h, past any real call; a larger
 * count (from the terminal signal or the ledger) is corrupt or hostile, and assembling it would allocate
 * an unbounded PCM buffer, so assembly refuses it.
 */
export const MAX_ASSEMBLY_SHARDS = 2000;

/**
 * Most samples one assembly produces: 3 h at 48 kHz. The WAV is 2 bytes per sample (~1 GB at this cap;
 * on big-endian hosts a separate PCM array doubles that), so this is the memory ceiling of one
 * assembly; the captured count comes from the browser, so it must be bounded before anything is allocated.
 */
export const MAX_ASSEMBLY_SAMPLES = RECORDING_SAMPLE_RATE * 60 * 180;

/** Largest value of the shard ledger's INT `Index` column: "below this" counts every stored shard. */
const SQL_INT_MAX = 2_147_483_647;

/** Waveform buckets, matching the browser's capture-time `PeakAccumulator`. */
const PEAK_BUCKETS = 600;
const BYTES_PER_SAMPLE = 2;

/**
 * Lays a session's shards out on one 48 kHz timeline and decodes them with one decoder.
 *
 * - A present shard is decoded packet by packet; exactly `SampleCount` samples are kept (decoded audio
 *   past it is dropped, a shortfall stays silent). Every packet is still decoded so the decoder state
 *   stays continuous into the next shard.
 * - A run of missing indexes becomes one silent gap from the end of the previous shard to the start of
 *   the next present one (a trailing run: to the end of the recording), listing the missing indexes.
 * - A present shard that starts after the end of the previous one leaves a silent gap with no indexes.
 * - A shard with a packet libopus cannot decode is silenced whole, listed as a gap with its index and
 *   in `DecodeFailures`.
 * - After any gap the decoder is reset.
 *
 * The samples are decoded straight into the returned WAV's data section (see `allocatePcm16Wav`).
 *
 * The shard count is `expectedShards`, or the highest present index + 1 when no terminal signal has
 * arrived. The length is `capturedSamples`, or the end of the last shard when unknown (and never less
 * than the end of the last shard: audio past a stale terminal is kept, not cut).
 *
 * @param shards Parsed shards (any order, unique indexes).
 * @param expectedShards Shard count from the terminal signal, or null when none arrived.
 * @param capturedSamples Captured sample count from the terminal signal, or null.
 * @param decoder The one decoder for this stream.
 * @throws RecordingAssemblyError on a duplicate index, a shard overlapping the audio before it, or a
 *   shard/sample count over {@link MAX_ASSEMBLY_SHARDS} / {@link MAX_ASSEMBLY_SAMPLES}.
 */
export function AssembleOpusRecordingPcm(
    shards: RecordingShardContents[], expectedShards: number | null, capturedSamples: number | null, decoder: IOpusPacketDecoder
): AssembledOpusRecording {
    const byIndex = indexShards(shards);
    const ordered = [...byIndex.values()].sort((a, b) => a.ShardIndex - b.ShardIndex);
    const last = ordered[ordered.length - 1];
    const highestIndex = last ? last.ShardIndex : -1;
    const lastEnd = last ? last.StartSample + last.SampleCount : 0;
    const shardCount = Math.max(expectedShards ?? 0, highestIndex + 1);
    const length = Math.max(capturedSamples ?? 0, lastEnd);
    AssertRecordingAssemblyBounds(shardCount, length);

    const output = allocatePcm16Wav(length, RECORDING_SAMPLE_RATE);
    const pcm = output.Pcm;
    const gaps: RecordingGap[] = [];
    const decodeFailures: ShardDecodeFailure[] = [];
    let position = 0;
    let missing: number[] = [];
    let decodedAny = false;
    let leadingMissingRun: RecordingGap | null = null;
    for (let index = 0; index < shardCount; index++) {
        const shard = byIndex.get(index);
        if (!shard) {
            missing.push(index);
            continue;
        }
        if (shard.StartSample < position) {
            throw new RecordingAssemblyError(`shard ${index} starts at sample ${shard.StartSample}, before the end of the audio before it (${position})`);
        }
        if (shard.StartSample > position || missing.length > 0) {
            const gap: RecordingGap = { startSample: position, sampleCount: shard.StartSample - position, indexes: missing };
            gaps.push(gap);
            if (!decodedAny && missing.length > 0) {
                leadingMissingRun = gap;
            }
            missing = [];
            if (decodedAny) {
                decoder.Reset();
            }
        }
        const failure = decodeShardInto(pcm, shard, decoder);
        if (failure) {
            // One bad packet costs its shard, not the recording: silence the whole shard, list it as a gap,
            // and reset so the next shard does not start from a broken decoder state.
            pcm.fill(0, shard.StartSample, shard.StartSample + shard.SampleCount);
            gaps.push({ startSample: shard.StartSample, sampleCount: shard.SampleCount, indexes: [index] });
            decodeFailures.push(failure);
            decoder.Reset();
        }
        decodedAny = true;
        position = shard.StartSample + shard.SampleCount;
    }
    if (position < length || missing.length > 0) {
        const gap: RecordingGap = { startSample: position, sampleCount: length - position, indexes: missing };
        gaps.push(gap);
        if (!decodedAny && missing.length > 0) {
            leadingMissingRun = gap;
        }
    }

    const terminalMatched = expectedShards !== null && capturedSamples !== null
        && shardCount === expectedShards && length === capturedSamples;
    return {
        Pcm: pcm, Wav: output.Finish(), Gaps: gaps, DecodeFailures: decodeFailures, LeadingMissingRun: leadingMissingRun,
        TerminalMatched: terminalMatched, Complete: terminalMatched && gaps.length === 0,
    };
}

/**
 * Most samples one shard can carry: the format caps a shard at two windows of packets (see
 * `ParseRecordingShard`), each packet at most one 960-sample frame of kept audio.
 */
const MAX_SHARD_SAMPLES = 2 * RECORDING_SHARD_WINDOW_PACKETS * RECORDING_FRAME_SAMPLES;

/**
 * Fills the leading run of missing shards from the session's previous recording.
 *
 * Why: a Complete assembly deletes its shard rows (everything below its expected count). When a strictly
 * higher terminal later re-opens the session (the tab was hidden, a terminal went out, the call
 * continued), the re-assembly finds those indexes missing. Their audio lives only in the previous
 * `recording.wav`, so it is copied back rather than overwritten with silence.
 *
 * Why only the LEADING run (indexes 0 up to the first present shard): that prefix is exactly what a
 * Complete deletes, and every later assembly reproduces it identically from the same file, so it is the
 * same audio whichever assembly wrote the object last. A later missing range is different: an assembly
 * may have overwritten the object with silence there and then lost its fence or failed to finish, so the
 * object can be newer than the stored `RecordingGaps`, and reusing it could report silence as audio.
 * Those ranges stay silent gaps.
 *
 * Within the reused range the previous recording's own gaps are carried over (clipped), since those
 * samples are its silence. The part of the run beyond the previous recording's length stays silent and
 * stays a gap; the run's rows are gone, so per-index boundaries are unknown, and the remainder lists the
 * indexes that can hold samples past the old end: an index `i` ends no later than
 * `(i + 1) * MAX_SHARD_SAMPLES`, so indexes that provably end inside the old recording are dropped.
 *
 * Returns a new result (the samples are written in place) with `Complete` recomputed.
 */
export function FillGapsFromPreviousRecording(assembled: AssembledOpusRecording, previous: PreviousRecording): AssembledOpusRecording {
    const { Pcm: pcm } = assembled;
    const run = assembled.LeadingMissingRun;
    const reuseEnd = run ? Math.min(run.startSample + run.sampleCount, previous.Pcm.length) : 0;
    if (!run || reuseEnd <= run.startSample) {
        return assembled;
    }
    const runEnd = run.startSample + run.sampleCount;
    pcm.set(previous.Pcm.subarray(run.startSample, reuseEnd), run.startSample);
    const gaps: RecordingGap[] = assembled.Gaps.filter(gap => gap !== run);
    for (const old of previous.Gaps) {
        const start = Math.max(old.startSample, run.startSample);
        const end = Math.min(old.startSample + old.sampleCount, reuseEnd);
        if (end > start) {
            gaps.push({ startSample: start, sampleCount: end - start, indexes: old.indexes });
        }
    }
    if (runEnd > reuseEnd) {
        const indexes = run.indexes.filter(i => (i + 1) * MAX_SHARD_SAMPLES > reuseEnd);
        gaps.push({ startSample: reuseEnd, sampleCount: runEnd - reuseEnd, indexes });
    }
    gaps.sort((a, b) => a.startSample - b.startSample);
    // On little-endian hosts Pcm is a view of the WAV, so the copy above already landed in it.
    const wav = pcm.buffer === assembled.Wav.buffer ? assembled.Wav : EncodePcm16Wav(pcm, RECORDING_SAMPLE_RATE);
    return { ...assembled, Wav: wav, Gaps: gaps, Complete: assembled.TerminalMatched && gaps.length === 0 };
}

/**
 * The samples of a canonical recording WAV (exactly the 44-byte mono PCM16 48 kHz layout
 * `WriteRecordingWavHeader` writes, data size matching the file), or null for anything else. Only such
 * a file is trusted as a previous assembly's output.
 */
export function ParseCanonicalRecordingWav(bytes: Uint8Array): Int16Array | null {
    if (bytes.length < RECORDING_WAV_HEADER_BYTES) {
        return null;
    }
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dataSize = buffer.length - RECORDING_WAV_HEADER_BYTES;
    const canonical = buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.readUInt32LE(4) === 36 + dataSize
        && buffer.toString('ascii', 8, 16) === 'WAVEfmt '
        && buffer.readUInt32LE(16) === 16
        && buffer.readUInt16LE(20) === 1
        && buffer.readUInt16LE(22) === 1
        && buffer.readUInt32LE(24) === RECORDING_SAMPLE_RATE
        && buffer.readUInt32LE(28) === RECORDING_SAMPLE_RATE * BYTES_PER_SAMPLE
        && buffer.readUInt16LE(32) === BYTES_PER_SAMPLE
        && buffer.readUInt16LE(34) === 16
        && buffer.toString('ascii', 36, 40) === 'data'
        && buffer.readUInt32LE(40) === dataSize
        && dataSize % BYTES_PER_SAMPLE === 0;
    if (!canonical) {
        return null;
    }
    const dataOffset = buffer.byteOffset + RECORDING_WAV_HEADER_BYTES;
    if (endianness() === 'LE' && dataOffset % BYTES_PER_SAMPLE === 0) {
        // A view, not a copy: the previous recording can be as large as the new one.
        return new Int16Array(buffer.buffer, dataOffset, dataSize / BYTES_PER_SAMPLE);
    }
    const samples = new Int16Array(dataSize / BYTES_PER_SAMPLE);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = buffer.readInt16LE(RECORDING_WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE);
    }
    return samples;
}

/**
 * Throws when an assembly would exceed {@link MAX_ASSEMBLY_SHARDS} or {@link MAX_ASSEMBLY_SAMPLES}.
 * Checked twice on purpose: by the orchestrator on the session's terminal counts BEFORE loading any
 * shard rows, and by {@link AssembleOpusRecordingPcm} on the counts derived from the shards themselves
 * (the only counts there are when no terminal signal arrived).
 */
export function AssertRecordingAssemblyBounds(shardCount: number | null, sampleCount: number | null): void {
    if (shardCount !== null && shardCount > MAX_ASSEMBLY_SHARDS) {
        throw new RecordingAssemblyError(`refusing to assemble ${shardCount} shards; the limit is ${MAX_ASSEMBLY_SHARDS}`);
    }
    if (sampleCount !== null && sampleCount > MAX_ASSEMBLY_SAMPLES) {
        throw new RecordingAssemblyError(`refusing to assemble ${sampleCount} samples; the limit is ${MAX_ASSEMBLY_SAMPLES} (3 h at ${RECORDING_SAMPLE_RATE} Hz)`);
    }
}

function indexShards(shards: RecordingShardContents[]): Map<number, RecordingShardContents> {
    const byIndex = new Map<number, RecordingShardContents>();
    for (const shard of shards) {
        if (byIndex.has(shard.ShardIndex)) {
            throw new RecordingAssemblyError(`duplicate shard index ${shard.ShardIndex}`);
        }
        byIndex.set(shard.ShardIndex, shard);
    }
    return byIndex;
}

/** Decodes a shard into its range; returns the first packet that failed to decode (the caller silences the shard), else null. */
function decodeShardInto(pcm: Int16Array, shard: RecordingShardContents, decoder: IOpusPacketDecoder): ShardDecodeFailure | null {
    let written = 0;
    for (let packetIndex = 0; packetIndex < shard.Packets.length; packetIndex++) {
        let frame: Int16Array;
        try {
            frame = decoder.Decode(shard.Packets[packetIndex]);
        } catch (error) {
            return { ShardIndex: shard.ShardIndex, PacketIndex: packetIndex, Message: error instanceof Error ? error.message : String(error) };
        }
        const take = Math.min(frame.length, shard.SampleCount - written);
        if (take > 0) {
            pcm.set(frame.subarray(0, take), shard.StartSample + written);
            written += take;
        }
    }
    return null;
}

/**
 * A zeroed WAV of `sampleCount` samples plus the Int16 array to write the samples into. On a
 * little-endian host (every Node deployment target) that array is a view over the WAV's data section,
 * so the recording is held once and `Finish` is free; elsewhere it is a separate array that `Finish`
 * copies in little-endian order.
 */
function allocatePcm16Wav(sampleCount: number, sampleRate: number): { Pcm: Int16Array; Finish(): Buffer } {
    const dataSize = sampleCount * BYTES_PER_SAMPLE;
    const wav = Buffer.alloc(RECORDING_WAV_HEADER_BYTES + dataSize);
    WriteRecordingWavHeader(wav, sampleRate, dataSize);
    const dataOffset = wav.byteOffset + RECORDING_WAV_HEADER_BYTES;
    if (endianness() === 'LE' && dataOffset % BYTES_PER_SAMPLE === 0) {
        return { Pcm: new Int16Array(wav.buffer, dataOffset, sampleCount), Finish: () => wav };
    }
    const pcm = new Int16Array(sampleCount);
    return {
        Pcm: pcm,
        Finish: () => {
            for (let i = 0; i < pcm.length; i++) {
                wav.writeInt16LE(pcm[i], RECORDING_WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE);
            }
            return wav;
        },
    };
}

/**
 * Waveform peaks of a whole recording: max-abs per bucket, normalized by the global max (0..1). Same
 * semantics as the browser's capture-time peaks (`DownsamplePeaks` in ng-conversations), so a viewer
 * renders an assembled recording exactly like a browser-uploaded one.
 *
 * @param pcm Mono PCM16 samples.
 * @param buckets Target bucket count (default 600); a shorter buffer yields one bucket per sample.
 * @returns The peaks, or `[]` for an empty or all-silent buffer.
 */
export function ComputeRecordingPeaks(pcm: Int16Array, buckets: number = PEAK_BUCKETS): number[] {
    const target = Math.max(1, Math.floor(buckets));
    if (pcm.length === 0) {
        return [];
    }
    const count = Math.min(target, pcm.length);
    const perBucket = pcm.length / count;
    const peaks = new Array<number>(count).fill(0);
    let globalMax = 0;
    for (let b = 0; b < count; b++) {
        const start = Math.floor(b * perBucket);
        const end = b === count - 1 ? pcm.length : Math.floor((b + 1) * perBucket);
        let localMax = 0;
        for (let i = start; i < end; i++) {
            const abs = Math.abs(pcm[i]);
            if (abs > localMax) {
                localMax = abs;
            }
        }
        peaks[b] = localMax;
        globalMax = Math.max(globalMax, localMax);
    }
    return globalMax === 0 ? [] : peaks.map(v => v / globalMax);
}

/**
 * Wraps mono PCM16 samples in the canonical 44-byte WAV header (written by the shared
 * `WriteRecordingWavHeader`), samples little-endian regardless of host byte order.
 */
export function EncodePcm16Wav(pcm: Int16Array, sampleRate: number): Buffer {
    const output = allocatePcm16Wav(pcm.length, sampleRate);
    output.Pcm.set(pcm);
    return output.Finish();
}

/** {@link IOpusPacketDecoder} over libopus (`@evan/opus`: native binding, WASM fallback). */
class LibopusPacketDecoder implements IOpusPacketDecoder {
    // 48000 is RECORDING_SAMPLE_RATE; the binding's option type only accepts the literal rates.
    private readonly decoder = new Decoder({ channels: 1, sample_rate: 48000 });

    public Decode(packet: Uint8Array): Int16Array {
        // The binding returns a view of a buffer it reuses on the next call, so copy the samples out now.
        const bytes = this.decoder.decode(packet);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const samples = new Int16Array(bytes.byteLength / BYTES_PER_SAMPLE);
        for (let i = 0; i < samples.length; i++) {
            samples[i] = view.getInt16(i * BYTES_PER_SAMPLE, true);
        }
        return samples;
    }

    public Reset(): void {
        this.decoder.reset();
    }
}

/** A fresh 48 kHz mono libopus decoder. Use one per assembly; feed it packets in stream order. */
export function CreateLibopusDecoder(): IOpusPacketDecoder {
    return new LibopusPacketDecoder();
}

/**
 * Assembles a claimed session's shard ledger into `recording.wav` + `peaks.json` and finishes the claim.
 *
 * Flow: read the session's terminal counts and the stored rows' positions (both bounded before any
 * shard bytes are loaded) → without `ForcePartial`, hand the claim back (`Deferred`) when the positions
 * alone show the recording cannot be Complete → resolve where the recording is stored → load and parse
 * the shards (a shard that fails to parse, or whose header disagrees with its ledger row, is logged and
 * treated as missing) → decode ({@link AssembleOpusRecordingPcm}; a shard with an undecodable packet is
 * logged and silenced) → when the session already has its own `recording.wav` and the leading shards are
 * missing, read it and fill that prefix from it ({@link FillGapsFromPreviousRecording}: a Complete assembly deleted
 * the rows its audio came from, so a re-opened session must not overwrite that audio with silence; the
 * early position-only Deferred is skipped for such a session for the same reason). Then:
 * - incomplete and not `ForcePartial`: the claim is handed back as `Pending` with no file, keeping the
 *   gaps already stored for the session's existing recording → `Deferred`;
 * - otherwise, if this claim still holds, the WAV is stored: a first assembly uploads `recording.wav`
 *   into the session folder; a re-assembly overwrites the session's existing WAV object in place, keeping
 *   its `MJ: Files` id. `peaks.json` is rewritten next to it. The finish is fenced on `Version`; only then
 *   is a new file linked to the session and, for `Complete`, the assembled shard rows deleted.
 *
 * The session is never saved through `BaseEntity` (that rewrites every column and would clobber the
 * concurrent proc writes to the recording state); the finish proc stamps `RecordingFileID`.
 *
 * Never throws. Failures split by kind:
 * - a {@link RecordingAssemblyError} (deterministic: bounds exceeded, overlapping or duplicate shards,
 *   no storage account, agent not loadable) is logged, the claim is finished as `Failed` (when the fence
 *   still holds), and the outcome is `Failed`;
 * - any other error (SQL, storage, decoder load: likely transient) is logged with the session id and
 *   version, and the claim is LEFT in `Assembling` with no finish call; the outcome is `Retry`. The
 *   janitor's stale-`Assembling` re-claim (with its backoff and give-up cap) retries a closed session,
 *   and a later terminal or shard re-opens a live one.
 * A lost fence is `Superseded` and leaves the shards.
 */
export async function AssembleRealtimeRecordingFromLedger(input: AssembleRealtimeRecordingInput): Promise<AssembleRealtimeRecordingOutcome> {
    try {
        return await assembleFromLedger(input);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof RecordingAssemblyError) {
            LogError(`AssembleRealtimeRecordingFromLedger failed (session ${input.SessionID}, version ${input.Version}): ${message}`);
            await finishAsFailed(input);
            return 'Failed';
        }
        LogError(
            `AssembleRealtimeRecordingFromLedger hit a transient error (session ${input.SessionID}, version ${input.Version}); ` +
            `the claim stays Assembling for a stale re-claim to retry: ${message}`
        );
        return 'Retry';
    }
}

async function assembleFromLedger(input: AssembleRealtimeRecordingInput): Promise<AssembleRealtimeRecordingOutcome> {
    const { SessionID, Version, Ledger, ContextUser, ForcePartial } = input;
    const session = await loadSession(input);
    const expected = session.RecordingExpectedShards;
    const captured = session.RecordingCapturedSamples;
    AssertRecordingAssemblyBounds(expected, captured);

    // Bound the row count too before loading: the terminal counts do not limit how many indexes exist.
    const storedShards = await Ledger.CountShardsBelow(SessionID, SQL_INT_MAX);
    AssertRecordingAssemblyBounds(storedShards, null);
    const positions = await Ledger.LoadShardMetadata(SessionID);
    // Decided from row positions alone, so an incomplete ledger never costs a full load and decode. Not
    // when a recording exists: the rows it was assembled from are deleted, and its audio fills them in.
    if (!ForcePartial && !session.RecordingFileID && !couldBeComplete(positions, expected, captured)) {
        return handBack(input, session);
    }
    logOverrun(SessionID, positions, captured);
    const target = await resolveStorageTarget(session, input);

    const shards = parseLedgerShards(SessionID, await Ledger.LoadShards(SessionID));
    let assembled = AssembleOpusRecordingPcm(shards, expected, captured, CreateLibopusDecoder());
    for (const failure of assembled.DecodeFailures) {
        LogError(
            `AssembleRealtimeRecordingFromLedger (session ${SessionID}): shard ${failure.ShardIndex} packet ${failure.PacketIndex} ` +
            `failed to decode (${failure.Message}); the shard is silenced and listed as a gap`
        );
    }
    if (assembled.LeadingMissingRun && target.ExistingFile) {
        const previous = await readPreviousRecording(session, target, input);
        if (previous) {
            assembled = FillGapsFromPreviousRecording(assembled, previous);
        }
    }
    if (!assembled.Complete && !ForcePartial) {
        return handBack(input, session);
    }
    // Last check before writing storage, so a superseded assembler does not overwrite a newer result.
    // Storage has no compare-and-set, so a claim landing during the write is caught by the fenced finish.
    if (!await stillHoldsClaim(input)) {
        LogStatus(`AssembleRealtimeRecordingFromLedger: session ${SessionID} was claimed again after version ${Version}; nothing written`);
        return 'Superseded';
    }

    const status = assembled.Complete ? 'Complete' : 'Partial';
    const stored = await storeWav(target, assembled.Wav, input);
    await WriteRecordingPeaksSidecar(SessionID, target.AccountID, ComputeRecordingPeaks(assembled.Pcm), ContextUser);

    const finished = await Ledger.FinishAssembly({ SessionID, Version, Status: status, Gaps: assembled.Gaps, FileID: stored.FileID });
    if (!finished) {
        logSupersededWrite(SessionID, Version, stored);
        return 'Superseded';
    }
    if (stored.Uploaded) {
        await LinkRecordingToSession(stored.FileID, SessionID, ContextUser, input.Provider);
    }
    if (status === 'Complete' && expected !== null) {
        await deleteAssembledShards(Ledger, SessionID, expected);
    }
    return status;
}

/**
 * Reads the session's existing `recording.wav` and its stored gaps, for {@link FillGapsFromPreviousRecording}.
 * Returns null (logged, nothing reused, so the missing ranges stay silent gaps) when the file is not a
 * canonical recording WAV, is over the sample bound, or the stored gaps cannot be read: reusing samples
 * without knowing which of them were silence would misreport the recording as gap-free. A storage read
 * failure throws (transient, see {@link AssembleRealtimeRecordingFromLedger}).
 */
async function readPreviousRecording(
    session: MJAIAgentSessionEntity, target: StorageTarget, input: AssembleRealtimeRecordingInput
): Promise<PreviousRecording | null> {
    const file = target.ExistingFile;
    if (!file) {
        return null;
    }
    const driver = await FileStorageEngine.Instance.GetDriver(target.AccountID, input.ContextUser);
    const prefix = `AssembleRealtimeRecordingFromLedger (session ${session.ID})`;
    // A missing object is permanent, not transient: treating it as a read error would Retry forever.
    // Assembly goes on and the write recreates the object at the same key.
    if (!await driver.ObjectExists(file.ProviderKey)) {
        LogError(`${prefix}: existing recording file ${file.ID} has no object at ${file.ProviderKey}; nothing to reuse, so missing ranges stay silent gaps`);
        return null;
    }
    const pcm = ParseCanonicalRecordingWav(await driver.GetObject({ fullPath: file.ProviderKey }));
    if (!pcm) {
        LogError(`${prefix}: existing recording file ${file.ID} is not a canonical 48 kHz mono PCM16 WAV; its audio is not reused, so missing ranges stay silent gaps`);
        return null;
    }
    if (pcm.length > MAX_ASSEMBLY_SAMPLES) {
        LogError(`${prefix}: existing recording file ${file.ID} holds ${pcm.length} samples, over the limit of ${MAX_ASSEMBLY_SAMPLES}; not reused`);
        return null;
    }
    const gaps = parseStoredGaps(session.RecordingGaps);
    if (!gaps) {
        LogError(`${prefix}: stored RecordingGaps cannot be read; the audio of existing recording file ${file.ID} is not reused`);
        return null;
    }
    return { Pcm: pcm, Gaps: gaps };
}

/** The session's stored `RecordingGaps` JSON as gaps (`[]` when none), or null when it is malformed. */
function parseStoredGaps(json: string | null): RecordingGap[] | null {
    if (!json) {
        return [];
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        if (error instanceof SyntaxError) {
            return null;
        }
        throw error;
    }
    if (!Array.isArray(parsed)) {
        return null;
    }
    const gaps: RecordingGap[] = [];
    for (const item of parsed as unknown[]) {
        const gap = item as Partial<RecordingGap> | null;
        if (!gap || !Number.isSafeInteger(gap.startSample) || !Number.isSafeInteger(gap.sampleCount)
            || !Array.isArray(gap.indexes) || !gap.indexes.every(i => Number.isSafeInteger(i))) {
            return null;
        }
        gaps.push({ startSample: gap.startSample as number, sampleCount: gap.sampleCount as number, indexes: gap.indexes });
    }
    return gaps;
}

/**
 * True when the stored rows' positions allow a Complete recording: terminal counts known, exactly the
 * indexes `0..expected-1` stored, each starting where the previous one ends, the last ending at
 * `captured`. A true result can still assemble Partial (a corrupt or undecodable shard).
 */
function couldBeComplete(positions: LedgerShardMetadata[], expected: number | null, captured: number | null): boolean {
    if (expected === null || captured === null || positions.length !== expected) {
        return false;
    }
    let end = 0;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i].Index !== i || positions[i].StartSample !== end) {
            return false;
        }
        end = positions[i].StartSample + positions[i].SampleCount;
    }
    return end === captured;
}

/**
 * Hands an un-forced, incomplete claim back as `Pending` with no file. The stored gaps are passed
 * through unchanged: they describe the session's existing recording (if any), which this does not replace.
 */
async function handBack(input: AssembleRealtimeRecordingInput, session: MJAIAgentSessionEntity): Promise<AssembleRealtimeRecordingOutcome> {
    const { SessionID, Version, Ledger } = input;
    const released = await Ledger.FinishAssembly({ SessionID, Version, Status: 'Pending', Gaps: session.RecordingGaps, FileID: null });
    return released ? 'Deferred' : 'Superseded';
}

/** Shards running past a terminal's captured count (the call went on after it): kept, but worth knowing about. */
function logOverrun(sessionID: string, positions: LedgerShardMetadata[], captured: number | null): void {
    if (captured === null) {
        return;
    }
    const past = positions.filter(p => p.StartSample + p.SampleCount > captured);
    if (past.length === 0) {
        return;
    }
    const end = Math.max(...past.map(p => p.StartSample + p.SampleCount));
    LogStatus(
        `AssembleRealtimeRecordingFromLedger (session ${sessionID}): shards ${past.map(p => p.Index).join(', ')} run to sample ${end}, ` +
        `${end - captured} samples past the terminal's captured count of ${captured}; the recording keeps them`
    );
}

async function loadSession(input: AssembleRealtimeRecordingInput): Promise<MJAIAgentSessionEntity> {
    const session = await input.Provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', input.ContextUser);
    if (!await session.Load(input.SessionID)) {
        throw new Error(`could not load session ${input.SessionID}`);
    }
    return session;
}

/** Re-reads the session: true while it is still `Assembling` under this assembly's version. */
async function stillHoldsClaim(input: AssembleRealtimeRecordingInput): Promise<boolean> {
    const session = await loadSession(input);
    return session.RecordingStatus === 'Assembling' && session.RecordingAssemblyVersion === input.Version;
}

/** Where the WAV goes: over the session's existing assembled WAV, or a new upload. */
interface StorageTarget {
    AccountID: string;
    /** The existing WAV to overwrite in place, or null for a first assembly. */
    ExistingFile: { ID: string; ProviderKey: string } | null;
}

/**
 * A re-assembly writes through the existing file's own storage provider (the agent's configuration may
 * have changed since). Only the session's own `<RecordingFolder>/recording.wav` object is ever
 * overwritten: `RecordingFileID` is an ordinary column, so it could point at any file (another
 * session's recording, or a legacy browser upload such as `recording.webm` whose `MJ: Files` row would
 * keep the old content type). Anything else gets a new WAV upload, and the finish re-points the session.
 */
async function resolveStorageTarget(session: MJAIAgentSessionEntity, input: AssembleRealtimeRecordingInput): Promise<StorageTarget> {
    const { ContextUser, Provider } = input;
    if (session.RecordingFileID) {
        const file = await Provider.GetEntityObject<MJFileEntity>('MJ: Files', ContextUser);
        if (!await file.Load(session.RecordingFileID) || !file.ProviderKey) {
            throw new Error(`could not load recording file ${session.RecordingFileID} of session ${session.ID}`);
        }
        // Some drivers store keys with a leading '/', so compare without it.
        if (file.ProviderKey.replace(/^\/+/, '') === `${RecordingFolder(session.ID)}/recording.wav`) {
            const accountID = await ResolveStorageAccountIDForProvider(file.ProviderID, ContextUser, Provider);
            if (!accountID) {
                throw new RecordingAssemblyError(`no storage account for provider ${file.ProviderID} of recording file ${file.ID}`);
            }
            return { AccountID: accountID, ExistingFile: { ID: file.ID, ProviderKey: file.ProviderKey } };
        }
        LogStatus(`AssembleRealtimeRecordingFromLedger: session ${session.ID} points at recording ${file.ID} (${file.ProviderKey}), not its own recording.wav; uploading a new WAV instead of overwriting it`);
    }
    const agent = await Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ContextUser);
    if (!await agent.Load(session.AgentID)) {
        throw new RecordingAssemblyError(`could not load agent ${session.AgentID} of session ${session.ID}`);
    }
    const accountID = await ResolveRecordingStorageAccountID(agent, ContextUser, Provider);
    if (!accountID) {
        throw new RecordingAssemblyError(`agent ${session.AgentID} has no recording storage account configured`);
    }
    return { AccountID: accountID, ExistingFile: null };
}

interface StoredWav {
    FileID: string;
    /** True for a new `MJ: Files` row (first assembly); false when an existing file was overwritten. */
    Uploaded: boolean;
}

async function storeWav(target: StorageTarget, wav: Buffer, input: AssembleRealtimeRecordingInput): Promise<StoredWav> {
    const { SessionID, ContextUser, Provider } = input;
    if (target.ExistingFile) {
        const driver = await FileStorageEngine.Instance.GetDriver(target.AccountID, ContextUser);
        if (!await driver.PutObject(target.ExistingFile.ProviderKey, wav, 'audio/wav')) {
            throw new Error(`overwriting recording file ${target.ExistingFile.ID} (${target.ExistingFile.ProviderKey}) returned false`);
        }
        return { FileID: target.ExistingFile.ID, Uploaded: false };
    }
    const uploaded = await FileStorageEngine.Instance.UploadFile({
        content: wav, fileName: 'recording.wav', mimeType: 'audio/wav', contextUser: ContextUser,
        storageAccountId: target.AccountID, provider: Provider, pathPrefix: RecordingFolder(SessionID),
    });
    return { FileID: uploaded.FileID, Uploaded: true };
}

/** A lost fence after storage was written: say exactly what was left behind. */
function logSupersededWrite(sessionID: string, version: number, stored: StoredWav): void {
    if (stored.Uploaded) {
        // The finish proc is the only thing that stamps RecordingFileID, so no later assembler knows this
        // row exists. Its object key is the session's recording.wav, which the newer assembler writes too.
        LogStatus(
            `AssembleRealtimeRecordingFromLedger: session ${sessionID} version ${version} was superseded after uploading; ` +
            `MJ: Files row ${stored.FileID} is an orphan (not stamped, not linked). Its object is the session's recording.wav, ` +
            `shared with the newer assembly, so delete only the row, never the object`
        );
        return;
    }
    LogStatus(
        `AssembleRealtimeRecordingFromLedger: session ${sessionID} version ${version} was superseded after overwriting ` +
        `recording file ${stored.FileID}; the newer assembly rewrites it`
    );
}

/** Parses each ledger row; a row that fails to parse or disagrees with its own header is logged and left out (a gap). */
function parseLedgerShards(sessionID: string, rows: LedgerShard[]): RecordingShardContents[] {
    const shards: RecordingShardContents[] = [];
    for (const row of rows) {
        let parsed: RecordingShardContents;
        try {
            parsed = ParseRecordingShard(row.Data);
        } catch (error) {
            if (!(error instanceof RecordingShardFormatError)) {
                throw error;
            }
            LogError(`AssembleRealtimeRecordingFromLedger (session ${sessionID}): shard ${row.Index} is not valid MJOPUS1 (${error.message}); treated as missing`);
            continue;
        }
        if (parsed.ShardIndex !== row.Index || parsed.StartSample !== row.StartSample || parsed.SampleCount !== row.SampleCount) {
            LogError(
                `AssembleRealtimeRecordingFromLedger (session ${sessionID}): shard ${row.Index} header (index ${parsed.ShardIndex}, ` +
                `start ${parsed.StartSample}, samples ${parsed.SampleCount}) disagrees with its ledger row ` +
                `(start ${row.StartSample}, samples ${row.SampleCount}); treated as missing`
            );
            continue;
        }
        shards.push(parsed);
    }
    return shards;
}

/** The recording is already Complete; a failed cleanup is logged and left for the janitor's purge. */
async function deleteAssembledShards(ledger: IRealtimeRecordingLedger, sessionID: string, expected: number): Promise<void> {
    try {
        await ledger.DeleteShardsBelow(sessionID, expected);
    } catch (error) {
        LogError(`AssembleRealtimeRecordingFromLedger (session ${sessionID}): recording is Complete but deleting its ${expected} shard rows failed; the janitor purge will remove them: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function finishAsFailed(input: AssembleRealtimeRecordingInput): Promise<void> {
    const { SessionID, Version, Ledger } = input;
    try {
        if (!await Ledger.FinishAssembly({ SessionID, Version, Status: 'Failed', Gaps: [], FileID: null })) {
            LogStatus(`AssembleRealtimeRecordingFromLedger: session ${SessionID} version ${Version} failed but was already superseded; left to the newer assembly`);
        }
    } catch (error) {
        LogError(`AssembleRealtimeRecordingFromLedger: could not mark session ${SessionID} version ${Version} Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
