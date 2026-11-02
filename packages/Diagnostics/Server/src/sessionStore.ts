import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJDiagnosticSessionEntity, IDiagnosticSessionScope } from '@memberjunction/core-entities';
import { ActiveDiagnosticSession, DiagnosticSessionManager } from './sessionManager.js';

const SESSION_ENTITY = 'MJ: Diagnostic Sessions';

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
  const md = provider ?? Metadata.Provider;
  const row = await md.GetEntityObject<MJDiagnosticSessionEntity>(SESSION_ENTITY, contextUser);
  return (await row.Load(sessionId)) ? row : undefined;
}

/** Loads a session from its row, whatever its status. Returns `undefined` when there is no row. */
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

/** Saves a row whose end time has passed as `Expired`; logs a failed save. */
async function expireRow(row: MJDiagnosticSessionEntity): Promise<void> {
  row.Status = 'Expired';
  if (!(await row.Save())) {
    LogError(`Could not mark diagnostic session '${row.ID}' Expired: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

/**
 * Loads the `Active` session rows into the session manager so a restart or another instance
 * keeps capturing them. Rows whose end time has passed are saved as `Expired`. Returns the number loaded.
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
  let loaded = 0;
  for (const row of result.Results ?? []) {
    if (new Date(row.EndsAt).getTime() <= now) {
      await expireRow(row);
      continue;
    }
    DiagnosticSessionManager.Instance.RegisterActiveSession(SessionFromRow(row));
    loaded++;
  }
  return loaded;
}
