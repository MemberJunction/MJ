import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { Base64ToBytes, EscapeSQLString, IsValidUUID, UUIDMap } from '@memberjunction/global';
import { MJDiagnosticSessionEntity, MJDiagnosticSessionEntity_IDiagnosticSessionScope as IDiagnosticSessionScope } from '@memberjunction/core-entities';
import { ActiveDiagnosticSession, DiagnosticSessionManager } from './sessionManager.js';

const SESSION_ENTITY = 'MJ: Diagnostic Sessions';
const CHUNK_ENTITY = 'MJ: Diagnostic Session Chunks';

/** The byte counts of a session's saved chunks. */
interface SavedChunkBytes {
  /** Compressed bytes as stored. */
  compressed: number;
  /** Serialized NDJSON bytes before compression. */
  serialized: number;
}

/** A saved chunk row as the restore reads it. */
type ChunkSizeRow = { DiagnosticSessionID: string; Data: string | null };

/** The session values saved when a session starts; the row supplies the ID. */
export type NewDiagnosticSession = Omit<ActiveDiagnosticSession, 'id'>;

type SessionStatus = MJDiagnosticSessionEntity['Status'];

function saveError(action: string, row: MJDiagnosticSessionEntity): Error {
  return new Error(`Could not ${action}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
}

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Maps a `MJ: Diagnostic Sessions` row to the in-memory session shape. */
export function SessionFromRow(row: MJDiagnosticSessionEntity): ActiveDiagnosticSession {
  return {
    id: row.ID,
    name: row.Name,
    reason: row.Reason ?? undefined,
    status: row.Status,
    scopeType: row.ScopeType,
    scope: parseJson<IDiagnosticSessionScope>(row.ScopeJSON, {}),
    level: row.Level,
    categories: parseJson<string[]>(row.CategoriesJSON, []),
    scrubLiterals: row.ScrubLiterals,
    startedAtMs: new Date(row.StartedAt).getTime(),
    endsAtMs: new Date(row.EndsAt).getTime(),
    maxBytes: row.MaxBytes,
    createdByUserId: row.CreatedByUserID,
    companyId: row.CompanyID,
    bytesWritten: 0
  };
}

function applySessionFields(row: MJDiagnosticSessionEntity, session: NewDiagnosticSession): void {
  row.Name = session.name;
  row.Reason = session.reason ?? null;
  row.Status = session.status;
  row.ScopeType = session.scopeType;
  row.ScopeJSON = JSON.stringify(session.scope);
  row.Level = session.level;
  row.CategoriesJSON = JSON.stringify(session.categories);
  row.ScrubLiterals = session.scrubLiterals;
  row.StartedAt = new Date(session.startedAtMs);
  row.EndsAt = new Date(session.endsAtMs);
  row.MaxBytes = session.maxBytes;
  row.CreatedByUserID = session.createdByUserId;
  row.CompanyID = session.companyId ?? null;
}

/** Saves a new `MJ: Diagnostic Sessions` row and returns the session with the row's ID. Throws when the save fails. */
export async function SaveNewSession(
  session: NewDiagnosticSession,
  contextUser: UserInfo,
  provider?: IMetadataProvider
): Promise<ActiveDiagnosticSession> {
  const md = provider ?? Metadata.Provider;
  const row = await md.GetEntityObject<MJDiagnosticSessionEntity>(SESSION_ENTITY, contextUser);
  applySessionFields(row, session);
  if (!(await row.Save())) {
    throw saveError('save the diagnostic session', row);
  }
  return { ...session, id: row.ID };
}

async function loadSessionRow(
  sessionId: string,
  contextUser: UserInfo | undefined,
  provider?: IMetadataProvider
): Promise<MJDiagnosticSessionEntity | undefined> {
  if (!IsValidUUID(sessionId)) {
    return undefined;
  }
  const md = provider ?? Metadata.Provider;
  const row = await md.GetEntityObject<MJDiagnosticSessionEntity>(SESSION_ENTITY, contextUser);
  return (await row.Load(sessionId)) ? row : undefined;
}

/** Loads a session from its row, whatever its status. Returns `undefined` when the ID is not a UUID or there is no row. */
export async function LoadSessionRecord(
  sessionId: string,
  contextUser: UserInfo | undefined,
  provider?: IMetadataProvider
): Promise<ActiveDiagnosticSession | undefined> {
  const row = await loadSessionRow(sessionId, contextUser, provider);
  return row ? SessionFromRow(row) : undefined;
}

/** Returns the session from memory, or from its row when this process does not hold it. */
export async function FindSession(
  sessionId: string,
  contextUser: UserInfo | undefined,
  provider?: IMetadataProvider
): Promise<ActiveDiagnosticSession | undefined> {
  return DiagnosticSessionManager.Instance.GetSessionRecord(sessionId) ?? LoadSessionRecord(sessionId, contextUser, provider);
}

/**
 * Ends a session's row: `Stopped` with a stop time, or `Expired` when its end time has passed.
 * A row that already ended keeps its status. Throws when there is no row or the save fails.
 */
export async function EndSessionRow(
  sessionId: string,
  contextUser: UserInfo,
  provider?: IMetadataProvider
): Promise<SessionStatus> {
  const row = await loadSessionRow(sessionId, contextUser, provider);
  if (!row) {
    throw new Error(`Diagnostic session '${sessionId}' not found.`);
  }
  if (row.Status !== 'Active') {
    return row.Status;
  }
  const now = new Date();
  if (now.getTime() >= new Date(row.EndsAt).getTime()) {
    row.Status = 'Expired';
  } else {
    row.Status = 'Stopped';
    row.StoppedAt = now;
  }
  if (!(await row.Save())) {
    throw saveError('update the diagnostic session', row);
  }
  return row.Status;
}

/**
 * Makes the session manager save a session's row as `Expired` when the session passes its end time
 * while this process holds it, and save session buffers outside a request as `contextUser`.
 * A failed save is logged.
 */
export function WatchSessionExpiry(contextUser: UserInfo | undefined, provider?: IMetadataProvider): void {
  DiagnosticSessionManager.Instance.SetBackgroundSaveContext(contextUser, provider);
  DiagnosticSessionManager.Instance.SetSessionExpiredHandler((session) => {
    void expireSessionRow(session.id, contextUser, provider);
  });
}

async function expireSessionRow(sessionId: string, contextUser: UserInfo | undefined, provider?: IMetadataProvider): Promise<void> {
  try {
    const row = await loadSessionRow(sessionId, contextUser, provider);
    if (row?.Status === 'Active') {
      await expireRow(row);
    }
  } catch (err) {
    LogError(`Could not mark diagnostic session '${sessionId}' Expired: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Saves a row whose end time has passed as `Expired`; logs a failed save. */
async function expireRow(row: MJDiagnosticSessionEntity): Promise<void> {
  row.Status = 'Expired';
  if (!(await row.Save())) {
    LogError(`Could not mark diagnostic session '${row.ID}' Expired: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

/**
 * Loads the `Active` session rows into the session manager so a restart or another instance
 * keeps capturing them, with the byte counts of the chunks they already saved. Rows whose end
 * time has passed are saved as `Expired`. Returns the number loaded.
 */
export async function RestoreActiveSessions(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
  const md = provider ?? Metadata.Provider;
  const result = await RunView.FromMetadataProvider(md).RunView<MJDiagnosticSessionEntity>(
    { EntityName: SESSION_ENTITY, ExtraFilter: `Status = 'Active'`, ResultType: 'entity_object' },
    contextUser
  );
  if (!result.Success) {
    throw new Error(`Could not load active diagnostic sessions: ${result.ErrorMessage}`);
  }
  const now = Date.now();
  const live: ActiveDiagnosticSession[] = [];
  for (const row of result.Results ?? []) {
    if (new Date(row.EndsAt).getTime() <= now) {
      await expireRow(row);
      continue;
    }
    live.push(SessionFromRow(row));
  }
  const savedBytes = await readSavedChunkBytes(live.map((s) => s.id), contextUser, md);
  for (const session of live) {
    const bytes = savedBytes.Get(session.id);
    session.bytesWritten = bytes?.compressed ?? 0;
    session.bytesCaptured = bytes?.serialized ?? 0;
    DiagnosticSessionManager.Instance.RegisterActiveSession(session);
  }
  return live.length;
}

/**
 * Sums the saved chunk sizes of each session. The serialized size comes from each chunk's gzip
 * trailer, so no chunk is decompressed. A failed read is logged and the sessions count from zero.
 */
async function readSavedChunkBytes(
  sessionIds: string[],
  contextUser: UserInfo | undefined,
  md: IMetadataProvider
): Promise<UUIDMap<SavedChunkBytes>> {
  const totals = new UUIDMap<SavedChunkBytes>();
  if (sessionIds.length === 0) {
    return totals;
  }
  const idList = sessionIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  const res = await RunView.FromMetadataProvider(md).RunView<ChunkSizeRow>(
    {
      EntityName: CHUNK_ENTITY,
      ExtraFilter: `DiagnosticSessionID IN (${idList})`,
      Fields: ['DiagnosticSessionID', 'Data'],
      ResultType: 'simple'
    },
    contextUser
  );
  if (!res.Success) {
    LogError(`Could not read the saved chunk sizes of the restored diagnostic sessions: ${res.ErrorMessage}`);
    return totals;
  }
  for (const row of res.Results ?? []) {
    addChunkBytes(totals, row);
  }
  return totals;
}

/** Adds one chunk row's compressed and serialized sizes to its session's totals. */
function addChunkBytes(totals: UUIDMap<SavedChunkBytes>, row: ChunkSizeRow): void {
  if (!row.DiagnosticSessionID || !row.Data) {
    return;
  }
  const bytes = Base64ToBytes(row.Data);
  const current = totals.Get(row.DiagnosticSessionID) ?? { compressed: 0, serialized: 0 };
  current.compressed += bytes.byteLength;
  current.serialized += gzipSerializedSize(bytes);
  totals.Set(row.DiagnosticSessionID, current);
}

/** The uncompressed size a single-member gzip stream records in its last four bytes (little-endian), or 0 when it is too short. */
function gzipSerializedSize(bytes: Uint8Array): number {
  if (bytes.byteLength < 18) {
    return 0;
  }
  const end = bytes.byteLength;
  return (bytes[end - 4] | (bytes[end - 3] << 8) | (bytes[end - 2] << 16) | (bytes[end - 1] << 24)) >>> 0;
}
