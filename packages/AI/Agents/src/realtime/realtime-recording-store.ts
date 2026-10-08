/**
 * @fileoverview Shared MJStorage finalize for realtime session recordings — the single code path both
 * the **server-bridged** capture (`BaseAgent.finalizeRealtimeRecording`) and the **client-direct**
 * browser upload (`RealtimeClientSessionResolver.UploadRealtimeRecording`) use to: resolve the agent's
 * recording storage account, upload the audio, link it to the `AIAgentSession`, and stamp the session's
 * recording fields. Keeps the storage policy in one place rather than duplicated per topology.
 *
 * @module @memberjunction/ai-agents
 */
import { IMetadataProvider, UserInfo, LogError } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentSessionEntity, MJFileEntityRecordLinkEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { RealtimeRecordingMedia } from './realtime-recording-capture';

/**
 * Resolves the storage account a session recording should be written to: the agent's
 * `RecordingStorageProviderID` if set, else its `AttachmentStorageProviderID` (recordings default to the
 * attachments account), resolved to that provider's first account. Returns `null` when nothing is
 * configured — callers treat that as "do not record" (fail-closed).
 *
 * @param agent The agent whose recording/attachment storage configuration drives the choice.
 * @returns The resolved storage account id, or `null`.
 */
export async function ResolveRecordingStorageAccountID(
    agent: MJAIAgentEntity, contextUser: UserInfo, provider?: IMetadataProvider
): Promise<string | null> {
    const providerID = agent.RecordingStorageProviderID || agent.AttachmentStorageProviderID;
    if (!providerID) {
        return null;
    }
    // Ensure the storage engine has loaded its accounts before reading them. The engine may be
    // unconfigured in this process, or configured BEFORE this storage account was provisioned (a stale
    // cache). Try the loaded cache first; if the provider's account isn't found, force a one-time refresh
    // so a newly-provisioned account is picked up WITHOUT requiring a server restart.
    await FileStorageEngine.Instance.Config(false, contextUser, provider);
    let accounts = FileStorageEngine.Instance.GetAccountsByProviderID(providerID);
    if (accounts.length === 0) {
        await FileStorageEngine.Instance.Config(true, contextUser, provider);
        accounts = FileStorageEngine.Instance.GetAccountsByProviderID(providerID);
    }
    return accounts[0]?.ID ?? null;
}

/** @deprecated Use {@link ResolveRecordingStorageAccountID}. */
export async function resolveRecordingStorageAccountID(
    agent: MJAIAgentEntity, contextUser: UserInfo, provider?: IMetadataProvider
): Promise<string | null> {
    return ResolveRecordingStorageAccountID(agent, contextUser, provider);
}

/** Input to {@link storeRealtimeRecording}. */
export interface StoreRealtimeRecordingInput {
    /** The encoded recording bytes (e.g. a WAV from the server mixer, or the browser's seekable WAV). */
    Audio: Buffer;
    /** MIME type of the audio (`audio/wav`, `audio/webm`, `audio/ogg`, `audio/mp4`). */
    MimeType: string;
    /** What was captured, stamped on the session. */
    Media: RealtimeRecordingMedia;
    /** The recording `t0` (alignment origin), stamped on the session. */
    StartedAt: Date;
    /** The resolved storage account id (see {@link resolveRecordingStorageAccountID}). */
    StorageAccountID: string;
    /** The `AIAgentSession` id the recording belongs to. */
    SessionID: string;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /**
     * Optional capture-time waveform peaks (max-abs per bucket, normalized 0..1). When present, written
     * as a `peaks.json` sidecar in the SAME session folder as the recording so a viewer can render the
     * waveform without re-decoding the audio. Best-effort — a sidecar failure never fails the recording.
     */
    Peaks?: number[];
}

/** A short, stable file extension for the recording's MIME type. */
function extensionForMime(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
    // Header-less raw PCM crash-recovery shards (audio/L16 / audio/pcm) — NOT individually playable;
    // recovery concatenates them in order and WAV-wraps. The consolidated file is always WAV.
    if (mimeType.includes('L16') || mimeType.includes('pcm')) return 'pcm';
    return 'wav';
}

/** The per-session folder all of a session's recording artifacts live in (shards + final file). */
function recordingFolder(sessionID: string): string {
    return `realtime-recordings/${sessionID}`;
}

/**
 * Reads a stored recording's bytes back through **authenticated** MJStorage (server-side `GetObject` on
 * the file's own provider/account) — NOT a public pre-signed link. Used to stream a recording to an
 * authorized browser securely. Never throws.
 *
 * @param fileID The `MJ: Files` id of the recording.
 * @returns `{ Bytes, MimeType }` or `null` when the file/account/object can't be resolved.
 */
export async function ReadRealtimeRecordingFile(
    fileID: string, contextUser: UserInfo, provider: IMetadataProvider
): Promise<{ Bytes: Buffer; MimeType: string } | null> {
    try {
        const file = await provider.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        if (!await file.Load(fileID) || !file.ProviderKey) {
            return null;
        }
        // Ensure the engine knows this provider's accounts (idempotent; force-refresh if missing).
        await FileStorageEngine.Instance.Config(false, contextUser, provider);
        let accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
        if (accounts.length === 0) {
            await FileStorageEngine.Instance.Config(true, contextUser, provider);
            accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
        }
        const account = accounts[0];
        if (!account) {
            return null;
        }
        const driver = await FileStorageEngine.Instance.GetDriver(account.ID, contextUser);
        const bytes = await driver.GetObject({ fullPath: file.ProviderKey });
        if (!bytes || bytes.length === 0) {
            return null;
        }
        return { Bytes: bytes, MimeType: file.ContentType ?? 'audio/webm' };
    } catch (error) {
        LogError(`readRealtimeRecordingFile failed (file ${fileID}): ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/** @deprecated Use {@link ReadRealtimeRecordingFile}. */
export async function readRealtimeRecordingFile(
    fileID: string, contextUser: UserInfo, provider: IMetadataProvider
): Promise<{ Bytes: Buffer; MimeType: string } | null> {
    return ReadRealtimeRecordingFile(fileID, contextUser, provider);
}

/** Input to {@link writeRealtimeRecordingSegment}. */
export interface WriteRecordingSegmentInput {
    SessionID: string;
    /** 0-based index of this ~15s shard within the session. */
    SegmentIndex: number;
    Audio: Buffer;
    MimeType: string;
    StorageAccountID: string;
    ContextUser: UserInfo;
}

/**
 * Writes ONE crash-recovery segment shard (`seg-NNNN.<ext>`) into the session's folder as a RAW
 * storage object — no `MJ: Files` row, no session stamping. Shards are durability insurance during a
 * live call (so a browser/tab death loses at most the last window); they are byte-slices of one
 * continuous stream (only the first carries the container header), so they are NOT individually
 * playable — recovery is "concatenate the folder's shards in order". They are deleted once the
 * canonical consolidated file lands ({@link deleteRealtimeRecordingSegments}). Never throws.
 *
 * @returns `true` on success.
 */
export async function WriteRealtimeRecordingSegment(input: WriteRecordingSegmentInput): Promise<boolean> {
    const { SessionID, SegmentIndex, Audio, MimeType, StorageAccountID, ContextUser } = input;
    try {
        const driver = await FileStorageEngine.Instance.GetDriver(StorageAccountID, ContextUser);
        const name = `seg-${String(SegmentIndex).padStart(4, '0')}.${extensionForMime(MimeType)}`;
        return await driver.PutObject(`${recordingFolder(SessionID)}/${name}`, Audio, MimeType);
    } catch (error) {
        LogError(`writeRealtimeRecordingSegment failed (session ${SessionID}, seg ${SegmentIndex}): ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/** @deprecated Use {@link WriteRealtimeRecordingSegment}. */
export async function writeRealtimeRecordingSegment(input: WriteRecordingSegmentInput): Promise<boolean> {
    return WriteRealtimeRecordingSegment(input);
}

/**
 * Writes the capture-time waveform peaks as a `peaks.json` sidecar (a JSON array of numbers) into the
 * session's recording folder via the storage driver. Best-effort and tolerant — a missing/empty peaks
 * array is a no-op, and any storage failure is logged and swallowed (the recording itself already
 * succeeded). Never throws.
 *
 * @returns `true` when a sidecar was written.
 */
export async function WriteRecordingPeaksSidecar(
    sessionID: string, storageAccountID: string, peaks: number[] | undefined, contextUser: UserInfo
): Promise<boolean> {
    if (!Array.isArray(peaks) || peaks.length === 0) {
        return false;
    }
    try {
        const driver = await FileStorageEngine.Instance.GetDriver(storageAccountID, contextUser);
        const payload = Buffer.from(JSON.stringify(peaks), 'utf8');
        return await driver.PutObject(`${recordingFolder(sessionID)}/peaks.json`, payload, 'application/json');
    } catch (error) {
        LogError(`writeRecordingPeaksSidecar failed (session ${sessionID}): ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/** @deprecated Use {@link WriteRecordingPeaksSidecar}. */
export async function writeRecordingPeaksSidecar(
    sessionID: string, storageAccountID: string, peaks: number[] | undefined, contextUser: UserInfo
): Promise<boolean> {
    return WriteRecordingPeaksSidecar(sessionID, storageAccountID, peaks, contextUser);
}

/**
 * Deletes the `seg-*` shards in a session's folder, leaving the consolidated `recording.*` file. Called
 * after {@link storeRealtimeRecording} writes the canonical file at end of call. Never throws.
 *
 * @returns The number of shards deleted.
 */
export async function DeleteRealtimeRecordingSegments(sessionID: string, storageAccountID: string, contextUser: UserInfo): Promise<number> {
    try {
        const driver = await FileStorageEngine.Instance.GetDriver(storageAccountID, contextUser);
        const folder = recordingFolder(sessionID);
        // List the folder's CONTENTS: without the trailing slash, delimiter-based drivers (S3, GCS)
        // return the folder itself as a common prefix and no objects, so no shard was ever deleted.
        const listed = await driver.ListObjects(`${folder}/`);
        let deleted = 0;
        for (const obj of listed.objects ?? []) {
            const base = (obj.name.split('/').pop() ?? obj.name);
            if (base.startsWith('seg-') && await driver.DeleteObject(`${folder}/${base}`)) {
                deleted++;
            }
        }
        return deleted;
    } catch (error) {
        LogError(`deleteRealtimeRecordingSegments failed (session ${sessionID}): ${error instanceof Error ? error.message : String(error)}`);
        return 0;
    }
}

/** @deprecated Use {@link DeleteRealtimeRecordingSegments}. */
export async function deleteRealtimeRecordingSegments(sessionID: string, storageAccountID: string, contextUser: UserInfo): Promise<number> {
    return DeleteRealtimeRecordingSegments(sessionID, storageAccountID, contextUser);
}

/** Outcome of {@link storeRealtimeRecording}. */
export interface StoreRealtimeRecordingResult {
    /** The `MJ: Files` id when the recording was stored; null on every failure. */
    readonly FileID: string | null;
    /** Why it failed, verbatim from the layer that knew. Null on success. */
    readonly ErrorMessage: string | null;
}

/**
 * Uploads a session recording to MJStorage, links it to the `AIAgentSession` (via
 * `MJ: File Entity Record Links`), and stamps `RecordingFileID` / `RecordingMedia` / `RecordingStartedAt`
 * on the session. Never throws — a recording-storage failure must not fail the session; failures are
 * logged AND carried out in the result so the caller can report the real cause (a bare `null` used to
 * strand reasons like Drive's "Service Accounts do not have storage quota" three layers down).
 *
 * @param input The recording bytes + storage account + session context.
 * @returns The created `MJ: Files` id, or the failure reason.
 */
export async function StoreRealtimeRecording(input: StoreRealtimeRecordingInput): Promise<StoreRealtimeRecordingResult> {
    const { Audio, MimeType, Media, StartedAt, StorageAccountID, SessionID, ContextUser, Provider, Peaks } = input;
    try {
        // Canonical consolidated file in the session's own folder, alongside (then replacing) its shards.
        const uploaded = await FileStorageEngine.Instance.UploadFile({
            content: Audio,
            fileName: `recording.${extensionForMime(MimeType)}`,
            mimeType: MimeType,
            contextUser: ContextUser,
            storageAccountId: StorageAccountID,
            provider: Provider,
            pathPrefix: recordingFolder(SessionID)
        });

        // Best-effort waveform-peaks sidecar (peaks.json) next to the recording, for fast waveform
        // rendering without re-decoding the audio. A sidecar failure never fails the recording itself.
        await WriteRecordingPeaksSidecar(SessionID, StorageAccountID, Peaks, ContextUser);

        // Link the file to the session record so it's discoverable via MJ: File Entity Record Links.
        const sessionEntityID = Provider.EntityByName('MJ: AI Agent Sessions')?.ID;
        if (sessionEntityID) {
            const link = await Provider.GetEntityObject<MJFileEntityRecordLinkEntity>('MJ: File Entity Record Links', ContextUser);
            link.NewRecord();
            link.FileID = uploaded.FileID;
            link.EntityID = sessionEntityID;
            link.RecordID = SessionID;
            if (!await link.Save()) {
                LogError(`storeRealtimeRecording: failed to link recording to session ${SessionID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }

        // Stamp the recording fields on the session (file + media kind + t0).
        const session = await Provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', ContextUser);
        if (await session.Load(SessionID)) {
            session.RecordingFileID = uploaded.FileID;
            session.RecordingMedia = Media;
            session.RecordingStartedAt = StartedAt;
            if (!await session.Save()) {
                LogError(`storeRealtimeRecording: failed to stamp recording fields on session ${SessionID}: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
        return { FileID: uploaded.FileID, ErrorMessage: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`storeRealtimeRecording failed for session ${SessionID}: ${message}`);
        return { FileID: null, ErrorMessage: message };
    }
}

/** @deprecated Use {@link StoreRealtimeRecording}. */
export async function storeRealtimeRecording(input: StoreRealtimeRecordingInput): Promise<StoreRealtimeRecordingResult> {
    return StoreRealtimeRecording(input);
}

const RECORDING_WAV_HEADER_BYTES = 44;
const RECORDING_BYTES_PER_SAMPLE = 2; // mono, 16-bit PCM
/** WAV stores sizes as uint32; the RIFF chunk size is `36 + dataSize`, so data tops out 36 bytes short of the max. */
const RECORDING_MAX_DATA_BYTES = 0xFFFFFFFF - 36;

/** One recovered shard: its zero-based position in the recording and its raw mono PCM16-LE bytes. */
export interface RecordingSegmentBytes {
    readonly Index: number;
    readonly Bytes: Buffer;
}

/** A WAV assembled from shards, plus what had to be invented to keep it aligned. */
export interface AssembledRecording {
    /** Canonical 44-byte-header mono 16-bit PCM WAV. */
    readonly Wav: Buffer;
    /** Shard indexes (ascending) that were absent and filled with silence. */
    readonly MissingIndexes: number[];
    /** Byte length used for each silent gap; reported even when nothing was missing. */
    readonly GapBytes: number;
}

/**
 * Assembles recovered recording shards into one WAV, in index order, filling every absent index with
 * silence. Silence (rather than skipping the gap) keeps all later audio at its true time offset, so it
 * stays aligned with transcript cues, which are offsets from the session's `RecordingStartedAt`.
 *
 * The gap length is the median length of the present shards excluding the highest present index (that
 * one is normally a partial window); with a single shard, that shard's length. It is rounded down to
 * an even byte count (whole 16-bit samples), minimum 2.
 *
 * @param segments Recovered shards; any order, unique non-negative integer indexes starting from 0.
 * @param sampleRate Sample rate of the PCM data, in Hz.
 * @throws Error on no segments, an invalid sample rate or index, a duplicate index, an empty or
 *   odd-length shard, or a result too large for a WAV.
 */
export function BuildRecordingFromSegments(segments: RecordingSegmentBytes[], sampleRate: number): AssembledRecording {
    validateRecordingInputs(segments, sampleRate);
    const ordered = [...segments].sort((a, b) => a.Index - b.Index);
    const gapBytes = computeRecordingGapBytes(ordered);
    // Count gaps arithmetically (indexes are unique and non-negative) so an absurd index fails the size
    // check below instead of first enumerating billions of missing indexes.
    const missingCount = ordered[ordered.length - 1].Index - (ordered.length - 1);

    const dataSize = ordered.reduce((sum, s) => sum + s.Bytes.length, 0) + missingCount * gapBytes;
    if (dataSize > RECORDING_MAX_DATA_BYTES) {
        throw new Error(`BuildRecordingFromSegments: data of ${dataSize} bytes exceeds the maximum WAV data size of ${RECORDING_MAX_DATA_BYTES} bytes`);
    }

    // Buffer.alloc zero-fills, so gaps need no explicit write.
    const wav = Buffer.alloc(RECORDING_WAV_HEADER_BYTES + dataSize);
    writeRecordingWavHeader(wav, sampleRate, dataSize);
    let offset = RECORDING_WAV_HEADER_BYTES;
    let expectedIndex = 0;
    for (const segment of ordered) {
        offset += (segment.Index - expectedIndex) * gapBytes;
        offset += segment.Bytes.copy(wav, offset);
        expectedIndex = segment.Index + 1;
    }
    return { Wav: wav, MissingIndexes: findMissingIndexes(ordered), GapBytes: gapBytes };
}

function validateRecordingInputs(segments: RecordingSegmentBytes[], sampleRate: number): void {
    if (segments.length === 0) {
        throw new Error('BuildRecordingFromSegments: no segments to assemble');
    }
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
        throw new Error(`BuildRecordingFromSegments: sample rate must be a positive integer, got ${sampleRate}`);
    }
    const seen = new Set<number>();
    for (const { Index, Bytes } of segments) {
        if (!Number.isInteger(Index) || Index < 0) {
            throw new Error(`BuildRecordingFromSegments: segment index must be a non-negative integer, got ${Index}`);
        }
        if (seen.has(Index)) {
            throw new Error(`BuildRecordingFromSegments: duplicate segment index ${Index}`);
        }
        seen.add(Index);
        if (Bytes.length === 0) {
            throw new Error(`BuildRecordingFromSegments: segment ${Index} is empty`);
        }
        if (Bytes.length % RECORDING_BYTES_PER_SAMPLE !== 0) {
            throw new Error(`BuildRecordingFromSegments: segment ${Index} has odd length ${Bytes.length}; PCM16 needs an even byte count`);
        }
    }
}

/** Median length of the present shards minus the highest-indexed one (a partial window), floored to even, min 2. */
function computeRecordingGapBytes(ordered: RecordingSegmentBytes[]): number {
    const basis = ordered.length > 1 ? ordered.slice(0, -1) : ordered;
    const lengths = basis.map(s => s.Bytes.length).sort((a, b) => a - b);
    const mid = Math.floor(lengths.length / 2);
    const median = lengths.length % 2 === 1 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
    const even = Math.floor(median / RECORDING_BYTES_PER_SAMPLE) * RECORDING_BYTES_PER_SAMPLE;
    return Math.max(RECORDING_BYTES_PER_SAMPLE, even);
}

/** Indexes in [0, highest present) with no shard. `ordered` is sorted ascending. */
function findMissingIndexes(ordered: RecordingSegmentBytes[]): number[] {
    const highestIndex = ordered[ordered.length - 1].Index;
    const present = new Set(ordered.map(s => s.Index));
    const missing: number[] = [];
    for (let i = 0; i < highestIndex; i++) {
        if (!present.has(i)) {
            missing.push(i);
        }
    }
    return missing;
}

/** Same canonical header layout as `RealtimeRecordingCapture.encodeWavBuffer` (mono, 16-bit, PCM). */
function writeRecordingWavHeader(buffer: Buffer, sampleRate: number, dataSize: number): void {
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * RECORDING_BYTES_PER_SAMPLE, 28);
    buffer.writeUInt16LE(RECORDING_BYTES_PER_SAMPLE, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);
}
