/**
 * @fileoverview Meeting-Room recording registration — the server-side path that closes the LiveKit
 * meeting-room recording loop. After a room's composite egress completes, this module:
 *
 *  1. Resolves the **Meeting-Room Conversation** for the room (prefer by `EgressID`, fall back to the
 *     room name → `ExternalID` + `Type='Meeting Room'`, else create one via the sink's pattern).
 *  2. Resolves the **meeting-recording storage account** — a configured `MJStorage` account that points
 *     at the same sink LiveKit egress wrote the MP4 to, so MJ can read/stream it.
 *  3. Creates the `MJ: Files` row for the recording (v1 points DIRECTLY at the egress output — no byte
 *     copy — so playback streams straight from the sink). An OPTIONAL copy-to-canonical path (OFF by
 *     default, behind config) reads the bytes and re-uploads into a separate canonical provider.
 *  4. Stamps `Conversation.RecordingFileID` (+ `EgressID`) and saves.
 *
 * Lives in `@memberjunction/server` (the one package that depends on the egress service, MJStorage, and
 * core-entities). It is invoked from `RealtimeBridgeResolver.StopLiveKitRecording`. Everything is
 * best-effort: any failure returns a non-throwing failure result and logs — a recording that fails to
 * register never crashes the stop-recording mutation.
 *
 * ## Required configuration
 *
 * The egress sink and the MJStorage account must point at the **same** bucket/container so MJ can read the
 * file LiveKit wrote. Configure the **provider** whose accounts target that sink via either:
 *
 *   - env: `MJ_MEETING_RECORDING_STORAGE_PROVIDER=<MJ: File Storage Providers ID>`
 *   - config (`mj.config.cjs`): `meetingRecordingStorageProviderID: '<provider id>'`
 *
 * When unset, registration returns a clear, non-throwing failure explaining the config is required (the
 * recording still stopped; it just isn't registered as a `MJ: Files` row).
 *
 * ### Optional copy-to-canonical ("copy into Box")
 *
 * To copy the MP4 OUT of the egress sink into a separate canonical provider (e.g. Box) instead of pointing
 * the Files row at the sink, set a DIFFERENT provider via:
 *
 *   - env: `MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER=<provider id>`
 *   - config: `meetingRecordingCanonicalStorageProviderID: '<provider id>'`
 *
 * When set and different from the sink provider, the bytes are read from the sink and uploaded into the
 * canonical provider, and the Files row points there. OFF by default.
 *
 * @module @memberjunction/server
 * @author MemberJunction.com
 */

import { IMetadataProvider, UserInfo, RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJConversationEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';

const CONVERSATION_ENTITY = 'MJ: Conversations';
const FILES_ENTITY = 'MJ: Files';
const MEETING_ROOM_CONVERSATION_TYPE = 'Meeting Room';

/** The egress output a completed recording produced — the subset of `RecordingInfo` registration needs. */
export interface MeetingRecordingEgressResult {
  /** The LiveKit egress session id (correlates the recording back to the conversation). */
  EgressID: string;
  /** The room the recording belongs to (the LiveKit room name = the Conversation's `ExternalID`). */
  RoomName: string;
  /** The output MP4's path/key in the egress storage sink. Required to register; `undefined` if egress is still in progress. */
  OutputLocation?: string;
  /** The output file size in bytes, when the egress reported it. */
  OutputSizeBytes?: number;
}

/** The outcome of registering a meeting recording. */
export interface MeetingRecordingRegistrationResult {
  /** Whether the recording was registered (Files row created + Conversation stamped). */
  Success: boolean;
  /** A clear, human-readable explanation when {@link Success} is false (config missing, no output, save failed). */
  ErrorMessage?: string;
  /** The newly created `MJ: Files` row id, when {@link Success} is true. */
  RecordingFileID?: string;
  /** The resolved Meeting-Room Conversation id, when one was resolved/created. */
  ConversationID?: string;
}

/** Config inputs for registration — env vars are read here; a host may override via the optional params. */
export interface MeetingRecordingRegistrationConfig {
  /**
   * The `MJ: File Storage Providers` id whose accounts target the egress sink (where LiveKit wrote the
   * MP4). Falls back to `process.env.MJ_MEETING_RECORDING_STORAGE_PROVIDER`.
   */
  sinkStorageProviderID?: string;
  /**
   * OPTIONAL canonical provider id — when set AND different from the sink, the MP4 is copied into it and
   * the Files row points there (the "copy into Box" option). Falls back to
   * `process.env.MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER`. OFF by default.
   */
  canonicalStorageProviderID?: string;
}

/**
 * Registers a completed meeting recording: resolves the Meeting-Room Conversation, creates the `MJ: Files`
 * row for the egress MP4, and stamps `Conversation.RecordingFileID` (+ `EgressID`). Best-effort — never
 * throws; returns a failure result with a clear message instead.
 *
 * @param egress The completed egress result (must carry an `OutputLocation`).
 * @param contextUser The authenticated user (for DB writes + credential access).
 * @param provider The metadata provider servicing this request.
 * @param config Optional config overrides (otherwise read from env).
 */
export async function registerMeetingRecordingFile(
  egress: MeetingRecordingEgressResult,
  contextUser: UserInfo,
  provider: IMetadataProvider,
  config?: MeetingRecordingRegistrationConfig,
): Promise<MeetingRecordingRegistrationResult> {
  try {
    if (!egress.OutputLocation) {
      return {
        Success: false,
        ErrorMessage:
          'The recording has no output yet (egress still in progress) — nothing to register. ' + 'Register only after the egress has stopped/completed.',
      };
    }

    const sinkProviderID = config?.sinkStorageProviderID ?? process.env.MJ_MEETING_RECORDING_STORAGE_PROVIDER;
    if (!sinkProviderID) {
      return {
        Success: false,
        ErrorMessage:
          'No meeting-recording storage provider is configured. Set MJ_MEETING_RECORDING_STORAGE_PROVIDER ' +
          '(or meetingRecordingStorageProviderID in mj.config.cjs) to the MJ: File Storage Providers id ' +
          'whose accounts target the same sink LiveKit egress writes to.',
      };
    }

    await FileStorageEngine.Instance.Config(false, contextUser, provider);

    const sinkAccountID = resolveStorageAccountForProvider(sinkProviderID);
    if (!sinkAccountID) {
      return {
        Success: false,
        ErrorMessage:
          `No active MJStorage account is linked to the configured meeting-recording provider '${sinkProviderID}'. ` +
          'Create a File Storage Account for that provider pointing at the egress sink bucket/container.',
      };
    }

    const conversationID = await resolveMeetingConversation(egress, contextUser, provider);
    if (!conversationID) {
      return { Success: false, ErrorMessage: 'Could not resolve or create the Meeting-Room Conversation for the recording.' };
    }

    // v1: point the Files row directly at the egress output in the sink account (no byte copy). The
    // OPTIONAL copy-to-canonical path overrides both the provider+key when a differing canonical
    // provider is configured.
    const fileLocation = await resolveFileLocation(egress, sinkProviderID, sinkAccountID, contextUser, config);
    if (!fileLocation.Success) {
      return { Success: false, ErrorMessage: fileLocation.ErrorMessage, ConversationID: conversationID };
    }

    const fileID = await createRecordingFileRow(egress, fileLocation.ProviderID, fileLocation.ProviderKey, contextUser, provider);
    if (!fileID) {
      return { Success: false, ErrorMessage: 'Failed to create the MJ: Files row for the recording.', ConversationID: conversationID };
    }

    const stamped = await stampConversationRecording(conversationID, fileID, egress.EgressID, contextUser, provider);
    if (!stamped) {
      return {
        Success: false,
        ErrorMessage: 'Created the recording file but failed to stamp it onto the Conversation.',
        ConversationID: conversationID,
        RecordingFileID: fileID,
      };
    }

    LogStatus(`registerMeetingRecordingFile: registered recording ${fileID} for room '${egress.RoomName}' on conversation ${conversationID}.`);
    return { Success: true, RecordingFileID: fileID, ConversationID: conversationID };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`registerMeetingRecordingFile failed: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}

/**
 * Best-effort correlation when a recording STARTS: stamps `Conversation.EgressID` onto the room's
 * Meeting-Room Conversation (if it already exists) so a live recording is tracked against the room. If the
 * conversation doesn't exist yet, this resolves to `false` silently — the stop-flow will resolve/create it.
 * Never throws.
 *
 * @param roomName The LiveKit room name (= the Conversation's `ExternalID`).
 * @param egressID The egress id that just started.
 * @param contextUser The authenticated user.
 * @param provider The metadata provider.
 * @returns `true` when an existing conversation was stamped, else `false`.
 */
export async function correlateRecordingStart(roomName: string, egressID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<boolean> {
  try {
    const conversationID = await findConversationByRoomName(roomName, contextUser, provider);
    if (!conversationID) {
      return false; // not created yet — stop-flow resolves/creates it
    }
    const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
    if (!(await conversation.Load(conversationID))) {
      return false;
    }
    conversation.EgressID = egressID;
    if (await conversation.Save()) {
      return true;
    }
    LogError(`correlateRecordingStart: failed to stamp EgressID: ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return false;
  } catch (error) {
    // Never fail the recording start on correlation.
    LogError(`correlateRecordingStart (best-effort) failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Resolves the Meeting-Room Conversation for a completed recording: prefer matching by `EgressID` (set on
 * start), fall back to the room name (`ExternalID` + `Type`), else create one following the transcript
 * sink's pattern (scoped `Application` so it stays out of the normal chat list).
 */
export async function resolveMeetingConversation(
  egress: MeetingRecordingEgressResult,
  contextUser: UserInfo,
  provider: IMetadataProvider,
): Promise<string | null> {
  const byEgress = await findConversationByEgressID(egress.EgressID, contextUser, provider);
  if (byEgress) {
    return byEgress;
  }
  const byRoom = await findConversationByRoomName(egress.RoomName, contextUser, provider);
  if (byRoom) {
    return byRoom;
  }
  return createMeetingConversation(egress.RoomName, contextUser, provider);
}

/** Finds a non-archived Meeting-Room Conversation by its `EgressID`. */
async function findConversationByEgressID(egressID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
  if (!egressID) {
    return null;
  }
  const rv = RunView.FromMetadataProvider(provider);
  const found = await rv.RunView<{ ID: string }>(
    {
      EntityName: CONVERSATION_ENTITY,
      ExtraFilter: `EgressID='${escapeSql(egressID)}' AND Type='${escapeSql(MEETING_ROOM_CONVERSATION_TYPE)}' AND (IsArchived IS NULL OR IsArchived=0)`,
      Fields: ['ID'],
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 1,
      ResultType: 'simple',
    },
    contextUser,
  );
  return found.Success && found.Results.length > 0 ? found.Results[0].ID : null;
}

/** Finds a non-archived Meeting-Room Conversation by room name (`ExternalID` + `Type`). */
async function findConversationByRoomName(roomName: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
  if (!roomName) {
    return null;
  }
  const rv = RunView.FromMetadataProvider(provider);
  const found = await rv.RunView<{ ID: string }>(
    {
      EntityName: CONVERSATION_ENTITY,
      ExtraFilter: `ExternalID='${escapeSql(roomName)}' AND Type='${escapeSql(MEETING_ROOM_CONVERSATION_TYPE)}' AND (IsArchived IS NULL OR IsArchived=0)`,
      Fields: ['ID'],
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 1,
      ResultType: 'simple',
    },
    contextUser,
  );
  return found.Success && found.Results.length > 0 ? found.Results[0].ID : null;
}

/** Creates a Meeting-Room Conversation for a room (scoped `Application`, keyed by room name) — mirrors the transcript sink. */
async function createMeetingConversation(roomName: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
  const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
  conversation.NewRecord();
  conversation.UserID = contextUser.ID;
  conversation.Name = `Meeting Room ${roomName}`;
  conversation.Type = MEETING_ROOM_CONVERSATION_TYPE;
  conversation.ExternalID = roomName;
  conversation.ApplicationScope = 'Application';
  if (await conversation.Save()) {
    return conversation.ID;
  }
  LogError(
    `registerMeetingRecordingFile: failed to create Meeting-Room conversation for room '${roomName}': ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`,
  );
  return null;
}

/** Result of resolving where the Files row should point (sink directly, or copied into a canonical provider). */
interface FileLocationResult {
  Success: boolean;
  ErrorMessage?: string;
  ProviderID: string;
  ProviderKey: string;
}

/**
 * Resolves the `(ProviderID, ProviderKey)` the Files row should point at. v1 default: the egress output in
 * the sink provider (no copy). When a DIFFERING canonical provider is configured, copies the bytes into it
 * and points there instead.
 */
async function resolveFileLocation(
  egress: MeetingRecordingEgressResult,
  sinkProviderID: string,
  sinkAccountID: string,
  contextUser: UserInfo,
  config?: MeetingRecordingRegistrationConfig,
): Promise<FileLocationResult> {
  const outputLocation = egress.OutputLocation!;
  const canonicalProviderID = config?.canonicalStorageProviderID ?? process.env.MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER;

  // Default (v1): point directly at the sink output — playback streams straight from it, no byte copy.
  if (!canonicalProviderID || canonicalProviderID === sinkProviderID) {
    return { Success: true, ProviderID: sinkProviderID, ProviderKey: outputLocation };
  }

  // OPTIONAL "copy into Box": a separate canonical provider IS configured and differs from the sink —
  // read the bytes from the sink and upload them into the canonical provider, then point there.
  const canonicalKey = await copyEgressOutputToCanonical(outputLocation, sinkAccountID, canonicalProviderID, contextUser);
  if (!canonicalKey.Success) {
    return { Success: false, ErrorMessage: canonicalKey.ErrorMessage, ProviderID: '', ProviderKey: '' };
  }
  return { Success: true, ProviderID: canonicalProviderID, ProviderKey: canonicalKey.ProviderKey };
}

/** Result of a canonical copy. */
interface CanonicalCopyResult {
  Success: boolean;
  ErrorMessage?: string;
  ProviderKey: string;
}

/**
 * OPTIONAL — copies the egress MP4 OUT of the sink account into a configured canonical provider (the "copy
 * into Box" option). Reads the bytes via the sink driver's `GetObject({ fullPath })` and re-uploads them
 * into the canonical provider via `FileStorageEngine.UploadFile`. Returns the canonical `ProviderKey`.
 */
export async function copyEgressOutputToCanonical(
  outputLocation: string,
  sinkAccountID: string,
  canonicalProviderID: string,
  contextUser: UserInfo,
): Promise<CanonicalCopyResult> {
  const engine = FileStorageEngine.Instance;
  const canonicalAccountID = resolveStorageAccountForProvider(canonicalProviderID);
  if (!canonicalAccountID) {
    return {
      Success: false,
      ErrorMessage: `No active MJStorage account is linked to the configured canonical provider '${canonicalProviderID}'.`,
      ProviderKey: '',
    };
  }

  const sinkDriver = await engine.GetDriver(sinkAccountID, contextUser);
  const bytes = await sinkDriver.GetObject({ fullPath: outputLocation });

  const fileName = outputLocation.split('/').pop() || `recording-${Date.now()}.mp4`;
  const uploaded = await engine.UploadFile({
    content: bytes,
    fileName,
    mimeType: 'video/mp4',
    contextUser,
    storageAccountId: canonicalAccountID,
    pathPrefix: `meeting-recordings/${new Date().toISOString().slice(0, 10)}`,
  });
  return { Success: true, ProviderKey: uploaded.StoragePath };
}

/** Creates the `MJ: Files` row pointing at the recording (no byte copy in the default v1 path). */
async function createRecordingFileRow(
  egress: MeetingRecordingEgressResult,
  providerID: string,
  providerKey: string,
  contextUser: UserInfo,
  provider: IMetadataProvider,
): Promise<string | null> {
  const file = await provider.GetEntityObject<MJFileEntity>(FILES_ENTITY, contextUser);
  file.NewRecord();
  file.Name = `Meeting Recording — ${egress.RoomName} — ${new Date().toISOString().slice(0, 10)}`;
  file.ContentType = 'video/mp4';
  file.ProviderID = providerID;
  file.ProviderKey = providerKey;
  file.Status = 'Uploaded';
  // NOTE: `MJ: Files` has no size column, so `egress.OutputSizeBytes` is not persisted here (it is logged
  // and used by the player's range-streaming on demand). If a size column is added, set it here.
  if (await file.Save()) {
    return file.ID;
  }
  LogError(`registerMeetingRecordingFile: failed to save MJ: Files row: ${file.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  return null;
}

/** Loads the Conversation and stamps `RecordingFileID` (+ `EgressID` if unset), then saves. */
async function stampConversationRecording(
  conversationID: string,
  fileID: string,
  egressID: string,
  contextUser: UserInfo,
  provider: IMetadataProvider,
): Promise<boolean> {
  const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
  if (!(await conversation.Load(conversationID))) {
    LogError(`registerMeetingRecordingFile: could not load conversation ${conversationID} to stamp the recording.`);
    return false;
  }
  conversation.RecordingFileID = fileID;
  if (!conversation.EgressID) {
    conversation.EgressID = egressID;
  }
  if (await conversation.Save()) {
    return true;
  }
  LogError(`registerMeetingRecordingFile: failed to stamp the Conversation: ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  return false;
}

/**
 * Resolves an MJStorage account linked to a provider id (the first one). `IsActive` lives on the
 * *provider*, not the account, so provider-level inactivity is handled upstream by the engine's driver
 * cache; here we just pick the provider's account.
 */
function resolveStorageAccountForProvider(providerID: string): string | null {
  const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(providerID);
  return accounts.length > 0 ? accounts[0].ID : null;
}

/** Escapes single quotes for safe embedding in an `ExtraFilter` literal. */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
