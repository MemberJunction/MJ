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
import { Decoder } from '@evan/opus';
import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentSessionEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    ParseRecordingShard, RecordingShardContents, RecordingShardFormatError, RECORDING_SAMPLE_RATE,
} from '@memberjunction/ai-core-plus';
import { IRealtimeRecordingLedger, LedgerShard } from './realtime-recording-ledger';
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

/** Result of {@link AssembleOpusRecordingPcm}. */
export interface AssembledOpusRecording {
    /** Mono PCM16 at 48 kHz. */
    Pcm: Int16Array;
    /** Silent ranges, in order. */
    Gaps: RecordingGap[];
    /** True only when the terminal counts are known, every expected shard is present, and nothing is silent-filled. */
    Complete: boolean;
}

/** Outcome of {@link AssembleRealtimeRecordingFromLedger}. */
export type AssembleRealtimeRecordingOutcome = 'Complete' | 'Partial' | 'Failed' | 'Superseded' | 'Deferred';

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
 * Most samples one assembly produces: 3 h at 48 kHz. The PCM buffer and its WAV copy are each 2 bytes
 * per sample (~1 GB each at this cap), so this is the memory ceiling of one assembly; the captured count
 * comes from the browser, so it must be bounded before anything is allocated.
 */
export const MAX_ASSEMBLY_SAMPLES = RECORDING_SAMPLE_RATE * 60 * 180;

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
 * - After any gap the decoder is reset.
 *
 * The shard count is `expectedShards`, or the highest present index + 1 when no terminal signal has
 * arrived. The length is `capturedSamples`, or the end of the last shard when unknown (and never less
 * than the end of the last shard: audio past a stale terminal is kept, not cut).
 *
 * @param shards Parsed shards (any order, unique indexes).
 * @param expectedShards Shard count from the terminal signal, or null when none arrived.
 * @param capturedSamples Captured sample count from the terminal signal, or null.
 * @param decoder The one decoder for this stream.
 * @throws Error on a duplicate index, a shard overlapping the audio before it, a decode failure, or a
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

    const pcm = new Int16Array(length);
    const gaps: RecordingGap[] = [];
    let position = 0;
    let missing: number[] = [];
    let decodedAny = false;
    for (let index = 0; index < shardCount; index++) {
        const shard = byIndex.get(index);
        if (!shard) {
            missing.push(index);
            continue;
        }
        if (shard.StartSample < position) {
            throw new Error(`shard ${index} starts at sample ${shard.StartSample}, before the end of the audio before it (${position})`);
        }
        if (shard.StartSample > position || missing.length > 0) {
            gaps.push({ startSample: position, sampleCount: shard.StartSample - position, indexes: missing });
            missing = [];
            if (decodedAny) {
                decoder.Reset();
            }
        }
        decodeShardInto(pcm, shard, decoder);
        decodedAny = true;
        position = shard.StartSample + shard.SampleCount;
    }
    if (position < length || missing.length > 0) {
        gaps.push({ startSample: position, sampleCount: length - position, indexes: missing });
    }

    const complete = expectedShards !== null && capturedSamples !== null
        && gaps.length === 0 && shardCount === expectedShards && length === capturedSamples;
    return { Pcm: pcm, Gaps: gaps, Complete: complete };
}

/**
 * Throws when an assembly would exceed {@link MAX_ASSEMBLY_SHARDS} or {@link MAX_ASSEMBLY_SAMPLES}.
 * Checked twice on purpose: by the orchestrator on the session's terminal counts BEFORE loading any
 * shard rows, and by {@link AssembleOpusRecordingPcm} on the counts derived from the shards themselves
 * (the only counts there are when no terminal signal arrived).
 */
export function AssertRecordingAssemblyBounds(shardCount: number | null, sampleCount: number | null): void {
    if (shardCount !== null && shardCount > MAX_ASSEMBLY_SHARDS) {
        throw new Error(`refusing to assemble ${shardCount} shards; the limit is ${MAX_ASSEMBLY_SHARDS}`);
    }
    if (sampleCount !== null && sampleCount > MAX_ASSEMBLY_SAMPLES) {
        throw new Error(`refusing to assemble ${sampleCount} samples; the limit is ${MAX_ASSEMBLY_SAMPLES} (3 h at ${RECORDING_SAMPLE_RATE} Hz)`);
    }
}

function indexShards(shards: RecordingShardContents[]): Map<number, RecordingShardContents> {
    const byIndex = new Map<number, RecordingShardContents>();
    for (const shard of shards) {
        if (byIndex.has(shard.ShardIndex)) {
            throw new Error(`duplicate shard index ${shard.ShardIndex}`);
        }
        byIndex.set(shard.ShardIndex, shard);
    }
    return byIndex;
}

function decodeShardInto(pcm: Int16Array, shard: RecordingShardContents, decoder: IOpusPacketDecoder): void {
    let written = 0;
    shard.Packets.forEach((packet, packetIndex) => {
        let frame: Int16Array;
        try {
            frame = decoder.Decode(packet);
        } catch (error) {
            throw new Error(`decoding shard ${shard.ShardIndex}, packet ${packetIndex} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        const take = Math.min(frame.length, shard.SampleCount - written);
        if (take > 0) {
            pcm.set(frame.subarray(0, take), shard.StartSample + written);
            written += take;
        }
    });
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
    const dataSize = pcm.length * BYTES_PER_SAMPLE;
    const wav = Buffer.alloc(RECORDING_WAV_HEADER_BYTES + dataSize);
    WriteRecordingWavHeader(wav, sampleRate, dataSize);
    for (let i = 0; i < pcm.length; i++) {
        wav.writeInt16LE(pcm[i], RECORDING_WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE);
    }
    return wav;
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
 * Flow: read the session's terminal counts (bounded before anything is loaded) → resolve where the
 * recording is stored → load and parse the shards (a shard that fails to parse, or whose header
 * disagrees with its ledger row, is logged and treated as missing) → decode ({@link AssembleOpusRecordingPcm}).
 * Then:
 * - incomplete and not `ForcePartial`: the claim is handed back as `Pending` with no file → `Deferred`;
 * - otherwise, if this claim still holds, the WAV is stored: a first assembly uploads `recording.wav`
 *   into the session folder; a re-assembly overwrites the session's existing WAV object in place, keeping
 *   its `MJ: Files` id. `peaks.json` is rewritten next to it. The finish is fenced on `Version`; only then
 *   is a new file linked to the session and, for `Complete`, the assembled shard rows deleted.
 *
 * The session is never saved through `BaseEntity` (that rewrites every column and would clobber the
 * concurrent proc writes to the recording state); the finish proc stamps `RecordingFileID`.
 *
 * Never throws: any failure is logged with the session id, the claim is finished as `Failed` (when the
 * fence still holds), and the outcome is `Failed`. A lost fence is `Superseded` and leaves the shards.
 */
export async function AssembleRealtimeRecordingFromLedger(input: AssembleRealtimeRecordingInput): Promise<AssembleRealtimeRecordingOutcome> {
    try {
        return await assembleFromLedger(input);
    } catch (error) {
        LogError(`AssembleRealtimeRecordingFromLedger failed (session ${input.SessionID}, version ${input.Version}): ${error instanceof Error ? error.message : String(error)}`);
        await finishAsFailed(input);
        return 'Failed';
    }
}

async function assembleFromLedger(input: AssembleRealtimeRecordingInput): Promise<AssembleRealtimeRecordingOutcome> {
    const { SessionID, Version, Ledger, ContextUser, ForcePartial } = input;
    const session = await loadSession(input);
    const expected = session.RecordingExpectedShards;
    const captured = session.RecordingCapturedSamples;
    AssertRecordingAssemblyBounds(expected, captured);
    const target = await resolveStorageTarget(session, input);

    const shards = parseLedgerShards(SessionID, await Ledger.LoadShards(SessionID));
    const assembled = AssembleOpusRecordingPcm(shards, expected, captured, CreateLibopusDecoder());
    if (!assembled.Complete && !ForcePartial) {
        const released = await Ledger.FinishAssembly({ SessionID, Version, Status: 'Pending', Gaps: [], FileID: null });
        return released ? 'Deferred' : 'Superseded';
    }
    // Last check before writing storage, so a superseded assembler does not overwrite a newer result.
    // Storage has no compare-and-set, so a claim landing during the write is caught by the fenced finish.
    if (!await stillHoldsClaim(input)) {
        LogStatus(`AssembleRealtimeRecordingFromLedger: session ${SessionID} was claimed again after version ${Version}; nothing written`);
        return 'Superseded';
    }

    const status = assembled.Complete ? 'Complete' : 'Partial';
    const wav = EncodePcm16Wav(assembled.Pcm, RECORDING_SAMPLE_RATE);
    const stored = await storeWav(target, wav, input);
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
 * have changed since). An existing file that is not a WAV (a legacy browser upload such as webm) is not
 * overwritten: its `MJ: Files` row would keep the old content type. A new WAV is uploaded instead, and
 * the finish re-points the session at it.
 */
async function resolveStorageTarget(session: MJAIAgentSessionEntity, input: AssembleRealtimeRecordingInput): Promise<StorageTarget> {
    const { ContextUser, Provider } = input;
    if (session.RecordingFileID) {
        const file = await Provider.GetEntityObject<MJFileEntity>('MJ: Files', ContextUser);
        if (!await file.Load(session.RecordingFileID) || !file.ProviderKey) {
            throw new Error(`could not load recording file ${session.RecordingFileID} of session ${session.ID}`);
        }
        if (file.ContentType === 'audio/wav') {
            const accountID = await ResolveStorageAccountIDForProvider(file.ProviderID, ContextUser, Provider);
            if (!accountID) {
                throw new Error(`no storage account for provider ${file.ProviderID} of recording file ${file.ID}`);
            }
            return { AccountID: accountID, ExistingFile: { ID: file.ID, ProviderKey: file.ProviderKey } };
        }
        LogStatus(`AssembleRealtimeRecordingFromLedger: session ${session.ID} points at a ${file.ContentType ?? 'untyped'} recording ${file.ID}; uploading a new WAV instead of overwriting it`);
    }
    const agent = await Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ContextUser);
    if (!await agent.Load(session.AgentID)) {
        throw new Error(`could not load agent ${session.AgentID} of session ${session.ID}`);
    }
    const accountID = await ResolveRecordingStorageAccountID(agent, ContextUser, Provider);
    if (!accountID) {
        throw new Error(`agent ${session.AgentID} has no recording storage account configured`);
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
