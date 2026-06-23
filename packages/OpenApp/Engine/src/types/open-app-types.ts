/**
 * Shared types for the MJ Open App Engine.
 *
 * These types are used throughout the engine for tracking app state,
 * installation actions, error phases, and progress reporting.
 */

/**
 * Possible statuses for an installed Open App.
 * Matches the CHECK constraint on the OpenApp.Status column.
 */
export type AppStatus = 'Active' | 'Disabled' | 'Error' | 'Installing' | 'Upgrading' | 'Removing' | 'Removed';

/**
 * Actions recorded in the Open App Install History table.
 * Matches the CHECK constraint on OpenAppInstallHistory.Action.
 */
export type InstallAction = 'Install' | 'Upgrade' | 'Remove';

/**
 * Phases in the install/upgrade/remove lifecycle.
 * Recorded in OpenAppInstallHistory.ErrorPhase when an operation fails.
 */
export type ErrorPhase = 'Schema' | 'Migration' | 'Packages' | 'Config' | 'Hooks' | 'Record';

/**
 * Status of an inter-app dependency.
 * Matches the CHECK constraint on OpenAppDependency.Status.
 */
export type DependencyStatus = 'Satisfied' | 'Missing' | 'Incompatible';

/**
 * Progress callbacks for installation operations.
 * Follows the same callback pattern as mj-sync's PushCallbacks.
 */
export interface AppInstallCallbacks {
    /** Called when an operation phase progresses (e.g. "Fetching manifest...") */
    OnProgress?: (phase: string, message: string) => void;
    /** Called when an operation phase completes successfully */
    OnSuccess?: (phase: string, message: string) => void;
    /** Called when an operation phase encounters an error */
    OnError?: (phase: string, message: string) => void;
    /** Called for non-fatal warnings during an operation */
    OnWarn?: (phase: string, message: string) => void;
    /** Called for general log messages */
    OnLog?: (message: string) => void;
    /** Called when the engine needs user confirmation (e.g. destructive actions) */
    OnConfirm?: (message: string) => Promise<boolean>;

    // ── Interactive prompt callbacks ──────────────────────────────────────────
    // Wired by the CLI to @inquirer/prompts; absent for headless/non-interactive
    // callers (in which case in-process hook modules should fall back to defaults).
    /** Prompt for free-text input. */
    OnPromptInput?: (message: string, opts?: { default?: string }) => Promise<string>;
    /** Prompt for a yes/no confirmation with an optional default. */
    OnPromptConfirm?: (message: string, opts?: { default?: boolean }) => Promise<boolean>;
    /** Prompt to choose one option from a list. */
    OnPromptSelect?: (message: string, choices: Array<{ name: string; value: string }>) => Promise<string>;
    /** Prompt for a masked secret (e.g. an API key). */
    OnPromptPassword?: (message: string) => Promise<string>;
}

/**
 * Payload passed to an in-process lifecycle hook module's default export
 * (referenced by manifest `hooks.postInstallModule` / `preRemoveModule` /
 * `postUpgradeModule`). The engine resolves the module from the consumer's
 * node_modules, imports it, and awaits `default(payload)`.
 *
 * Hook authors (e.g. the Skip Client app) import this type from
 * `@memberjunction/open-app-engine` and type their default export against it.
 * `Provider`/`ContextUser` are intentionally loosely typed here to avoid a hard
 * dependency on `@memberjunction/core` from this types module; cast them to
 * `IMetadataProvider` / `UserInfo` in the hook.
 */
export interface AppHookPayload {
    /** The installed/affected app record. */
    App: InstalledAppInfo;
    /** Consumer monorepo root (process.cwd() at install time). */
    RepoRoot: string;
    /** Live MJ metadata/data provider (cast to IMetadataProvider). */
    Provider: unknown;
    /** Context user the engine runs entity operations as (cast to UserInfo). */
    ContextUser: unknown;
    /** Interactive + progress callbacks (prompt callbacks present only in interactive installs). */
    Callbacks?: AppInstallCallbacks;
    /** The validated manifest as a plain object (typed as MJAppManifest by consumers). */
    Manifest: unknown;
}

/**
 * Options for the install command.
 */
export interface InstallOptions {
    /** GitHub repository URL or app name (for registry lookup) */
    Source: string;
    /** Specific version to install (default: latest) */
    Version?: string;
    /** Enable verbose output */
    Verbose?: boolean;
    /** Allow schema names starting with '__'. Dangerous; MJ-internal apps only. */
    AllowDoubleUnderscoreSchema?: boolean;
    /**
     * @internal Set by the orchestrator when installing the pre-resolved members
     * of a dependency graph in topological order — never set this directly. When
     * true, the engine skips dependency resolution and installs ONLY this app,
     * because each member's transitive dependencies were already resolved and
     * installed ahead of it by the top-level call; re-resolving here would be
     * redundant and (for cycles) could recurse without bound. Not exposed via the
     * CLI. The leading underscore follows the same internal-use-only naming
     * convention as `RunViewParams._fromEngine`.
     */
    _skipDependencyResolution?: boolean;
}

/**
 * Subset of {@link InstallOptions} forwarded from a top-level `mj app install`
 * to its recursive dependency installs. Behavior/environment flags that should
 * govern the entire install run (the parent app and every dependency it pulls
 * in) belong here. App-identity options (`Source`, `Version`) stay per-app and
 * are NOT passthrough — each dependency has its own source and resolves its
 * own latest release.
 *
 * Expand by adding fields to the `Pick` list when a new behavior flag is added
 * to {@link InstallOptions} and should also apply to dependency installs.
 * Adding a field here is the single place to wire passthrough semantics; the
 * orchestrator and any caller pick it up automatically.
 */
export type PassthroughInstallOptions = Pick<InstallOptions, 'AllowDoubleUnderscoreSchema' | 'Verbose'>;

/**
 * Options for the upgrade command.
 */
export interface UpgradeOptions {
    /** Name of the installed app to upgrade */
    AppName: string;
    /** Specific version to upgrade to (default: latest) */
    Version?: string;
    /** Enable verbose output */
    Verbose?: boolean;
    /** Allow schema names starting with '__'. Dangerous; MJ-internal apps only. */
    AllowDoubleUnderscoreSchema?: boolean;
}

/**
 * Options for the remove command.
 */
export interface RemoveOptions {
    /** Name of the installed app to remove */
    AppName: string;
    /** Keep the database schema and data (don't DROP SCHEMA) */
    KeepData?: boolean;
    /** Force removal even if other apps depend on this one */
    Force?: boolean;
    /** Enable verbose output */
    Verbose?: boolean;
    /**
     * Allow dropping schemas whose name starts with '__' (normally reserved for MJ internals).
     * The exact-match reserved list (dbo/sys/guest/INFORMATION_SCHEMA/__mj) remains blocked.
     * Dangerous; intended for MJ-internal apps only.
     */
    AllowDoubleUnderscoreSchema?: boolean;
}

/**
 * Result of an install, upgrade, or remove operation.
 */
export interface AppOperationResult {
    /** Whether the operation succeeded */
    Success: boolean;
    /** The action that was performed */
    Action: InstallAction;
    /** The app name */
    AppName: string;
    /** The version installed/upgraded to (or removed from) */
    Version: string;
    /** Error message if the operation failed */
    ErrorMessage?: string;
    /** Which phase failed */
    ErrorPhase?: ErrorPhase;
    /** How long the operation took in seconds */
    DurationSeconds: number;
    /** Summary of what changed */
    Summary?: string;
}

/**
 * Information about an installed app, as stored in the MJ: Open Apps table.
 */
export interface InstalledAppInfo {
    /** Primary key (UNIQUEIDENTIFIER) */
    ID: string;
    /** Unique app name from the manifest (e.g. "acme-crm") */
    Name: string;
    /** Human-readable display name */
    DisplayName: string;
    /** Short description of the app */
    Description: string | null;
    /** Current installed semver version */
    Version: string;
    /** Publisher name from the manifest */
    Publisher: string;
    /** Publisher contact email */
    PublisherEmail: string | null;
    /** Publisher website URL */
    PublisherURL: string | null;
    /** GitHub repository URL */
    RepositoryURL: string;
    /** Database schema name (if the app uses one) */
    SchemaName: string | null;
    /** Semver range of compatible MJ versions */
    MJVersionRange: string;
    /** SPDX license identifier */
    License: string | null;
    /** Font Awesome icon class or emoji */
    Icon: string | null;
    /** Hex color for UI theming (#RRGGBB) */
    Color: string | null;
    /** Full mj-app.json manifest as a JSON string */
    ManifestJSON: string;
    /** JSON Schema for user-configurable settings */
    ConfigurationSchemaJSON: string | null;
    /** ID of the user who installed this app */
    InstalledByUserID: string;
    /** Current app status */
    Status: AppStatus;
}

/**
 * Resolved dependency in the install order.
 */
export interface ResolvedDependency {
    /** App name */
    AppName: string;
    /** Required version range */
    VersionRange: string;
    /** GitHub repository URL */
    Repository: string;
    /** Whether this dependency is already installed */
    AlreadyInstalled: boolean;
    /** Currently installed version (if installed) */
    InstalledVersion?: string;
}
