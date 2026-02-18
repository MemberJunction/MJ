/**
 * Install orchestrator for MJ Open Apps.
 *
 * Sequences the install flow, upgrade flow, and remove flow.
 * Each step is delegated to a specialized handler.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { AppInstallCallbacks, InstallOptions, UpgradeOptions, RemoveOptions, AppOperationResult, ErrorPhase } from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import { ParseAndValidateManifest } from '../manifest/manifest-loader.js';
import { CheckMJVersionCompatibility, IsValidUpgrade } from '../dependency/version-checker.js';
import { ResolveDependencies } from '../dependency/dependency-resolver.js';
import type { InstalledAppMap, DependencyNode, DependencyValue } from '../dependency/dependency-resolver.js';
import { FetchManifestFromGitHub, DownloadMigrations, GetLatestVersion, type GitHubClientOptions } from '../github/github-client.js';
import { CreateAppSchema, DropAppSchema, SchemaExists, EscapeSqlString } from './schema-manager.js';
import { RunAppMigrations, type SkywayDatabaseConfig } from './migration-runner.js';
import { AddAppPackages, RemoveAppPackages, RunNpmInstall } from './package-manager.js';
import { AddServerDynamicPackages, RemoveServerDynamicPackages, ToggleServerDynamicPackages } from './config-manager.js';
import { RegenerateClientBootstrap, type ClientBootstrapEntry } from './client-bootstrap-gen.js';
import { BaseEntity, DatabaseProviderBase, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  RecordAppInstallation,
  RecordInstallHistoryEntry,
  RecordAppDependencies,
  DeleteAppDependencies,
  SetAppStatus,
  FindInstalledApp,
  FindDependentApps,
  ListInstalledApps,
  UpdateAppRecord,
} from './history-recorder.js';

/**
 * Runtime context provided by the CLI to the orchestrator.
 * Contains all the external dependencies needed for the install flow.
 */
export interface OrchestratorContext {
  /** MJ context user for entity operations (Metadata / RunView) */
  ContextUser: UserInfo;
  /** MJ database provider for schema DDL operations */
  DatabaseProvider: DatabaseProviderBase;
  /** Database config for Skyway */
  DatabaseConfig: SkywayDatabaseConfig;
  /** GitHub client options (auth token) */
  GitHubOptions: GitHubClientOptions;
  /** Absolute path to the monorepo root */
  RepoRoot: string;
  /** The current MJ version string */
  MJVersion: string;
  /** Progress callbacks */
  Callbacks?: AppInstallCallbacks;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the full install flow for an Open App.
 *
 * Steps:
 * 1.  Fetch manifest from GitHub
 * 2.  Validate manifest (Zod)
 * 3.  Validate MJ version compatibility
 * 4.  Resolve dependencies (topological sort + version validation)
 * 5.  Install dependencies (recursive, depth-first)
 * 6.  Check schema (no collision)
 * 7.  Create schema
 * 8.  Run migrations (Skyway - DDL + metadata DML)
 * 9.  Record installation with 'Installing' status
 * 10. Update package.json files
 * 11. Run npm install
 * 12. Update server config (dynamicPackages in mj.config.cjs)
 * 13. Update client imports (open-app-bootstrap.generated.ts)
 * 14. Execute hooks (postInstall)
 * 15. Finalize status to 'Active'
 */
export async function InstallApp(options: InstallOptions, context: OrchestratorContext): Promise<AppOperationResult> {
  const startTime = Date.now();
  const { Callbacks } = context;
  let createdAppId: string | undefined;
  let manifest: MJAppManifest | undefined;

  try {
    // Step 1: Fetch manifest
    Callbacks?.OnProgress?.('Fetch', `Fetching manifest from ${options.Source}...`);
    const fetchResult = await FetchManifestFromGitHub(options.Source, options.Version, context.GitHubOptions);
    if (!fetchResult.Success || !fetchResult.ManifestJSON) {
      return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, fetchResult.ErrorMessage ?? 'Failed to fetch manifest');
    }

    // Step 2: Validate manifest
    Callbacks?.OnProgress?.('Validate', 'Validating manifest...');
    const parseResult = ParseAndValidateManifest(fetchResult.ManifestJSON);
    if (!parseResult.Success || !parseResult.Manifest) {
      return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, `Invalid manifest: ${parseResult.Errors?.join(', ')}`);
    }
    manifest = parseResult.Manifest;

    // Steps 3-4: Validate MJ compatibility and resolve dependencies (parallel)
    Callbacks?.OnProgress?.('Validate', 'Checking MJ version compatibility and resolving dependencies...');
    const [compatResult, depResult] = await Promise.all([
      Promise.resolve(CheckMJVersionCompatibility(context.MJVersion, manifest.mjVersionRange)),
      ResolveDependencyChain(manifest, context),
    ]);
    if (!compatResult.Compatible) {
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, compatResult.Message ?? 'Incompatible MJ version');
    }
    if (!depResult.Success) {
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, depResult.ErrorMessage ?? 'Dependency resolution failed');
    }

    // Step 5: Install dependencies (recursive)
    if (depResult.DepsToInstall && depResult.DepsToInstall.length > 0) {
      const depsResult = await InstallDependencies(depResult.DepsToInstall, context);
      if (!depsResult.Success) {
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, depsResult.ErrorMessage ?? 'Dependency installation failed');
      }
    }

    // Check for prior installation (e.g. previously removed app)
    const existingApp = await FindInstalledApp(context.ContextUser, manifest.name);
    const isReinstall = existingApp != null && existingApp.Status === 'Removed';
    if (existingApp && !isReinstall) {
      return BuildFailureResult(
        'Install',
        manifest.name,
        manifest.version,
        'Schema',
        startTime,
        `App '${manifest.name}' is already installed with status '${existingApp.Status}'. Use 'mj app upgrade' to update it.`,
      );
    }

    // ── PHASE 1: Database operations (rollbackable) ──────────────
    Callbacks?.OnProgress?.('Install', `Installing ${manifest.name} v${manifest.version}...`);
    let schemaCreated = false;

    // Steps 6-7: Schema
    if (manifest.schema) {
      const schemaResult = await HandleSchemaCreation(manifest, context, isReinstall);
      if (!schemaResult.Success) {
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, schemaResult.ErrorMessage ?? 'Schema creation failed');
      }
      schemaCreated = !isReinstall; // Track if we created a new schema (for rollback)
    }

    // Step 8: Run migrations
    if (manifest.migrations && manifest.schema) {
      const migrationResult = await HandleMigrations(manifest, context);
      if (!migrationResult.Success) {
        await CompensateSchemaOnFailure(manifest, context, schemaCreated, Callbacks);
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Migration', startTime, migrationResult.ErrorMessage ?? 'Migration failed');
      }
    }

    // Step 9: Record installation with 'Installing' status
    Callbacks?.OnProgress?.('Record', 'Recording app installation...');
    const recordResult = await RecordInstallationAtomically(context.ContextUser, manifest, Callbacks);
    if (!recordResult.Success) {
      await CompensateSchemaOnFailure(manifest, context, schemaCreated, Callbacks);
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Record', startTime, recordResult.ErrorMessage ?? 'Failed to record installation');
    }
    createdAppId = recordResult.AppId;

    // ── PHASE 2: File operations (after all DB work succeeds) ────
    Callbacks?.OnProgress?.('Config', 'Updating configuration files...');

    // Steps 10-11: Packages
    const pkgResult = await HandlePackageInstallation(manifest, context);
    if (!pkgResult.Success) {
      await SetAppStatus(context.ContextUser, createdAppId!, 'Error');
      await RecordFailureHistory(context.ContextUser, createdAppId!, 'Install', manifest, 'Packages', pkgResult.ErrorMessage ?? 'Package installation failed', startTime);
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Packages', startTime, pkgResult.ErrorMessage ?? 'Package installation failed');
    }

    // Step 12: Update server config
    const configResult = HandleServerConfig(manifest, context);
    if (!configResult.Success) {
      await SetAppStatus(context.ContextUser, createdAppId!, 'Error');
      await RecordFailureHistory(context.ContextUser, createdAppId!, 'Install', manifest, 'Config', configResult.ErrorMessage ?? 'Config update failed', startTime);
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Config', startTime, configResult.ErrorMessage ?? 'Config update failed');
    }

    // Step 13: Update client imports
    await HandleClientBootstrapRegeneration(context);

    // Step 14: Execute hooks
    if (manifest.hooks?.postInstall) {
      Callbacks?.OnProgress?.('Hooks', 'Running postInstall hook...');
      await ExecuteHook(manifest.hooks.postInstall, context.RepoRoot);
    }

    // Step 15: Finalize — set status to Active and record success history
    Callbacks?.OnProgress?.('Record', 'Finalizing installation...');
    await SetAppStatus(context.ContextUser, createdAppId!, 'Active');
    await RecordInstallHistoryEntry(context.ContextUser, createdAppId!, 'Install', manifest, {
      Success: true,
      DurationSeconds: GetDurationSeconds(startTime),
      StartedAt: new Date(startTime),
      EndedAt: new Date(),
      Summary: 'Initial installation',
    });

    Callbacks?.OnSuccess?.('Install', `Successfully installed ${manifest.name} v${manifest.version}`);

    return {
      Success: true,
      Action: 'Install',
      AppName: manifest.name,
      Version: manifest.version,
      DurationSeconds: GetDurationSeconds(startTime),
      Summary: 'App installed successfully. Restart MJAPI and rebuild MJExplorer to activate.',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (createdAppId && manifest) {
      try {
        await RecordFailureHistory(context.ContextUser, createdAppId, 'Install', manifest, 'Schema', message, startTime);
        await SetAppStatus(context.ContextUser, createdAppId, 'Error');
      } catch {
        /* best effort */
      }
    }
    Callbacks?.OnError?.('Install', message);
    return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, message);
  }
}

/**
 * Records app installation and dependencies atomically using a TransactionGroup.
 * The app record is created with 'Installing' status. The caller is responsible for
 * finalizing to 'Active' after all file operations complete.
 */
async function RecordInstallationAtomically(
  contextUser: UserInfo,
  manifest: MJAppManifest,
  callbacks?: AppInstallCallbacks,
): Promise<InternalResult> {
  const md = new Metadata();
  const tg = await md.CreateTransactionGroup();

  try {
    // Queue OpenApp save with 'Installing' status
    const appId = await RecordAppInstallation(contextUser, manifest, callbacks, tg, 'Installing');

    if (manifest.dependencies) {
      await RecordAppDependencies(contextUser, appId, manifest.dependencies, tg);
    }

    // Submit all atomically
    callbacks?.OnProgress?.('Record', 'Committing installation records...');
    const success = await tg.Submit();
    if (!success) {
      return { Success: false, ErrorMessage: 'Transaction failed: one or more records could not be saved' };
    }

    return { Success: true, AppId: appId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, ErrorMessage: `Transaction failed: ${message}` };
  }
}

/**
 * Compensating action: drops the schema if it was newly created during a failed install.
 * Notifies the user via callbacks before and after rollback.
 */
async function CompensateSchemaOnFailure(
  manifest: MJAppManifest,
  context: OrchestratorContext,
  schemaWasCreated: boolean,
  callbacks?: AppInstallCallbacks,
): Promise<void> {
  if (!schemaWasCreated || !manifest.schema) {
    return;
  }
  try {
    callbacks?.OnProgress?.('Rollback', `Rolling back: dropping schema '${manifest.schema.name}'...`);
    await DropAppSchema(manifest.schema.name, context.DatabaseProvider);
    callbacks?.OnProgress?.('Rollback', `Schema '${manifest.schema.name}' dropped successfully`);
  } catch (rollbackError: unknown) {
    const msg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
    callbacks?.OnError?.('Rollback', `Failed to drop schema '${manifest.schema.name}' during rollback: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the upgrade flow for an installed Open App.
 */
export async function UpgradeApp(options: UpgradeOptions, context: OrchestratorContext): Promise<AppOperationResult> {
  const startTime = Date.now();
  const { Callbacks } = context;
  let upgradeAppId: string | undefined;
  let manifest: MJAppManifest | undefined;
  let previousVersion = '';

  try {
    // Look up existing app
    const existingApp = await FindInstalledApp(context.ContextUser, options.AppName);
    if (!existingApp) {
      return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, `App '${options.AppName}' is not installed`);
    }
    upgradeAppId = existingApp.ID;

    previousVersion = existingApp.Version;

    // Step 1: Fetch new manifest
    const targetVersion = options.Version ?? (await GetLatestVersion(existingApp.RepositoryURL, context.GitHubOptions));
    if (!targetVersion) {
      return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, 'Could not determine target version');
    }

    // Verify target is actually newer than installed version
    const upgradeCheck = IsValidUpgrade(previousVersion, targetVersion);
    if (!upgradeCheck.Compatible) {
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, upgradeCheck.Message ?? 'Invalid upgrade version');
    }

    Callbacks?.OnProgress?.('Fetch', `Fetching manifest for ${options.AppName} v${targetVersion}...`);
    const fetchResult = await FetchManifestFromGitHub(existingApp.RepositoryURL, targetVersion, context.GitHubOptions);
    if (!fetchResult.Success || !fetchResult.ManifestJSON) {
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, fetchResult.ErrorMessage ?? 'Failed to fetch manifest');
    }

    // Step 2: Validate manifest and compatibility
    const parseResult = ParseAndValidateManifest(fetchResult.ManifestJSON);
    if (!parseResult.Success || !parseResult.Manifest) {
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, `Invalid manifest: ${parseResult.Errors?.join(', ')}`);
    }
    manifest = parseResult.Manifest;

    const compatResult = CheckMJVersionCompatibility(context.MJVersion, manifest.mjVersionRange);
    if (!compatResult.Compatible) {
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, compatResult.Message ?? 'Incompatible MJ version');
    }

    // Step 3: Check dependency compatibility
    if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
      const depResult = await ResolveDependencyChain(manifest, context);
      if (!depResult.Success) {
        return BuildFailureResult(
          'Upgrade',
          options.AppName,
          targetVersion,
          'Schema',
          startTime,
          depResult.ErrorMessage ?? 'Dependency check failed for upgrade',
        );
      }
      // Install any new dependencies required by the upgraded version
      if (depResult.DepsToInstall && depResult.DepsToInstall.length > 0) {
        const installResult = await InstallDependencies(depResult.DepsToInstall, context);
        if (!installResult.Success) {
          return BuildFailureResult(
            'Upgrade',
            options.AppName,
            targetVersion,
            'Schema',
            startTime,
            installResult.ErrorMessage ?? 'Failed to install new dependencies for upgrade',
          );
        }
      }
    }

    // Set status to Upgrading
    await SetAppStatus(context.ContextUser, existingApp.ID, 'Upgrading');

    // Step 4: Run migrations (Skyway applies only new ones)
    if (manifest.migrations && manifest.schema) {
      const migrationResult = await HandleMigrations(manifest, context);
      if (!migrationResult.Success) {
        await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Migration', migrationResult.ErrorMessage ?? 'Migration failed', startTime, previousVersion);
        await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
        return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Migration', startTime, migrationResult.ErrorMessage ?? 'Migration failed');
      }
    }

    // Steps 5-6: Update packages
    const pkgResult = await HandlePackageInstallation(manifest, context);
    if (!pkgResult.Success) {
      await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Packages', pkgResult.ErrorMessage ?? 'Package update failed', startTime, previousVersion);
      await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Packages', startTime, pkgResult.ErrorMessage ?? 'Package update failed');
    }

    // Step 7: Update server config if changed
    const configResult = HandleServerConfig(manifest, context);
    if (!configResult.Success) {
      await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Config', configResult.ErrorMessage ?? 'Config update failed', startTime, previousVersion);
      await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Config', startTime, configResult.ErrorMessage ?? 'Config update failed');
    }

    // Step 8: Regenerate client imports
    await HandleClientBootstrapRegeneration(context);

    // Step 9: Execute hooks
    if (manifest.hooks?.postUpgrade) {
      Callbacks?.OnProgress?.('Hooks', 'Running postUpgrade hook...');
      await ExecuteHook(manifest.hooks.postUpgrade, context.RepoRoot);
    }

    // Step 10: Update records
    await UpdateAppRecord(context.ContextUser, existingApp.ID, {
      Version: manifest.version,
      ManifestJSON: JSON.stringify(manifest),
      Status: 'Active',
    });

    // Update dependency records to reflect new manifest
    if (manifest.dependencies) {
      await DeleteAppDependencies(context.ContextUser, existingApp.ID);
      await RecordAppDependencies(context.ContextUser, existingApp.ID, manifest.dependencies);
    }

    await RecordInstallHistoryEntry(context.ContextUser, existingApp.ID, 'Upgrade', manifest, {
      PreviousVersion: previousVersion,
      Success: true,
      DurationSeconds: GetDurationSeconds(startTime),
      StartedAt: new Date(startTime),
      EndedAt: new Date(),
      Summary: `Upgraded from ${previousVersion} to ${manifest.version}`,
    });

    Callbacks?.OnSuccess?.('Upgrade', `Successfully upgraded ${options.AppName} to v${manifest.version}`);

    return {
      Success: true,
      Action: 'Upgrade',
      AppName: options.AppName,
      Version: manifest.version,
      DurationSeconds: GetDurationSeconds(startTime),
      Summary: `Upgraded from ${previousVersion} to ${manifest.version}. Restart MJAPI and rebuild MJExplorer.`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (upgradeAppId) {
      try {
        if (manifest) {
          await RecordFailureHistory(context.ContextUser, upgradeAppId, 'Upgrade', manifest, 'Schema', message, startTime, previousVersion);
        }
        await SetAppStatus(context.ContextUser, upgradeAppId, 'Error');
      } catch {
        /* best effort */
      }
    }
    Callbacks?.OnError?.('Upgrade', message);
    return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the remove flow for an installed Open App.
 */
export async function RemoveApp(options: RemoveOptions, context: OrchestratorContext): Promise<AppOperationResult> {
  const startTime = Date.now();
  const { Callbacks } = context;
  let removeAppId: string | undefined;
  let removeManifest: MJAppManifest | undefined;

  try {
    const existingApp = await FindInstalledApp(context.ContextUser, options.AppName);
    if (!existingApp) {
      return BuildFailureResult('Remove', options.AppName, '', 'Schema', startTime, `App '${options.AppName}' is not installed`);
    }
    removeAppId = existingApp.ID;

    // Step 1: Check dependents
    if (!options.Force) {
      const dependents = await FindDependentApps(context.ContextUser, options.AppName);
      if (dependents.length > 0) {
        return BuildFailureResult(
          'Remove',
          options.AppName,
          existingApp.Version,
          'Schema',
          startTime,
          `Cannot remove: the following apps depend on ${options.AppName}: ${dependents.join(', ')}. Use --force to override.`,
        );
      }
    }

    await SetAppStatus(context.ContextUser, existingApp.ID, 'Removing');

    // Step 2: Execute preRemove hook
    removeManifest = JSON.parse(existingApp.ManifestJSON) as MJAppManifest;
    const manifest = removeManifest;
    if (manifest.hooks?.preRemove) {
      Callbacks?.OnProgress?.('Hooks', 'Running preRemove hook...');
      await ExecuteHook(manifest.hooks.preRemove, context.RepoRoot);
    }

    // Steps 3-5: Remove config, client bootstrap, and package refs (parallel — all write to different files)
    Callbacks?.OnProgress?.('Config', 'Removing config, client bootstrap, and package references...');
    await Promise.all([
      Promise.resolve(RemoveServerDynamicPackages(context.RepoRoot, options.AppName)),
      HandleClientBootstrapRegeneration(context),
      Promise.resolve(
        RemoveAppPackages({
          RepoRoot: context.RepoRoot,
          ServerPackages: manifest.packages?.server ?? [],
          ClientPackages: manifest.packages?.client ?? [],
          SharedPackages: manifest.packages?.shared ?? [],
          Version: existingApp.Version,
        }),
      ),
    ]);

    // npm install must run after package.json changes are written
    Callbacks?.OnProgress?.('Packages', 'Running npm install...');
    const npmResult = RunNpmInstall(context.RepoRoot, options.Verbose);
    if (!npmResult.Success) {
      Callbacks?.OnWarn?.('Packages', `npm install warning during removal: ${npmResult.ErrorMessage}`);
    }

    // Step 6: Remove metadata (entity registrations, SchemaInfo, etc.)
    if (existingApp.SchemaName) {
      Callbacks?.OnProgress?.('Metadata', `Removing entity metadata for schema '${existingApp.SchemaName}'...`);
      await RemoveAppEntityMetadata(existingApp.SchemaName, context.ContextUser, Callbacks);
    }

    // Step 7: Drop schema (unless --keep-data)
    if (!options.KeepData && existingApp.SchemaName) {
      Callbacks?.OnProgress?.('Schema', `Dropping schema '${existingApp.SchemaName}'...`);
      const dropResult = await DropAppSchema(existingApp.SchemaName, context.DatabaseProvider);
      if (!dropResult.Success) {
        Callbacks?.OnWarn?.('Schema', `Failed to drop schema: ${dropResult.ErrorMessage}`);
      }
    }

    // Step 8: Update records
    await RecordInstallHistoryEntry(context.ContextUser, existingApp.ID, 'Remove', manifest, {
      Success: true,
      DurationSeconds: GetDurationSeconds(startTime),
      StartedAt: new Date(startTime),
      EndedAt: new Date(),
      Summary: options.KeepData ? 'Removed (data kept)' : 'Removed (data dropped)',
    });

    await UpdateAppRecord(context.ContextUser, existingApp.ID, {
      Status: 'Removed',
    });

    Callbacks?.OnSuccess?.('Remove', `Successfully removed ${options.AppName}`);

    return {
      Success: true,
      Action: 'Remove',
      AppName: options.AppName,
      Version: existingApp.Version,
      DurationSeconds: GetDurationSeconds(startTime),
      Summary: options.KeepData ? 'App removed (database schema preserved)' : 'App removed',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (removeAppId) {
      try {
        if (removeManifest) {
          await RecordFailureHistory(context.ContextUser, removeAppId, 'Remove', removeManifest, 'Schema', message, startTime);
        }
        await SetAppStatus(context.ContextUser, removeAppId, 'Error');
      } catch {
        /* best effort */
      }
    }
    Callbacks?.OnError?.('Remove', message);
    return BuildFailureResult('Remove', options.AppName, '', 'Schema', startTime, message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISABLE / ENABLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disables an installed app without removing it.
 */
export async function DisableApp(appName: string, context: OrchestratorContext): Promise<AppOperationResult> {
  const startTime = Date.now();
  const app = await FindInstalledApp(context.ContextUser, appName);
  if (!app) {
    return BuildFailureResult('Install', appName, '', 'Config', startTime, `App '${appName}' is not installed`);
  }

  ToggleServerDynamicPackages(context.RepoRoot, appName, false);
  await HandleClientBootstrapRegeneration(context);
  await SetAppStatus(context.ContextUser, app.ID, 'Disabled');

  return {
    Success: true,
    Action: 'Install', // No 'Disable' action type
    AppName: appName,
    Version: app.Version,
    DurationSeconds: GetDurationSeconds(startTime),
    Summary: 'App disabled. Restart MJAPI and rebuild MJExplorer.',
  };
}

/**
 * Re-enables a disabled app.
 */
export async function EnableApp(appName: string, context: OrchestratorContext): Promise<AppOperationResult> {
  const startTime = Date.now();
  const app = await FindInstalledApp(context.ContextUser, appName);
  if (!app) {
    return BuildFailureResult('Install', appName, '', 'Config', startTime, `App '${appName}' is not installed`);
  }

  ToggleServerDynamicPackages(context.RepoRoot, appName, true);
  await HandleClientBootstrapRegeneration(context);
  await SetAppStatus(context.ContextUser, app.ID, 'Active');

  return {
    Success: true,
    Action: 'Install',
    AppName: appName,
    Version: app.Version,
    DurationSeconds: GetDurationSeconds(startTime),
    Summary: 'App enabled. Restart MJAPI and rebuild MJExplorer.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal result type used by orchestrator helper functions.
 */
interface InternalResult {
  Success: boolean;
  ErrorMessage?: string;
  AppId?: string;
  DepsToInstall?: Array<{ AppName: string; Repository: string; VersionRange: string }>;
}

/**
 * Resolves the dependency chain for a manifest, returning any uninstalled
 * dependencies that need to be installed first.
 */
async function ResolveDependencyChain(manifest: MJAppManifest, context: OrchestratorContext): Promise<InternalResult> {
  if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Dependencies', 'Resolving dependencies...');

  const installedApps = await ListInstalledApps(context.ContextUser);
  const installedMap: InstalledAppMap = {};
  for (const app of installedApps) {
    installedMap[app.Name] = { Version: app.Version, Repository: app.RepositoryURL };
  }

  const rootNode: DependencyNode = {
    AppName: manifest.name,
    Repository: manifest.repository,
    Dependencies: manifest.dependencies as Record<string, DependencyValue>,
  };

  const result = ResolveDependencies(rootNode, installedMap);
  if (!result.Success) {
    return { Success: false, ErrorMessage: result.ErrorMessage };
  }

  const depsToInstall = (result.InstallOrder ?? [])
    .filter((d) => !d.AlreadyInstalled)
    .map((d) => ({ AppName: d.AppName, Repository: d.Repository, VersionRange: d.VersionRange }));

  return { Success: true, DepsToInstall: depsToInstall };
}

/**
 * Installs unresolved dependencies sequentially via recursive {@link InstallApp} calls.
 */
async function InstallDependencies(
  deps: Array<{ AppName: string; Repository: string; VersionRange: string }>,
  context: OrchestratorContext,
): Promise<InternalResult> {
  for (const dep of deps) {
    if (!dep.Repository) {
      return {
        Success: false,
        ErrorMessage: `Dependency '${dep.AppName}' is not installed and no repository URL was provided in the manifest. Use the object form: { "version": "${dep.VersionRange}", "repository": "https://github.com/..." }`,
      };
    }
    context.Callbacks?.OnProgress?.('Dependencies', `Installing dependency from ${dep.Repository}...`);
    const result = await InstallApp({ Source: dep.Repository }, context);
    if (!result.Success) {
      return { Success: false, ErrorMessage: `Failed to install dependency: ${result.ErrorMessage}` };
    }
  }
  return { Success: true };
}

/**
 * Handles schema creation for an app, including collision checks and reinstall reuse.
 */
async function HandleSchemaCreation(manifest: MJAppManifest, context: OrchestratorContext, isReinstall: boolean = false): Promise<InternalResult> {
  if (!manifest.schema) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Schema', `Checking schema '${manifest.schema.name}'...`);
  const exists = await SchemaExists(manifest.schema.name, context.DatabaseProvider);

  if (exists) {
    if (isReinstall) {
      // Schema left over from a previous install (e.g. --keep-data removal).
      // Reuse it rather than failing.
      context.Callbacks?.OnProgress?.('Schema', `Reusing existing schema '${manifest.schema.name}'`);
      return { Success: true };
    }
    return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' already exists` };
  }

  if (manifest.schema.createIfNotExists !== false) {
    context.Callbacks?.OnProgress?.('Schema', `Creating schema '${manifest.schema.name}'...`);
    const result = await CreateAppSchema(manifest.schema.name, context.DatabaseProvider);
    return { Success: result.Success, ErrorMessage: result.ErrorMessage };
  }

  return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' does not exist and createIfNotExists is false` };
}

/**
 * Downloads and runs Skyway migrations for an app's schema.
 */
async function HandleMigrations(manifest: MJAppManifest, context: OrchestratorContext): Promise<InternalResult> {
  if (!manifest.schema || !manifest.migrations) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Migration', 'Downloading migration files...');
  const tempDir = join(tmpdir(), `mj-app-${manifest.name}-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const downloadResult = await DownloadMigrations(manifest.repository, manifest.version, manifest.migrations.directory, tempDir, context.GitHubOptions);

  if (!downloadResult.Success) {
    return { Success: false, ErrorMessage: downloadResult.ErrorMessage };
  }

  context.Callbacks?.OnProgress?.('Migration', `Running ${downloadResult.Files?.length ?? 0} migration(s)...`);

  const migrationResult = await RunAppMigrations({
    MigrationsDir: tempDir,
    SchemaName: manifest.schema.name,
    DatabaseConfig: context.DatabaseConfig,
  });

  return { Success: migrationResult.Success, ErrorMessage: migrationResult.ErrorMessage };
}

/**
 * Adds app npm packages to the appropriate workspace package.json files and runs npm install.
 */
async function HandlePackageInstallation(manifest: MJAppManifest, context: OrchestratorContext): Promise<InternalResult> {
  if (!manifest.packages) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Packages', 'Adding npm packages...');
  const addResult = AddAppPackages({
    RepoRoot: context.RepoRoot,
    ServerPackages: manifest.packages.server ?? [],
    ClientPackages: manifest.packages.client ?? [],
    SharedPackages: manifest.packages.shared ?? [],
    Version: manifest.version,
  });

  if (!addResult.Success) {
    return { Success: false, ErrorMessage: addResult.ErrorMessage };
  }

  context.Callbacks?.OnProgress?.('Packages', 'Running npm install...');
  const installResult = RunNpmInstall(context.RepoRoot, undefined, manifest.packages.registry);
  return { Success: installResult.Success, ErrorMessage: installResult.ErrorMessage };
}

/**
 * Adds server dynamic package entries to mj.config.cjs for the app.
 */
function HandleServerConfig(manifest: MJAppManifest, context: OrchestratorContext): InternalResult {
  context.Callbacks?.OnProgress?.('Config', 'Updating server config...');
  const result = AddServerDynamicPackages(context.RepoRoot, manifest);
  return { Success: result.Success, ErrorMessage: result.ErrorMessage };
}

/**
 * Regenerates the client bootstrap file with imports ordered by dependency.
 * Apps that are depended on appear before the apps that depend on them.
 */
async function HandleClientBootstrapRegeneration(context: OrchestratorContext): Promise<void> {
  context.Callbacks?.OnProgress?.('Config', 'Regenerating client bootstrap...');

  const apps = await ListInstalledApps(context.ContextUser);

  // Build dependency graph for topological sort
  const appDeps = new Map<string, string[]>();
  for (const app of apps) {
    const manifest = JSON.parse(app.ManifestJSON) as MJAppManifest;
    const depNames = manifest.dependencies ? Object.keys(manifest.dependencies) : [];
    appDeps.set(app.Name, depNames);
  }

  // Topological sort: apps with no deps first, then apps depending on them
  const sortedNames = TopologicalSortApps(appDeps);

  // Build entries in sorted order
  const entries: ClientBootstrapEntry[] = [];
  const appsByName = new Map(apps.map((a) => [a.Name, a]));
  for (const name of sortedNames) {
    const app = appsByName.get(name);
    if (!app) continue;
    const manifest = JSON.parse(app.ManifestJSON) as MJAppManifest;
    const clientPkgs = [...(manifest.packages?.client ?? []), ...(manifest.packages?.shared ?? [])];

    for (const pkg of clientPkgs) {
      entries.push({
        AppName: app.Name,
        Version: app.Version,
        PackageName: pkg.name,
        Enabled: app.Status === 'Active',
      });
    }
  }

  RegenerateClientBootstrap(context.RepoRoot, entries);
}

/**
 * Simple topological sort for installed apps by their dependency names.
 * Returns app names in dependency order (leaf-first).
 */
function TopologicalSortApps(appDeps: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function Visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const deps = appDeps.get(name) ?? [];
    for (const dep of deps) {
      if (appDeps.has(dep)) {
        Visit(dep);
      }
    }
    result.push(name);
  }

  for (const name of appDeps.keys()) {
    Visit(name);
  }
  return result;
}

/**
 * Executes a shell hook command with a 2-minute timeout.
 */
async function ExecuteHook(command: string, cwd: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  execSync(command, { cwd, encoding: 'utf-8', timeout: 120000, stdio: 'inherit' });
}

/**
 * Removes all MJ entity metadata associated with an app's schema.
 * Deletes in FK-dependency order to avoid constraint violations.
 */
async function RemoveAppEntityMetadata(schemaName: string, contextUser: UserInfo, callbacks?: AppInstallCallbacks): Promise<void> {
  try {
    const rv = new RunView();
    const escaped = EscapeSqlString(schemaName);

    // First, find all entity IDs in this schema so we can clean FK-dependent records
    const entityResult = await rv.RunView<BaseEntity>(
      {
        EntityName: 'Entities',
        ExtraFilter: `SchemaName = '${escaped}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );

    if (!entityResult.Success || entityResult.Results.length === 0) {
      // No entities found — just clean up SchemaInfo
      await DeleteEntitiesByFilter(rv, contextUser, 'Schema Info', `SchemaName = '${escaped}'`);
      callbacks?.OnSuccess?.('Metadata', `Entity metadata for schema '${schemaName}' removed`);
      return;
    }

    const entityIds = entityResult.Results.map((e) => String(e.Get('ID')));
    const idList = entityIds.map((id) => `'${EscapeSqlString(id)}'`).join(',');
    const entityIdFilter = `EntityID IN (${idList})`;

    // Delete FK-dependent records in order (parallel where safe)
    await Promise.all([
      DeleteEntitiesByFilter(rv, contextUser, 'Entity Permissions', entityIdFilter),
      DeleteEntitiesByFilter(rv, contextUser, 'Application Entities', entityIdFilter),
    ]);

    // Entity Relationships reference EntityID on both sides
    await DeleteEntitiesByFilter(rv, contextUser, 'Entity Relationships', `EntityID IN (${idList}) OR RelatedEntityID IN (${idList})`);

    // Delete Entity Fields (FK on EntityID)
    await DeleteEntitiesByFilter(rv, contextUser, 'Entity Fields', `EntityID IN (${idList})`);

    // Delete Entities themselves
    for (const entity of entityResult.Results) {
      await entity.Delete();
    }

    // Delete SchemaInfo last
    await DeleteEntitiesByFilter(rv, contextUser, 'Schema Info', `SchemaName = '${escaped}'`);

    callbacks?.OnSuccess?.('Metadata', `Entity metadata for schema '${schemaName}' removed`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    callbacks?.OnWarn?.('Metadata', `Failed to remove entity metadata: ${message}`);
  }
}

/**
 * Helper: loads entities by filter and deletes them one by one.
 */
async function DeleteEntitiesByFilter(rv: RunView, contextUser: UserInfo, entityName: string, filter: string): Promise<void> {
  const result = await rv.RunView<BaseEntity>(
    {
      EntityName: entityName,
      ExtraFilter: filter,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (result.Success) {
    for (const record of result.Results) {
      await record.Delete();
    }
  }
}

/** Calculates elapsed seconds from a `Date.now()` start timestamp. */
function GetDurationSeconds(startTime: number): number {
  return Math.round((Date.now() - startTime) / 1000);
}

/** Constructs a standardized failure {@link AppOperationResult}. */
function BuildFailureResult(
  action: 'Install' | 'Upgrade' | 'Remove',
  appName: string,
  version: string,
  errorPhase: ErrorPhase,
  startTime: number,
  errorMessage: string,
): AppOperationResult {
  return {
    Success: false,
    Action: action,
    AppName: appName,
    Version: version,
    ErrorMessage: errorMessage,
    ErrorPhase: errorPhase,
    DurationSeconds: GetDurationSeconds(startTime),
  };
}

/**
 * Best-effort helper to record a failure history entry.
 * Catches errors internally so that history recording failures
 * never mask the original operation error.
 */
async function RecordFailureHistory(
  contextUser: UserInfo,
  appId: string,
  action: 'Install' | 'Upgrade' | 'Remove',
  manifest: MJAppManifest,
  errorPhase: ErrorPhase,
  errorMessage: string,
  startTime: number,
  previousVersion?: string,
): Promise<void> {
  try {
    await RecordInstallHistoryEntry(contextUser, appId, action, manifest, {
      PreviousVersion: previousVersion,
      Success: false,
      ErrorPhase: errorPhase,
      ErrorMessage: errorMessage,
      DurationSeconds: GetDurationSeconds(startTime),
      StartedAt: new Date(startTime),
      EndedAt: new Date(),
      Summary: `Failed during ${errorPhase} phase: ${errorMessage}`,
    });
  } catch {
    /* best effort — don't let history recording failure mask the original error */
  }
}
