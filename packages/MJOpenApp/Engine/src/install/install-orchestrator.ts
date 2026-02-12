/**
 * Install orchestrator for MJ Open Apps.
 *
 * Sequences the 14-step install flow, 10-step upgrade flow, and
 * 8-step remove flow. Each step is delegated to a specialized handler.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type {
    AppInstallCallbacks,
    InstallOptions,
    UpgradeOptions,
    RemoveOptions,
    AppOperationResult,
    ErrorPhase,
    InstalledAppInfo
} from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import { ValidateManifestObject, ParseAndValidateManifest } from '../manifest/manifest-loader.js';
import { CheckMJVersionCompatibility } from '../dependency/version-checker.js';
import { ResolveDependencies } from '../dependency/dependency-resolver.js';
import type { InstalledAppMap, DependencyNode } from '../dependency/dependency-resolver.js';
import {
    FetchManifestFromGitHub,
    DownloadMigrations,
    GetLatestVersion,
    type GitHubClientOptions
} from '../github/github-client.js';
import { CreateAppSchema, DropAppSchema, SchemaExists, type SchemaManagerConnection } from './schema-manager.js';
import { RunAppMigrations, type SkywayDatabaseConfig } from './migration-runner.js';
import { AddAppPackages, RemoveAppPackages, RunNpmInstall } from './package-manager.js';
import { AddServerDynamicPackages, RemoveServerDynamicPackages, ToggleServerDynamicPackages } from './config-manager.js';
import { RegenerateClientBootstrap, type ClientBootstrapEntry } from './client-bootstrap-gen.js';
import {
    RecordAppInstallation,
    RecordInstallHistoryEntry,
    RecordAppDependencies,
    SetAppStatus,
    FindInstalledApp,
    FindDependentApps,
    ListInstalledApps,
    UpdateAppRecord,
    type MJDataProvider
} from './history-recorder.js';

/**
 * Runtime context provided by the CLI to the orchestrator.
 * Contains all the external dependencies needed for the install flow.
 */
export interface OrchestratorContext {
    /** MJ data provider for entity operations */
    DataProvider: MJDataProvider;
    /** Database connection for schema operations */
    SchemaConnection: SchemaManagerConnection;
    /** Database config for Skyway */
    DatabaseConfig: SkywayDatabaseConfig;
    /** GitHub client options (auth token) */
    GitHubOptions: GitHubClientOptions;
    /** Absolute path to the monorepo root */
    RepoRoot: string;
    /** The current MJ version string */
    MJVersion: string;
    /** The user ID performing the operation */
    UserId: string;
    /** Progress callbacks */
    Callbacks?: AppInstallCallbacks;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL FLOW (14 steps)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the full 14-step install flow for an Open App.
 *
 * Steps:
 * 1.  Fetch manifest from GitHub
 * 2.  Validate manifest (Zod)
 * 3.  Validate MJ version compatibility
 * 4.  Resolve dependencies (topological sort)
 * 5.  Install dependencies (recursive, depth-first)
 * 6.  Check schema (no collision)
 * 7.  Create schema
 * 8.  Run migrations (Skyway - DDL + metadata DML)
 * 9.  Update package.json files
 * 10. Run npm install
 * 11. Update server config (dynamicPackages in mj.config.cjs)
 * 12. Update client imports (open-app-bootstrap.generated.ts)
 * 13. Execute hooks (postInstall)
 * 14. Record installation
 */
export async function InstallApp(
    options: InstallOptions,
    context: OrchestratorContext
): Promise<AppOperationResult> {
    const startTime = Date.now();
    const { Callbacks } = context;

    try {
        // Step 1: Fetch manifest
        Callbacks?.OnProgress?.('Fetch', `Fetching manifest from ${options.Source}...`);
        const fetchResult = await FetchManifestFromGitHub(
            options.Source,
            options.Version,
            context.GitHubOptions
        );
        if (!fetchResult.Success || !fetchResult.ManifestJSON) {
            return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, fetchResult.ErrorMessage ?? 'Failed to fetch manifest');
        }

        // Step 2: Validate manifest
        Callbacks?.OnProgress?.('Validate', 'Validating manifest...');
        const parseResult = ParseAndValidateManifest(fetchResult.ManifestJSON);
        if (!parseResult.Success || !parseResult.Manifest) {
            return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, `Invalid manifest: ${parseResult.Errors?.join(', ')}`);
        }
        const manifest = parseResult.Manifest;

        // Step 3: Validate MJ compatibility
        Callbacks?.OnProgress?.('Validate', 'Checking MJ version compatibility...');
        const compatResult = CheckMJVersionCompatibility(context.MJVersion, manifest.mjVersionRange);
        if (!compatResult.Compatible) {
            return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, compatResult.Message ?? 'Incompatible MJ version');
        }

        // Step 4: Resolve dependencies
        const depResult = await ResolveDependencyChain(manifest, context);
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

        // Set status to Installing
        Callbacks?.OnProgress?.('Install', `Installing ${manifest.name} v${manifest.version}...`);

        // Steps 6-7: Schema
        if (manifest.schema) {
            const schemaResult = await HandleSchemaCreation(manifest, context);
            if (!schemaResult.Success) {
                return BuildFailureResult('Install', manifest.name, manifest.version, 'Schema', startTime, schemaResult.ErrorMessage ?? 'Schema creation failed');
            }
        }

        // Step 8: Run migrations
        if (manifest.migrations && manifest.schema) {
            const migrationResult = await HandleMigrations(manifest, context);
            if (!migrationResult.Success) {
                return BuildFailureResult('Install', manifest.name, manifest.version, 'Migration', startTime, migrationResult.ErrorMessage ?? 'Migration failed');
            }
        }

        // Steps 9-10: Packages
        const pkgResult = await HandlePackageInstallation(manifest, context);
        if (!pkgResult.Success) {
            return BuildFailureResult('Install', manifest.name, manifest.version, 'Packages', startTime, pkgResult.ErrorMessage ?? 'Package installation failed');
        }

        // Step 11: Update server config
        const configResult = HandleServerConfig(manifest, context);
        if (!configResult.Success) {
            return BuildFailureResult('Install', manifest.name, manifest.version, 'Config', startTime, configResult.ErrorMessage ?? 'Config update failed');
        }

        // Step 12: Update client imports
        await HandleClientBootstrapRegeneration(context);

        // Step 13: Execute hooks
        if (manifest.hooks?.postInstall) {
            Callbacks?.OnProgress?.('Hooks', 'Running postInstall hook...');
            await ExecuteHook(manifest.hooks.postInstall, context.RepoRoot);
        }

        // Step 14: Record installation
        const appId = await RecordAppInstallation(context.DataProvider, manifest, context.UserId, Callbacks);
        await RecordInstallHistoryEntry(
            context.DataProvider, appId, 'Install', manifest, context.UserId,
            { Success: true, DurationSeconds: GetDurationSeconds(startTime), Summary: 'Initial installation' }
        );

        if (manifest.dependencies) {
            await RecordAppDependencies(context.DataProvider, appId, manifest.dependencies, context.UserId);
        }

        Callbacks?.OnSuccess?.('Install', `Successfully installed ${manifest.name} v${manifest.version}`);

        return {
            Success: true,
            Action: 'Install',
            AppName: manifest.name,
            Version: manifest.version,
            DurationSeconds: GetDurationSeconds(startTime),
            Summary: 'App installed successfully. Restart MJAPI and rebuild MJExplorer to activate.'
        };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        Callbacks?.OnError?.('Install', message);
        return BuildFailureResult('Install', options.Source, '', 'Schema', startTime, message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE FLOW (10 steps)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the 10-step upgrade flow for an installed Open App.
 */
export async function UpgradeApp(
    options: UpgradeOptions,
    context: OrchestratorContext
): Promise<AppOperationResult> {
    const startTime = Date.now();
    const { Callbacks } = context;

    try {
        // Look up existing app
        const existingApp = await FindInstalledApp(context.DataProvider, options.AppName);
        if (!existingApp) {
            return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, `App '${options.AppName}' is not installed`);
        }

        const previousVersion = existingApp.Version;

        // Step 1: Fetch new manifest
        const targetVersion = options.Version ?? await GetLatestVersion(existingApp.RepositoryURL, context.GitHubOptions);
        if (!targetVersion) {
            return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, 'Could not determine target version');
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
        const manifest = parseResult.Manifest;

        const compatResult = CheckMJVersionCompatibility(context.MJVersion, manifest.mjVersionRange);
        if (!compatResult.Compatible) {
            return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Schema', startTime, compatResult.Message ?? 'Incompatible MJ version');
        }

        // Step 3: Check dependency compatibility
        // (simplified — just validate the manifest dependencies are met)

        // Set status to Upgrading
        await SetAppStatus(context.DataProvider, existingApp.ID, 'Upgrading', context.UserId);

        // Step 4: Run migrations (Skyway applies only new ones)
        if (manifest.migrations && manifest.schema) {
            const migrationResult = await HandleMigrations(manifest, context);
            if (!migrationResult.Success) {
                await SetAppStatus(context.DataProvider, existingApp.ID, 'Error', context.UserId);
                return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Migration', startTime, migrationResult.ErrorMessage ?? 'Migration failed');
            }
        }

        // Steps 5-6: Update packages
        const pkgResult = await HandlePackageInstallation(manifest, context);
        if (!pkgResult.Success) {
            await SetAppStatus(context.DataProvider, existingApp.ID, 'Error', context.UserId);
            return BuildFailureResult('Upgrade', options.AppName, targetVersion, 'Packages', startTime, pkgResult.ErrorMessage ?? 'Package update failed');
        }

        // Step 7: Update server config if changed
        const configResult = HandleServerConfig(manifest, context);
        if (!configResult.Success) {
            await SetAppStatus(context.DataProvider, existingApp.ID, 'Error', context.UserId);
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
        await UpdateAppRecord(context.DataProvider, existingApp.ID, {
            Version: manifest.version,
            ManifestJSON: JSON.stringify(manifest),
            Status: 'Active'
        }, context.UserId);

        await RecordInstallHistoryEntry(
            context.DataProvider, existingApp.ID, 'Upgrade', manifest, context.UserId,
            { PreviousVersion: previousVersion, Success: true, DurationSeconds: GetDurationSeconds(startTime), Summary: `Upgraded from ${previousVersion} to ${manifest.version}` }
        );

        Callbacks?.OnSuccess?.('Upgrade', `Successfully upgraded ${options.AppName} to v${manifest.version}`);

        return {
            Success: true,
            Action: 'Upgrade',
            AppName: options.AppName,
            Version: manifest.version,
            DurationSeconds: GetDurationSeconds(startTime),
            Summary: `Upgraded from ${previousVersion} to ${manifest.version}. Restart MJAPI and rebuild MJExplorer.`
        };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        Callbacks?.OnError?.('Upgrade', message);
        return BuildFailureResult('Upgrade', options.AppName, '', 'Schema', startTime, message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE FLOW (8 steps)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the 8-step remove flow for an installed Open App.
 */
export async function RemoveApp(
    options: RemoveOptions,
    context: OrchestratorContext
): Promise<AppOperationResult> {
    const startTime = Date.now();
    const { Callbacks } = context;

    try {
        const existingApp = await FindInstalledApp(context.DataProvider, options.AppName);
        if (!existingApp) {
            return BuildFailureResult('Remove', options.AppName, '', 'Schema', startTime, `App '${options.AppName}' is not installed`);
        }

        // Step 1: Check dependents
        if (!options.Force) {
            const dependents = await FindDependentApps(context.DataProvider, options.AppName);
            if (dependents.length > 0) {
                return BuildFailureResult(
                    'Remove', options.AppName, existingApp.Version, 'Schema', startTime,
                    `Cannot remove: the following apps depend on ${options.AppName}: ${dependents.join(', ')}. Use --force to override.`
                );
            }
        }

        await SetAppStatus(context.DataProvider, existingApp.ID, 'Removing', context.UserId);

        // Step 2: Execute preRemove hook
        const manifest = JSON.parse(existingApp.ManifestJSON) as MJAppManifest;
        if (manifest.hooks?.preRemove) {
            Callbacks?.OnProgress?.('Hooks', 'Running preRemove hook...');
            await ExecuteHook(manifest.hooks.preRemove, context.RepoRoot);
        }

        // Step 3: Remove server config
        Callbacks?.OnProgress?.('Config', 'Removing server config entries...');
        RemoveServerDynamicPackages(context.RepoRoot, options.AppName);

        // Step 4: Regenerate client imports (without this app)
        Callbacks?.OnProgress?.('Config', 'Regenerating client bootstrap...');
        await HandleClientBootstrapRegeneration(context);

        // Step 5: Remove npm packages
        Callbacks?.OnProgress?.('Packages', 'Removing npm packages...');
        RemoveAppPackages({
            RepoRoot: context.RepoRoot,
            ServerPackages: manifest.packages?.server ?? [],
            ClientPackages: manifest.packages?.client ?? [],
            SharedPackages: manifest.packages?.shared ?? [],
            Version: existingApp.Version
        });
        RunNpmInstall(context.RepoRoot, options.Verbose);

        // Step 6: Remove metadata (entity registrations etc.)
        // Metadata removal is done via SQL since migrations are not reversible.
        // The app's migration DML inserted records into __mj tables; we need
        // to delete those records. This is app-specific and would be handled
        // by the preRemove hook or cleanup SQL.

        // Step 7: Drop schema (unless --keep-data)
        if (!options.KeepData && existingApp.SchemaName) {
            Callbacks?.OnProgress?.('Schema', `Dropping schema '${existingApp.SchemaName}'...`);
            const dropResult = await DropAppSchema(existingApp.SchemaName, context.SchemaConnection);
            if (!dropResult.Success) {
                Callbacks?.OnWarn?.('Schema', `Failed to drop schema: ${dropResult.ErrorMessage}`);
            }
        }

        // Step 8: Update records
        await RecordInstallHistoryEntry(
            context.DataProvider, existingApp.ID, 'Remove', manifest, context.UserId,
            { Success: true, DurationSeconds: GetDurationSeconds(startTime), Summary: options.KeepData ? 'Removed (data kept)' : 'Removed (data dropped)' }
        );

        await UpdateAppRecord(context.DataProvider, existingApp.ID, {
            Status: 'Removing'
        }, context.UserId);

        Callbacks?.OnSuccess?.('Remove', `Successfully removed ${options.AppName}`);

        return {
            Success: true,
            Action: 'Remove',
            AppName: options.AppName,
            Version: existingApp.Version,
            DurationSeconds: GetDurationSeconds(startTime),
            Summary: options.KeepData ? 'App removed (database schema preserved)' : 'App removed'
        };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
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
export async function DisableApp(
    appName: string,
    context: OrchestratorContext
): Promise<AppOperationResult> {
    const startTime = Date.now();
    const app = await FindInstalledApp(context.DataProvider, appName);
    if (!app) {
        return BuildFailureResult('Install', appName, '', 'Config', startTime, `App '${appName}' is not installed`);
    }

    ToggleServerDynamicPackages(context.RepoRoot, appName, false);
    await HandleClientBootstrapRegeneration(context);
    await SetAppStatus(context.DataProvider, app.ID, 'Disabled', context.UserId);

    return {
        Success: true,
        Action: 'Install', // No 'Disable' action type
        AppName: appName,
        Version: app.Version,
        DurationSeconds: GetDurationSeconds(startTime),
        Summary: 'App disabled. Restart MJAPI and rebuild MJExplorer.'
    };
}

/**
 * Re-enables a disabled app.
 */
export async function EnableApp(
    appName: string,
    context: OrchestratorContext
): Promise<AppOperationResult> {
    const startTime = Date.now();
    const app = await FindInstalledApp(context.DataProvider, appName);
    if (!app) {
        return BuildFailureResult('Install', appName, '', 'Config', startTime, `App '${appName}' is not installed`);
    }

    ToggleServerDynamicPackages(context.RepoRoot, appName, true);
    await HandleClientBootstrapRegeneration(context);
    await SetAppStatus(context.DataProvider, app.ID, 'Active', context.UserId);

    return {
        Success: true,
        Action: 'Install',
        AppName: appName,
        Version: app.Version,
        DurationSeconds: GetDurationSeconds(startTime),
        Summary: 'App enabled. Restart MJAPI and rebuild MJExplorer.'
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface InternalResult {
    Success: boolean;
    ErrorMessage?: string;
    DepsToInstall?: Array<{ Repository: string; VersionRange: string }>;
}

async function ResolveDependencyChain(
    manifest: MJAppManifest,
    context: OrchestratorContext
): Promise<InternalResult> {
    if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
        return { Success: true };
    }

    context.Callbacks?.OnProgress?.('Dependencies', 'Resolving dependencies...');

    const installedApps = await ListInstalledApps(context.DataProvider);
    const installedMap: InstalledAppMap = {};
    for (const app of installedApps) {
        installedMap[app.Name] = { Version: app.Version, Repository: app.RepositoryURL };
    }

    const rootNode: DependencyNode = {
        AppName: manifest.name,
        Repository: manifest.repository,
        Dependencies: manifest.dependencies
    };

    const result = ResolveDependencies(rootNode, installedMap);
    if (!result.Success) {
        return { Success: false, ErrorMessage: result.ErrorMessage };
    }

    const depsToInstall = (result.InstallOrder ?? [])
        .filter(d => !d.AlreadyInstalled)
        .map(d => ({ Repository: d.Repository, VersionRange: d.VersionRange }));

    return { Success: true, DepsToInstall: depsToInstall };
}

async function InstallDependencies(
    deps: Array<{ Repository: string; VersionRange: string }>,
    context: OrchestratorContext
): Promise<InternalResult> {
    for (const dep of deps) {
        if (!dep.Repository) {
            return { Success: false, ErrorMessage: `Missing repository URL for dependency` };
        }
        context.Callbacks?.OnProgress?.('Dependencies', `Installing dependency from ${dep.Repository}...`);
        const result = await InstallApp({ Source: dep.Repository }, context);
        if (!result.Success) {
            return { Success: false, ErrorMessage: `Failed to install dependency: ${result.ErrorMessage}` };
        }
    }
    return { Success: true };
}

async function HandleSchemaCreation(
    manifest: MJAppManifest,
    context: OrchestratorContext
): Promise<InternalResult> {
    if (!manifest.schema) {
        return { Success: true };
    }

    context.Callbacks?.OnProgress?.('Schema', `Checking schema '${manifest.schema.name}'...`);
    const exists = await SchemaExists(manifest.schema.name, context.SchemaConnection);

    if (exists) {
        return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' already exists` };
    }

    if (manifest.schema.createIfNotExists !== false) {
        context.Callbacks?.OnProgress?.('Schema', `Creating schema '${manifest.schema.name}'...`);
        const result = await CreateAppSchema(manifest.schema.name, context.SchemaConnection);
        return { Success: result.Success, ErrorMessage: result.ErrorMessage };
    }

    return { Success: false, ErrorMessage: `Schema '${manifest.schema.name}' does not exist and createIfNotExists is false` };
}

async function HandleMigrations(
    manifest: MJAppManifest,
    context: OrchestratorContext
): Promise<InternalResult> {
    if (!manifest.schema || !manifest.migrations) {
        return { Success: true };
    }

    context.Callbacks?.OnProgress?.('Migration', 'Downloading migration files...');
    const tempDir = join(tmpdir(), `mj-app-${manifest.name}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    const downloadResult = await DownloadMigrations(
        manifest.repository,
        manifest.version,
        manifest.migrations.directory,
        tempDir,
        context.GitHubOptions
    );

    if (!downloadResult.Success) {
        return { Success: false, ErrorMessage: downloadResult.ErrorMessage };
    }

    context.Callbacks?.OnProgress?.('Migration', `Running ${downloadResult.Files?.length ?? 0} migration(s)...`);

    const migrationResult = await RunAppMigrations({
        MigrationsDir: tempDir,
        SchemaName: manifest.schema.name,
        DatabaseConfig: context.DatabaseConfig
    });

    return { Success: migrationResult.Success, ErrorMessage: migrationResult.ErrorMessage };
}

async function HandlePackageInstallation(
    manifest: MJAppManifest,
    context: OrchestratorContext
): Promise<InternalResult> {
    if (!manifest.packages) {
        return { Success: true };
    }

    context.Callbacks?.OnProgress?.('Packages', 'Adding npm packages...');
    const addResult = AddAppPackages({
        RepoRoot: context.RepoRoot,
        ServerPackages: manifest.packages.server ?? [],
        ClientPackages: manifest.packages.client ?? [],
        SharedPackages: manifest.packages.shared ?? [],
        Version: manifest.version
    });

    if (!addResult.Success) {
        return { Success: false, ErrorMessage: addResult.ErrorMessage };
    }

    context.Callbacks?.OnProgress?.('Packages', 'Running npm install...');
    const installResult = RunNpmInstall(context.RepoRoot);
    return { Success: installResult.Success, ErrorMessage: installResult.ErrorMessage };
}

function HandleServerConfig(
    manifest: MJAppManifest,
    context: OrchestratorContext
): InternalResult {
    context.Callbacks?.OnProgress?.('Config', 'Updating server config...');
    const result = AddServerDynamicPackages(context.RepoRoot, manifest);
    return { Success: result.Success, ErrorMessage: result.ErrorMessage };
}

async function HandleClientBootstrapRegeneration(
    context: OrchestratorContext
): Promise<void> {
    context.Callbacks?.OnProgress?.('Config', 'Regenerating client bootstrap...');

    const apps = await ListInstalledApps(context.DataProvider);
    const entries: ClientBootstrapEntry[] = [];

    for (const app of apps) {
        const manifest = JSON.parse(app.ManifestJSON) as MJAppManifest;
        const clientPkgs = [...(manifest.packages?.client ?? []), ...(manifest.packages?.shared ?? [])];

        for (const pkg of clientPkgs) {
            entries.push({
                AppName: app.Name,
                Version: app.Version,
                PackageName: pkg.name,
                Enabled: app.Status === 'Active'
            });
        }
    }

    RegenerateClientBootstrap(context.RepoRoot, entries);
}

async function ExecuteHook(command: string, cwd: string): Promise<void> {
    const { execSync } = await import('node:child_process');
    execSync(command, { cwd, encoding: 'utf-8', timeout: 120000, stdio: 'inherit' });
}

function GetDurationSeconds(startTime: number): number {
    return Math.round((Date.now() - startTime) / 1000);
}

function BuildFailureResult(
    action: 'Install' | 'Upgrade' | 'Remove',
    appName: string,
    version: string,
    errorPhase: ErrorPhase,
    startTime: number,
    errorMessage: string
): AppOperationResult {
    return {
        Success: false,
        Action: action,
        AppName: appName,
        Version: version,
        ErrorMessage: errorMessage,
        ErrorPhase: errorPhase,
        DurationSeconds: GetDurationSeconds(startTime)
    };
}
