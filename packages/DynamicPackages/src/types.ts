/**
 * Types for the process-agnostic dynamic package loader.
 *
 * A "dynamic package" is an npm package whose name is only known at runtime — it is named by
 * configuration (`mj.config.cjs` `dynamicPackages.*[]`, written by `mj app install`; the
 * host's `codeGeneration.packages`), or by an Open App's own `mj-app.json` when a process runs
 * inside that app's repository. Importing one triggers its `@RegisterClass` decorators so the
 * ClassFactory returns the app's entity/action/provider subclasses instead of base-class
 * fallbacks. MJAPI has always done this at boot; every other MJ process (the CLI, MCP/A2A
 * servers, test bootstraps, ad-hoc scripts) needs the same thing, which is why the loader lives
 * in a package with no MJ runtime dependencies.
 */

/** Which package tier a process wants: server-side (Node) packages or client (browser) ones. */
export type DynamicPackageTier = 'server' | 'client';

/**
 * Whether a process should load dynamic packages at all. `'none'` is the escape hatch for
 * "raw" runs — restoring dumps, bulk ingestion, or diagnosing a package that breaks boot —
 * where custom `Save()` logic and lifecycle hooks must NOT run.
 */
export type DynamicPackagesMode = 'load' | 'none';

/**
 * Where the resolved mode came from, highest precedence first:
 * `MJ_DYNAMIC_PACKAGES` env var > programmatic option > `dynamicPackages.policy` > default.
 */
export type DynamicPackagesModeSource = 'env' | 'option' | 'policy' | 'default';

/**
 * One entry of `dynamicPackages.server[]` / `dynamicPackages.client[]` in mj.config.cjs.
 * `PackageName`, `StartupExport`, `AppName` and `Enabled` are written by `mj app install`;
 * `Processes` / `ExcludeProcesses` are hand-authored scoping (see {@link MatchesProcess}).
 */
export interface DynamicPackageEntry {
    /** npm package name to import. */
    PackageName: string;
    /** Optional named export to invoke after import (a registration kicker). */
    StartupExport?: string;
    /** Open App name this package belongs to (for tracking / pruning). */
    AppName?: string;
    /** Whether this package should be loaded anywhere. Treated as enabled unless explicitly `false`. */
    Enabled?: boolean;
    /**
     * Process IDs (or prefixes) this entry loads in. Omitted or empty = every process that asks
     * for the entry's tier. `['cli:sync']` loads for `cli:sync:push` and `cli:sync:pull` only;
     * `['mjapi', 'cli']` loads in the API and in every CLI command.
     */
    Processes?: string[];
    /** Process IDs (or prefixes) this entry must NOT load in, evaluated after {@link Processes}. */
    ExcludeProcesses?: string[];
}

/**
 * The `dynamicPackages` section of mj.config.cjs as this loader reads it.
 */
export interface DynamicPackagesConfig {
    server?: DynamicPackageEntry[];
    client?: DynamicPackageEntry[];
    /**
     * Per-process on/off policy keyed by process ID or prefix, e.g. `{ 'cli:codegen': 'none' }`.
     * The most specific matching key wins. Overridden by the `MJ_DYNAMIC_PACKAGES` env var and
     * by a programmatic `mode` option.
     */
    policy?: Record<string, DynamicPackagesMode>;
}

/** Where a loadable entry was discovered. */
export type DynamicPackageSource = 'config' | 'generated' | 'manifest';

/** Where a manifest-sourced package's workspace member lives on disk (the app's own repository). */
export interface WorkspaceHome {
    /** Directory holding the app's `mj-app.json`. */
    RepoDir: string;
    /** `code.sourceDirectory` from the manifest (default `packages`), relative to {@link RepoDir}. */
    SourceDirectory: string;
}

/** An entry the loader decided about, with its provenance. */
export interface DiscoveredDynamicPackage {
    Entry: DynamicPackageEntry;
    Source: DynamicPackageSource;
    /**
     * Present only for `'manifest'` entries: lets the loader fall back to importing the
     * workspace member by path when no resolution anchor can see it (pnpm strict layout).
     */
    WorkspaceHome?: WorkspaceHome;
}

/** A package the loader imported (and whose startup export, if any, it ran). */
export interface LoadedDynamicPackage extends DiscoveredDynamicPackage {
    /** The imported module namespace — hosts read conventions like `RESOLVER_PATHS` off it. */
    Module: Record<string, unknown>;
    /**
     * True when `StartupExport` named a function and it was invoked by THIS call. False when the
     * entry has no startup export, the named export is missing, or the package was already loaded
     * earlier in this process (the module is still returned; the hook is not run twice).
     */
    RanStartupExport: boolean;
}

/** Why an entry was not loaded. */
export type DynamicPackageSkipReason = 'disabled' | 'process-filter' | 'mode-none' | 'duplicate';

export interface SkippedDynamicPackage extends DiscoveredDynamicPackage {
    Reason: DynamicPackageSkipReason;
}

/** A package that resolved but failed while loading (its own error — never masked). */
export interface FailedDynamicPackage extends DiscoveredDynamicPackage {
    Error: unknown;
}

/** Logger seam so each host routes loader output through its own channel (stdout, stderr, spinner). */
export interface DynamicPackagesLogger {
    /** Normal progress ("Loaded …"). */
    info(message: string): void;
    /** Recoverable problems the operator must see (a package that threw while loading). */
    warn(message: string, error?: unknown): void;
    /** Detail that only matters when debugging (skips, filters, mode source). */
    verbose?(message: string): void;
}

export interface LoadDynamicPackagesOptions {
    /**
     * Identity of the calling process, lowercase and colon-separated: `mjapi`, `cli:sync:push`,
     * `mcp`, `a2a`, `integration-tests`. Entry `Processes` / `ExcludeProcesses` and
     * `dynamicPackages.policy` match against it by exact ID or by prefix segment.
     */
    processId: string;
    /** Raw (un-validated) mj.config.cjs object. Zod-parsed configs usually strip `dynamicPackages`; pass the raw one. */
    config?: Record<string, unknown> | null;
    /** Absolute path of the mj.config.cjs the config came from — the primary resolution anchor. */
    configFilePath?: string;
    /** Which tier to load. Defaults to `'server'`. */
    tier?: DynamicPackageTier;
    /**
     * Also load the host's generated packages named under `codeGeneration.packages`
     * (entities / actions / graphqlResolvers for the server tier). Defaults to `true`.
     */
    includeGeneratedPackages?: boolean;
    /**
     * Also discover packages from an Open App manifest (`mj-app.json`) found in
     * {@link appManifestDir} — the "running inside the app's own repo" case, where the app's
     * packages are workspace members but nothing has installed them into a host config.
     * Defaults to `true`.
     */
    discoverAppManifest?: boolean;
    /** Directory holding `mj-app.json`. Defaults to the config file's directory, else `process.cwd()`. */
    appManifestDir?: string;
    /** Programmatic mode override (below the env var, above config policy). */
    mode?: DynamicPackagesMode;
    /** Output channel. Defaults to `console`. */
    log?: DynamicPackagesLogger;
}

export interface DynamicPackagesReport {
    ProcessId: string;
    Tier: DynamicPackageTier;
    Mode: DynamicPackagesMode;
    ModeSource: DynamicPackagesModeSource;
    Loaded: LoadedDynamicPackage[];
    Skipped: SkippedDynamicPackage[];
    /** Package names no anchor could resolve — expected before `npm install` or an unbuilt workspace member. */
    NotFound: DiscoveredDynamicPackage[];
    Failed: FailedDynamicPackage[];
}
