/**
 * Shared context builder for MJ Open App CLI commands.
 *
 * Constructs the OrchestratorContext needed by the engine's install/upgrade/remove
 * functions, using the MJCLI config and stub providers (to be replaced with real
 * MJ data providers once full integration is wired up).
 */
import ora from 'ora-classic';
import { getValidatedConfig } from '../config.js';

/**
 * Builds an OrchestratorContext for the open-app-engine.
 *
 * We define the return type structurally here to avoid a compile-time dependency
 * on @memberjunction/mj-open-app-engine (which is imported dynamically at runtime).
 */
export async function buildOrchestratorContext(
  command: { log: (msg: string) => void; warn: (msg: string | Error) => void },
  verbose?: boolean
): Promise<OrchestratorContextShape> {
  const config = getValidatedConfig();
  const spinner = verbose ? ora() : undefined;

  return {
    DataProvider: buildStubDataProvider(),
    SchemaConnection: buildStubSchemaConnection(),
    DatabaseConfig: {
      Host: config.dbHost,
      Port: config.dbPort,
      Database: config.dbDatabase,
      User: config.codeGenLogin,
      Password: config.codeGenPassword,
    },
    GitHubOptions: {
      Token: config.openApps?.github?.token ?? process.env.GITHUB_TOKEN,
    },
    RepoRoot: process.cwd(),
    MJVersion: getMJVersion(),
    UserId: 'system', // Will be replaced with actual user lookup
    Callbacks: {
      OnProgress: (phase: string, message: string) => spinner?.start(`[${phase}] ${message}`),
      OnSuccess: (phase: string, message: string) => spinner?.succeed(`[${phase}] ${message}`),
      OnError: (phase: string, message: string) => spinner?.fail(`[${phase}] ${message}`),
      OnWarn: (phase: string, message: string) => command.warn(`[${phase}] ${message}`),
      OnLog: (message: string) => command.log(message),
    },
  };
}

/**
 * Structural type matching OrchestratorContext from the engine.
 * Defined here to avoid a compile-time import of the engine package.
 */
interface OrchestratorContextShape {
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

export function buildStubDataProvider(): OrchestratorContextShape['DataProvider'] {
  // Stub data provider — will be wired to MJ's RunView/Metadata in full integration
  return {
    CreateRecord: async () => 'stub-id',
    UpdateRecord: async () => {},
    FindRecord: async () => null,
    FindRecords: async () => [],
  };
}

function buildStubSchemaConnection(): OrchestratorContextShape['SchemaConnection'] {
  // Stub schema connection — will be wired to actual SQL connection
  return {
    ExecuteSQL: async () => [],
  };
}

function getMJVersion(): string {
  try {
    const { readFileSync } = require('node:fs');
    const { resolve } = require('node:path');
    const pkgJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/MJGlobal/package.json'), 'utf-8')
    ) as { version: string };
    return pkgJson.version;
  } catch {
    return '4.3.1';
  }
}
