/**
 * @fileoverview Shared MJStorage finalize for realtime session recordings — the single code path both
 * the **server-bridged** capture (`BaseAgent.finalizeRealtimeRecording`) and the **client-direct**
 * browser upload (`RealtimeClientSessionResolver.UploadRealtimeRecording`) use to: resolve the agent's
 * recording storage account, upload the audio, link it to the `AIAgentSession`, and stamp the session's
 * recording fields. Keeps the storage policy in one place rather than duplicated per topology.
 *
 * @module @memberjunction/ai-agents
 */
import { IMetadataProvider, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentSessionEntity, MJFileEntityRecordLinkEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine, FileStorageBase } from '@memberjunction/storage';
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
    /** Name of the uploaded file. Defaults to `recording.<ext>`. */
    FileName?: string;
    /** Description stored on the `MJ: Files` row (e.g. how a recovered recording was assembled). */
    Description?: string;
    /**
     * When true, the session is re-read right before linking/stamping and, if it already has a
     * `RecordingFileID`, that recording is left alone: nothing is linked or stamped and the result is
     * `Superseded`. Recovery sets this so a late-arriving real recording is never overwritten. Left
     * false (the default) for the end-of-call upload, which stamps unconditionally.
     */
    PreserveExistingRecording?: boolean;
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

/**
 * Sample rate (Hz) carried by a raw-PCM MIME type such as `audio/L16;rate=48000`. Case-insensitive on
 * the type and parameter name; whitespace and extra parameters are tolerated. Returns `null` for any
 * other type, a missing `rate`, or a rate that is not a positive integer. Shared by the shard-key
 * writer and the recovery's content-type fallback so the two cannot disagree on what counts as a rate.
 */
function parsePcmRate(mimeType: string): number | null {
    const [type, ...params] = mimeType.split(';').map(part => part.trim());
    if (!/^audio\/(l16|pcm)$/i.test(type)) {
        return null;
    }
    for (const param of params) {
        const match = /^rate\s*=\s*(\d+)$/i.exec(param);
        const rate = match ? Number(match[1]) : 0;
        if (Number.isSafeInteger(rate) && rate > 0) {
            return rate;
        }
    }
    return null;
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
 * `seg-NNNN.<ext>`, or `seg-NNNN.r<rate>.pcm` for a PCM shard whose MIME carries a rate. Header-less
 * PCM has no way to say how fast to play it back, and recovery runs after the browser (and its
 * `RecordingStartedAt`/rate bookkeeping) is gone, so the rate travels in the key itself.
 */
function segmentFileName(segmentIndex: number, mimeType: string): string {
    const index = String(segmentIndex).padStart(4, '0');
    const extension = extensionForMime(mimeType);
    const rate = extension === 'pcm' ? parsePcmRate(mimeType) : null;
    return rate === null ? `seg-${index}.${extension}` : `seg-${index}.r${rate}.${extension}`;
}

/**
 * Writes ONE crash-recovery segment shard (`seg-NNNN[.r<rate>].<ext>`) into the session's folder as a RAW
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
        const name = segmentFileName(SegmentIndex, MimeType);
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
    /**
     * True only when `PreserveExistingRecording` was set and the session already had a recording: the
     * file was uploaded but deliberately not linked or stamped, so it is an orphan. False on every
     * other path.
     */
    readonly Superseded: boolean;
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
            fileName: input.FileName ?? `recording.${extensionForMime(MimeType)}`,
            mimeType: MimeType,
            description: input.Description,
            contextUser: ContextUser,
            storageAccountId: StorageAccountID,
            provider: Provider,
            pathPrefix: recordingFolder(SessionID)
        });

        // Best-effort waveform-peaks sidecar (peaks.json) next to the recording, for fast waveform
        // rendering without re-decoding the audio. A sidecar failure never fails the recording itself.
        await WriteRecordingPeaksSidecar(SessionID, StorageAccountID, Peaks, ContextUser);

        // Read the session as late as possible: a recording that landed during our upload must win.
        const session = await Provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', ContextUser);
        const sessionLoaded = await session.Load(SessionID);
        if (input.PreserveExistingRecording && sessionLoaded && session.RecordingFileID) {
            LogStatus(`storeRealtimeRecording: session ${SessionID} already has recording file ${session.RecordingFileID}; the just-uploaded file ${uploaded.FileID} is orphaned and was not linked or stamped`);
            return { FileID: uploaded.FileID, ErrorMessage: null, Superseded: true };
        }

        await linkRecordingToSession(uploaded.FileID, SessionID, ContextUser, Provider);
        if (input.PreserveExistingRecording && sessionLoaded) {
            // Re-read after the link work so the read-to-write window is one load -> save.
            if (!await session.Load(SessionID) || session.RecordingFileID) {
                LogStatus(`storeRealtimeRecording: session ${SessionID} gained recording file ${session.RecordingFileID} while linking; file ${uploaded.FileID} is orphaned and was not stamped`);
                return { FileID: uploaded.FileID, ErrorMessage: null, Superseded: true };
            }
        }
        if (sessionLoaded) {
            await stampRecordingOnSession(session, uploaded.FileID, Media, StartedAt);
        }
        return { FileID: uploaded.FileID, ErrorMessage: null, Superseded: false };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`storeRealtimeRecording failed for session ${SessionID}: ${message}`);
        return { FileID: null, ErrorMessage: message, Superseded: false };
    }
}

/** Links the file to the session record so it's discoverable via MJ: File Entity Record Links. */
async function linkRecordingToSession(fileID: string, sessionID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
    const sessionEntityID = provider.EntityByName('MJ: AI Agent Sessions')?.ID;
    if (!sessionEntityID) {
        return;
    }
    const link = await provider.GetEntityObject<MJFileEntityRecordLinkEntity>('MJ: File Entity Record Links', contextUser);
    link.NewRecord();
    link.FileID = fileID;
    link.EntityID = sessionEntityID;
    link.RecordID = sessionID;
    if (!await link.Save()) {
        LogError(`storeRealtimeRecording: failed to link recording to session ${sessionID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** Stamps the recording fields on an already-loaded session (file + media kind + t0). */
async function stampRecordingOnSession(
    session: MJAIAgentSessionEntity, fileID: string, media: RealtimeRecordingMedia, startedAt: Date
): Promise<void> {
    session.RecordingFileID = fileID;
    session.RecordingMedia = media;
    session.RecordingStartedAt = startedAt;
    if (!await session.Save()) {
        LogError(`storeRealtimeRecording: failed to stamp recording fields on session ${session.ID}: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
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
 * @param maxDataBytes Ceiling on the PCM data size (shards plus gap fill), checked before anything is
 *   allocated. Defaults to the WAV format's own limit; callers handling untrusted shards pass less.
 * @throws Error on no segments, an invalid sample rate or index, a duplicate index, an empty or
 *   odd-length shard, or a result too large for a WAV.
 */
export function BuildRecordingFromSegments(
    segments: RecordingSegmentBytes[], sampleRate: number, maxDataBytes: number = RECORDING_MAX_DATA_BYTES
): AssembledRecording {
    validateRecordingInputs(segments, sampleRate);
    const ordered = [...segments].sort((a, b) => a.Index - b.Index);
    const gapBytes = computeRecordingGapBytes(ordered);
    // Count gaps arithmetically (indexes are unique and non-negative) so an absurd index fails the size
    // check below instead of first enumerating billions of missing indexes.
    const missingCount = ordered[ordered.length - 1].Index - (ordered.length - 1);

    const dataSize = ordered.reduce((sum, s) => sum + s.Bytes.length, 0) + missingCount * gapBytes;
    const limit = Math.min(maxDataBytes, RECORDING_MAX_DATA_BYTES);
    if (dataSize > limit) {
        throw new Error(`BuildRecordingFromSegments: data of ${dataSize} bytes exceeds the maximum WAV data size of ${limit} bytes`);
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

/**
 * Most shards recovery will assemble. At ~15 s per shard this is an hour of audio, far past any real
 * call; a listing at or beyond it (by count or by highest index) is treated as corrupt or hostile and
 * fails closed rather than allocating a huge WAV.
 */
export const MAX_RECOVERY_SEGMENTS = 240;

/**
 * Ceiling on the PCM a recovery will hold in memory: 384 MiB covers an hour of 48 kHz mono PCM16
 * (345.6 MB) with headroom. Shard sizes are client-controlled (the GraphQL body limit is 50 MB, so one
 * shard can be ~37 MB) and gaps are filled with silence, so without this a session owner could make the
 * janitor allocate gigabytes. Checked against listed sizes, running actual bytes, and the assembled size.
 */
export const MAX_RECOVERY_BYTES = 384 * 1024 * 1024;

/** `seg-0003.pcm` or `seg-0003.r48000.pcm`: index, optional keyed rate, extension. */
const SEGMENT_KEY_PATTERN = /^seg-(\d+)(?:\.r(\d+))?\.([A-Za-z0-9]+)$/;
const RECOVERED_FILE_NAME = 'recording-recovered.wav';

/** Input to {@link RecoverRealtimeRecordingFromSegments}. */
export interface RecoverRealtimeRecordingInput {
    SessionID: string;
    /** Storage account the shards were written to. */
    StorageAccountID: string;
    /** The recording `t0`, stamped on the session (recovery cannot derive it from the shards). */
    StartedAt: Date;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** What {@link RecoverRealtimeRecordingFromSegments} did. */
export type RecoverRealtimeRecordingOutcome = 'Recovered' | 'NoSegments' | 'Superseded' | 'Failed';

/** Result of {@link RecoverRealtimeRecordingFromSegments}. */
export interface RecoverRealtimeRecordingResult {
    readonly Outcome: RecoverRealtimeRecordingOutcome;
    /** The recovered `MJ: Files` id; set for `Recovered`, and for `Superseded` when an orphan was uploaded. */
    readonly FileID: string | null;
    /** Number of shards found in the session folder. */
    readonly SegmentCount: number;
    /** Shard indexes that were absent and filled with estimated silence. */
    readonly MissingIndexes: number[];
    /** Why recovery failed; null otherwise. */
    readonly ErrorMessage: string | null;
}

interface ListedShard {
    readonly Name: string;
    readonly Path: string;
    readonly Index: number;
    readonly KeyedRate: number | null;
    readonly Extension: string;
    /** Size the listing reported; 0 on drivers that do not report one. */
    readonly ListedSize: number;
}

/**
 * Rebuilds a session's recording from the `seg-*` crash-recovery shards left in its storage folder —
 * for a call whose browser died or whose end-of-call upload never ran, so no `recording.*` exists.
 * Shards are concatenated in order (silence for absent ones), uploaded as `recording-recovered.wav`,
 * stamped on the session, and only then deleted. Deletion happens only after a reload confirms the
 * session points at the recovered file, so a failure at any step leaves the shards for the next try.
 * If the session gained a recording meanwhile, that one is kept and the outcome is `Superseded`.
 *
 * Never throws: every failure is logged with the session id and returned as `Failed`.
 *
 * @param input Session, storage account, recording `t0`, and server context.
 */
export async function RecoverRealtimeRecordingFromSegments(input: RecoverRealtimeRecordingInput): Promise<RecoverRealtimeRecordingResult> {
    try {
        return await recoverFromSegments(input);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`RecoverRealtimeRecordingFromSegments failed (session ${input.SessionID}): ${message}`);
        return recoveryResult('Failed', { ErrorMessage: message });
    }
}

function recoveryResult(
    outcome: RecoverRealtimeRecordingOutcome, fields: Partial<Omit<RecoverRealtimeRecordingResult, 'Outcome'>> = {}
): RecoverRealtimeRecordingResult {
    return { Outcome: outcome, FileID: null, SegmentCount: 0, MissingIndexes: [], ErrorMessage: null, ...fields };
}

async function recoverFromSegments(input: RecoverRealtimeRecordingInput): Promise<RecoverRealtimeRecordingResult> {
    const { SessionID, StorageAccountID, StartedAt, ContextUser, Provider } = input;
    const driver = await FileStorageEngine.Instance.GetDriver(StorageAccountID, ContextUser);
    const shards = await listRecordingShards(driver, SessionID);
    if (shards.length === 0) {
        LogStatus(`RecoverRealtimeRecordingFromSegments: no shards for session ${SessionID} in storage account ${StorageAccountID}`);
        return recoveryResult('NoSegments');
    }
    assertRecoverable(shards);

    const sampleRate = await resolveSharedSampleRate(driver, shards);
    const segments = await readShardBytes(driver, shards);
    const assembled = BuildRecordingFromSegments(segments, sampleRate, MAX_RECOVERY_BYTES);
    const description = describeRecovery(shards.length, assembled, sampleRate);
    if (assembled.MissingIndexes.length > 0) {
        LogStatus(`RecoverRealtimeRecordingFromSegments (session ${SessionID}): ${description}`);
    }

    const stored = await StoreRealtimeRecording({
        Audio: assembled.Wav, MimeType: 'audio/wav', Media: 'Audio', StartedAt, StorageAccountID, SessionID,
        ContextUser, Provider, FileName: RECOVERED_FILE_NAME, Description: description, PreserveExistingRecording: true,
    });
    const found = { FileID: stored.FileID, SegmentCount: shards.length, MissingIndexes: assembled.MissingIndexes };
    if (stored.Superseded) {
        return recoveryResult('Superseded', found);
    }
    if (!stored.FileID) {
        throw new Error(stored.ErrorMessage ?? 'storing the recovered recording failed');
    }
    return finishRecovery(input, stored.FileID, found, shards);
}

/** Confirms the stamp stuck, then (and only then) deletes the shards. */
async function finishRecovery(
    input: RecoverRealtimeRecordingInput, fileID: string, found: Partial<Omit<RecoverRealtimeRecordingResult, 'Outcome'>>,
    shards: ListedShard[]
): Promise<RecoverRealtimeRecordingResult> {
    const { SessionID, StorageAccountID, ContextUser, Provider } = input;
    const session = await Provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', ContextUser);
    if (!await session.Load(SessionID)) {
        throw new Error(`could not reload session ${SessionID} to confirm the recovered recording was stamped`);
    }
    if (session.RecordingFileID && session.RecordingFileID !== fileID) {
        LogStatus(`RecoverRealtimeRecordingFromSegments (session ${SessionID}): session now points at ${session.RecordingFileID}, not recovered file ${fileID}; keeping shards`);
        return recoveryResult('Superseded', found);
    }
    if (session.RecordingFileID !== fileID) {
        throw new Error(`recovered file ${fileID} uploaded but not stamped on session ${SessionID}; shards kept`);
    }
    const deleted = await deleteListedShards(StorageAccountID, ContextUser, shards);
    if (deleted < shards.length) {
        LogError(`RecoverRealtimeRecordingFromSegments (session ${SessionID}): deleted ${deleted} of ${shards.length} shards after recovery`);
    }
    return recoveryResult('Recovered', found);
}

/**
 * Deletes exactly the shards that were assembled. A re-list would also take shards written after our
 * listing, whose audio is not in the recovered file. Returns how many were deleted.
 */
async function deleteListedShards(storageAccountID: string, contextUser: UserInfo, shards: ListedShard[]): Promise<number> {
    const driver = await FileStorageEngine.Instance.GetDriver(storageAccountID, contextUser);
    let deleted = 0;
    for (const shard of shards) {
        if (await driver.DeleteObject(shard.Path)) {
            deleted++;
        }
    }
    return deleted;
}

/** Lists the session folder's `seg-*` objects. Other objects (recording.*, peaks.json) are ignored. */
async function listRecordingShards(driver: FileStorageBase, sessionID: string): Promise<ListedShard[]> {
    const folder = recordingFolder(sessionID);
    const listed = await driver.ListObjects(`${folder}/`);
    const shards: ListedShard[] = [];
    for (const obj of listed.objects ?? []) {
        const name = obj.name.split('/').pop() ?? obj.name;
        const match = SEGMENT_KEY_PATTERN.exec(name);
        if (match) {
            const keyedRate = match[2] === undefined ? null : Number(match[2]);
            if (keyedRate !== null && !(Number.isSafeInteger(keyedRate) && keyedRate > 0)) {
                throw new Error(`shard ${name} has an invalid sample rate in its key`);
            }
            shards.push({
                Name: name, Path: `${folder}/${name}`, Index: Number(match[1]),
                KeyedRate: keyedRate, Extension: match[3], ListedSize: obj.size ?? 0,
            });
        }
    }
    return shards;
}

/** Fail closed on an oversized listing and on anything that is not raw PCM (webm/ogg shards cannot be concatenated). */
function assertRecoverable(shards: ListedShard[]): void {
    const highestIndex = Math.max(...shards.map(s => s.Index));
    if (shards.length >= MAX_RECOVERY_SEGMENTS || highestIndex >= MAX_RECOVERY_SEGMENTS) {
        throw new Error(`refusing to recover ${shards.length} shards (highest index ${highestIndex}); limit is ${MAX_RECOVERY_SEGMENTS}`);
    }
    const listedBytes = shards.reduce((sum, s) => sum + s.ListedSize, 0);
    if (listedBytes > MAX_RECOVERY_BYTES) {
        throw new Error(`shards total ${listedBytes} bytes, over the recovery limit of ${MAX_RECOVERY_BYTES} bytes`);
    }
    const notPcm = shards.find(s => s.Extension !== 'pcm');
    if (notPcm) {
        throw new Error(`shard ${notPcm.Name} is not raw PCM; only .pcm shards can be reassembled`);
    }
}

/** One sample rate for every shard: from the key when present, else the object's stored content type. */
async function resolveSharedSampleRate(driver: FileStorageBase, shards: ListedShard[]): Promise<number> {
    let rate: number | null = null;
    let rateSource = '';
    for (const shard of shards) {
        const shardRate = shard.KeyedRate ?? parsePcmRate((await driver.GetObjectMetadata({ fullPath: shard.Path })).contentType ?? '');
        if (shardRate === null) {
            throw new Error(`cannot determine the sample rate of shard ${shard.Name}`);
        }
        if (rate !== null && shardRate !== rate) {
            throw new Error(`shards disagree on sample rate: ${rateSource} is ${rate} Hz but ${shard.Name} is ${shardRate} Hz`);
        }
        rate = shardRate;
        rateSource = shard.Name;
    }
    if (rate === null) {
        throw new Error('no shards to take a sample rate from');
    }
    return rate;
}

/** Sequential on purpose: bounds memory and request concurrency against the storage account. */
async function readShardBytes(driver: FileStorageBase, shards: ListedShard[]): Promise<RecordingSegmentBytes[]> {
    const segments: RecordingSegmentBytes[] = [];
    let total = 0;
    for (const shard of shards) {
        const bytes = await driver.GetObject({ fullPath: shard.Path });
        total += bytes.length;
        // Listed sizes can be 0 or wrong, so the real total is enforced as bytes arrive.
        if (total > MAX_RECOVERY_BYTES) {
            throw new Error(`shards read so far total ${total} bytes (at ${shard.Name}), over the recovery limit of ${MAX_RECOVERY_BYTES} bytes`);
        }
        segments.push({ Index: shard.Index, Bytes: bytes });
    }
    return segments;
}

function describeRecovery(shardCount: number, assembled: AssembledRecording, sampleRate: number): string {
    const head = `Recovered from ${shardCount} crash-recovery segment(s)`;
    if (assembled.MissingIndexes.length === 0) {
        return `${head}.`;
    }
    const seconds = assembled.GapBytes / RECORDING_BYTES_PER_SAMPLE / sampleRate;
    return `${head}; missing segment(s) ${assembled.MissingIndexes.join(', ')} filled with estimated silence (~${seconds.toFixed(1)} s each).`;
}
