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
export type AppStatus = 'Active' | 'Disabled' | 'Error' | 'Installing' | 'Upgrading' | 'Removing';

/**
 * Actions recorded in the Open App Install History table.
 * Matches the CHECK constraint on OpenAppInstallHistory.Action.
 */
export type InstallAction = 'Install' | 'Upgrade' | 'Remove';

/**
 * Phases in the install/upgrade/remove lifecycle.
 * Recorded in OpenAppInstallHistory.ErrorPhase when an operation fails.
 */
export type ErrorPhase = 'Schema' | 'Migration' | 'Packages' | 'Config' | 'Hooks';

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
    OnProgress?: (phase: string, message: string) => void;
    OnSuccess?: (phase: string, message: string) => void;
    OnError?: (phase: string, message: string) => void;
    OnWarn?: (phase: string, message: string) => void;
    OnLog?: (message: string) => void;
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
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string | null;
    Version: string;
    Publisher: string;
    PublisherEmail: string | null;
    PublisherURL: string | null;
    RepositoryURL: string;
    SchemaName: string | null;
    MJVersionRange: string;
    License: string | null;
    Icon: string | null;
    Color: string | null;
    ManifestJSON: string;
    ConfigurationSchemaJSON: string | null;
    InstalledByUserID: string;
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
