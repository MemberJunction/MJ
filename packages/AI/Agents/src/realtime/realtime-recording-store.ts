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
import { MJAIAgentEntity, MJAIAgentSessionEntity, MJFileEntityRecordLinkEntity } from '@memberjunction/core-entities';
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
export function resolveRecordingStorageAccountID(agent: MJAIAgentEntity): string | null {
    const providerID = agent.RecordingStorageProviderID || agent.AttachmentStorageProviderID;
    if (!providerID) {
        return null;
    }
    const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(providerID);
    return accounts[0]?.ID ?? null;
}

/** Input to {@link storeRealtimeRecording}. */
export interface StoreRealtimeRecordingInput {
    /** The encoded recording bytes (e.g. a WAV from the server mixer, or browser webm/ogg). */
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
}

/** A short, stable file extension for the recording's MIME type. */
function extensionForMime(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
    return 'wav';
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
    const { Audio, MimeType, Media, StartedAt, StorageAccountID, SessionID, ContextUser, Provider } = input;
    try {
        const uploaded = await FileStorageEngine.Instance.UploadFile({
            content: Audio,
            fileName: `realtime-session-${SessionID}.${extensionForMime(MimeType)}`,
            mimeType: MimeType,
            contextUser: ContextUser,
            storageAccountId: StorageAccountID,
            provider: Provider,
            // Single-level folder: some providers (Box) can't create nested folders in one upload.
            pathPrefix: 'realtime-recordings'
        });

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
