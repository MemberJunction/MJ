import { ActionParam } from '@memberjunction/actions-base';
import type { IntegrationRunManifest } from '@memberjunction/integration-progress-artifacts';
import type { ArchiveSeedState, ArchiveSeedWork } from '@memberjunction/schema-engine';

/** Max time the server waits for a schema-apply (build) step before failing the job. */
export const ARCHIVE_SEED_APPLY_TIMEOUT_MS = 30 * 60_000;
/** Max time a job waits in AwaitingCleanupDecision before it stops waiting. */
export const ARCHIVE_SEED_CLEANUP_DECISION_TIMEOUT_MS = 24 * 60 * 60_000;

const DEFAULT_BATCH_SIZE = 250000;
const STAGING_PREFIX = 'MJ_Staging_';

/** Caller-supplied inputs for starting an archive seed. */
export interface ArchiveSeedStartInput {
  CompanyID: string;
  ConnectionName: string;
  BackupUrls: string;
  SasToken?: string;
  StorageCredentialID?: string;
  StagingDatabaseName?: string;
  BatchSize?: number;
  TargetDataFileDirectory?: string;
  TargetLogFileDirectory?: string;
}

/** The validation failure for a start request, or undefined when it is complete. */
export function ValidateArchiveSeedStartInput(input: ArchiveSeedStartInput): string | undefined {
  if (!input.CompanyID?.trim()) {
    return "'CompanyID' is required.";
  }
  if (!input.ConnectionName?.trim()) {
    return "'ConnectionName' is required.";
  }
  if (!input.BackupUrls?.trim()) {
    return "'BackupUrls' is required.";
  }
  const hasUrl = input.BackupUrls.split(',').some(u => /^https?:\/\//i.test(u.trim()));
  if (hasUrl && !input.SasToken?.trim() && !input.StorageCredentialID?.trim()) {
    return "An Azure Blob backup needs either 'SasToken' or 'StorageCredentialID'.";
  }
  return undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `MJ_Staging_<first 12 alphanumerics of the name>_<yyyyMMddHHmm>` (local time). */
export function DefaultStagingDatabaseName(connectionName: string, now: Date): string {
  const slug = connectionName.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `${STAGING_PREFIX}${slug}_${stamp}`;
}

/** A fresh work record in `Created`. The SAS token is deliberately never persisted. */
export function NewArchiveSeedWork(input: ArchiveSeedStartInput, userID: string, integrationID: string, now: Date): ArchiveSeedWork {
  const work: ArchiveSeedWork = {
    State: 'Created',
    StateChangedAt: now.toISOString(),
    UserID: userID,
    CompanyID: input.CompanyID,
    IntegrationID: integrationID,
    ConnectionName: input.ConnectionName,
    BackupUrls: input.BackupUrls,
    StagingDatabaseName: input.StagingDatabaseName?.trim() || DefaultStagingDatabaseName(input.ConnectionName, now),
    BatchSize: input.BatchSize ?? DEFAULT_BATCH_SIZE,
  };
  if (input.StorageCredentialID) work.StorageCredentialID = input.StorageCredentialID;
  if (input.TargetDataFileDirectory) work.TargetDataFileDirectory = input.TargetDataFileDirectory;
  if (input.TargetLogFileDirectory) work.TargetLogFileDirectory = input.TargetLogFileDirectory;
  return work;
}

const SUCCESSOR: Partial<Record<ArchiveSeedState, ArchiveSeedState>> = {
  Created: 'Restoring',
  Restoring: 'Discovering',
  Discovering: 'AwaitingSelection',
  AwaitingSelection: 'Building',
  Building: 'Mapping',
  Mapping: 'Loading',
  Loading: 'Seeding',
  Seeding: 'AwaitingCleanupDecision',
  AwaitingCleanupDecision: 'CleaningUp',
  CleaningUp: 'Done',
};

function isLegalTransition(from: ArchiveSeedState, to: ArchiveSeedState): boolean {
  if (to === 'Failed') return from !== 'Done' && from !== 'Failed';
  return SUCCESSOR[from] === to;
}

/** Pure state transition: returns a copy in `next`, or throws when the move is not legal. */
export function Transition(work: ArchiveSeedWork, next: ArchiveSeedState, now: Date, patch?: Partial<ArchiveSeedWork>): ArchiveSeedWork {
  if (!isLegalTransition(work.State, next)) {
    throw new Error(`Invalid archive seed transition ${work.State} → ${next}`);
  }
  return { ...work, ...patch, State: next, StateChangedAt: now.toISOString() };
}

/**
 * The validation failure for a table selection, or undefined when it is acceptable.
 * Names match the discovered tables case-insensitively (SQL Server identifiers are case-insensitive);
 * an empty list, an unknown name, or a name repeated after case folding is rejected.
 */
export function ValidateTableSelection(work: ArchiveSeedWork, tableNames: string[]): string | undefined {
  if (tableNames.length === 0) {
    return 'Select at least one table';
  }
  const known = new Set((work.Tables ?? []).map(t => t.Name.toLowerCase()));
  const seen = new Set<string>();
  for (const name of tableNames) {
    const folded = name.toLowerCase();
    if (!known.has(folded)) return `Unknown table '${name}'`;
    if (seen.has(folded)) return `Duplicate table '${name}'`;
    seen.add(folded);
  }
  return undefined;
}

/**
 * The selected names spelled exactly as discovered in `work.Tables`, in selection order.
 * Call after {@link ValidateTableSelection} passes; names not found are dropped. Store the result
 * as `SelectedTables`.
 */
export function CanonicalizeTableSelection(work: ArchiveSeedWork, tableNames: string[]): string[] {
  const byFolded = new Map((work.Tables ?? []).map(t => [t.Name.toLowerCase(), t.Name]));
  return tableNames
    .map(n => byFolded.get(n.toLowerCase()))
    .filter((n): n is string => n !== undefined);
}

/** Every present value becomes a string Input ActionParam; undefined/null/'' are dropped. */
function toActionParams(values: Record<string, string | number | boolean | undefined | null>): ActionParam[] {
  return Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null && entry[1] !== '')
    .map(([name, value]) => {
      const param = new ActionParam();
      param.Name = name;
      param.Type = 'Input';
      param.Value = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
      return param;
    });
}

/** Params for 'Restore SQL Server Backup To Staging'. */
export function BuildRestoreActionParams(work: ArchiveSeedWork, companyIntegrationID: string, runID: string, sasToken?: string): ActionParam[] {
  return toActionParams({
    CompanyIntegrationID: companyIntegrationID,
    BackupUrls: work.BackupUrls,
    StagingDatabaseName: work.StagingDatabaseName,
    SasToken: sasToken,
    StorageCredentialID: work.StorageCredentialID,
    TargetDataFileDirectory: work.TargetDataFileDirectory,
    TargetLogFileDirectory: work.TargetLogFileDirectory,
    ProgressRunID: runID,
  });
}

/** Params for 'Load SQL Server Integration From Staging' (never truncates, never drops staging). */
export function BuildLoadActionParams(work: ArchiveSeedWork, companyIntegrationID: string, runID: string): ActionParam[] {
  return toActionParams({
    CompanyIntegrationID: companyIntegrationID,
    StagingDatabaseName: work.StagingDatabaseName,
    BackupStartDate: work.BackupStartDate,
    BatchSize: work.BatchSize,
    TruncateTargetBeforeLoad: false,
    DropStagingDbOnComplete: false,
    ContainerUrl: work.ContainerUrl,
    ProgressRunID: runID,
  });
}

/** Params for 'Drop SQL Server Staging Database'. */
export function BuildDropActionParams(work: ArchiveSeedWork, companyIntegrationID: string, runID: string): ActionParam[] {
  return toActionParams({
    StagingDatabaseName: work.StagingDatabaseName,
    ContainerUrl: work.ContainerUrl,
    CompanyIntegrationID: companyIntegrationID,
    ProgressRunID: runID,
  });
}

/** The progress-run manifest for one phase of an archive seed job. */
export function RunManifestFor(
  work: ArchiveSeedWork,
  jobID: string,
  companyIntegrationID: string,
  phase: 'A' | 'B',
  runID: string,
  now: Date,
): IntegrationRunManifest {
  return {
    runID,
    runKind: 'Other',
    integrationID: work.IntegrationID,
    companyIntegrationID,
    triggerType: 'Manual',
    startedAt: now.toISOString(),
    context: { kind: 'ArchiveSeed', jobID, phase },
  };
}
