import { ActionParam } from '@memberjunction/actions-base';

/** The name the bootstrap action registers under; the resolver resolves it by this name. */
export const BOOTSTRAP_ACTION_NAME = 'Bootstrap SQL Server Integration From Backup';

/** The caller-supplied inputs of a bootstrap launch (mirrors the action's input parameters). */
export interface BootstrapLaunchInput {
  CompanyIntegrationID: string;
  BackupUrls: string;
  SasToken?: string;
  StorageCredentialID?: string;
  StagingDatabaseName?: string;
  DropStagingDbOnComplete?: boolean;
  TruncateTargetBeforeLoad?: boolean;
  BatchSize?: number;
  EntityMapIDs?: string;
  TargetDataFileDirectory?: string;
  TargetLogFileDirectory?: string;
}

/**
 * The action parameters for a detached bootstrap run: every supplied input as a string parameter
 * (booleans as 'true'/'false', blanks omitted) plus `ProgressRunID`, the run the action reports to.
 * Pure, so the mapping is unit-testable without the action engine.
 */
export function BuildBootstrapActionParams(input: BootstrapLaunchInput, runID: string): ActionParam[] {
  const values: Record<string, string | number | boolean | undefined> = {
    CompanyIntegrationID: input.CompanyIntegrationID,
    BackupUrls: input.BackupUrls,
    SasToken: input.SasToken,
    StorageCredentialID: input.StorageCredentialID,
    StagingDatabaseName: input.StagingDatabaseName,
    DropStagingDbOnComplete: input.DropStagingDbOnComplete,
    TruncateTargetBeforeLoad: input.TruncateTargetBeforeLoad,
    BatchSize: input.BatchSize,
    EntityMapIDs: input.EntityMapIDs,
    TargetDataFileDirectory: input.TargetDataFileDirectory,
    TargetLogFileDirectory: input.TargetLogFileDirectory,
    ProgressRunID: runID,
  };
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

/** The validation failure for a launch request, or undefined when the request is complete. */
export function ValidateBootstrapLaunchInput(input: BootstrapLaunchInput): string | undefined {
  if (!input.CompanyIntegrationID?.trim()) {
    return "'CompanyIntegrationID' is required.";
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
