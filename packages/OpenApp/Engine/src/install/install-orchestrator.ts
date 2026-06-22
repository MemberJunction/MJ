/**
 * Install orchestrator for MJ Open Apps.
 *
 * Sequences the install flow, upgrade flow, and remove flow.
 * Each step is delegated to a specialized handler.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { AppInstallCallbacks, InstallOptions, UpgradeOptions, RemoveOptions, AppOperationResult, ErrorPhase, PassthroughInstallOptions } from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import { ParseAndValidateManifest } from '../manifest/manifest-loader.js';
import { CheckMJVersionCompatibility, IsValidUpgrade } from '../dependency/version-checker.js';
import { ResolveDependencyGraph } from '../dependency/dependency-graph-builder.js';
import type { ManifestFetcher, RootApp } from '../dependency/dependency-graph-builder.js';
import type { InstalledAppMap, DependencyValue } from '../dependency/dependency-resolver.js';
import { FetchManifestFromGitHub, DownloadMigrations, DownloadDirectory, GetLatestVersion, ValidateGitHubTag, ParseGitHubUrl, type GitHubClientOptions } from '../github/github-client.js';
import { CreateAppSchema, DropAppSchema, SchemaExists, EscapeSqlString } from './schema-manager.js';
import { RunAppMigrations, type SkywayDatabaseConfig } from './migration-runner.js';
import { AddAppPackages, RemoveAppPackages, RunPackageInstall, BumpPrefixedDependencies, type PackageManagerType, type VersionStrategy, type WorkspaceTarget } from './package-manager.js';
import { AddServerDynamicPackages, RemoveServerDynamicPackages, ToggleServerDynamicPackages, AddEntityPackageMapping, RemoveEntityPackageMapping } from './config-manager.js';
import { AngularConfigManager } from './angular-config-manager.js';
import { RegenerateClientBootstrap, type ClientBootstrapEntry } from './client-bootstrap-gen.js';
import { BaseEntity, DatabaseProviderBase, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
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
/**
 * Result of a host-provided metadata push/unregister operation.
 */
export interface MetadataOperationResult {
  Success: boolean;
  ErrorMessage?: string;
  Created?: number;
  Updated?: number;
  Deleted?: number;
  Skipped?: number;
  Errors?: number;
}

/**
 * Host-injected function that runs an `mj sync push` over a LOCAL metadata directory.
 * Provided by the host (the CLI) so the engine can seed a connector-profile app's
 * metadata at install WITHOUT the engine depending on `@memberjunction/metadata-sync`.
 * `deleteDbOnly` is forwarded for the remove path (delete records the app seeded).
 */
export type MetadataPushFn = (params: {
  dir: string;
  verbose?: boolean;
  include?: string[];
  deleteDbOnly?: boolean;
}) => Promise<MetadataOperationResult>;

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
  /** Path to server workspace relative to RepoRoot (default: 'packages/MJAPI') */
  ServerPackagePath?: string;
  /** Path to client workspace relative to RepoRoot (default: 'packages/MJExplorer') */
  ClientPackagePath?: string;
  /** Package manager to use (default: auto-detected from lockfile) */
  PackageManager?: PackageManagerType;
  /** Version strategy for deps: 'semver' | 'catalog' | 'workspace' | 'auto' (default: 'auto') */
  VersionStrategy?: VersionStrategy;
  /** Additional workspace targets beyond the default server/client pair */
  AdditionalTargets?: WorkspaceTarget[];
  /** File subpath within client workspace for bootstrap file (default: 'src/app/generated/open-app-bootstrap.generated.ts') */
  ClientBootstrapSubpath?: string;
  /** MJ core schema name. Used to resolve `${mjSchema}` placeholder in app migrations. Defaults to '__mj'. */
  MJCoreSchema?: string;
  /** Extra user placeholders merged into the Skyway Placeholders map for migration SQL substitution. */
  MigrationPlaceholders?: Record<string, string>;
  /**
   * Host-injected metadata pusher. REQUIRED for connector-profile apps
   * (`manifest.metadata.processOnInstall === true`) so the engine can seed/retire the
   * app's metadata (Integration/IntegrationObject/IntegrationObjectField + Actions) at
   * install/remove time. Left undefined for schema-backed apps, which don't process
   * metadata at install. Injected by the CLI to keep the engine decoupled from metadata-sync.
   */
  MetadataPusher?: MetadataPushFn;
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
 * 4.  Resolve the FULL transitive dependency graph (fetch every dependency's
 *     manifest, detect cross-repo cycles, topologically sort) — skipped when
 *     this call is itself a pre-resolved member of a parent's graph
 * 5.  Install dependencies in leaf-first order (each via _skipDependencyResolution)
 * 6.  Check schema (no collision)
 * 7.  Create schema
 * 8.  Run migrations (Skyway - DDL + metadata DML)
 * 9.  Record installation with 'Installing' status
 * 10. Update package.json files
 * 11. Run npm install
 * 12. Update server config (dynamicPackages in mj.config.cjs)
 * 13. Update angular.json prebundle excludes (prevents Vite singleton duplication)
 * 14. Update client imports (open-app-bootstrap.generated.ts)
 * 15. Execute hooks (postInstall)
 * 16. Finalize status to 'Active'
 */
export async function InstallApp(options: InstallOptions, context: OrchestratorContext): Promise<AppOperationResult> {
  const startTime = Date.now();
  const { Callbacks } = context;
  let createdAppId: string | undefined;
  let manifest: MJAppManifest | undefined;

  // In-repo subpath for multi-app repos. Explicit option wins; otherwise derive it
  // from the Source URL (e.g. `.../Integrations/CRM/HubSpot`). undefined = repo root.
  const subpath = options.Subpath ?? ParseGitHubUrl(options.Source)?.Subpath;

  try {
    // Step 1a: If an explicit version was requested, validate the tag exists on GitHub
    const explicitVersion = options.Version;
    if (explicitVersion) {
      Callbacks?.OnProgress?.('Fetch', `Validating version tag v${explicitVersion.replace(/^v/, '')} exists...`);
      const tagResult = await ValidateGitHubTag(options.Source, explicitVersion, context.GitHubOptions, subpath);
      if (!tagResult.Exists) {
        return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, tagResult.ErrorMessage ?? `Version ${explicitVersion} not found`);
      }
    }

    // Step 1b: Fetch manifest (from the app's subpath when this is a multi-app repo)
    Callbacks?.OnProgress?.('Fetch', `Fetching manifest from ${options.Source}...`);
    const fetchResult = await FetchManifestFromGitHub(options.Source, explicitVersion, context.GitHubOptions, subpath);
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

    // When an explicit version is requested, use that version for package pins
    // (not the manifest's version field, which may be a base version like "1.0.0").
    // Also switch to 'exact' version strategy so packages are pinned without ^ prefix.
    const effectivePackageVersion = explicitVersion ? explicitVersion.replace(/^v/, '') : manifest.version;
    const effectiveVersionStrategy: VersionStrategy | undefined = explicitVersion ? 'exact' : context.VersionStrategy;

    // Step 3: Validate MJ compatibility
    Callbacks?.OnProgress?.('Validate', 'Checking MJ version compatibility...');
    const compatResult = CheckMJVersionCompatibility(context.MJVersion, manifest.mjVersionRange);
    if (!compatResult.Compatible) {
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, compatResult.Message ?? 'Incompatible MJ version');
    }

    // Steps 4-5: Resolve the full transitive dependency graph and install members
    // in leaf-first order. Skipped when this call is itself a pre-resolved member
    // of a parent's graph (the parent already resolved and installed our deps).
    if (!options._skipDependencyResolution) {
      const depResult = await ResolveDependencyChain(manifest, context);
      if (!depResult.Success) {
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, depResult.ErrorMessage ?? 'Dependency resolution failed');
      }
      if (depResult.DepsToInstall && depResult.DepsToInstall.length > 0) {
        const depsResult = await InstallDependencies(depResult.DepsToInstall, context, {
          AllowDoubleUnderscoreSchema: options.AllowDoubleUnderscoreSchema,
          Verbose: options.Verbose,
        });
        if (!depsResult.Success) {
          return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, depsResult.ErrorMessage ?? 'Dependency installation failed');
        }
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
      const schemaResult = await HandleSchemaCreation(manifest, context, isReinstall, options.AllowDoubleUnderscoreSchema === true);
      if (!schemaResult.Success) {
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, schemaResult.ErrorMessage ?? 'Schema creation failed');
      }
      schemaCreated = !isReinstall; // Track if we created a new schema (for rollback)
    }

    // Step 8: Run migrations
    if (manifest.migrations && manifest.schema) {
      const migrationResult = await HandleMigrations(manifest, context, subpath);
      if (!migrationResult.Success) {
        await CompensateSchemaOnFailure(manifest, context, schemaCreated, options.AllowDoubleUnderscoreSchema === true, Callbacks);
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Migration', startTime, migrationResult.ErrorMessage ?? 'Migration failed');
      }
    }

    // Step 9: Record installation with 'Installing' status
    Callbacks?.OnProgress?.('Record', 'Recording app installation...');
    const recordResult = await RecordInstallationAtomically(context.ContextUser, manifest, Callbacks, undefined, subpath);
    if (!recordResult.Success) {
      await CompensateSchemaOnFailure(manifest, context, schemaCreated, options.AllowDoubleUnderscoreSchema === true, Callbacks);
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Record', startTime, recordResult.ErrorMessage ?? 'Failed to record installation');
    }
    createdAppId = recordResult.AppId;

    // ── PHASE 2: File operations (after all DB work succeeds) ────
    Callbacks?.OnProgress?.('Config', 'Updating configuration files...');

    // Steps 10-11: Packages
    const pkgResult = await HandlePackageInstallation(manifest, context, effectivePackageVersion, effectiveVersionStrategy);
    let npmInstallWarning: string | undefined;
    if (!pkgResult.Success) {
      if (pkgResult.PackageJsonUpdated) {
        // package.json was updated successfully but `npm install` failed (e.g., missing npm auth).
        // Continue with the rest of the install — the user can run `npm install` manually once
        // they fix their npm credentials.
        npmInstallWarning = pkgResult.ErrorMessage;
        Callbacks?.OnWarn?.('Packages', `npm install failed — package.json entries were added but dependencies were not resolved. Run 'npm install' manually after fixing npm auth.\n  Detail: ${pkgResult.ErrorMessage}`);
      } else {
        await SetAppStatus(context.ContextUser, createdAppId!, 'Error');
        await RecordFailureHistory(context.ContextUser, createdAppId!, 'Install', manifest, 'Packages', pkgResult.ErrorMessage ?? 'Package installation failed', startTime);
        return BuildFailureResult('Install', manifest.name, manifest.version, 'Packages', startTime, pkgResult.ErrorMessage ?? 'Package installation failed');
      }
    }

    // Step 12: Update server config
    const configResult = HandleServerConfig(manifest, context);
    if (!configResult.Success) {
      await SetAppStatus(context.ContextUser, createdAppId!, 'Error');
      await RecordFailureHistory(context.ContextUser, createdAppId!, 'Install', manifest, 'Config', configResult.ErrorMessage ?? 'Config update failed', startTime);
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Config', startTime, configResult.ErrorMessage ?? 'Config update failed');
    }

    // Step 12b: Connector-profile metadata push — seeds the app's Integration/IO/IOF
    // + Action rows. No-op unless manifest.metadata.processOnInstall is set.
    const metaResult = await HandleMetadataPush(manifest, context, subpath);
    if (!metaResult.Success) {
      await SetAppStatus(context.ContextUser, createdAppId!, 'Error');
      await RecordFailureHistory(context.ContextUser, createdAppId!, 'Install', manifest, 'Config', metaResult.ErrorMessage ?? 'Metadata push failed', startTime);
      return BuildFailureResult('Install', manifest.name, manifest.version, 'Config', startTime, metaResult.ErrorMessage ?? 'Metadata push failed');
    }

    // Step 13: Update angular.json prebundle excludes
    HandleAngularPrebundleExcludes(manifest, context);

    // Step 14: Flip status to Active BEFORE regenerating the client bootstrap,
    // so the regen reads the new status and emits enabled imports.
    Callbacks?.OnProgress?.('Record', 'Finalizing installation...');
    await SetAppStatus(context.ContextUser, createdAppId!, 'Active');

    // Step 15: Update client imports (reads current app status from DB)
    await HandleClientBootstrapRegeneration(context);

    // Step 16: Execute hooks
    if (manifest.hooks?.postInstall) {
      Callbacks?.OnProgress?.('Hooks', 'Running postInstall hook...');
      await ExecuteHook(manifest.hooks.postInstall, context.RepoRoot);
    }

    await RecordInstallHistoryEntry(context.ContextUser, createdAppId!, 'Install', manifest, {
      Success: true,
      DurationSeconds: GetDurationSeconds(startTime),
      StartedAt: new Date(startTime),
      EndedAt: new Date(),
      Summary: 'Initial installation',
    });

    Callbacks?.OnSuccess?.('Install', `Successfully installed ${manifest.name} v${manifest.version}`);

    const baseSummary = 'App installed successfully. Restart MJAPI and rebuild MJExplorer to activate.';
    const summary = npmInstallWarning
      ? `${baseSummary}\n\n⚠ npm install failed — package.json and config files were updated but dependencies were not installed. Log in to npm ('npm login') or configure your .npmrc, then run 'npm install' to complete the setup.`
      : baseSummary;

    return {
      Success: true,
      Action: 'Install',
      AppName: manifest.name,
      Version: manifest.version,
      DurationSeconds: GetDurationSeconds(startTime),
      Summary: summary,
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
  provider?: IMetadataProvider,
  subpath?: string,
): Promise<InternalResult> {
  const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
  const tg = await md.CreateTransactionGroup();

  try {
    // Queue OpenApp save with 'Installing' status
    const appId = await RecordAppInstallation(contextUser, manifest, callbacks, tg, 'Installing', provider, subpath);

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
  allowDoubleUnderscore: boolean,
  callbacks?: AppInstallCallbacks,
): Promise<void> {
  if (!schemaWasCreated || !manifest.schema) {
    return;
  }
  try {
    callbacks?.OnProgress?.('Rollback', `Rolling back: dropping schema '${manifest.schema.name}'...`);
    await DropAppSchema(manifest.schema.name, context.DatabaseProvider, { allowDoubleUnderscore });
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
    const explicitUpgradeVersion = options.Version;
    const targetVersion = explicitUpgradeVersion ?? (await GetLatestVersion(existingApp.RepositoryURL, context.GitHubOptions, existingApp.Subpath ?? undefined));
    if (!targetVersion) {
      return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, 'Could not determine target version');
    }

    // If an explicit version was requested, validate the tag exists on GitHub
    if (explicitUpgradeVersion) {
      const tagResult = await ValidateGitHubTag(existingApp.RepositoryURL, targetVersion, context.GitHubOptions, existingApp.Subpath ?? undefined);
      if (!tagResult.Exists) {
        return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, tagResult.ErrorMessage ?? `Version ${targetVersion} not found`);
      }
    }

    // Verify target is actually newer than installed version
    const upgradeCheck = IsValidUpgrade(previousVersion, targetVersion);
    if (!upgradeCheck.Compatible) {
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, upgradeCheck.Message ?? 'Invalid upgrade version');
    }
    if (upgradeCheck.AlreadyAtTarget) {
      return {
        Success: true,
        Action: 'Upgrade',
        AppName: options.AppName,
        Version: targetVersion,
        DurationSeconds: GetDurationSeconds(startTime),
        Summary: upgradeCheck.Message ?? `Already at version ${targetVersion}`,
      };
    }

    // Re-fetch from the same in-repo subpath the app was originally installed from
    // (null/undefined for root-manifest apps — fully backwards compatible).
    const subpath = existingApp.Subpath ?? undefined;

    Callbacks?.OnProgress?.('Fetch', `Fetching manifest for ${options.AppName} v${targetVersion}...`);
    const fetchResult = await FetchManifestFromGitHub(existingApp.RepositoryURL, targetVersion, context.GitHubOptions, subpath);
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
        const installResult = await InstallDependencies(depResult.DepsToInstall, context, {
          AllowDoubleUnderscoreSchema: options.AllowDoubleUnderscoreSchema,
          Verbose: options.Verbose,
        });
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
      const migrationResult = await HandleMigrations(manifest, context, subpath);
      if (!migrationResult.Success) {
        await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Migration', migrationResult.ErrorMessage ?? 'Migration failed', startTime, previousVersion);
        await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
        return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Migration', startTime, migrationResult.ErrorMessage ?? 'Migration failed');
      }
    }

    // Steps 5-6: Update packages
    // When upgrading to an explicit version, pin packages exactly; otherwise use default strategy
    const effectiveUpgradeVersion = explicitUpgradeVersion ? targetVersion.replace(/^v/, '') : manifest.version;
    const effectiveUpgradeStrategy: VersionStrategy | undefined = explicitUpgradeVersion ? 'exact' : context.VersionStrategy;
    const pkgResult = await HandlePackageInstallation(manifest, context, effectiveUpgradeVersion, effectiveUpgradeStrategy);
    let npmInstallWarning: string | undefined;
    if (!pkgResult.Success) {
      if (pkgResult.PackageJsonUpdated) {
        npmInstallWarning = pkgResult.ErrorMessage;
        Callbacks?.OnWarn?.('Packages', `npm install failed — package.json entries were updated but dependencies were not resolved. Run 'npm install' manually after fixing npm auth.\n  Detail: ${pkgResult.ErrorMessage}`);
      } else {
        await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Packages', pkgResult.ErrorMessage ?? 'Package update failed', startTime, previousVersion);
        await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
        return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Packages', startTime, pkgResult.ErrorMessage ?? 'Package update failed');
      }
    }

    // Step 7: Update server config if changed
    const configResult = HandleServerConfig(manifest, context);
    if (!configResult.Success) {
      await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Config', configResult.ErrorMessage ?? 'Config update failed', startTime, previousVersion);
      await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Config', startTime, configResult.ErrorMessage ?? 'Config update failed');
    }

    // Step 7b: Re-push connector-profile metadata (idempotent merge — adds new IO/IOF/Actions,
    // updates changed ones). No-op unless manifest.metadata.processOnInstall is set.
    const metaResult = await HandleMetadataPush(manifest, context, subpath);
    if (!metaResult.Success) {
      await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Config', metaResult.ErrorMessage ?? 'Metadata push failed', startTime, previousVersion);
      await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
      return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Config', startTime, metaResult.ErrorMessage ?? 'Metadata push failed');
    }

    // Step 8: Update angular.json prebundle excludes (handles new scopes in upgraded manifest)
    HandleAngularPrebundleExcludes(manifest, context);

    // Step 9: Update app record first (including Status: Active) so the
    // bootstrap regen below reads the final status from the DB.
    await UpdateAppRecord(context.ContextUser, existingApp.ID, {
      Version: manifest.version,
      ManifestJSON: JSON.stringify(manifest),
      Status: 'Active',
    });

    // Step 10: Regenerate client imports
    await HandleClientBootstrapRegeneration(context);

    // Step 11: Execute hooks
    if (manifest.hooks?.postUpgrade) {
      Callbacks?.OnProgress?.('Hooks', 'Running postUpgrade hook...');
      await ExecuteHook(manifest.hooks.postUpgrade, context.RepoRoot);
    }

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

    const baseSummary = `Upgraded from ${previousVersion} to ${manifest.version}. Restart MJAPI and rebuild MJExplorer.`;
    const summary = npmInstallWarning
      ? `${baseSummary}\n\n⚠ npm install failed — package.json and config files were updated but dependencies were not installed. Log in to npm ('npm login') or configure your .npmrc, then run 'npm install' to complete the setup.`
      : baseSummary;

    return {
      Success: true,
      Action: 'Upgrade',
      AppName: options.AppName,
      Version: manifest.version,
      DurationSeconds: GetDurationSeconds(startTime),
      Summary: summary,
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
    const manifest: MJAppManifest = JSON.parse(existingApp.ManifestJSON);
    removeManifest = manifest;
    if (manifest.hooks?.preRemove) {
      Callbacks?.OnProgress?.('Hooks', 'Running preRemove hook...');
      await ExecuteHook(manifest.hooks.preRemove, context.RepoRoot);
    } else if (manifest.metadata?.processOnInstall && !manifest.schema) {
      // Connector-profile app with no preRemove hook: its seeded metadata
      // (Integration / IntegrationObject / IntegrationObjectField / Actions) lives in
      // the shared __mj schema, so the schema-scoped cleanup below cannot reach it.
      // Surface this rather than silently orphaning the rows (known uninstall gap).
      Callbacks?.OnWarn?.(
        'Hooks',
        `App '${options.AppName}' seeded integration metadata at install but declares no preRemove hook — ` +
          `its Integration/IntegrationObject/IntegrationObjectField/Action rows are NOT auto-removed. ` +
          `Retire them via metadata deleteRecord (mj sync push --delete-db-only) if desired.`,
      );
    }

    // Steps 3-6: Remove config, client bootstrap, angular.json excludes, and package refs
    // (parallel where they write to different files)
    Callbacks?.OnProgress?.('Config', 'Removing config, client bootstrap, and package references...');

    // Collect other installed apps' manifests so we don't remove shared prebundle excludes
    const otherApps = (await ListInstalledApps(context.ContextUser))
      .filter(a => a.Name !== options.AppName && a.Status !== 'Removed');
    const otherManifests = otherApps.map(a => JSON.parse(a.ManifestJSON) as MJAppManifest);

    await Promise.all([
      Promise.resolve(RemoveServerDynamicPackages(context.RepoRoot, options.AppName)),
      Promise.resolve(manifest.schema ? RemoveEntityPackageMapping(context.RepoRoot, manifest.schema.name) : undefined),
      Promise.resolve(HandleAngularPrebundleExcludeRemoval(manifest, otherManifests, context)),
      HandleClientBootstrapRegeneration(context),
      Promise.resolve(
        RemoveAppPackages({
          RepoRoot: context.RepoRoot,
          ServerPackages: manifest.packages?.server ?? [],
          ClientPackages: manifest.packages?.client ?? [],
          SharedPackages: manifest.packages?.shared ?? [],
          Version: existingApp.Version,
          ServerPackagePath: context.ServerPackagePath,
          ClientPackagePath: context.ClientPackagePath,
          PackageManager: context.PackageManager,
          AdditionalTargets: context.AdditionalTargets,
        }),
      ),
    ]);

    // Package install must run after package.json changes are written
    Callbacks?.OnProgress?.('Packages', 'Running package install...');
    const installResult = RunPackageInstall(context.RepoRoot, options.Verbose, undefined, context.PackageManager);
    if (!installResult.Success) {
      Callbacks?.OnWarn?.('Packages', `Package install warning during removal: ${installResult.ErrorMessage}`);
    }

    // Step 6: Remove metadata (entity registrations, SchemaInfo, etc.)
    let metadataResult: { Success: boolean; ErrorMessage?: string } = { Success: true };
    if (existingApp.SchemaName) {
      Callbacks?.OnProgress?.('Metadata', `Removing entity metadata for schema '${existingApp.SchemaName}'...`);
      metadataResult = await RemoveAppEntityMetadata(existingApp.SchemaName, context.ContextUser, Callbacks);
    }

    // Step 7: Drop schema (unless --keep-data)
    let schemaDropError: string | undefined;
    if (!options.KeepData && existingApp.SchemaName) {
      Callbacks?.OnProgress?.('Schema', `Dropping schema '${existingApp.SchemaName}'...`);
      const dropResult = await DropAppSchema(existingApp.SchemaName, context.DatabaseProvider, {
        allowDoubleUnderscore: options.AllowDoubleUnderscoreSchema === true,
      });
      if (!dropResult.Success) {
        schemaDropError = dropResult.ErrorMessage;
        Callbacks?.OnError?.('Schema', `Failed to drop schema: ${dropResult.ErrorMessage}`);
      }
    }

    // If metadata removal or schema drop failed, the app is NOT cleanly removed — report it
    // as a failure (don't mark the app 'Removed') instead of silently claiming success.
    const removalErrors = [metadataResult.Success ? undefined : metadataResult.ErrorMessage, schemaDropError]
      .filter((e): e is string => !!e);
    if (removalErrors.length > 0) {
      const combined = removalErrors.join('; ');
      await RecordInstallHistoryEntry(context.ContextUser, existingApp.ID, 'Remove', manifest, {
        Success: false,
        DurationSeconds: GetDurationSeconds(startTime),
        StartedAt: new Date(startTime),
        EndedAt: new Date(),
        Summary: `Remove failed: ${combined}`,
      });
      await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
      return BuildFailureResult('Remove', options.AppName, existingApp.Version, 'Schema', startTime, combined);
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
  await SetAppStatus(context.ContextUser, app.ID, 'Disabled');
  await HandleClientBootstrapRegeneration(context);

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
  await SetAppStatus(context.ContextUser, app.ID, 'Active');
  await HandleClientBootstrapRegeneration(context);

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
  DepsToInstall?: Array<{ AppName: string; Repository: string; VersionRange: string; Subpath?: string }>;
  /** True when package.json was updated but npm install failed (e.g., auth issue) */
  PackageJsonUpdated?: boolean;
}

/**
 * Resolves the FULL transitive dependency graph for a manifest, returning any
 * uninstalled dependencies that need to be installed first, in leaf-first order.
 *
 * Unlike a single-level resolve, this fetches every reachable dependency's
 * manifest from its repository so the complete graph is known up front — which
 * is what makes genuine cross-repo cycle detection (A -> B -> A) possible before
 * any install work begins.
 */
async function ResolveDependencyChain(manifest: MJAppManifest, context: OrchestratorContext): Promise<InternalResult> {
  if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Dependencies', 'Resolving dependency graph...');

  const installedApps = await ListInstalledApps(context.ContextUser);
  const installedMap: InstalledAppMap = {};
  for (const app of installedApps) {
    installedMap[app.Name] = { Version: app.Version, Repository: app.RepositoryURL };
  }

  // Zod infers object variant fields as optional; DependencyValue requires them.
  // The runtime schema validates they're present, so this narrowing is safe.
  const dependencies = (manifest.dependencies ?? {}) as Record<string, DependencyValue>;
  const root: RootApp = {
    AppName: manifest.name,
    Repository: manifest.repository,
    Dependencies: dependencies,
  };

  const result = await ResolveDependencyGraph(root, installedMap, BuildManifestFetcher(context));
  if (!result.Success) {
    return { Success: false, ErrorMessage: result.ErrorMessage };
  }

  const depsToInstall = (result.InstallOrder ?? [])
    .filter((d) => !d.AlreadyInstalled)
    .map((d) => ({ AppName: d.AppName, Repository: d.Repository, VersionRange: d.VersionRange, Subpath: d.Subpath }));

  return { Success: true, DepsToInstall: depsToInstall };
}

/**
 * Builds a {@link ManifestFetcher} that retrieves and validates a dependency's
 * manifest from GitHub. Used by the graph builder to walk transitive deps.
 */
function BuildManifestFetcher(context: OrchestratorContext): ManifestFetcher {
  return async (repoUrl: string, subpath?: string) => {
    const fetched = await FetchManifestFromGitHub(repoUrl, undefined, context.GitHubOptions, subpath);
    if (!fetched.Success || !fetched.ManifestJSON) {
      return { Success: false, ErrorMessage: fetched.ErrorMessage ?? 'Failed to fetch manifest' };
    }
    const parsed = ParseAndValidateManifest(fetched.ManifestJSON);
    if (!parsed.Success || !parsed.Manifest) {
      return { Success: false, ErrorMessage: `Invalid manifest: ${parsed.Errors?.join(', ')}` };
    }
    return {
      Success: true,
      Manifest: {
        name: parsed.Manifest.name,
        repository: parsed.Manifest.repository,
        dependencies: (parsed.Manifest.dependencies ?? {}) as Record<string, DependencyValue>,
      },
    };
  };
}

/**
 * Installs the resolved dependencies sequentially in the leaf-first order
 * produced by the graph resolution. Each dependency is installed via
 * {@link InstallApp} with `_skipDependencyResolution` set — its own transitive
 * dependencies appear earlier in the order and are therefore already installed,
 * so re-resolving here would be redundant (and, for any cycle that slipped the
 * up-front check, unbounded).
 *
 * Inherited options that affect install BEHAVIOR (verbosity, the schema-name
 * override) are forwarded from the parent so a flag set on the top-level call
 * also governs the dependency installs. App-identity options (Source, Version)
 * are NOT forwarded — each dependency has its own source and installs its own
 * latest release rather than inheriting the parent's pin. The forwarded set is
 * explicit so new flags require a deliberate decision about whether they apply
 * to dependencies.
 */
async function InstallDependencies(
  deps: Array<{ AppName: string; Repository: string; VersionRange: string; Subpath?: string }>,
  context: OrchestratorContext,
  inherited: PassthroughInstallOptions,
): Promise<InternalResult> {
  for (const dep of deps) {
    if (!dep.Repository) {
      return {
        Success: false,
        ErrorMessage: `Dependency '${dep.AppName}' is not installed and no repository URL was provided in the manifest. Use the object form: { "version": "${dep.VersionRange}", "repository": "https://github.com/..." }`,
      };
    }
    context.Callbacks?.OnProgress?.('Dependencies', `Installing dependency from ${dep.Repository}...`);
    // NOTE (known limitation, tracked in #2713): we install from the dependency's
    // repository with no Version, so it resolves to whatever its default-branch
    // manifest reports — `dep.VersionRange` is NOT enforced for fresh installs.
    // Declared ranges are only checked against ALREADY-installed deps (see
    // ProcessEdge in dependency-graph-builder.ts). So a `>=1.0 <2.0` requirement
    // can silently install 3.0 if that's the latest. Pre-existing behavior, not a
    // regression; range-gated fresh installs are deferred follow-on work.
    const result = await InstallApp(
      {
        Source: dep.Repository,
        Subpath: dep.Subpath,
        _skipDependencyResolution: true,
        AllowDoubleUnderscoreSchema: inherited.AllowDoubleUnderscoreSchema,
        Verbose: inherited.Verbose,
      },
      context,
    );
    if (!result.Success) {
      return { Success: false, ErrorMessage: `Failed to install dependency: ${result.ErrorMessage}` };
    }
  }
  return { Success: true };
}

/**
 * Connector-profile metadata stage: downloads the app's `metadata/` subtree and runs a
 * scoped `mj sync push` over it via the host-injected pusher. This seeds a schema-less
 * connector app's Integration/IntegrationObject/IntegrationObjectField + Action rows at
 * install time (and re-pushes them, idempotently, on upgrade). No-op unless the manifest
 * opts in with `metadata.processOnInstall`. The mj-sync push is transactional (full
 * rollback on error), so a failed push leaves no partial metadata behind.
 */
async function HandleMetadataPush(manifest: MJAppManifest, context: OrchestratorContext, subpath?: string): Promise<InternalResult> {
  if (!manifest.metadata?.processOnInstall) {
    return { Success: true };
  }
  if (!context.MetadataPusher) {
    return {
      Success: false,
      ErrorMessage: `App '${manifest.name}' requires install-time metadata processing (metadata.processOnInstall) but the host did not provide a MetadataPusher.`,
    };
  }

  context.Callbacks?.OnProgress?.('Config', 'Downloading app metadata...');
  const tempDir = join(tmpdir(), `mj-app-${manifest.name}-meta-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const dirName = manifest.metadata.directory ?? 'metadata';
  const download = await DownloadDirectory(manifest.repository, manifest.version, dirName, tempDir, context.GitHubOptions, subpath);
  if (!download.Success) {
    return { Success: false, ErrorMessage: `Failed to download metadata: ${download.ErrorMessage}` };
  }
  if (!download.Files || download.Files.length === 0) {
    context.Callbacks?.OnWarn?.('Config', `No metadata files found in '${dirName}' — nothing to push.`);
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Config', `Pushing ${download.Files.length} metadata file(s)...`);
  const push = await context.MetadataPusher({ dir: tempDir, verbose: context.Callbacks != null });
  if (!push.Success) {
    return { Success: false, ErrorMessage: `Metadata push failed: ${push.ErrorMessage ?? 'unknown error'}` };
  }

  context.Callbacks?.OnSuccess?.(
    'Config',
    `Metadata pushed (${push.Created ?? 0} created, ${push.Updated ?? 0} updated).`,
  );
  return { Success: true };
}

/**
 * Handles schema creation for an app, including collision checks and reinstall reuse.
 */
async function HandleSchemaCreation(manifest: MJAppManifest, context: OrchestratorContext, isReinstall: boolean = false, allowDoubleUnderscore: boolean = false): Promise<InternalResult> {
  if (!manifest.schema) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Schema', `Checking schema '${manifest.schema.name}'...`);
  const exists = await SchemaExists(manifest.schema.name, context.DatabaseProvider);

  if (exists) {
    if (isReinstall || manifest.schema.createIfNotExists !== false) {
      // Schema already exists — either a reinstall (previously removed app),
      // or createIfNotExists is set (the app expects to adopt an existing schema).
      // Reuse it and let Skyway apply only new migrations.
      context.Callbacks?.OnProgress?.('Schema', `Reusing existing schema '${manifest.schema.name}'`);
      return { Success: true };
    }
    return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' already exists` };
  }

  if (manifest.schema.createIfNotExists !== false) {
    context.Callbacks?.OnProgress?.('Schema', `Creating schema '${manifest.schema.name}'...`);
    const result = await CreateAppSchema(manifest.schema.name, context.DatabaseProvider, { allowDoubleUnderscore });
    return { Success: result.Success, ErrorMessage: result.ErrorMessage };
  }

  return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' does not exist and createIfNotExists is false` };
}

/**
 * Downloads and runs Skyway migrations for an app's schema.
 */
async function HandleMigrations(manifest: MJAppManifest, context: OrchestratorContext, subpath?: string): Promise<InternalResult> {
  if (!manifest.schema || !manifest.migrations) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Migration', 'Downloading migration files...');
  const tempDir = join(tmpdir(), `mj-app-${manifest.name}-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const downloadResult = await DownloadMigrations(manifest.repository, manifest.version, manifest.migrations.directory, tempDir, context.GitHubOptions, subpath);

  if (!downloadResult.Success) {
    return { Success: false, ErrorMessage: downloadResult.ErrorMessage };
  }

  context.Callbacks?.OnProgress?.('Migration', `Running ${downloadResult.Files?.length ?? 0} migration(s)...`);

  const migrationResult = await RunAppMigrations({
    MigrationsDir: tempDir,
    SchemaName: manifest.schema.name,
    DatabaseConfig: context.DatabaseConfig,
    MJCoreSchema: context.MJCoreSchema,
    ExtraPlaceholders: context.MigrationPlaceholders,
    // Select the Skyway provider matching the live DB platform.
    Platform: context.DatabaseProvider.Dialect.PlatformKey,
  });

  return { Success: migrationResult.Success, ErrorMessage: migrationResult.ErrorMessage };
}

/**
 * Adds app npm packages to the appropriate workspace package.json files and runs npm install.
 *
 * @param packageVersion - The version string to write (may differ from manifest.version when an explicit version is requested)
 * @param versionStrategy - Override for version strategy (e.g., 'exact' when explicit version is requested)
 */
async function HandlePackageInstallation(
  manifest: MJAppManifest,
  context: OrchestratorContext,
  packageVersion?: string,
  versionStrategy?: VersionStrategy,
): Promise<InternalResult> {
  if (!manifest.packages) {
    return { Success: true };
  }

  context.Callbacks?.OnProgress?.('Packages', 'Adding packages...');
  const addResult = AddAppPackages({
    RepoRoot: context.RepoRoot,
    ServerPackages: manifest.packages.server ?? [],
    ClientPackages: manifest.packages.client ?? [],
    SharedPackages: manifest.packages.shared ?? [],
    Version: packageVersion ?? manifest.version,
    ServerPackagePath: context.ServerPackagePath,
    ClientPackagePath: context.ClientPackagePath,
    PackageManager: context.PackageManager,
    VersionStrategy: versionStrategy ?? context.VersionStrategy,
    AdditionalTargets: context.AdditionalTargets,
  });

  if (!addResult.Success) {
    return { Success: false, ErrorMessage: addResult.ErrorMessage };
  }

  // If the manifest declares a package prefix, bump ALL matching dependencies
  // across the workspace (not just the manifest-declared ones). This handles
  // consumer-added packages like bcsaas-settings, bcsaas-credentials, etc.
  const prefix = manifest.packages.prefix;
  if (prefix) {
    const bareVersion = packageVersion ?? manifest.version;
    const updatedCount = BumpPrefixedDependencies(context.RepoRoot, prefix, bareVersion);
    if (updatedCount > 0) {
      context.Callbacks?.OnProgress?.('Packages', `Bumped ${updatedCount} workspace package.json file(s) with prefix '${prefix}' to ${bareVersion}`);
    }
  }

  context.Callbacks?.OnProgress?.('Packages', 'Running package install...');
  const installResult = RunPackageInstall(context.RepoRoot, undefined, manifest.packages.registry, context.PackageManager);
  if (!installResult.Success) {
    return { Success: false, PackageJsonUpdated: true, ErrorMessage: installResult.ErrorMessage };
  }
  return { Success: true };
}

/**
 * Adds server dynamic package entries and entity package mapping to mj.config.cjs for the app.
 */
function HandleServerConfig(manifest: MJAppManifest, context: OrchestratorContext): InternalResult {
  context.Callbacks?.OnProgress?.('Config', 'Updating server config...');

  const dynamicResult = AddServerDynamicPackages(context.RepoRoot, manifest);
  if (!dynamicResult.Success) {
    return { Success: false, ErrorMessage: dynamicResult.ErrorMessage };
  }

  // Add entityPackageName mapping so CodeGen resolves per-schema imports correctly
  const entityResult = AddEntityPackageMapping(context.RepoRoot, manifest);
  if (!entityResult.Success) {
    return { Success: false, ErrorMessage: entityResult.ErrorMessage };
  }

  return { Success: true };
}

/**
 * Adds the app's npm scope(s) to angular.json's prebundle.exclude so Vite
 * serves them as raw ES modules instead of inlining them into prebundled chunks.
 * This prevents duplicate Angular DI singletons caused by module duplication.
 *
 * Non-fatal: if angular.json doesn't exist or the update fails, a warning is
 * emitted but the install/upgrade continues — the app will still work in
 * production builds, just the dev server may have the singleton bug.
 */
function HandleAngularPrebundleExcludes(manifest: MJAppManifest, context: OrchestratorContext): void {
  const manager = new AngularConfigManager(context.RepoRoot, context.ClientPackagePath);
  if (!manager.Load()) {
    return; // angular.json not found — not an error, skip silently
  }

  manager.AddPrebundleExcludes(manifest);

  const result = manager.Save();
  if (!result.Success) {
    context.Callbacks?.OnWarn?.(
      'Config',
      `Failed to update angular.json prebundle excludes: ${result.ErrorMessage}. ` +
      `You may need to manually add the app's npm scope to prebundle.exclude in angular.json.`
    );
  } else if (result.Changes && result.Changes.length > 0) {
    context.Callbacks?.OnProgress?.('Config', `Updated angular.json: ${result.Changes.join('; ')}`);
  }
}

/**
 * Removes an app's prebundle exclude patterns from angular.json during app removal.
 * Only removes patterns not still needed by other installed apps.
 */
function HandleAngularPrebundleExcludeRemoval(
  manifest: MJAppManifest,
  otherManifests: MJAppManifest[],
  context: OrchestratorContext,
): void {
  const manager = new AngularConfigManager(context.RepoRoot, context.ClientPackagePath);
  if (!manager.Load()) return;

  manager.RemovePrebundleExcludes(manifest, otherManifests);
  manager.Save();
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
    const manifest: MJAppManifest = JSON.parse(app.ManifestJSON);
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
    const manifest: MJAppManifest = JSON.parse(app.ManifestJSON);
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

  RegenerateClientBootstrap(context.RepoRoot, entries, context.ClientPackagePath, context.ClientBootstrapSubpath);
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
async function RemoveAppEntityMetadata(schemaName: string, contextUser: UserInfo, callbacks?: AppInstallCallbacks): Promise<{ Success: boolean; ErrorMessage?: string }> {
  try {
    const rv = new RunView();
    const escaped = EscapeSqlString(schemaName);

    // Helper: delete by filter and throw on any failure so the outer catch reports it
    // (MJ metadata FKs are NO ACTION, not CASCADE, so dependents must be removed in order).
    const deleteByFilterOrThrow = async (entityName: string, filter: string): Promise<void> => {
      const r = await DeleteEntitiesByFilter(rv, contextUser, entityName, filter);
      if (!r.Success) {
        throw new Error(r.ErrorMessage ?? `Failed to delete ${entityName} records`);
      }
    };

    // First, find all entity IDs in this schema so we can clean FK-dependent records.
    const entityResult = await rv.RunView<BaseEntity>(
      {
        EntityName: 'MJ: Entities',
        ExtraFilter: `SchemaName = '${escaped}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!entityResult.Success) {
      throw new Error(`Failed to query entities for schema '${schemaName}': ${entityResult.ErrorMessage}`);
    }

    if (entityResult.Results.length === 0) {
      // No entities found — just clean up SchemaInfo
      await deleteByFilterOrThrow('MJ: Schema Info', `SchemaName = '${escaped}'`);
      callbacks?.OnSuccess?.('Metadata', `Entity metadata for schema '${schemaName}' removed`);
      return { Success: true };
    }

    const entityIds = entityResult.Results.map((e) => String(e.Get('ID')));
    const idList = entityIds.map((id) => `'${EscapeSqlString(id)}'`).join(',');

    // Entity Field Values (FK on EntityFieldID) must go before the Entity Fields they
    // reference — collect this schema's field IDs first.
    const fieldResult = await rv.RunView<BaseEntity>(
      {
        EntityName: 'MJ: Entity Fields',
        ExtraFilter: `EntityID IN (${idList})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!fieldResult.Success) {
      throw new Error(`Failed to query entity fields for schema '${schemaName}': ${fieldResult.ErrorMessage}`);
    }
    const fieldIdList = fieldResult.Results.map((f) => `'${EscapeSqlString(String(f.Get('ID')))}'`).join(',');

    // Delete FK-dependent records in dependency order.
    if (fieldIdList.length > 0) {
      await deleteByFilterOrThrow('MJ: Entity Field Values', `EntityFieldID IN (${fieldIdList})`);
    }
    await deleteByFilterOrThrow('MJ: Entity Permissions', `EntityID IN (${idList})`);
    await deleteByFilterOrThrow('MJ: Application Entities', `EntityID IN (${idList})`);
    await deleteByFilterOrThrow('MJ: Entity Settings', `EntityID IN (${idList})`);
    // Entity Relationships reference EntityID on both sides
    await deleteByFilterOrThrow('MJ: Entity Relationships', `EntityID IN (${idList}) OR RelatedEntityID IN (${idList})`);
    // Entity Fields (FK on EntityID)
    await deleteByFilterOrThrow('MJ: Entity Fields', `EntityID IN (${idList})`);

    // Delete Entities themselves
    for (const entity of entityResult.Results) {
      if (!(await entity.Delete())) {
        throw new Error(`Failed to delete entity '${String(entity.Get('Name'))}': ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    }

    // Delete SchemaInfo last
    await deleteByFilterOrThrow('MJ: Schema Info', `SchemaName = '${escaped}'`);

    callbacks?.OnSuccess?.('Metadata', `Entity metadata for schema '${schemaName}' removed`);
    return { Success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    callbacks?.OnError?.('Metadata', `Failed to remove entity metadata: ${message}`);
    return { Success: false, ErrorMessage: `Failed to remove entity metadata for schema '${schemaName}': ${message}` };
  }
}

/**
 * Helper: loads entities by filter and deletes them one by one.
 */
async function DeleteEntitiesByFilter(rv: RunView, contextUser: UserInfo, entityName: string, filter: string): Promise<{ Success: boolean; ErrorMessage?: string }> {
  const result = await rv.RunView<BaseEntity>(
    {
      EntityName: entityName,
      ExtraFilter: filter,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!result.Success) {
    return { Success: false, ErrorMessage: `Failed to query ${entityName}: ${result.ErrorMessage}` };
  }
  for (const record of result.Results) {
    if (!(await record.Delete())) {
      return { Success: false, ErrorMessage: `Failed to delete a ${entityName} record: ${record.LatestResult?.CompleteMessage ?? 'unknown error'}` };
    }
  }
  return { Success: true };
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
