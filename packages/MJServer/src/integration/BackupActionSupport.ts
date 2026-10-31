/**
 * Helpers shared by the two ways a SQL Server backup reaches the integration actions — the detached
 * bootstrap launch (`IntegrationBootstrapResolver`) and the archive seed job
 * (`IntegrationArchiveSeedResolver` and its collaborators): who may launch, how an action is found by
 * name, how inputs become action parameters, and what makes a backup source complete.
 */
import type { UserInfo } from '@memberjunction/core';
import { ActionParam, type ActionEngineBase, type MJActionEntityExtended } from '@memberjunction/actions-base';
import type { AppContext } from '../types.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';

/** A value that can become an Input action parameter; undefined, null and '' are omitted. */
export type ActionInputValue = string | number | boolean | undefined | null;

/** The backup location fields both launch inputs carry. */
export interface BackupSourceInput {
  BackupUrls: string;
  SasToken?: string;
  StorageCredentialID?: string;
}

/**
 * The authenticated caller of `operation`. Throws when there is none, or when the session is
 * scope-limited, which may not run an action (as with RunAction).
 */
export function GetActionLaunchPrincipal(ctx: AppContext, operation: string): UserInfo {
  const user = ctx.userPayload?.userRecord;
  if (!user) {
    throw new Error('User is not authenticated');
  }
  if (IsScopeLimitedPrincipal(user)) {
    throw new Error(`${operation} is not permitted for scope-limited sessions`);
  }
  return user;
}

/**
 * The registered action named `actionName` (case-insensitive, trimmed — `GetActionByName`'s index).
 * Throws when it is not registered. The engine must already be configured.
 */
export function FindRegisteredAction(engine: Pick<ActionEngineBase, 'GetActionByName'>, actionName: string): MJActionEntityExtended {
  const action = engine.GetActionByName(actionName);
  if (!action) {
    throw new Error(`Action '${actionName}' is not registered. Push the integration action metadata first.`);
  }
  return action;
}

/** Every present value as a string Input parameter (booleans as 'true'/'false'); undefined, null and '' are dropped. */
export function ToInputActionParams(values: Record<string, ActionInputValue>): ActionParam[] {
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

/**
 * The validation failure for a backup source, or undefined when it is complete: `BackupUrls` is
 * required, and an Azure Blob (http/https) backup needs a SAS token or a storage credential.
 */
export function ValidateBackupSource(input: BackupSourceInput): string | undefined {
  if (!input.BackupUrls?.trim()) {
    return "'BackupUrls' is required.";
  }
  const hasUrl = input.BackupUrls.split(',').some(u => /^https?:\/\//i.test(u.trim()));
  if (hasUrl && !input.SasToken?.trim() && !input.StorageCredentialID?.trim()) {
    return "An Azure Blob backup needs either 'SasToken' or 'StorageCredentialID'.";
  }
  return undefined;
}
