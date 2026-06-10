/**
 * Shared context builder for MJ Open App CLI commands.
 *
 * Constructs the OrchestratorContext needed by the engine's install/upgrade/remove
 * functions, using the MJ entity framework (Metadata, RunView, BaseEntity) backed
 * by the SQL Server data provider.
 */
import sql from 'mssql';
import ora from 'ora-classic';
import { createRequire } from 'node:module';
import { UserInfo, type DatabaseProviderBase, Metadata, SetProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { getValidatedConfig } from '../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Provider initialization (lazy singleton)
// ─────────────────────────────────────────────────────────────────────────────

let _provider: DatabaseProviderBase | null = null;
let _initPromise: Promise<DatabaseProviderBase> | null = null;
/** Platform-specific teardown registered by the active init path. */
let _closeFn: (() => Promise<void>) | null = null;

/**
 * Initializes the MJ data provider for the configured platform if not already done.
 * Selects the SQL Server or PostgreSQL provider from `config.dbPlatform`, configures it,
 * and populates UserCache. Idempotent — repeated calls return the cached provider.
 */
async function ensureProviderInitialized(): Promise<DatabaseProviderBase> {
  if (_provider) {
    return _provider;
  }
  if (_initPromise) {
    return _initPromise;
  }

  _initPromise = (async () => {
    const config = getValidatedConfig();
    const platform = (config.dbPlatform ?? 'sqlserver').toLowerCase();
    // Composition root: select the concrete provider initializer from a table keyed by platform
    // (data-driven — no `platform === …` branching). This is the single place a platform string is
    // resolved to a provider; everything downstream uses the polymorphic DatabaseProviderBase.
    const PROVIDER_INITIALIZERS: Record<string, (c: CliConfig) => Promise<DatabaseProviderBase>> = {
      sqlserver: initSqlServerProvider,
      postgresql: initPostgresProvider,
    };
    _provider = await (PROVIDER_INITIALIZERS[platform] ?? initSqlServerProvider)(config);
    return _provider;
  })();

  return _initPromise;
}

type CliConfig = ReturnType<typeof getValidatedConfig>;

/** SQL Server provider init (mssql ConnectionPool + setupSQLServerClient). */
async function initSqlServerProvider(config: CliConfig): Promise<DatabaseProviderBase> {
  const poolConfig: sql.config = {
    server: config.dbHost,
    port: config.dbPort,
    database: config.dbDatabase,
    user: config.codeGenLogin,
    password: config.codeGenPassword,
    options: {
      encrypt: config.dbHost.includes('.database.windows.net'),
      trustServerCertificate: config.dbTrustServerCertificate ?? true,
      enableArithAbort: true,
    },
  };

  const pool = new sql.ConnectionPool(poolConfig);
  await pool.connect();
  const providerConfig = new SQLServerProviderConfigData(pool, config.coreSchema ?? '__mj');
  const provider = await setupSQLServerClient(providerConfig);
  _closeFn = async () => { if (pool.connected) { await pool.close(); } };
  return provider as unknown as DatabaseProviderBase;
}

/**
 * PostgreSQL provider init. `pg` and the PG data provider are dynamically imported so
 * SQL-Server-only environments never need them installed. Mirrors the MetadataSync /
 * MJServer PG bootstrap so CLI Open App commands have the same provider + System-user
 * semantics on PostgreSQL.
 */
async function initPostgresProvider(config: CliConfig): Promise<DatabaseProviderBase> {
  const pg = (await import('pg')).default;
  const { PostgreSQLDataProvider, PostgreSQLProviderConfigData } = await import('@memberjunction/postgresql-dataprovider');

  const coreSchema = config.coreSchema ?? '__mj';
  const port = config.dbPort ?? 5432;
  const pgPool = new pg.Pool({
    host: config.dbHost,
    port,
    user: config.codeGenLogin,
    password: config.codeGenPassword,
    database: config.dbDatabase,
    max: 10,
    min: 1,
  });
  const testClient = await pgPool.connect();
  await testClient.query('SELECT 1');
  testClient.release();

  const pgConfigData = new PostgreSQLProviderConfigData(
    {
      Host: config.dbHost,
      Port: port,
      Database: config.dbDatabase,
      User: config.codeGenLogin,
      Password: config.codeGenPassword,
      MaxConnections: 10,
      MinConnections: 1,
    },
    coreSchema,
    1, // > 0 triggers the initial metadata load (AllowRefresh gate in PostgreSQLDataProvider)
  );

  const provider = new PostgreSQLDataProvider();
  await provider.Config(pgConfigData);
  SetProvider(provider as unknown as DatabaseProviderBase);
  _closeFn = async () => { try { await pgPool.end(); } catch { /* best-effort */ } };

  await refreshUserCacheFromPG(pgPool, coreSchema);
  return provider as unknown as DatabaseProviderBase;
}

/** Populates UserCache from PG vwUsers/vwUserRoles (UserCache itself is provider-agnostic state). */
async function refreshUserCacheFromPG(pgPool: import('pg').Pool, coreSchema: string): Promise<void> {
  const uResult = await pgPool.query(`SELECT * FROM "${coreSchema}"."vwUsers"`);
  const rResult = await pgPool.query(`SELECT * FROM "${coreSchema}"."vwUserRoles"`);
  const userInfos = uResult.rows.map((user: Record<string, unknown>) =>
    new UserInfo(Metadata.Provider, {
      ...user,
      UserRoles: rResult.rows.filter((role: Record<string, unknown>) =>
        UUIDsEqual(role.UserID as string, user.ID as string)),
    })
  );
  (UserCache.Instance as unknown as Record<string, unknown>)['_users'] = userInfos;
}

/**
 * Closes the shared connection pool(s). Call on CLI exit for cleanup.
 */
export async function closeConnectionPool(): Promise<void> {
  if (_closeFn) {
    await _closeFn();
    _closeFn = null;
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
  const provider = await ensureProviderInitialized();
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
      Encrypt: config.dbEncrypt,
      TrustServerCertificate: config.dbTrustServerCertificate,
      RequestTimeout: config.dbRequestTimeout,
    },
    GitHubOptions: {
      Token: config.openApps?.github?.token ?? process.env.GITHUB_TOKEN,
      TokenMap: filterDefinedTokens(config.openApps?.github?.tokens),
    },
    RepoRoot: process.cwd(),
    MJVersion: getMJVersion(),
    ServerPackagePath: config.openApps?.serverPackagePath,
    ClientPackagePath: config.openApps?.clientPackagePath,
    PackageManager: config.openApps?.packageManager,
    VersionStrategy: config.openApps?.versionStrategy,
    // Zod infers object fields as optional; runtime schema validates they're present
    AdditionalTargets: config.openApps?.additionalTargets as Array<{ Path: string; Role: 'server' | 'client' }> | undefined,
    ClientBootstrapSubpath: config.openApps?.clientBootstrapSubpath,
    MJCoreSchema: config.coreSchema ?? '__mj',
    MigrationPlaceholders: config.openApps?.migrationPlaceholders,
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
  DatabaseProvider: DatabaseProviderBase;
  DatabaseConfig: {
    Host: string;
    Port: number;
    Database: string;
    User: string;
    Password: string;
    TrustedConnection?: boolean;
    Encrypt?: boolean;
    TrustServerCertificate?: boolean;
    RequestTimeout?: number;
  };
  GitHubOptions: {
    Token?: string;
    TokenMap?: Record<string, string>;
  };
  RepoRoot: string;
  MJVersion: string;
  ServerPackagePath?: string;
  ClientPackagePath?: string;
  PackageManager?: 'npm' | 'pnpm' | 'yarn';
  VersionStrategy?: 'semver' | 'exact' | 'catalog' | 'workspace' | 'auto';
  AdditionalTargets?: Array<{ Path: string; Role: 'server' | 'client' }>;
  ClientBootstrapSubpath?: string;
  MJCoreSchema?: string;
  MigrationPlaceholders?: Record<string, string>;
  Callbacks?: {
    OnProgress?: (phase: string, message: string) => void;
    OnSuccess?: (phase: string, message: string) => void;
    OnError?: (phase: string, message: string) => void;
    OnWarn?: (phase: string, message: string) => void;
    OnLog?: (message: string) => void;
  };
}

/**
 * Filters a token map from config, removing entries where the env var resolved to undefined.
 * This happens when mj.config.cjs references process.env.SOME_TOKEN but the var isn't set.
 */
function filterDefinedTokens(tokens: Record<string, string | undefined> | undefined): Record<string, string> | undefined {
  if (!tokens) return undefined;
  const filtered: Record<string, string> = {};
  for (const [url, token] of Object.entries(tokens)) {
    if (token) {
      filtered[url] = token;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

// createRequire is needed because getMJVersion uses require.resolve() to locate
// package.json files. This package is ESM ("type": "module"), so the CommonJS
// `require` global is not available at runtime on Node 22+. createRequire
// provides a CJS-compatible resolver scoped to this file's URL.
const require = createRequire(import.meta.url);

/** Reads the current MJ version. Tries @memberjunction/core first, then local MJGlobal. */
function getMJVersion(): string {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');

  // Try installed @memberjunction/core (works for all project layouts)
  try {
    const corePkgPath = require.resolve('@memberjunction/core/package.json');
    const pkgJson: { version: string } = JSON.parse(readFileSync(corePkgPath, 'utf-8'));
    return pkgJson.version;
  } catch { /* not found */ }

  // Fall back to local monorepo MJGlobal
  try {
    const raw: string = readFileSync(resolve(process.cwd(), 'packages/MJGlobal/package.json'), 'utf-8');
    const pkgJson: { version: string } = JSON.parse(raw);
    return pkgJson.version;
  } catch {
    throw new Error(
      'Could not determine MJ version. Ensure @memberjunction/core is installed or packages/MJGlobal/package.json exists.'
    );
  }
}
