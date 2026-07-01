/**
 * Install orchestrator for MJ Open Apps.
 *
 * Sequences the install flow, upgrade flow, and remove flow.
 * Each step is delegated to a specialized handler.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import type { AppInstallCallbacks, InstallOptions, UpgradeOptions, RemoveOptions, AppOperationResult, ErrorPhase, PassthroughInstallOptions } from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import { ParseAndValidateManifest } from '../manifest/manifest-loader.js';
import { CheckMJVersionCompatibility, IsValidUpgrade } from '../dependency/version-checker.js';
import { ResolveDependencyGraph } from '../dependency/dependency-graph-builder.js';
import type { ManifestFetcher, RootApp } from '../dependency/dependency-graph-builder.js';
import type { InstalledAppMap, DependencyValue } from '../dependency/dependency-resolver.js';
import { FetchManifestFromGitHub, DownloadMigrations, GetLatestVersion, ListGitHubReleases, ListGitHubTags, ValidateGitHubTag, ParseGitHubUrl, type GitHubClientOptions, type MigrationDownloadResult } from '../github/github-client.js';
import semver from 'semver';
import { CreateAppSchema, DropAppSchema, SchemaExists, EscapeSqlString } from './schema-manager.js';
import { RunAppMigrations, type SkywayDatabaseConfig } from './migration-runner.js';
import { AddAppPackages, RemoveAppPackages, RunPackageInstall, BumpPrefixedDependencies, type PackageManagerType, type VersionStrategy, type WorkspaceTarget } from './package-manager.js';
import { AddServerDynamicPackages, AddClientDynamicPackages, RemoveServerDynamicPackages, ToggleServerDynamicPackages, AddEntityPackageMapping, RemoveEntityPackageMapping } from './config-manager.js';
import { AngularConfigManager } from './angular-config-manager.js';
import { BaseEntity, DatabaseProviderBase, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, TransactionGroupBase } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type { MJEntityEntity, MJEntityFieldEntity, MJApplicationEntity } from '@memberjunction/core-entities';
import {
  RecordAppInstallation,
  RecordInstallHistoryEntry,
  RecordAppDependencies,
  ReplaceAppDependenciesAtomically,
  SetAppStatus,
  FindInstalledApp,
  CheckSchemaSharedByOtherApps,
  type SchemaShareCheck,
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
  /** MJ core schema name. Used to resolve `${mjSchema}` placeholder in app migrations. Defaults to '__mj'. */
  MJCoreSchema?: string;
  /** Extra user placeholders merged into the Skyway Placeholders map for migration SQL substitution. */
  MigrationPlaceholders?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the full install flow for an Open App.
 *
 * Every capability block is optional and additive: an app may extend MJ via a schema,
 * metadata, packages, any combination, or be manifest-only. Each step below is gated on
 * its block being present, so a manifest-only app simply records itself and finishes. The
 * persisted `MJ: Open Apps.ManifestJSON` is the source of truth re-read by upgrade/remove.
 *
 * Steps (each no-ops when its block is absent):
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
 * 12. Update server + client config (dynamicPackages.server/.client in mj.config.cjs;
 *     client imports are materialized into MJExplorer's manifest at its next prebuild)
 * 13. Update angular.json prebundle excludes (prevents Vite singleton duplication)
 * 14. Execute hooks (postInstall)
 * 15. Finalize status to 'Active'
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
    // Reinstallable = a previously 'Removed' app, OR a half-installed 'Error' app (a
    // failed prior install left it Error; `mj app upgrade` won't recover it, so a
    // reinstall must be allowed instead of dead-ending the user) — B17.
    const isReinstall = existingApp != null && (existingApp.Status === 'Removed' || existingApp.Status === 'Error');
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
      // Roll back only a schema WE actually created this run (not a reused/adopted one).
      // Pre-fix this used `!isReinstall`, leaking a freshly-created schema when a removed
      // app's schema had been dropped and was recreated on reinstall (B18).
      schemaCreated = schemaResult.Created === true;

      // Persist the case-stable canonical schema name so entity ClassName/CodeName and
      // GraphQL type names keep their PascalCase prefix on PostgreSQL (where the physical
      // schema is folded to lowercase). Idempotent UPDATE keyed on the physical name —
      // a no-op until the SchemaInfo row exists (created out-of-band by CodeGen's
      // spUpdateSchemaInfoFromDatabase), which then backfills the value catalog-only.
      // Best-effort: a failure here must not fail the install (the canonical name is a
      // codegen-time naming concern, recoverable on the next codegen pass).
      await PersistCanonicalSchemaName(manifest, context);
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
    const pkgResult = await HandlePackageInstallation(manifest, context, effectivePackageVersion, effectiveVersionStrategy, options.Verbose);
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

    // Step 13: Update angular.json prebundle excludes
    HandleAngularPrebundleExcludes(manifest, context);

    // Step 14: Finalize status. If `npm install` failed (deps unresolved), finalize as
    // 'Disabled' rather than 'Active' — otherwise the app is advertised as healthy while
    // its packages can't be imported. When Disabled, also flip the app's dynamicPackages
    // entries to Enabled:false so `mj codegen manifest --open-app-client-bootstrap` emits
    // commented-out client imports (a static import of an uninstalled package would break
    // the MJExplorer build) and the server loader skips it until `mj app enable` (B15).
    Callbacks?.OnProgress?.('Record', 'Finalizing installation...');
    const finalStatus = npmInstallWarning ? 'Disabled' : 'Active';
    await SetAppStatus(context.ContextUser, createdAppId!, finalStatus);
    if (finalStatus !== 'Active') {
      // Array-agnostic by AppName — sweeps both the server and client arrays.
      ToggleServerDynamicPackages(context.RepoRoot, manifest.name, false);
    }

    // Step 16: Execute hooks
    if (manifest.hooks?.postInstall) {
      Callbacks?.OnProgress?.('Hooks', 'Running postInstall hook...');
      await ExecuteHook(manifest.hooks.postInstall, context.RepoRoot);
    }

    // The install is complete (status is already 'Active'). The history entry is an
    // audit record — a failure to write it must NOT throw into the outer catch and
    // downgrade a fully-successful install to 'Error' (B31). Best-effort only.
    try {
      await RecordInstallHistoryEntry(context.ContextUser, createdAppId!, 'Install', manifest, {
        Success: true,
        DurationSeconds: GetDurationSeconds(startTime),
        StartedAt: new Date(startTime),
        EndedAt: new Date(),
        Summary: 'Initial installation',
      });
    } catch (histErr: unknown) {
      Callbacks?.OnWarn?.('Record', `App installed, but the history audit entry could not be written: ${histErr instanceof Error ? histErr.message : String(histErr)}`);
    }

    Callbacks?.OnSuccess?.('Install', `Successfully installed ${manifest.name} v${manifest.version}`);

    // The summary must reflect what's actually left to do, or 'Active' overstates readiness.
    // A schema-bearing app ships only its tables + migrations; the entity *metadata*
    // (MJ: Entities rows) and generated entity classes are materialized out-of-band by the
    // host's CodeGen run. Until CodeGen runs, the app's entities aren't queryable — so the
    // generic "restart + rebuild" guidance omits the one step that brings the app to life.
    // Tell the operator to run CodeGen FIRST for schema apps (B16).
    let summary: string;
    if (npmInstallWarning) {
      summary = `App installed but left DISABLED — npm install failed, so its packages are not resolved. package.json and config were updated; log in to npm ('npm login') or fix your .npmrc, run 'npm install', then 'mj app enable ${manifest.name}'.`;
    } else if (manifest.schema) {
      summary = `App installed. Its schema and tables exist, but entity metadata is generated by CodeGen — run 'mj codegen', then restart MJAPI and rebuild MJExplorer to activate.`;
    } else {
      summary = 'App installed successfully. Restart MJAPI and rebuild MJExplorer to activate.';
    }

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
        // OpenApp migrations are forward-only — there is no automatic down/rollback, so the
        // schema may be partially upgraded. Skyway records each applied migration in the app
        // schema's history table, so the upgrade IS recoverable: fix the cause and re-run
        // `mj app upgrade`, which resumes from the last successful migration (the app's Version
        // is not advanced on failure, so the upgrade still validates). State this honestly
        // instead of leaving a bare "Migration failed" that reads as unrecoverable (B21).
        const detail = migrationResult.ErrorMessage ?? 'Migration failed';
        const recoverable =
          `${detail}\n\nThe schema may be partially upgraded (migrations are forward-only; there is no ` +
          `automatic rollback). Skyway tracks applied migrations, so once the cause is fixed, re-run ` +
          `'mj app upgrade ${options.AppName}' to resume from the last successful migration. If the schema ` +
          `is left inconsistent, restore it from a backup taken before the upgrade.`;
        await RecordFailureHistory(context.ContextUser, existingApp.ID, 'Upgrade', manifest, 'Migration', recoverable, startTime, previousVersion);
        await SetAppStatus(context.ContextUser, existingApp.ID, 'Error');
        return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Migration', startTime, recoverable);
      }
    }

    // Steps 5-6: Update packages
    // When upgrading to an explicit version, pin packages exactly; otherwise use default strategy
    const effectiveUpgradeVersion = explicitUpgradeVersion ? targetVersion.replace(/^v/, '') : manifest.version;
    const effectiveUpgradeStrategy: VersionStrategy | undefined = explicitUpgradeVersion ? 'exact' : context.VersionStrategy;
    const pkgResult = await HandlePackageInstallation(manifest, context, effectiveUpgradeVersion, effectiveUpgradeStrategy, options.Verbose);
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

    // Step 8: Update angular.json prebundle excludes (handles new scopes in upgraded manifest)
    HandleAngularPrebundleExcludes(manifest, context);

    // Step 9: Update app record first (including Status: Active) so the
    // bootstrap regen below reads the final status from the DB.
    await UpdateAppRecord(context.ContextUser, existingApp.ID, {
      Version: manifest.version,
      ManifestJSON: JSON.stringify(manifest),
      Status: 'Active',
    });

    // Step 11: Execute hooks
    if (manifest.hooks?.postUpgrade) {
      Callbacks?.OnProgress?.('Hooks', 'Running postUpgrade hook...');
      await ExecuteHook(manifest.hooks.postUpgrade, context.RepoRoot);
    }

    // Update dependency records to reflect new manifest. Delete + re-add atomically so a
    // crash mid-rewrite can't leave the app with zero dependency rows (B23). The upgrade
    // itself is already complete (status Active) at this point, so a failure to update the
    // dependency-tracking rows is a warning, not an upgrade failure.
    if (manifest.dependencies) {
      const depsReplaced = await ReplaceAppDependenciesAtomically(context.ContextUser, existingApp.ID, manifest.dependencies);
      if (!depsReplaced) {
        Callbacks?.OnWarn?.('Record', 'App upgraded, but its dependency records could not be updated atomically — re-run the upgrade to refresh them.');
      }
    }

    // Best-effort audit write — the upgrade is already complete (status Active); a failure to
    // write the history entry must NOT throw into the outer catch and downgrade a successful
    // upgrade to 'Error' (B31, parity with the Install path).
    try {
      await RecordInstallHistoryEntry(context.ContextUser, existingApp.ID, 'Upgrade', manifest, {
        PreviousVersion: previousVersion,
        Success: true,
        DurationSeconds: GetDurationSeconds(startTime),
        StartedAt: new Date(startTime),
        EndedAt: new Date(),
        Summary: `Upgraded from ${previousVersion} to ${manifest.version}`,
      });
    } catch (histErr: unknown) {
      Callbacks?.OnWarn?.('Record', `App upgraded, but the history audit entry could not be written: ${histErr instanceof Error ? histErr.message : String(histErr)}`);
    }

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
 * Executes the remove flow for an installed Open App, inverting whatever the install added.
 *
 * Symmetric teardown by form: a schema-backed app's schema is dropped; package/config/bootstrap
 * references are removed in every case. The persisted `ManifestJSON` (the source of truth)
 * decides which teardown steps apply.
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
    }

    // Step 3: Database cleanup FIRST — metadata + schema (the hard-to-undo, failure-prone
    // part). Doing it BEFORE any filesystem mutation means a DB failure aborts with the
    // config / package.json / client bootstrap still intact, instead of leaving a
    // half-removed app whose files are stripped but whose schema/metadata remain (B20).
    // Skipped entirely when another app shares the schema (B14).
    const shareCheck: SchemaShareCheck = existingApp.SchemaName
      ? await CheckSchemaSharedByOtherApps(context.ContextUser, existingApp.SchemaName, existingApp.ID)
      : { Shared: false, CheckFailed: false };
    const schemaShared = shareCheck.Shared;
    // An INDETERMINATE share-check (the query failed) is not a license to skip-and-strip — that
    // would leave a half-removed app (files gone, schema + metadata intact, status Removed). Treat
    // it like a removal error and abort BEFORE touching the filesystem (joined into removalErrors
    // below). B14/B20.
    const shareCheckError = shareCheck.CheckFailed
      ? `Could not determine whether schema '${existingApp.SchemaName}' is shared by other Open Apps (share-check query failed): ${shareCheck.ErrorMessage ?? 'unknown error'}`
      : undefined;
    if (schemaShared && !shareCheck.CheckFailed) {
      Callbacks?.OnWarn?.('Schema', `Schema '${existingApp.SchemaName}' is still used by another installed Open App — skipping metadata + schema removal to protect co-tenant data.`);
    }

    let metadataResult: { Success: boolean; ErrorMessage?: string } = { Success: true };
    if (existingApp.SchemaName && !schemaShared) {
      Callbacks?.OnProgress?.('Metadata', `Removing entity metadata for schema '${existingApp.SchemaName}'...`);
      metadataResult = await RemoveAppEntityMetadata(existingApp.SchemaName, context.ContextUser, Callbacks);
    }

    // Teardown — retire the rows this app's seed migrations wrote into the SHARED core schema
    // (Integration/IO/IOF/Action rows in __mj); dropping the app's own schema cannot reach them.
    // Data removal, so gated on !KeepData. No-op unless the manifest declares migrations.teardownDirectory.
    let teardownResult: InternalResult = { Success: true };
    if (!options.KeepData) {
      teardownResult = await HandleTeardown(manifest, context, existingApp.Subpath ?? undefined);
      if (!teardownResult.Success) {
        Callbacks?.OnError?.('Metadata', `Teardown failed: ${teardownResult.ErrorMessage}`);
      }
    }

    let schemaDropError: string | undefined;
    if (!options.KeepData && existingApp.SchemaName && !schemaShared) {
      Callbacks?.OnProgress?.('Schema', `Dropping schema '${existingApp.SchemaName}'...`);
      const dropResult = await DropAppSchema(existingApp.SchemaName, context.DatabaseProvider, {
        allowDoubleUnderscore: options.AllowDoubleUnderscoreSchema === true,
      });
      if (!dropResult.Success) {
        schemaDropError = dropResult.ErrorMessage;
        Callbacks?.OnError?.('Schema', `Failed to drop schema: ${dropResult.ErrorMessage}`);
      }
    }

    // Abort BEFORE touching the filesystem if DB cleanup failed — the app stays installed
    // (status Error) with its files intact, so it can be retried/removed again cleanly.
    const removalErrors = [
      shareCheckError,
      teardownResult.Success ? undefined : teardownResult.ErrorMessage,
      metadataResult.Success ? undefined : metadataResult.ErrorMessage,
      schemaDropError,
    ].filter((e): e is string => !!e);
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

    // Steps 4-7: Remove config, client bootstrap, angular.json excludes, and package refs
    // (parallel where they write to different files) — only AFTER DB cleanup succeeded.
    Callbacks?.OnProgress?.('Config', 'Removing config, client bootstrap, and package references...');

    // Collect other installed apps' manifests so we don't remove shared prebundle excludes
    const otherApps = (await ListInstalledApps(context.ContextUser))
      .filter(a => a.Name !== options.AppName && a.Status !== 'Removed');
    // Skip a corrupt OTHER-app manifest — it must not break THIS app's removal (B24).
    const otherManifests = otherApps.flatMap(a => {
      try {
        return [JSON.parse(a.ManifestJSON) as MJAppManifest];
      } catch {
        Callbacks?.OnWarn?.('Config', `Ignoring app '${a.Name}' when computing shared excludes — its ManifestJSON could not be parsed.`);
        return [];
      }
    });

    await Promise.all([
      Promise.resolve(RemoveServerDynamicPackages(context.RepoRoot, options.AppName)),
      Promise.resolve(manifest.schema ? RemoveEntityPackageMapping(context.RepoRoot, manifest.schema.name) : undefined),
      Promise.resolve(HandleAngularPrebundleExcludeRemoval(manifest, otherManifests, context)),
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

    // Step 8: Update records.
    // Best-effort audit write — DB cleanup + file removal already succeeded; a failure to write
    // the history entry must NOT throw into the outer catch and downgrade a successful remove to
    // 'Error' (B31, parity with the Install path).
    try {
      await RecordInstallHistoryEntry(context.ContextUser, existingApp.ID, 'Remove', manifest, {
        Success: true,
        DurationSeconds: GetDurationSeconds(startTime),
        StartedAt: new Date(startTime),
        EndedAt: new Date(),
        Summary: options.KeepData ? 'Removed (data kept)' : 'Removed (data dropped)',
      });
    } catch (histErr: unknown) {
      Callbacks?.OnWarn?.('Record', `App removed, but the history audit entry could not be written: ${histErr instanceof Error ? histErr.message : String(histErr)}`);
    }

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

  const toggle = ToggleServerDynamicPackages(context.RepoRoot, appName, false);
  if (!toggle.Success) {
    // Don't flip the DB status when the config edit failed — that desyncs the DB
    // from mj.config.cjs and would report success on a half-applied disable (B25).
    return BuildFailureResult('Install', appName, app.Version, 'Config', startTime, toggle.ErrorMessage ?? 'Failed to update dynamicPackages.server in mj.config.cjs');
  }
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

  const toggle = ToggleServerDynamicPackages(context.RepoRoot, appName, true);
  if (!toggle.Success) {
    return BuildFailureResult('Install', appName, app.Version, 'Config', startTime, toggle.ErrorMessage ?? 'Failed to update dynamicPackages.server in mj.config.cjs');
  }
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
  DepsToInstall?: Array<{ AppName: string; Repository: string; VersionRange: string; Subpath?: string }>;
  /** True when package.json was updated but npm install failed (e.g., auth issue) */
  PackageJsonUpdated?: boolean;
  /** True when a NEW schema was actually created (vs an existing one reused) — for rollback (B18). */
  Created?: boolean;
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
    // Resolve the highest published version that satisfies the declared range, and pin the
    // install to it. Previously the dependency installed with no Version → whatever the
    // default-branch manifest reported, so a `>=1.0 <2.0` requirement could silently pull
    // 3.0 (B26). A range with no satisfying version now fails loudly rather than installing
    // the wrong major.
    const resolved = await ResolveDependencyVersion(dep.Repository, dep.VersionRange, context.GitHubOptions);
    if (resolved.ErrorMessage) {
      return { Success: false, ErrorMessage: `Cannot install dependency '${dep.AppName}': ${resolved.ErrorMessage}` };
    }
    const result = await InstallApp(
      {
        Source: dep.Repository,
        Subpath: dep.Subpath,
        // Pinned to satisfy the declared range; undefined ⇒ no constraint ⇒ default-branch latest.
        Version: resolved.Version,
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
 * Resolves the version a dependency should install at, given the declared range. Returns the
 * highest published version (from the repo's releases + semver tags) that satisfies the range.
 * Returns `{ Version: undefined }` when there is no real constraint (so the caller installs the
 * default-branch latest), or `{ ErrorMessage }` when the range is invalid or unsatisfiable —
 * failing loudly rather than silently installing the wrong major version (B26).
 *
 * Exported for unit testing of the range-resolution logic.
 */
export async function ResolveDependencyVersion(
  repoUrl: string,
  versionRange: string,
  options: GitHubClientOptions,
): Promise<{ Version?: string; ErrorMessage?: string }> {
  const range = (versionRange ?? '').trim();
  // No real constraint → let InstallApp resolve the default-branch latest (prior behavior).
  if (range === '' || range === '*' || range.toLowerCase() === 'latest') {
    return { Version: undefined };
  }
  // An exact version is a 1-element "range" — pin it directly.
  if (semver.valid(range)) {
    return { Version: range.replace(/^v/, '') };
  }
  if (!semver.validRange(range)) {
    return { ErrorMessage: `version '${versionRange}' is not a valid semver version or range` };
  }
  // Gather candidate versions: non-draft releases + semver tags.
  const [releases, tags] = await Promise.all([
    ListGitHubReleases(repoUrl, options),
    ListGitHubTags(repoUrl, options),
  ]);
  const candidates = [
    ...releases.filter((r) => !r.Draft).map((r) => r.TagName.replace(/^v/, '')),
    ...tags.map((t) => t.replace(/^v/, '')),
  ].filter((v) => semver.valid(v) != null);
  if (candidates.length === 0) {
    return { ErrorMessage: `no published versions found at ${repoUrl} to satisfy '${versionRange}'` };
  }
  const best = semver.maxSatisfying(candidates, range);
  if (!best) {
    const latest = candidates.sort(semver.rcompare)[0];
    return { ErrorMessage: `no published version at ${repoUrl} satisfies '${versionRange}' (latest available: ${latest})` };
  }
  return { Version: best };
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
      return { Success: true, Created: false };
    }
    return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' already exists` };
  }

  if (manifest.schema.createIfNotExists !== false) {
    context.Callbacks?.OnProgress?.('Schema', `Creating schema '${manifest.schema.name}'...`);
    const result = await CreateAppSchema(manifest.schema.name, context.DatabaseProvider, { allowDoubleUnderscore });
    return { Success: result.Success, ErrorMessage: result.ErrorMessage, Created: result.Success };
  }

  return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' does not exist and createIfNotExists is false` };
}

/**
 * Persists the app's canonical (case-preserved) schema name onto its SchemaInfo row.
 *
 * The physical schema is created under its platform-canonical form (lowercased on PostgreSQL),
 * which is what `SchemaInfo.SchemaName` ends up holding (CodeGen reads it from the DB catalog).
 * The original casing survives only in the manifest (`manifest.schema.name`), so we record it in
 * `SchemaInfo.CanonicalSchemaName`. `vwEntities` and the runtime GraphQL type-name path then prefer
 * it (with a COALESCE/?? fallback to SchemaName), keeping PostgreSQL class names PascalCase and in
 * lockstep with the published entity packages.
 *
 * Keyed on the PHYSICAL schema name (matching how the row is created). Idempotent UPDATE — a no-op
 * when the SchemaInfo row doesn't exist yet (it is materialized out-of-band by CodeGen's
 * `spUpdateSchemaInfoFromDatabase`, which leaves CanonicalSchemaName NULL and then backfills it
 * from the installed-app record). Best-effort: failures are warned, never fatal to the install.
 */
async function PersistCanonicalSchemaName(manifest: MJAppManifest, context: OrchestratorContext): Promise<void> {
  if (!manifest.schema) {
    return;
  }
  const canonicalName = manifest.schema.name;

  // Entirely best-effort: building the statement touches the provider's Dialect, so the WHOLE body
  // (not just ExecuteSQL) is guarded — a provider without a usable Dialect must never fail the install.
  try {
    const dialect = context.DatabaseProvider.Dialect;
    const mjSchema = context.MJCoreSchema ?? '__mj';
    const physicalName = dialect.CanonicalSchemaName(canonicalName);

    // Portable, parameter-free single statement (the install path runs raw SQL, not parameterized);
    // values are string-literal-escaped via the dialect. SchemaName comparison is case-folded so it
    // matches whether the catalog stored it lowercased (PG) or as-authored (SQL Server).
    const table = dialect.QuoteSchema(mjSchema, 'SchemaInfo');
    const canonicalLiteral = dialect.QuoteStringLiteral(canonicalName);
    const physicalLiteral = dialect.QuoteStringLiteral(physicalName);
    const sql =
      `UPDATE ${table} SET ${dialect.QuoteIdentifier('CanonicalSchemaName')} = ${canonicalLiteral} ` +
      `WHERE LOWER(${dialect.QuoteIdentifier('SchemaName')}) = LOWER(${physicalLiteral})`;

    await context.DatabaseProvider.ExecuteSQL(sql);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    context.Callbacks?.OnWarn?.(
      'Schema',
      `Could not persist canonical schema name for '${canonicalName}' (will be backfilled at codegen time): ${message}`,
    );
  }
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

  // Live DB platform — selects the Skyway provider for RunAppMigrations below.
  const platform = context.DatabaseProvider.Dialect.PlatformKey;

  // Platform-aware download with PG fallback (uses `<directory>-pg/` on Postgres when present,
  // else the declared directory) + subpath-aware for multi-app repos.
  const downloadResult = await DownloadAppMigrations(manifest, context, tempDir, subpath);

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
    Platform: platform,
  });

  return { Success: migrationResult.Success, ErrorMessage: migrationResult.ErrorMessage };
}

/**
 * Remove-time teardown: runs the app's `migrations.teardownDirectory` scripts to retire the rows its
 * seed migrations wrote into the SHARED core schema (Integration/IO/IOF/Action rows in __mj). Dropping
 * the app's OWN schema cannot reach those, so without this they would orphan on `mj app remove`.
 *
 * Symmetric with {@link HandleMigrations}: platform-aware directory (`<teardownDirectory>-pg/` on
 * Postgres), subpath-aware download. Scripts are one-shot inverse DELETEs (generated from the same
 * metadata as the seed migration by the publisher's build) executed in filename order via the live
 * provider — NOT through Skyway (they are not versioned migrations). `${mjSchema}` resolves to the
 * core schema. No-op when the manifest declares no teardownDirectory.
 */
async function HandleTeardown(manifest: MJAppManifest, context: OrchestratorContext, subpath?: string): Promise<InternalResult> {
  const teardownDir = manifest.migrations?.teardownDirectory;
  if (!teardownDir) {
    return { Success: true };
  }

  const platform = context.DatabaseProvider.Dialect.PlatformKey;
  const dir = platform === 'postgresql' ? `${teardownDir}-pg` : teardownDir;
  const tempDir = join(tmpdir(), `mj-app-${manifest.name}-teardown-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  context.Callbacks?.OnProgress?.('Metadata', 'Downloading teardown scripts...');
  const download = await DownloadMigrations(manifest.repository, manifest.version, dir, tempDir, context.GitHubOptions, subpath);
  if (!download.Success) {
    return { Success: false, ErrorMessage: `Failed to download teardown scripts: ${download.ErrorMessage}` };
  }
  // DownloadMigrations only writes .sql; sort by filename so a numbered teardown runs in order.
  const files = (download.Files ?? []).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    context.Callbacks?.OnWarn?.('Metadata', `No teardown scripts in '${dir}' — this app's rows in the shared core schema will NOT be retired on remove.`);
    return { Success: true };
  }

  const mjSchema = context.MJCoreSchema ?? '__mj';
  context.Callbacks?.OnProgress?.('Metadata', `Running ${files.length} teardown script(s) against '${mjSchema}'...`);
  // Atomic: the inverse-DELETEs across all teardown files run in ONE transaction so a mid-list
  // failure rolls back the whole teardown rather than leaving the app's rows half-retired (some
  // files committed, some not) — which would orphan rows AND block a clean reinstall.
  await context.DatabaseProvider.BeginTransaction();
  try {
    for (const file of files) {
      const sql = readFileSync(join(tempDir, file), 'utf-8').split('${mjSchema}').join(mjSchema);
      if (sql.trim()) {
        await context.DatabaseProvider.ExecuteSQL(sql);
      }
    }
    await context.DatabaseProvider.CommitTransaction();
  } catch (error: unknown) {
    await context.DatabaseProvider.RollbackTransaction();
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, ErrorMessage: `Teardown failed for '${manifest.name}' (rolled back): ${message}` };
  }

  context.Callbacks?.OnSuccess?.('Metadata', `Retired this app's rows from '${mjSchema}' (${files.length} teardown script(s)).`);
  return { Success: true };
}

/**
 * Downloads an app's migration files for the LIVE database platform.
 *
 * On PostgreSQL, prefer a sibling `<directory>-pg` folder (the `.pg.sql` set) —
 * mirroring core `mj migrate`'s `migrations` → `migrations-pg` swap — and fall
 * back to the declared directory when no PG variant exists (dialect-neutral or
 * SQL-Server-only apps). On SQL Server, always use the declared directory.
 * subpath-aware for multi-app repos.
 */
async function DownloadAppMigrations(
  manifest: MJAppManifest,
  context: OrchestratorContext,
  tempDir: string,
  subpath?: string,
): Promise<MigrationDownloadResult> {
  const baseDir = manifest.migrations!.directory;
  const isPG = context.DatabaseProvider.Dialect.PlatformKey === 'postgresql';

  if (isPG) {
    const pgDir = `${baseDir.replace(/\/+$/, '')}-pg`;
    const pgResult = await DownloadMigrations(manifest.repository, manifest.version, pgDir, tempDir, context.GitHubOptions, subpath);
    // Use the PG-specific set only if it exists AND has files; otherwise fall
    // back to the declared directory (a 404 yields Success:false, an empty dir
    // yields Success:true with no files — both mean "no PG variant here").
    if (pgResult.Success && (pgResult.Files?.length ?? 0) > 0) {
      return pgResult;
    }
  }

  return DownloadMigrations(manifest.repository, manifest.version, baseDir, tempDir, context.GitHubOptions, subpath);
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
  verbose?: boolean,
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
  const installResult = RunPackageInstall(context.RepoRoot, verbose, manifest.packages.registry, context.PackageManager);
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

  // Record the app's client packages in dynamicPackages.client. `mj codegen manifest
  // --open-app-client-bootstrap` (run by MJExplorer's prebuild) turns each into a
  // side-effect import in the class-registrations manifest MJExplorer already imports —
  // so the client load path lives in distributed packages, not a bespoke MJExplorer file.
  // Runs on both install and upgrade (both call HandleServerConfig); idempotent per entry.
  const clientResult = AddClientDynamicPackages(context.RepoRoot, manifest);
  if (!clientResult.Success) {
    return { Success: false, ErrorMessage: clientResult.ErrorMessage };
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
 * Executes a shell hook command with a 2-minute timeout.
 */
async function ExecuteHook(command: string, cwd: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  execSync(command, { cwd, encoding: 'utf-8', timeout: 120000, stdio: 'inherit' });
}

/**
 * Removes all MJ entity metadata associated with an app's schema.
 * Deletes in FK-dependency order to avoid constraint violations.
 *
 * Exported for unit testing of the atomic-transaction semantics (PG3).
 */
export async function RemoveAppEntityMetadata(schemaName: string, contextUser: UserInfo, callbacks?: AppInstallCallbacks, provider?: IMetadataProvider): Promise<{ Success: boolean; ErrorMessage?: string }> {
  try {
    const rv = new RunView();
    const escaped = EscapeSqlString(schemaName);
    // All metadata deletes are queued into ONE TransactionGroup and committed once. MJ
    // metadata FKs are NO ACTION (not CASCADE), so dependents are queued in dependency order;
    // the group commits them in that order inside a single DB transaction. On PostgreSQL each
    // un-grouped delete would otherwise autocommit, so an FK violation partway (e.g. an
    // un-handled dependent) left partially-committed orphan state with no rollback — now the
    // whole cleanup is atomic and a failure rolls back cleanly (PG3).
    const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
    const tg = await md.CreateTransactionGroup();

    // Helper: queue all matching records of an entity for delete into the shared transaction.
    const queueDeleteByFilterOrThrow = async (entityName: string, filter: string): Promise<void> => {
      const r = await QueueDeleteEntitiesByFilter(rv, contextUser, entityName, filter, tg);
      if (!r.Success) {
        throw new Error(r.ErrorMessage ?? `Failed to queue delete of ${entityName} records`);
      }
    };

    // First, find all entity IDs in this schema so we can clean FK-dependent records.
    const entityResult = await rv.RunView<MJEntityEntity>(
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
      // No entities found — just clean up SchemaInfo (still atomic via the group).
      await queueDeleteByFilterOrThrow('MJ: Schema Info', `SchemaName = '${escaped}'`);
      if (!(await tg.Submit())) {
        throw new Error('Transaction failed: schema-info cleanup could not be committed');
      }
      callbacks?.OnSuccess?.('Metadata', `Entity metadata for schema '${schemaName}' removed`);
      return { Success: true };
    }

    const entityIds = entityResult.Results.map((e) => e.ID);
    const idList = entityIds.map((id) => `'${EscapeSqlString(id)}'`).join(',');

    // Entity Field Values (FK on EntityFieldID) must go before the Entity Fields they
    // reference — collect this schema's field IDs first.
    const fieldResult = await rv.RunView<MJEntityFieldEntity>(
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
    const fieldIdList = fieldResult.Results.map((f) => `'${EscapeSqlString(f.ID)}'`).join(',');

    // Capture the app's OWN Application row(s) NOW — before the ApplicationEntity links below
    // are deleted — so they can be cleaned up post-commit (see DeleteAppOwnedApplications). An
    // app's metadata-sync migration registers an Application (fixed UUID) grouping its entities;
    // historically the link rows were removed but the Application itself was orphaned, so a
    // reinstall's migration re-INSERTed the same fixed UUID and failed with a PK collision.
    const ownedAppIds = await FindAppOwnedApplications(rv, contextUser, entityIds, idList);

    // Queue FK-dependent deletes in dependency order (children before parents).
    if (fieldIdList.length > 0) {
      await queueDeleteByFilterOrThrow('MJ: Entity Field Values', `EntityFieldID IN (${fieldIdList})`);
    }
    await queueDeleteByFilterOrThrow('MJ: Entity Permissions', `EntityID IN (${idList})`);
    await queueDeleteByFilterOrThrow('MJ: Application Entities', `EntityID IN (${idList})`);
    await queueDeleteByFilterOrThrow('MJ: Entity Settings', `EntityID IN (${idList})`);
    // Entity Relationships reference EntityID on both sides
    await queueDeleteByFilterOrThrow('MJ: Entity Relationships', `EntityID IN (${idList}) OR RelatedEntityID IN (${idList})`);
    // Entity Fields (FK on EntityID)
    await queueDeleteByFilterOrThrow('MJ: Entity Fields', `EntityID IN (${idList})`);

    // Queue the Entities themselves.
    for (const entity of entityResult.Results) {
      entity.TransactionGroup = tg;
      await entity.Delete();
    }

    // Queue SchemaInfo last.
    await queueDeleteByFilterOrThrow('MJ: Schema Info', `SchemaName = '${escaped}'`);

    // Commit everything atomically — all-or-nothing (PG3).
    if (!(await tg.Submit())) {
      throw new Error('Transaction failed: entity metadata cleanup could not be committed atomically');
    }

    // Best-effort: drop the app's now-entity-less Application row(s) so a reinstall's migration
    // doesn't collide on the app's fixed Application PK. Done AFTER the atomic metadata commit —
    // the ApplicationEntity links are gone, so a wholly-owned Application is childless — and it is
    // best-effort because a user may have added other dependents (dashboards, role/user
    // assignments); such a row is left intact and simply reused on reinstall.
    await DeleteAppOwnedApplications(rv, ownedAppIds, contextUser, callbacks);

    callbacks?.OnSuccess?.('Metadata', `Entity metadata for schema '${schemaName}' removed`);
    return { Success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    callbacks?.OnError?.('Metadata', `Failed to remove entity metadata: ${message}`);
    return { Success: false, ErrorMessage: `Failed to remove entity metadata for schema '${schemaName}': ${message}` };
  }
}

/**
 * Finds the Application row(s) an Open App OWNS — i.e. an Application all of whose
 * `ApplicationEntity` links point at the schema's entities (`entityIds`). An Application
 * that also groups OTHER apps' entities is excluded (not wholly owned), so a shared
 * Application is never selected for removal. Returns the owned Application IDs.
 *
 * `idList` is the pre-quoted, comma-joined SQL list of the schema's entity IDs (reused so we
 * don't re-quote). Read-only — actual deletion is deferred to {@link DeleteAppOwnedApplications}.
 */
async function FindAppOwnedApplications(rv: RunView, contextUser: UserInfo, entityIds: string[], idList: string): Promise<string[]> {
  const ours = new Set(entityIds.map((id) => NormalizeUUID(id)));
  // Candidate Applications: those linked to ANY of this schema's entities.
  const linked = await rv.RunView<{ ApplicationID: string }>(
    { EntityName: 'MJ: Application Entities', ExtraFilter: `EntityID IN (${idList})`, Fields: ['ApplicationID'], ResultType: 'simple' },
    contextUser,
  );
  if (!linked.Success) {
    return [];
  }
  const candidateIds = [...new Set(linked.Results.map((r) => r.ApplicationID))];
  if (candidateIds.length === 0) {
    return [];
  }
  // Re-read ALL links for the candidates: an Application is "owned" only if EVERY one of its
  // links is to an entity we're removing (otherwise it groups another app's entities too).
  const candList = candidateIds.map((id) => `'${EscapeSqlString(id)}'`).join(',');
  const allLinks = await rv.RunView<{ ApplicationID: string; EntityID: string }>(
    { EntityName: 'MJ: Application Entities', ExtraFilter: `ApplicationID IN (${candList})`, Fields: ['ApplicationID', 'EntityID'], ResultType: 'simple' },
    contextUser,
  );
  if (!allLinks.Success) {
    return [];
  }
  const allOursByApp = new Map<string, boolean>();
  for (const link of allLinks.Results) {
    const wasAllOurs = allOursByApp.get(link.ApplicationID) ?? true;
    allOursByApp.set(link.ApplicationID, wasAllOurs && ours.has(NormalizeUUID(link.EntityID)));
  }
  return [...allOursByApp.entries()].filter(([, allOurs]) => allOurs).map(([appId]) => appId);
}

/**
 * Deletes the app-owned Application row(s) from {@link FindAppOwnedApplications}, BEST-EFFORT.
 * Called after the metadata-removal transaction commits (so the rows are already link-less).
 * `BaseEntity.Delete()` returns `false` on a logical failure — e.g. a remaining FK dependent
 * (a user-created Dashboard, role/user assignment, conversation) — in which case the Application
 * is left intact (a reinstall reuses it) and a warning is surfaced. A leftover Application is the
 * prior behavior, so this can never regress or fail the remove.
 */
async function DeleteAppOwnedApplications(rv: RunView, applicationIds: string[], contextUser: UserInfo, callbacks?: AppInstallCallbacks): Promise<void> {
  if (applicationIds.length === 0) {
    return;
  }
  const idList = applicationIds.map((id) => `'${EscapeSqlString(id)}'`).join(',');
  const appsResult = await rv.RunView<MJApplicationEntity>(
    { EntityName: 'MJ: Applications', ExtraFilter: `ID IN (${idList})`, ResultType: 'entity_object' },
    contextUser,
  );
  if (!appsResult.Success) {
    return;
  }
  for (const app of appsResult.Results) {
    try {
      if (!(await app.Delete())) {
        callbacks?.OnWarn?.('Metadata', `Left Application '${app.Name}' — it still has dependents; a reinstall will reuse it (${app.LatestResult?.CompleteMessage ?? 'has FK references'}).`);
      }
    } catch (error: unknown) {
      callbacks?.OnWarn?.('Metadata', `Could not remove app-owned Application '${app.Name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Helper: loads entities by filter and queues them all for delete into the shared
 * TransactionGroup (committed by the caller's Submit). Queuing — rather than committing each
 * delete individually — is what makes the whole metadata cleanup atomic on PostgreSQL (PG3).
 */
async function QueueDeleteEntitiesByFilter(rv: RunView, contextUser: UserInfo, entityName: string, filter: string, transactionGroup: TransactionGroupBase): Promise<{ Success: boolean; ErrorMessage?: string }> {
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
    record.TransactionGroup = transactionGroup;
    await record.Delete();
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
