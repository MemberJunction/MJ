import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJDiagnosticSenderRegistrationEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, SanitizeForLog, UUIDMap } from '@memberjunction/global';

export const SENDER_REGISTRATION_ENTITY = 'MJ: Diagnostic Sender Registrations';
const BUNDLE_ENTITY = 'MJ: Diagnostic Bundles';
const DAY_MS = 24 * 60 * 60_000;

/** The user and provider the intake reads and writes rows with. */
export interface IntakeDataContext {
  ContextUser: UserInfo;
  Provider: IMetadataProvider;
}

/** A sender the collector accepts requests from. */
export interface SenderRegistration {
  InstallID: string;
  KeyID: string;
  PublicKeyBase64: string;
  Status: MJDiagnosticSenderRegistrationEntity['Status'];
  /** Bundles accepted per 24 hours. 0 means no limit. */
  MaxBundlesPerDay: number;
  /** The database row, or null for a registration made with `RegisterSenderPublicKey`. */
  Row: MJDiagnosticSenderRegistrationEntity | null;
}

/** Looks up senders by install ID. */
export interface ISenderRegistry {
  Find(installId: string, data: IntakeDataContext | null): Promise<SenderRegistration | null>;
}

/**
 * Sender lookups. In-memory registrations (made with `RegisterInMemory`) are checked first, then
 * the `MJ: Diagnostic Sender Registrations` row with that `InstallID`.
 */
export class SenderRegistry implements ISenderRegistry {
  private readonly memory = new UUIDMap<SenderRegistration>();

  /** Registers an Active sender in memory only. No database row is written. */
  public RegisterInMemory(installId: string, keyId: string, publicKeyBase64: string, maxBundlesPerDay = 0): void {
    this.memory.Set(installId, {
      InstallID: installId,
      KeyID: keyId,
      PublicKeyBase64: publicKeyBase64,
      Status: 'Active',
      MaxBundlesPerDay: maxBundlesPerDay,
      Row: null
    });
  }

  public Clear(): void {
    this.memory.Clear();
  }

  public async Find(installId: string, data: IntakeDataContext | null): Promise<SenderRegistration | null> {
    const inMemory = this.memory.Get(installId);
    if (inMemory) {
      return inMemory;
    }
    if (!data) {
      return null;
    }
    const row = await LoadSenderRegistrationRow(installId, data);
    return row ? RegistrationFromRow(row) : null;
  }
}

/** Maps a registration row to a `SenderRegistration`. A row without a key reads as an empty key. */
export function RegistrationFromRow(row: MJDiagnosticSenderRegistrationEntity): SenderRegistration {
  return {
    InstallID: row.InstallID,
    KeyID: row.KeyID ?? '',
    PublicKeyBase64: row.PublicKeyBase64 ?? '',
    Status: row.Status,
    MaxBundlesPerDay: row.MaxBundlesPerDay,
    Row: row
  };
}

/** Loads the registration row for an install, or null when there is none or the query fails. */
export async function LoadSenderRegistrationRow(
  installId: string,
  data: IntakeDataContext
): Promise<MJDiagnosticSenderRegistrationEntity | null> {
  const result = await RunView.FromMetadataProvider(data.Provider).RunView<MJDiagnosticSenderRegistrationEntity>(
    {
      EntityName: SENDER_REGISTRATION_ENTITY,
      ExtraFilter: `InstallID = '${EscapeSQLString(installId)}'`,
      MaxRows: 1,
      ResultType: 'entity_object',
      BypassCache: true
    },
    data.ContextUser
  );
  if (!result.Success) {
    LogError(`Diagnostics intake: could not load the sender registration for '${SanitizeForLog(installId, 200)}': ${result.ErrorMessage}`);
    return null;
  }
  return result.Results?.[0] ?? null;
}

/**
 * Counts the `Received` bundle rows of a sender created in the last 24 hours.
 * Returns null when the query fails.
 */
export async function CountReceivedBundlesLastDay(installId: string, data: IntakeDataContext, now = new Date()): Promise<number | null> {
  const direction: 'Received' = 'Received';
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const result = await RunView.FromMetadataProvider(data.Provider).RunView(
    {
      EntityName: BUNDLE_ENTITY,
      ExtraFilter: `Direction = '${direction}' AND SenderInstallID = '${EscapeSQLString(installId)}' AND __mj_CreatedAt >= '${since}'`,
      ResultType: 'count_only',
      BypassCache: true
    },
    data.ContextUser
  );
  if (!result.Success) {
    LogError(`Diagnostics intake: could not count received bundles for '${SanitizeForLog(installId, 200)}': ${result.ErrorMessage}`);
    return null;
  }
  return result.TotalRowCount;
}

/** Sets `LastSeenAt` on a database registration. A failed save is logged. */
export async function TouchSenderLastSeen(registration: SenderRegistration, now = new Date()): Promise<void> {
  const row = registration.Row;
  if (!row) {
    return;
  }
  row.LastSeenAt = now;
  if (!(await row.Save())) {
    LogError(`Diagnostics intake: could not update LastSeenAt for '${SanitizeForLog(row.InstallID, 200)}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}
