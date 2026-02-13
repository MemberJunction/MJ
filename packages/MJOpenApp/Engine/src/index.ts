/**
 * MJ Open App Engine
 *
 * Packaging, distribution, and installation system for MJ Open Apps.
 * This package provides the core engine used by the `mj app` CLI commands
 * to install, upgrade, remove, and manage Open Apps.
 */

// Manifest schema and validation
export { mjAppManifestSchema } from './manifest/manifest-schema.js';
export type { MJAppManifest, ManifestPackageEntry, PackageRole } from './manifest/manifest-schema.js';
export { LoadManifestFromFile, ParseAndValidateManifest, ValidateManifestObject } from './manifest/manifest-loader.js';
export type { ManifestLoadResult } from './manifest/manifest-loader.js';

// Types
export type {
    AppStatus,
    InstallAction,
    ErrorPhase,
    DependencyStatus,
    AppInstallCallbacks,
    InstallOptions,
    UpgradeOptions,
    RemoveOptions,
    AppOperationResult,
    InstalledAppInfo,
    ResolvedDependency
} from './types/open-app-types.js';

// Dependency resolution
export { ResolveDependencies } from './dependency/dependency-resolver.js';
export type {
    DependencyNode,
    DependencyResolutionResult,
    InstalledAppMap
} from './dependency/dependency-resolver.js';
export {
    CheckMJVersionCompatibility,
    CheckDependencyVersionCompatibility,
    IsValidUpgrade
} from './dependency/version-checker.js';
export type { VersionCheckResult } from './dependency/version-checker.js';

// GitHub client
export {
    FetchManifestFromGitHub,
    ListGitHubReleases,
    DownloadMigrations,
    GetLatestVersion,
    ParseGitHubUrl
} from './github/github-client.js';
export type {
    GitHubClientOptions,
    GitHubRelease,
    ManifestFetchResult,
    MigrationDownloadResult
} from './github/github-client.js';

// Install handlers
export { CreateAppSchema, DropAppSchema, SchemaExists, ValidateSchemaName } from './install/schema-manager.js';
export type { SchemaManagerConnection, SchemaOperationResult } from './install/schema-manager.js';

export { RunAppMigrations } from './install/migration-runner.js';
export type { MigrationRunOptions, MigrationRunResult, FlywayDatabaseConfig, SkywayDatabaseConfig } from './install/migration-runner.js';

export { AddAppPackages, RemoveAppPackages, RunNpmInstall } from './install/package-manager.js';
export type { PackageManagerOptions, PackageOperationResult } from './install/package-manager.js';

export {
    AddServerDynamicPackages,
    RemoveServerDynamicPackages,
    ToggleServerDynamicPackages
} from './install/config-manager.js';
export type { DynamicPackageEntry, ConfigOperationResult } from './install/config-manager.js';

export { RegenerateClientBootstrap } from './install/client-bootstrap-gen.js';
export type { ClientBootstrapEntry } from './install/client-bootstrap-gen.js';

export {
    RecordAppInstallation,
    UpdateAppRecord,
    SetAppStatus,
    RecordInstallHistoryEntry,
    RecordAppDependencies,
    FindInstalledApp,
    ListInstalledApps,
    FindDependentApps
} from './install/history-recorder.js';
export type { MJDataProvider } from './install/history-recorder.js';

// Orchestrator (main entry point for CLI)
export {
    InstallApp,
    UpgradeApp,
    RemoveApp,
    DisableApp,
    EnableApp
} from './install/install-orchestrator.js';
export type { OrchestratorContext } from './install/install-orchestrator.js';
