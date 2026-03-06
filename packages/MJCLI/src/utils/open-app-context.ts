/**
 * Shared context builder for MJ Open App CLI commands.
 *
 * Constructs the OrchestratorContext needed by the engine's install/upgrade/remove
 * functions, using the MJ entity framework (Metadata, RunView, BaseEntity) backed
 * by the SQL Server data provider.
 */
import sql from 'mssql';
import ora from 'ora-classic';
import type { UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, SQLServerDataProvider, UserCache } from '@memberjunction/sqlserver-dataprovider';
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

/**
 * Resolves the system user for Open App operations.
 * Falls back to Owner user, then first active user if no system user exists.
 */
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
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a context user for read-only commands (list, info, check-updates).
 * Initializes the MJ runtime and returns the system user.
 */
export async function buildContextUser(): Promise<UserInfo> {
  await ensureProviderInitialized();
  return getSystemUserInfo();
}

/**
 * Builds the full OrchestratorContext for install/upgrade/remove/disable/enable commands.
 */
export async function buildOrchestratorContext(
  command: { log: (msg: string) => void; warn: (msg: string | Error) => void },
  verbose?: boolean,
): Promise<OrchestratorContextShape> {
  const config = getValidatedConfig();
  const { provider } = await ensureProviderInitialized();
  const contextUser = getSystemUserInfo();
  const spinner = verbose ? ora() : undefined;

  return {
    ContextUser: contextUser,
    DatabaseProvider: provider,
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
  ContextUser: UserInfo;
  DatabaseProvider: SQLServerDataProvider;
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
  };
}

/** Reads the current MJ version from MJGlobal's package.json. */
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
