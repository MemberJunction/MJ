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
import type { MJOpenAppEntity, MJOpenAppInstallHistoryEntity, MJOpenAppDependencyEntity } from '@memberjunction/core-entities';
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
  subpath?: string,
): Promise<string> {
  callbacks?.OnProgress?.('Record', 'Recording app installation...');

  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const entity = await md.GetEntityObject<MJOpenAppEntity>('MJ: Open Apps', contextUser);

  // Check for existing record (e.g. previously removed app being reinstalled)
  const existing = await FindInstalledApp(contextUser, manifest.name, provider);
  if (existing) {
    const key = new CompositeKey([{ FieldName: 'ID', Value: existing.ID }]);
    await entity.InnerLoad(key);
  } else {
    entity.NewRecord();
  }

  SetAppFields(entity, manifest, contextUser, initialStatus, subpath);

  if (transactionGroup) {
    entity.TransactionGroup = transactionGroup;
  }

  const saved = await entity.Save();
  if (!transactionGroup && !saved) {
    throw new Error(`Failed to record app installation: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }

  callbacks?.OnSuccess?.('Record', `App '${manifest.name}' recorded as installed`);
  return entity.ID;
}

/**
 * Sets all app fields on an entity object from a manifest.
 * Shared between new installs and reinstalls.
 */
function SetAppFields(
  entity: MJOpenAppEntity,
  manifest: MJAppManifest,
  contextUser: UserInfo,
  status: AppStatus = 'Active',
  subpath?: string,
): void {
  entity.Name = manifest.name;
  entity.DisplayName = manifest.displayName;
  entity.Description = manifest.description ?? null;
  entity.Version = manifest.version;
  entity.Publisher = manifest.publisher.name;
  entity.PublisherEmail = manifest.publisher.email ?? null;
  entity.PublisherURL = manifest.publisher.url ?? null;
  entity.RepositoryURL = manifest.repository;
  // Subpath persists which in-repo directory a multi-app repo installed from, so
  // upgrade/remove re-fetch the right manifest. null = manifest at the repo root.
  entity.Subpath = subpath ?? null;
  entity.SchemaName = manifest.schema?.name ?? null;
  entity.MJVersionRange = manifest.mjVersionRange;
  entity.License = manifest.license ?? null;
  entity.Icon = manifest.icon ?? null;
  entity.Color = manifest.color ?? null;
  entity.ManifestJSON = JSON.stringify(manifest);
  entity.ConfigurationSchemaJSON = manifest.configuration ? JSON.stringify(manifest.configuration) : null;
  entity.InstalledByUserID = contextUser.ID;
  entity.Status = status;
}

/**
 * Updates an existing app record (e.g., after upgrade or status change).
 *
 * @param contextUser - The user performing the update
 * @param appId - The OpenApp record ID
 * @param updates - Fields to update
 */
export async function UpdateAppRecord(contextUser: UserInfo, appId: string, updates: Partial<MJOpenAppEntity>, provider?: IMetadataProvider): Promise<void> {
  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const entity = await md.GetEntityObject<MJOpenAppEntity>('MJ: Open Apps', contextUser);
  const loaded = await entity.InnerLoad(CompositeKey.FromID(appId));
  if (!loaded) {
    throw new Error(`Open App record not found: ${appId}`);
  }
  // `updates` is a typed Partial<MJOpenAppEntity>, so call sites get compile-time field-name +
  // value-type checking. The body applies it dynamically via Set() — the only way to write an
  // arbitrary field subset onto a BaseEntity (you can't index typed accessors by a runtime key).
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
  const entity = await md.GetEntityObject<MJOpenAppInstallHistoryEntity>('MJ: Open App Install Histories', contextUser);
  entity.NewRecord();
  entity.OpenAppID = appId;
  entity.Version = manifest.version;
  entity.PreviousVersion = details.PreviousVersion ?? null;
  entity.Action = action;
  entity.ManifestJSON = JSON.stringify(manifest);
  entity.Summary = details.Summary ?? null;
  entity.ExecutedByUserID = contextUser.ID;
  entity.DurationSeconds = details.DurationSeconds ?? null;
  entity.StartedAt = details.StartedAt ?? null;
  entity.EndedAt = details.EndedAt ?? null;
  entity.Success = details.Success;
  entity.ErrorMessage = details.ErrorMessage ?? null;
  entity.ErrorPhase = details.ErrorPhase ?? null;

  if (transactionGroup) {
    entity.TransactionGroup = transactionGroup;
  }

  const saved = await entity.Save();
  if (!transactionGroup && !saved) {
    throw new Error(`Failed to record install history: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
  return entity.ID;
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

    const entity = await md.GetEntityObject<MJOpenAppDependencyEntity>('MJ: Open App Dependencies', contextUser);
    entity.NewRecord();
    entity.OpenAppID = appId;
    entity.DependsOnAppName = depName;
    entity.DependsOnAppID = depApp?.ID ?? null;
    entity.VersionRange = versionRange;
    entity.InstalledVersion = depApp?.Version ?? null;
    entity.Status = depApp ? 'Satisfied' : 'Missing';

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
 *
 * When a `transactionGroup` is supplied, the deletes are queued into it (committed by
 * the caller's `Submit()`) rather than committed individually — so an upgrade can delete
 * the old rows and insert the new ones in a single atomic unit (B23).
 */
export async function DeleteAppDependencies(
  contextUser: UserInfo,
  appId: string,
  transactionGroup?: TransactionGroupBase,
): Promise<void> {
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
    if (transactionGroup) {
      // Queue the delete into the caller's transaction — committed atomically on Submit().
      record.TransactionGroup = transactionGroup;
      await record.Delete();
      continue;
    }
    // BaseEntity.Delete() returns false on failure (it does not throw) — check it,
    // or stale dependency rows survive silently and corrupt later FindDependentApps.
    const deleted = await record.Delete();
    if (!deleted) {
      throw new Error(`Failed to delete a dependency for app ${appId}: ${record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }
}

/**
 * Atomically replaces an app's dependency rows: deletes the existing rows and inserts the
 * new set inside a single TransactionGroup. Used by upgrade so a crash mid-rewrite can
 * never leave the app with zero dependency rows (the prior code deleted then re-added in
 * two un-grouped steps) — B23.
 *
 * @returns the TransactionGroup Submit result (true = both delete + insert committed).
 */
export async function ReplaceAppDependenciesAtomically(
  contextUser: UserInfo,
  appId: string,
  dependencies: Record<string, string | { version?: string; repository?: string }>,
  provider?: IMetadataProvider,
): Promise<boolean> {
  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const tg = await md.CreateTransactionGroup();
  // Both queue into `tg`; nothing commits until Submit().
  await DeleteAppDependencies(contextUser, appId, tg);
  await RecordAppDependencies(contextUser, appId, dependencies, tg, provider);
  return tg.Submit();
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
 * Outcome of the co-tenant schema-share check used by RemoveApp. Distinguishes a
 * definitively-shared schema from an *indeterminate* one (the lookup itself failed) — the
 * caller must treat these differently: skip the drop for the former, ABORT the whole remove
 * for the latter.
 */
export interface SchemaShareCheck {
  /** Another non-removed app uses this schema → skip metadata + schema drop to protect it. */
  Shared: boolean;
  /**
   * The share-check QUERY itself failed (indeterminate). The caller MUST abort the remove
   * before stripping any files — silently skipping the schema drop and falling through would
   * leave a half-removed app (files gone, schema + metadata intact, status `Removed`). B14/B20.
   */
  CheckFailed: boolean;
  /** Error detail, present only when `CheckFailed`. */
  ErrorMessage?: string;
}

/**
 * Checks whether another (non-removed) Open App shares the given schema.
 *
 * RemoveApp drops the schema and wipes schema-keyed entity metadata by SchemaName;
 * without this guard, removing one app that ADOPTED a schema another app created
 * (manifest `schema.createIfNotExists`) would destroy the co-tenant's data and
 * metadata — see B14. On PostgreSQL the blast radius is larger (DROP SCHEMA CASCADE).
 *
 * Returns a {@link SchemaShareCheck}, not a bare boolean, so the caller can tell a genuinely
 * shared schema (`Shared:true, CheckFailed:false` → skip the drop, proceed) apart from an
 * indeterminate lookup (`CheckFailed:true` → abort the remove). On query failure it reports
 * `Shared:true` (never risk dropping a possibly-shared schema) AND `CheckFailed:true`.
 *
 * @param contextUser - The context user for the query
 * @param schemaName - The schema being considered for removal
 * @param excludeAppId - The app being removed (excluded from the share check)
 * @param provider - Optional metadata provider
 */
export async function CheckSchemaSharedByOtherApps(
  contextUser: UserInfo,
  schemaName: string,
  excludeAppId: string,
  provider?: IMetadataProvider,
): Promise<SchemaShareCheck> {
  if (!schemaName) {
    return { Shared: false, CheckFailed: false };
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
    // Indeterminate. Shared:true is the safe direction (never drop a possibly-shared schema);
    // CheckFailed signals the caller to ABORT before stripping files rather than fall through
    // to a half-removed state.
    return { Shared: true, CheckFailed: true, ErrorMessage: result.ErrorMessage };
  }
  return { Shared: result.Results.length > 0, CheckFailed: false };
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
