/**
 * @module @memberjunction/dynamic-packages
 *
 * Process-agnostic loader for packages whose names are only known at runtime: Open App server
 * and client packages recorded in `mj.config.cjs` `dynamicPackages.*[]` by `mj app install`,
 * a host's generated packages under `codeGeneration.packages`, and the packages of the Open App
 * whose repository a process is standing in (`mj-app.json`).
 *
 * MJAPI loads these at boot so the ClassFactory hands back an app's entity/action/provider
 * subclasses. Every other MJ process — the `mj` CLI (`sync push`, `app …`, `test`, …), the MCP
 * and A2A servers, the integration-test bootstrap, an ad-hoc script — needs the same behaviour,
 * and this package is where that behaviour lives so each host is one call:
 *
 * ```ts
 * import { LoadDynamicPackages, DiscoverMJConfig } from '@memberjunction/dynamic-packages';
 *
 * const { config, configFilePath } = DiscoverMJConfig();
 * await LoadDynamicPackages({ processId: 'mcp', config, configFilePath });
 * ```
 *
 * Entries can be scoped per process with `Processes` / `ExcludeProcesses`, whole processes can
 * be switched off with `dynamicPackages.policy`, and `MJ_DYNAMIC_PACKAGES=none` (or a host
 * flag that sets it) disables loading for one invocation.
 */
export type {
    DiscoveredDynamicPackage,
    DynamicPackageEntry,
    DynamicPackageSkipReason,
    DynamicPackageSource,
    DynamicPackageTier,
    DynamicPackagesConfig,
    DynamicPackagesLogger,
    DynamicPackagesMode,
    DynamicPackagesModeSource,
    DynamicPackagesReport,
    FailedDynamicPackage,
    LoadDynamicPackagesOptions,
    LoadedDynamicPackage,
    SkippedDynamicPackage,
    WorkspaceHome,
} from './types.js';
export { importFromHost, isResolutionFailure, resolvePackageJsonFromHost } from './host-import.js';
export { ANY_PROCESS, CliProcessId, MatchesProcess, NormalizeProcessId, ProcessIdMatches, ResolveMostSpecific } from './process-id.js';
export { DYNAMIC_PACKAGES_MODE_ENV_VAR, ResolveDynamicPackagesMode } from './mode.js';
export type { ResolvedDynamicPackagesMode } from './mode.js';
export {
    APP_MANIFEST_FILE_NAME,
    DiscoverAppManifestPackages,
    DiscoverGeneratedPackages,
    FindWorkspacePackageDir,
    GENERATED_PACKAGE_TYPES_BY_TIER,
    ReadDynamicPackagesConfig,
} from './discover.js';
export type { AppManifestDiscovery } from './discover.js';
export {
    ConsoleDynamicPackagesLogger,
    DiscoverMJConfig,
    LoadDynamicPackages,
    ResetLoadedDynamicPackages,
    SilentDynamicPackagesLogger,
    StderrDynamicPackagesLogger,
} from './loader.js';
