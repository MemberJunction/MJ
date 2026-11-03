import { LogError } from '@memberjunction/core';
import { MJDiagnosticBundleEntity, MJFileEntity } from '@memberjunction/core-entities';
import { SanitizeForLog } from '@memberjunction/global';
import { MarkBundleFailed } from './bundleStore.js';
import { IntakeDataContext } from './senderRegistry.js';

const BUNDLE_ENTITY = 'MJ: Diagnostic Bundles';
const FILE_ENTITY = 'MJ: Files';
const DAY_MS = 24 * 60 * 60_000;

/** Values a `Received` bundle row starts with. */
export interface NewReceivedBundle {
  ReferenceID: string;
  BundleID: string;
  SenderInstallID: string | null;
  SenderMJVersion: string;
  ContactInfo?: string;
  Summary?: string;
  ScrubLiterals: boolean;
  SizeBytes: number;
  RetentionDays: number;
}

/** What a `Ready` received row records. Manifest and findings are set only when the bundle was decrypted. */
export interface ReceivedBundleResult {
  SizeBytes: number;
  SHA256: string;
  Manifest?: Record<string, unknown>;
  Findings?: Array<Record<string, unknown>>;
  FileID?: string;
}

/** The stored object a received bundle's `MJ: Files` row points at. */
export interface StoredBundleObject {
  StorageProviderID: string;
  ObjectKey: string;
  ContentType: string;
}

/**
 * Saves a `Received` bundle row with status `Receiving` and returns it, or null (logged) when the
 * save fails. The intake keeps going without a row in that case.
 */
export async function CreateReceivedBundleRow(values: NewReceivedBundle, data: IntakeDataContext): Promise<MJDiagnosticBundleEntity | null> {
  const row = await data.Provider.GetEntityObject<MJDiagnosticBundleEntity>(BUNDLE_ENTITY, data.ContextUser);
  row.Name = values.BundleID;
  row.Description = values.Summary ?? null;
  row.Direction = 'Received';
  row.Status = 'Receiving';
  row.ScrubLiterals = values.ScrubLiterals;
  row.SizeBytes = values.SizeBytes;
  row.ExternalReferenceID = values.ReferenceID;
  row.SenderInstallID = values.SenderInstallID;
  row.SenderMJVersion = values.SenderMJVersion;
  row.ContactInfo = values.ContactInfo ?? null;
  row.ExpiresAt = new Date(Date.now() + values.RetentionDays * DAY_MS);
  if (await row.Save()) {
    return row;
  }
  LogError(`Diagnostics intake: could not save the received bundle row for '${SanitizeForLog(values.ReferenceID, 200)}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  return null;
}

/** Records the result on a received row and sets status `Ready`. A failed save is logged. */
export async function MarkReceivedBundleReady(row: MJDiagnosticBundleEntity, result: ReceivedBundleResult): Promise<void> {
  row.SizeBytes = result.SizeBytes;
  row.SHA256 = result.SHA256;
  row.ManifestJSON = result.Manifest ? JSON.stringify(result.Manifest) : null;
  row.FindingsJSON = result.Findings ? JSON.stringify(result.Findings) : null;
  row.FileID = result.FileID ?? null;
  row.Status = 'Ready';
  if (!(await row.Save())) {
    LogError(`Diagnostics intake: could not mark received bundle '${row.ID}' Ready: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

/** Sets status `Failed` with the reason. */
export async function MarkReceivedBundleFailed(row: MJDiagnosticBundleEntity, reason: string): Promise<void> {
  await MarkBundleFailed(row, reason);
}

/**
 * Saves an `MJ: Files` row (status `Uploaded`) for a stored bundle object and returns its ID,
 * or undefined (logged) when the save fails.
 */
export async function CreateStoredBundleFileRow(
  name: string,
  stored: StoredBundleObject,
  data: IntakeDataContext
): Promise<string | undefined> {
  const file = await data.Provider.GetEntityObject<MJFileEntity>(FILE_ENTITY, data.ContextUser);
  file.Name = name;
  file.ProviderID = stored.StorageProviderID;
  file.ProviderKey = stored.ObjectKey;
  file.ContentType = stored.ContentType;
  file.Status = 'Uploaded';
  if (await file.Save()) {
    return file.ID;
  }
  LogError(`Diagnostics intake: could not save the MJ: Files row for '${SanitizeForLog(stored.ObjectKey, 300)}': ${file.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  return undefined;
}
