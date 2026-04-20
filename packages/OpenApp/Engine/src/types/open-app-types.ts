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
}

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
