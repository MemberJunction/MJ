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
export async function resolveRecordingStorageAccountID(
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
export async function readRealtimeRecordingFile(
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
export async function writeRealtimeRecordingSegment(input: WriteRecordingSegmentInput): Promise<boolean> {
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

/**
 * Writes the capture-time waveform peaks as a `peaks.json` sidecar (a JSON array of numbers) into the
 * session's recording folder via the storage driver. Best-effort and tolerant — a missing/empty peaks
 * array is a no-op, and any storage failure is logged and swallowed (the recording itself already
 * succeeded). Never throws.
 *
 * @returns `true` when a sidecar was written.
 */
export async function writeRecordingPeaksSidecar(
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

/**
 * Deletes the `seg-*` shards in a session's folder, leaving the consolidated `recording.*` file. Called
 * after {@link storeRealtimeRecording} writes the canonical file at end of call. Never throws.
 *
 * @returns The number of shards deleted.
 */
export async function deleteRealtimeRecordingSegments(sessionID: string, storageAccountID: string, contextUser: UserInfo): Promise<number> {
    try {
        const driver = await FileStorageEngine.Instance.GetDriver(storageAccountID, contextUser);
        const folder = recordingFolder(sessionID);
        const listed = await driver.ListObjects(folder);
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

/**
 * Uploads a session recording to MJStorage, links it to the `AIAgentSession` (via
 * `MJ: File Entity Record Links`), and stamps `RecordingFileID` / `RecordingMedia` / `RecordingStartedAt`
 * on the session. Never throws — a recording-storage failure must not fail the session; failures are
 * logged and surfaced as a `null` return.
 *
 * @param input The recording bytes + storage account + session context.
 * @returns The created `MJ: Files` id, or `null` on failure.
 */
export async function storeRealtimeRecording(input: StoreRealtimeRecordingInput): Promise<string | null> {
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
        await writeRecordingPeaksSidecar(SessionID, StorageAccountID, Peaks, ContextUser);

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
        return uploaded.FileID;
    } catch (error) {
        LogError(`storeRealtimeRecording failed for session ${SessionID}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
