/**
 * Type declarations for @memberjunction/mj-open-app-engine.
 *
 * This ambient module declaration allows MJCLI to compile without
 * requiring the engine package to be linked at build time. The engine
 * is loaded dynamically at runtime via `await import()`.
 */
declare module '@memberjunction/mj-open-app-engine' {
  /** Loose context type accepted by orchestrator functions. */
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface OrchestratorContext {
    DataProvider: {
      CreateRecord: (entityName: string, values: Record<string, unknown>, contextUserId: string) => Promise<string>;
      UpdateRecord: (entityName: string, id: string, values: Record<string, unknown>, contextUserId: string) => Promise<void>;
      FindRecord: (entityName: string, filter: string) => Promise<Record<string, unknown> | null>;
      FindRecords: (entityName: string, filter: string) => Promise<Record<string, unknown>[]>;
    };
    SchemaConnection: {
      ExecuteSQL: (sql: string) => Promise<Record<string, unknown>[]>;
    };
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
    UserId: string;
    Callbacks?: {
      OnProgress?: (phase: string, message: string) => void;
      OnSuccess?: (phase: string, message: string) => void;
      OnError?: (phase: string, message: string) => void;
      OnWarn?: (phase: string, message: string) => void;
      OnLog?: (message: string) => void;
    };
  }

  /** Data provider subset used by read-only commands (list, info). */
  interface MJDataProvider {
    CreateRecord: (entityName: string, values: Record<string, unknown>, contextUserId: string) => Promise<string>;
    UpdateRecord: (entityName: string, id: string, values: Record<string, unknown>, contextUserId: string) => Promise<void>;
    FindRecord: (entityName: string, filter: string) => Promise<Record<string, unknown> | null>;
    FindRecords: (entityName: string, filter: string) => Promise<Record<string, unknown>[]>;
  }

  interface AppOperationResult {
    Success: boolean;
    AppName: string;
    Version: string;
    ErrorMessage?: string;
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
    Status: string;
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
    provider: MJDataProvider
  ): Promise<InstalledAppInfo[]>;

  export function FindInstalledApp(
    provider: MJDataProvider,
    appName: string
  ): Promise<InstalledAppInfo | null>;

  export function GetLatestVersion(
    repoUrl: string,
    options: { Token?: string }
  ): Promise<string | null>;
}
