/**
 * Type declarations for @memberjunction/mj-open-app-engine.
 *
 * This ambient module declaration allows MJCLI to compile without
 * requiring the engine package to be linked at build time. The engine
 * is loaded dynamically at runtime via `await import()`.
 */
declare module '@memberjunction/mj-open-app-engine' {
  import type { UserInfo, DatabaseProviderBase } from '@memberjunction/core';

  /** Loose context type accepted by orchestrator functions. */
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface OrchestratorContext {
    ContextUser: UserInfo;
    DatabaseProvider: DatabaseProviderBase;
    DatabaseConfig: {
      Host: string;
      Port: number;
      Database: string;
      User: string;
      Password: string;
      TrustedConnection?: boolean;
    };
    GitHubOptions: {
      Token?: string;
    };
    RepoRoot: string;
    MJVersion: string;
    Callbacks?: {
      OnProgress?: (phase: string, message: string) => void;
      OnSuccess?: (phase: string, message: string) => void;
      OnError?: (phase: string, message: string) => void;
      OnWarn?: (phase: string, message: string) => void;
      OnLog?: (message: string) => void;
      OnConfirm?: (message: string) => Promise<boolean>;
    };
  }

  interface AppOperationResult {
    Success: boolean;
    AppName: string;
    Version: string;
    Action?: 'Install' | 'Upgrade' | 'Remove';
    ErrorMessage?: string;
    ErrorPhase?: string;
    DurationSeconds?: number;
    Summary?: string;
  }

  interface InstalledAppInfo {
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
    Status: 'Active' | 'Disabled' | 'Error' | 'Installing' | 'Upgrading' | 'Removing' | 'Removed';
  }

  export function InstallApp(
    options: { Source: string; Version?: string; Verbose?: boolean },
    context: OrchestratorContext
  ): Promise<AppOperationResult>;

  export function UpgradeApp(
    options: { AppName: string; Version?: string; Verbose?: boolean },
    context: OrchestratorContext
  ): Promise<AppOperationResult>;

  export function RemoveApp(
    options: { AppName: string; KeepData?: boolean; Force?: boolean; Verbose?: boolean },
    context: OrchestratorContext
  ): Promise<AppOperationResult>;

  export function DisableApp(
    appName: string,
    context: OrchestratorContext
  ): Promise<AppOperationResult>;

  export function EnableApp(
    appName: string,
    context: OrchestratorContext
  ): Promise<AppOperationResult>;

  export function ListInstalledApps(
    contextUser: UserInfo
  ): Promise<InstalledAppInfo[]>;

  export function FindInstalledApp(
    contextUser: UserInfo,
    appName: string
  ): Promise<InstalledAppInfo | null>;

  export function GetLatestVersion(
    repoUrl: string,
    options: { Token?: string }
  ): Promise<string | null>;
}
