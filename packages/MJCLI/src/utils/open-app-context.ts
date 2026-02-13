/**
 * Shared context builder for MJ Open App CLI commands.
 *
 * Constructs the OrchestratorContext needed by the engine's install/upgrade/remove
 * functions, using the MJ entity framework (Metadata, RunView, BaseEntity) backed
 * by the SQL Server data provider.
 */
import sql from 'mssql';
import ora from 'ora-classic';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import type { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { getValidatedConfig } from '../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Provider initialization (lazy singleton)
// ─────────────────────────────────────────────────────────────────────────────

let _pool: sql.ConnectionPool | null = null;
let _provider: SQLServerDataProvider | null = null;
let _initPromise: Promise<SQLServerDataProvider> | null = null;

/**
 * Initializes the MJ SQL Server provider if not already done.
 * Creates a connection pool, configures the provider, and populates UserCache.
 */
async function ensureProviderInitialized(): Promise<{ pool: sql.ConnectionPool; provider: SQLServerDataProvider }> {
  if (_provider && _pool?.connected) {
    return { pool: _pool, provider: _provider };
  }

  if (_initPromise) {
    const provider = await _initPromise;
    return { pool: _pool!, provider };
  }

  _initPromise = (async () => {
    const config = getValidatedConfig();

    const poolConfig: sql.config = {
      server: config.dbHost,
      port: config.dbPort,
      database: config.dbDatabase,
      user: config.codeGenLogin,
      password: config.codeGenPassword,
      options: {
        encrypt: false,
        trustServerCertificate: config.dbTrustServerCertificate ?? true,
        enableArithAbort: true,
      },
    };

    _pool = new sql.ConnectionPool(poolConfig);
    await _pool.connect();

    const providerConfig = new SQLServerProviderConfigData(
      _pool,
      config.coreSchema ?? '__mj',
    );

    _provider = await setupSQLServerClient(providerConfig);
    return _provider;
  })();

  const provider = await _initPromise;
  return { pool: _pool!, provider };
}

/**
 * Closes the shared connection pool. Call on CLI exit for cleanup.
 */
export async function closeConnectionPool(): Promise<void> {
  if (_pool?.connected) {
    await _pool.close();
    _pool = null;
  }
  _provider = null;
  _initPromise = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// System User
// ─────────────────────────────────────────────────────────────────────────────

function getSystemUserInfo(): UserInfo {
  const sysUser = UserCache.Instance.GetSystemUser();
  if (sysUser) {
    return sysUser;
  }

  // Fallback: find first Owner user
  const ownerUser = UserCache.Instance.Users.find(u => u.IsActive && u.Type === 'Owner');
  if (ownerUser) {
    return ownerUser;
  }

  // Last resort: first active user
  const firstUser = UserCache.Instance.Users.find(u => u.IsActive);
  if (firstUser) {
    return firstUser;
  }

  throw new Error('No users found in UserCache. Cannot determine system user for Open App operations.');
}

// ─────────────────────────────────────────────────────────────────────────────
// MJ Data Provider (uses Metadata + RunView)
// ─────────────────────────────────────────────────────────────────────────────

function buildMJDataProvider(contextUser: UserInfo): OrchestratorContextShape['DataProvider'] {
  const md = new Metadata();
  const rv = new RunView();

  return {
    CreateRecord: async (entityName, values, _contextUserId) => {
      const entity = await md.GetEntityObject(entityName, contextUser);
      entity.NewRecord();
      for (const [field, value] of Object.entries(values)) {
        entity.Set(field, value);
      }
      const saved = await entity.Save();
      if (!saved) {
        throw new Error(`Failed to create ${entityName} record: ${entity.LatestResult?.Message ?? 'unknown error'}`);
      }
      return String(entity.Get('ID'));
    },

    UpdateRecord: async (entityName, id, values, _contextUserId) => {
      const entity = await md.GetEntityObject(entityName, contextUser);
      const loaded = await entity.InnerLoad(CompositeKey.FromID(id));
      if (!loaded) {
        throw new Error(`${entityName} record not found: ${id}`);
      }
      for (const [field, value] of Object.entries(values)) {
        entity.Set(field, value);
      }
      const saved = await entity.Save();
      if (!saved) {
        throw new Error(`Failed to update ${entityName} record ${id}: ${entity.LatestResult?.Message ?? 'unknown error'}`);
      }
    },

    FindRecord: async (entityName, filter) => {
      const result = await rv.RunView(
        {
          EntityName: entityName,
          ExtraFilter: filter,
          ResultType: 'simple',
          MaxRows: 1,
        },
        contextUser,
      );
      if (!result.Success) {
        throw new Error(`FindRecord failed for ${entityName}: ${result.ErrorMessage}`);
      }
      return result.Results.length > 0
        ? (result.Results[0] as Record<string, unknown>)
        : null;
    },

    FindRecords: async (entityName, filter) => {
      const result = await rv.RunView(
        {
          EntityName: entityName,
          ExtraFilter: filter,
          ResultType: 'simple',
        },
        contextUser,
      );
      if (!result.Success) {
        throw new Error(`FindRecords failed for ${entityName}: ${result.ErrorMessage}`);
      }
      return result.Results as Record<string, unknown>[];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Connection (raw SQL for DDL operations like CREATE SCHEMA)
// ─────────────────────────────────────────────────────────────────────────────

function buildSchemaConnection(pool: sql.ConnectionPool): OrchestratorContextShape['SchemaConnection'] {
  return {
    ExecuteSQL: async (sqlText: string) => {
      const result = await pool.request().query(sqlText);
      return result.recordset as Record<string, unknown>[];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a data provider for read-only commands (list, info, check-updates).
 * Initializes the MJ runtime and returns a provider backed by Metadata + RunView.
 */
export async function buildDataProvider(): Promise<OrchestratorContextShape['DataProvider']> {
  await ensureProviderInitialized();
  const contextUser = getSystemUserInfo();
  return buildMJDataProvider(contextUser);
}

/**
 * Builds the full OrchestratorContext for install/upgrade/remove/disable/enable commands.
 */
export async function buildOrchestratorContext(
  command: { log: (msg: string) => void; warn: (msg: string | Error) => void },
  verbose?: boolean,
): Promise<OrchestratorContextShape> {
  const config = getValidatedConfig();
  const { pool } = await ensureProviderInitialized();
  const contextUser = getSystemUserInfo();
  const spinner = verbose ? ora() : undefined;

  return {
    DataProvider: buildMJDataProvider(contextUser),
    SchemaConnection: buildSchemaConnection(pool),
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
    UserId: contextUser.ID,
    Callbacks: {
      OnProgress: (phase: string, message: string) => spinner?.start(`[${phase}] ${message}`),
      OnSuccess: (phase: string, message: string) => spinner?.succeed(`[${phase}] ${message}`),
      OnError: (phase: string, message: string) => command.warn(`[${phase}] ${message}`),
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

function getMJVersion(): string {
  try {
    const { readFileSync } = require('node:fs');
    const { resolve } = require('node:path');
    const pkgJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/MJGlobal/package.json'), 'utf-8'),
    ) as { version: string };
    return pkgJson.version;
  } catch {
    return '4.3.1';
  }
}
