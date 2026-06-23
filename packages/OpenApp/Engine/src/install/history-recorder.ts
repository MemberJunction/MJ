/**
 * History recorder for MJ Open Apps.
 *
 * Records installation state in the MJ: Open Apps table and creates
 * audit trail entries in MJ: Open App Install Histories.
 *
 * Uses MJ's RunView + Metadata directly for strongly typed entity operations.
 */
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import type { UserInfo, TransactionGroupBase, BaseEntity, IMetadataProvider } from '@memberjunction/core';
import type { AppStatus, InstallAction, ErrorPhase, InstalledAppInfo, AppInstallCallbacks } from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

/**
 * Escapes single quotes in a string for use in SQL filter expressions.
 */
function EscapeSqlFilter(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Records a new app installation in the MJ: Open Apps table.
 *
 * When a TransactionGroup is provided the save is queued (not executed)
 * and the caller is responsible for calling tg.Submit(). The returned
 * appId is available immediately because MJ pre-generates IDs on NewRecord().
 *
 * @param contextUser - The user performing the installation
 * @param manifest - The validated app manifest
 * @param callbacks - Progress callbacks
 * @param transactionGroup - Optional TransactionGroup for atomic batching
 * @param initialStatus - Status to set on the record (default: 'Active')
 * @returns The OpenApp record ID (pre-generated for new, existing for reinstall)
 */
export async function RecordAppInstallation(
  contextUser: UserInfo,
  manifest: MJAppManifest,
  callbacks?: AppInstallCallbacks,
  transactionGroup?: TransactionGroupBase,
  initialStatus: AppStatus = 'Active',
  provider?: IMetadataProvider,
): Promise<string> {
  callbacks?.OnProgress?.('Record', 'Recording app installation...');

  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const entity = await md.GetEntityObject('MJ: Open Apps', contextUser);

  // Check for existing record (e.g. previously removed app being reinstalled)
  const existing = await FindInstalledApp(contextUser, manifest.name, provider);
  if (existing) {
    const key = new CompositeKey([{ FieldName: 'ID', Value: existing.ID }]);
    await entity.InnerLoad(key);
  } else {
    entity.NewRecord();
  }

  SetAppFields(entity, manifest, contextUser, initialStatus);

  if (transactionGroup) {
    entity.TransactionGroup = transactionGroup;
  }

  const saved = await entity.Save();
  if (!transactionGroup && !saved) {
    throw new Error(`Failed to record app installation: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }

  callbacks?.OnSuccess?.('Record', `App '${manifest.name}' recorded as installed`);
  return String(entity.Get('ID'));
}

/**
 * Sets all app fields on an entity object from a manifest.
 * Shared between new installs and reinstalls.
 */
function SetAppFields(
  entity: { Set: (field: string, value: unknown) => void },
  manifest: MJAppManifest,
  contextUser: UserInfo,
  status: AppStatus = 'Active',
): void {
  entity.Set('Name', manifest.name);
  entity.Set('DisplayName', manifest.displayName);
  entity.Set('Description', manifest.description ?? null);
  entity.Set('Version', manifest.version);
  entity.Set('Publisher', manifest.publisher.name);
  entity.Set('PublisherEmail', manifest.publisher.email ?? null);
  entity.Set('PublisherURL', manifest.publisher.url ?? null);
  entity.Set('RepositoryURL', manifest.repository);
  entity.Set('SchemaName', manifest.schema?.name ?? null);
  entity.Set('MJVersionRange', manifest.mjVersionRange);
  entity.Set('License', manifest.license ?? null);
  entity.Set('Icon', manifest.icon ?? null);
  entity.Set('Color', manifest.color ?? null);
  entity.Set('ManifestJSON', JSON.stringify(manifest));
  entity.Set('ConfigurationSchemaJSON', manifest.configuration ? JSON.stringify(manifest.configuration) : null);
  entity.Set('InstalledByUserID', contextUser.ID);
  entity.Set('Status', status);
}

/**
 * Updates an existing app record (e.g., after upgrade or status change).
 *
 * @param contextUser - The user performing the update
 * @param appId - The OpenApp record ID
 * @param updates - Fields to update
 */
export async function UpdateAppRecord(contextUser: UserInfo, appId: string, updates: Record<string, unknown>, provider?: IMetadataProvider): Promise<void> {
  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const entity = await md.GetEntityObject('MJ: Open Apps', contextUser);
  const loaded = await entity.InnerLoad(CompositeKey.FromID(appId));
  if (!loaded) {
    throw new Error(`Open App record not found: ${appId}`);
  }
  for (const [field, value] of Object.entries(updates)) {
    entity.Set(field, value);
  }
  const saved = await entity.Save();
  if (!saved) {
    throw new Error(`Failed to update Open App record ${appId}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

/**
 * Sets the status of an installed app.
 */
export async function SetAppStatus(contextUser: UserInfo, appId: string, status: AppStatus): Promise<void> {
  await UpdateAppRecord(contextUser, appId, { Status: status });
}

/**
 * Records an install history entry (install, upgrade, or remove).
 *
 * @param contextUser - The user who performed the action
 * @param appId - The OpenApp record ID
 * @param action - The action performed
 * @param manifest - The manifest at this version
 * @param details - Additional details (previous version, duration, errors)
 */
export async function RecordInstallHistoryEntry(
  contextUser: UserInfo,
  appId: string,
  action: InstallAction,
  manifest: MJAppManifest,
  details: {
    PreviousVersion?: string;
    DurationSeconds?: number;
    StartedAt?: Date;
    EndedAt?: Date;
    Success: boolean;
    ErrorMessage?: string;
    ErrorPhase?: ErrorPhase;
    Summary?: string;
  },
  transactionGroup?: TransactionGroupBase,
  provider?: IMetadataProvider,
): Promise<string> {
  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const entity = await md.GetEntityObject('MJ: Open App Install Histories', contextUser);
  entity.NewRecord();
  entity.Set('OpenAppID', appId);
  entity.Set('Version', manifest.version);
  entity.Set('PreviousVersion', details.PreviousVersion ?? null);
  entity.Set('Action', action);
  entity.Set('ManifestJSON', JSON.stringify(manifest));
  entity.Set('Summary', details.Summary ?? null);
  entity.Set('ExecutedByUserID', contextUser.ID);
  entity.Set('DurationSeconds', details.DurationSeconds ?? null);
  entity.Set('StartedAt', details.StartedAt ?? null);
  entity.Set('EndedAt', details.EndedAt ?? null);
  entity.Set('Success', details.Success);
  entity.Set('ErrorMessage', details.ErrorMessage ?? null);
  entity.Set('ErrorPhase', details.ErrorPhase ?? null);

  if (transactionGroup) {
    entity.TransactionGroup = transactionGroup;
  }

  const saved = await entity.Save();
  if (!transactionGroup && !saved) {
    throw new Error(`Failed to record install history: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
  return String(entity.Get('ID'));
}

/**
 * Records dependency relationships for an installed app.
 *
 * @param contextUser - The user performing the operation
 * @param appId - The OpenApp record ID
 * @param dependencies - Map of dependency app name to version range
 */
export async function RecordAppDependencies(
  contextUser: UserInfo,
  appId: string,
  dependencies: Record<string, string | { version?: string; repository?: string }>,
  transactionGroup?: TransactionGroupBase,
  provider?: IMetadataProvider,
): Promise<void> {
  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const rv = new RunView();

  for (const [depName, depValue] of Object.entries(dependencies)) {
    const versionRange = typeof depValue === 'string' ? depValue : depValue.version;

    // Try to find the dependency app record
    const depResult = await rv.RunView<InstalledAppInfo>(
      {
        EntityName: 'MJ: Open Apps',
        ExtraFilter: `Name = '${EscapeSqlFilter(depName)}'`,
        ResultType: 'simple',
        MaxRows: 1,
      },
      contextUser,
    );
    const depApp = depResult.Success && depResult.Results.length > 0 ? depResult.Results[0] : null;

    const entity = await md.GetEntityObject('MJ: Open App Dependencies', contextUser);
    entity.NewRecord();
    entity.Set('OpenAppID', appId);
    entity.Set('DependsOnAppName', depName);
    entity.Set('DependsOnAppID', depApp?.ID ?? null);
    entity.Set('VersionRange', versionRange);
    entity.Set('InstalledVersion', depApp?.Version ?? null);
    entity.Set('Status', depApp ? 'Satisfied' : 'Missing');

    if (transactionGroup) {
      entity.TransactionGroup = transactionGroup;
    }

    const saved = await entity.Save();
    if (!transactionGroup && !saved) {
      throw new Error(`Failed to record dependency '${depName}': ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }
}

/**
 * Deletes all dependency records for an app.
 * Used during upgrade to replace stale dependency records with fresh ones.
 */
export async function DeleteAppDependencies(contextUser: UserInfo, appId: string): Promise<void> {
  const rv = new RunView();
  const result = await rv.RunView<BaseEntity>(
    {
      EntityName: 'MJ: Open App Dependencies',
      ExtraFilter: `OpenAppID = '${EscapeSqlFilter(appId)}'`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!result.Success) {
    // A failed query must not be swallowed — it would leave stale dependency rows
    // that the caller (upgrade) then re-inserts, accumulating duplicates (B30).
    throw new Error(`Failed to load dependencies for app ${appId}: ${result.ErrorMessage ?? 'unknown error'}`);
  }
  for (const record of result.Results) {
    // BaseEntity.Delete() returns false on failure (it does not throw) — check it,
    // or stale dependency rows survive silently and corrupt later FindDependentApps.
    const deleted = await record.Delete();
    if (!deleted) {
      throw new Error(`Failed to delete a dependency for app ${appId}: ${record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }
}

/**
 * Looks up an installed app by name.
 *
 * @param contextUser - The context user for the query
 * @param appName - The app name to look up
 * @returns The app record, or null if not found
 */
export async function FindInstalledApp(contextUser: UserInfo, appName: string, provider?: IMetadataProvider): Promise<InstalledAppInfo | null> {
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const result = await rv.RunView<InstalledAppInfo>(
    {
      EntityName: 'MJ: Open Apps',
      ExtraFilter: `Name = '${EscapeSqlFilter(appName)}'`,
      ResultType: 'simple',
    },
    contextUser,
  );

  if (!result.Success) {
    throw new Error(`Failed to look up app '${appName}': ${result.ErrorMessage}`);
  }

  return result.Results.length > 0 ? result.Results[0] : null;
}

/**
 * Returns true when another (non-removed) Open App shares the given schema.
 *
 * RemoveApp drops the schema and wipes schema-keyed entity metadata by SchemaName;
 * without this guard, removing one app that ADOPTED a schema another app created
 * (manifest `schema.createIfNotExists`) would destroy the co-tenant's data and
 * metadata — see B14. On PostgreSQL the blast radius is larger (DROP SCHEMA CASCADE).
 *
 * Fail-safe: if the lookup itself fails, returns true (assume shared, do NOT drop) —
 * the conservative choice never risks co-tenant data loss on an indeterminate query.
 *
 * @param contextUser - The context user for the query
 * @param schemaName - The schema being considered for removal
 * @param excludeAppId - The app being removed (excluded from the share check)
 * @param provider - Optional metadata provider
 */
export async function IsSchemaSharedByOtherApps(
  contextUser: UserInfo,
  schemaName: string,
  excludeAppId: string,
  provider?: IMetadataProvider,
): Promise<boolean> {
  if (!schemaName) {
    return false;
  }
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const result = await rv.RunView<InstalledAppInfo>(
    {
      EntityName: 'MJ: Open Apps',
      ExtraFilter:
        `SchemaName = '${EscapeSqlFilter(schemaName)}' ` +
        `AND ID <> '${EscapeSqlFilter(excludeAppId)}' ` +
        `AND Status NOT IN ('Removed', 'Removing')`,
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    return true; // fail safe — never risk dropping a possibly-shared schema
  }
  return result.Results.length > 0;
}

/**
 * Lists all installed apps.
 *
 * @param contextUser - The context user for the query
 * @returns Array of installed app records
 */
export async function ListInstalledApps(contextUser: UserInfo): Promise<InstalledAppInfo[]> {
  const rv = new RunView();
  const result = await rv.RunView<InstalledAppInfo>(
    {
      EntityName: 'MJ: Open Apps',
      ExtraFilter: "Status NOT IN ('Removing','Removed')",
      ResultType: 'simple',
    },
    contextUser,
  );

  if (!result.Success) {
    throw new Error(`Failed to list installed apps: ${result.ErrorMessage}`);
  }

  return result.Results;
}

/**
 * Checks if any installed apps depend on the given app.
 *
 * @param contextUser - The context user for the query
 * @param appName - The app name to check dependents for
 * @returns List of app names that depend on this app
 */
export async function FindDependentApps(contextUser: UserInfo, appName: string): Promise<string[]> {
  const rv = new RunView();
  const depResult = await rv.RunView<{ OpenAppID: string }>(
    {
      EntityName: 'MJ: Open App Dependencies',
      ExtraFilter: `DependsOnAppName = '${EscapeSqlFilter(appName)}'`,
      Fields: ['OpenAppID'],
      ResultType: 'simple',
    },
    contextUser,
  );

  if (!depResult.Success) {
    throw new Error(`Failed to find dependent apps: ${depResult.ErrorMessage}`);
  }

  const appIds = depResult.Results.map((r) => r.OpenAppID);
  if (appIds.length === 0) {
    return [];
  }

  const idList = appIds.map((id) => `'${EscapeSqlFilter(id)}'`).join(',');
  const appResult = await rv.RunView<{ Name: string }>(
    {
      EntityName: 'MJ: Open Apps',
      ExtraFilter: `ID IN (${idList}) AND Status NOT IN ('Removed')`,
      Fields: ['Name'],
      ResultType: 'simple',
    },
    contextUser,
  );

  if (!appResult.Success) {
    throw new Error(`Failed to resolve dependent app names: ${appResult.ErrorMessage}`);
  }

  return appResult.Results.map((r) => r.Name);
}
