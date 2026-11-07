import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJDiagnosticBundleEntity } from '@memberjunction/core-entities';

const BUNDLE_ENTITY = 'MJ: Diagnostic Bundles';
const DAY_MS = 24 * 60 * 60_000;

/** Values a local bundle row starts with. */
export interface NewLocalBundle {
  Name: string;
  Description?: string;
  SessionID: string | null;
  ScrubLiterals: boolean;
  RetentionDays: number;
}

/** The assembled bundle values a `Ready` row records. */
export interface ReadyBundleValues {
  SizeBytes: number;
  SHA256: string;
  Manifest: Record<string, unknown>;
  ScrubReport: Record<string, unknown>;
  Findings: Array<Record<string, unknown>>;
}

async function saveOrThrow(row: MJDiagnosticBundleEntity, action: string): Promise<void> {
  if (!(await row.Save())) {
    throw new Error(`Could not ${action}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

/**
 * Saves a `Local` bundle row with status `Building` and returns it. The bundle bytes stay in
 * memory; `Data` stays null. Throws when the save fails.
 */
export async function CreateLocalBundleRow(
  values: NewLocalBundle,
  contextUser: UserInfo,
  provider?: IMetadataProvider
): Promise<MJDiagnosticBundleEntity> {
  const md = provider ?? Metadata.Provider;
  const row = await md.GetEntityObject<MJDiagnosticBundleEntity>(BUNDLE_ENTITY, contextUser);
  row.Name = values.Name;
  row.Description = values.Description ?? null;
  row.Direction = 'Local';
  row.Status = 'Building';
  row.DiagnosticSessionID = values.SessionID;
  row.ScrubLiterals = values.ScrubLiterals;
  row.SizeBytes = 0;
  row.CreatedByUserID = contextUser.ID;
  row.ExpiresAt = new Date(Date.now() + values.RetentionDays * DAY_MS);
  await saveOrThrow(row, 'save the diagnostic bundle');
  return row;
}

/** Records the assembled bundle on its row and sets status `Ready`. Throws when the save fails. */
export async function MarkBundleReady(row: MJDiagnosticBundleEntity, values: ReadyBundleValues): Promise<void> {
  row.SizeBytes = values.SizeBytes;
  row.SHA256 = values.SHA256;
  row.ManifestJSON = JSON.stringify(values.Manifest);
  row.ScrubReportJSON = JSON.stringify(values.ScrubReport);
  row.FindingsJSON = JSON.stringify(values.Findings);
  row.Status = 'Ready';
  await saveOrThrow(row, 'mark the diagnostic bundle Ready');
}

/** Sets status `Failed` with the reason. A failed save is logged so the original error is kept. */
export async function MarkBundleFailed(row: MJDiagnosticBundleEntity, reason: string): Promise<void> {
  row.Status = 'Failed';
  row.FailureReason = reason;
  if (!(await row.Save())) {
    LogError(`Could not mark diagnostic bundle '${row.ID}' Failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

/** Loads a bundle row. Throws when there is no row. */
export async function LoadBundleRow(
  bundleId: string,
  contextUser: UserInfo,
  provider?: IMetadataProvider
): Promise<MJDiagnosticBundleEntity> {
  const md = provider ?? Metadata.Provider;
  const row = await md.GetEntityObject<MJDiagnosticBundleEntity>(BUNDLE_ENTITY, contextUser);
  if (!(await row.Load(bundleId))) {
    throw new Error(`Diagnostic bundle '${bundleId}' has no saved record.`);
  }
  return row;
}

/** Sets status `Sending` and the destination. Throws when the save fails. */
export async function MarkBundleSending(
  row: MJDiagnosticBundleEntity,
  destination: MJDiagnosticBundleEntity['Destination']
): Promise<void> {
  row.Status = 'Sending';
  row.Destination = destination;
  await saveOrThrow(row, 'mark the diagnostic bundle Sending');
}

/** Sets status `Sent` with the receiver's reference ID and the send time. Throws when the save fails. */
export async function MarkBundleSent(row: MJDiagnosticBundleEntity, referenceId: string, sentAt: Date): Promise<void> {
  row.Status = 'Sent';
  row.ExternalReferenceID = referenceId;
  row.SentAt = sentAt;
  await saveOrThrow(row, 'mark the diagnostic bundle Sent');
}
