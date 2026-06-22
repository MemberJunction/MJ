/**
 * Shared context builder for MJ Open App CLI commands.
 *
 * Constructs the OrchestratorContext needed by the engine's install/upgrade/remove
 * functions, using the MJ entity framework (Metadata, RunView, BaseEntity). The
 * backing data provider is selected from the configured database platform
 * (`DB_PLATFORM` env var / `dbPlatform` config): SQL Server (default) or
 * PostgreSQL — so `mj app …` works on either backend and the engine's
 * platform-aware install/migration paths receive a provider whose
 * `Dialect.PlatformKey` matches the real database.
 */
import sql from 'mssql';
import ora from 'ora-classic';
import { createRequire } from 'node:module';
import { UserInfo, SetProvider, type DatabaseProviderBase } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { PostgreSQLDataProvider, PostgreSQLProviderConfigData, type PGConnectionConfig } from '@memberjunction/postgresql-dataprovider';
import { getValidatedConfig } from '../config.js';

type ResolvedConfig = ReturnType<typeof getValidatedConfig>;

// ─────────────────────────────────────────────────────────────────────────────
// Provider initialization (lazy singleton) — platform-aware
// ─────────────────────────────────────────────────────────────────────────────

let _pool: sql.ConnectionPool | null = null;          // SQL Server pool (mssql)
let _pgProvider: PostgreSQLDataProvider | null = null; // PostgreSQL provider (owns its own pg pool)
let _provider: DatabaseProviderBase | null = null;
let _initPromise: Promise<DatabaseProviderBase> | null = null;
// System user resolved by the PostgreSQL path (UserCache is SQL-Server-specific, so
// the PG path can't populate it — it resolves the user directly instead). Null on
// the SQL Server path, where getSystemUserInfo() reads UserCache as before.
let _systemUser: UserInfo | null = null;

/**
 * Initializes the MJ data provider for the configured platform if not already
 * done, and populates UserCache. Selects SQL Server or PostgreSQL based on
 * `config.dbPlatform` (resolved from `DB_PLATFORM`).
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
    return config.dbPlatform === 'postgresql'
      ? createPostgresProvider(config)
      : createSqlServerProvider(config);
  })();

  _provider = await _initPromise;
  return _provider;
}

/**
 * Builds the SQL Server data provider (default platform).
 */
async function createSqlServerProvider(config: ResolvedConfig): Promise<DatabaseProviderBase> {
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

  _pool = new sql.ConnectionPool(poolConfig);
  await _pool.connect();

  const providerConfig = new SQLServerProviderConfigData(_pool, config.coreSchema ?? '__mj');
  return (await setupSQLServerClient(providerConfig)) as unknown as DatabaseProviderBase;
}

/**
 * Builds the PostgreSQL data provider. SSL is resolved (see {@link resolvePostgresSsl})
 * to work across local, self-hosted, and managed Postgres — e.g. AWS RDS/Aurora,
 * which defaults to `rds.force_ssl=1` and rejects an unencrypted channel.
 */
async function createPostgresProvider(config: ResolvedConfig): Promise<DatabaseProviderBase> {
  const connectionConfig: PGConnectionConfig = {
    Host: config.dbHost,
    Port: config.dbPort,
    Database: config.dbDatabase,
    User: config.codeGenLogin,
    Password: config.codeGenPassword,
    SSL: resolvePostgresSsl(config),
  };

  const coreSchema = config.coreSchema ?? '__mj';
  const pgConfig = new PostgreSQLProviderConfigData(
    connectionConfig,
    coreSchema,
    1, // checkRefreshIntervalSeconds — must be > 0 to trigger the provider's initial metadata load (matches CodeGen's PG path)
  );

  _pgProvider = new PostgreSQLDataProvider();
  await _pgProvider.Config(pgConfig);
  // Register as the process-global provider so BaseEntity + Metadata (used by the
  // OpenApp engine's RunView calls) resolve to it. setupSQLServerClient does this
  // for the SQL Server path; the PG path must do it explicitly (as CodeGen does).
  SetProvider(_pgProvider);

  // UserCache (used by the SQL Server path via setupSQLServerClient) is mssql-specific
  // — its Refresh() takes an mssql ConnectionPool. The PostgreSQL path resolves the
  // system user directly from the platform-agnostic vwUsers/vwUserRoles views, exactly
  // as CodeGen's setupPostgreSQLDataSource does.
  _systemUser = await resolvePostgresSystemUser(_pgProvider, coreSchema);
  return _pgProvider as unknown as DatabaseProviderBase;
}

/**
 * Loads users + their roles from the PostgreSQL `vwUsers` / `vwUserRoles` views and
 * returns the system user (preferring an Owner, else the first user). Mirrors the
 * user-resolution in CodeGen's `setupPostgreSQLDataSource`.
 */
async function resolvePostgresSystemUser(provider: PostgreSQLDataProvider, coreSchema: string): Promise<UserInfo> {
  // ExecuteSQL auto-quotes PascalCase identifiers (vwUsers/vwUserRoles), so unquoted
  // mixed-case is correct here (the lowercase schema is left as-is).
  const users = await provider.ExecuteSQL<Record<string, unknown>>(`SELECT * FROM ${coreSchema}.vwUsers`);
  const roles = await provider.ExecuteSQL<Record<string, unknown>>(`SELECT * FROM ${coreSchema}.vwUserRoles`);

  const userInfos = users.map((user) => {
    user.UserRoles = roles.filter(
      (role) => String(role.UserID).toLowerCase() === String(user.ID).toLowerCase(),
    );
    return new UserInfo(provider, user);
  });

  const systemUser = userInfos.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? userInfos[0];
  if (!systemUser) {
    throw new Error(
      `No users found in PostgreSQL (${coreSchema}.vwUsers is empty). Cannot determine system user for Open App operations.`,
    );
  }
  return systemUser;
}

/**
 * Resolves the PostgreSQL SSL setting so `mj app` works on every Postgres flavor:
 *  - Managed hosts (AWS RDS/Aurora, `*.amazonaws.com`) → SSL on (Aurora defaults to
 *    `rds.force_ssl=1`, which rejects an unencrypted connection).
 *  - Explicit `DB_ENCRYPT` is honored (true → on, false → off).
 *  - Otherwise `undefined` → the provider applies its own default (off in dev,
 *    on in production).
 * `rejectUnauthorized` follows `dbTrustServerCertificate`, mirroring the SQL Server
 * flag — set `DB_TRUST_SERVER_CERTIFICATE=1` for RDS when you don't supply the
 * Amazon RDS CA bundle.
 */
function resolvePostgresSsl(config: ResolvedConfig): PGConnectionConfig['SSL'] {
  const host = (config.dbHost ?? '').toLowerCase();
  const isManaged =
    host.endsWith('.rds.amazonaws.com') || host.includes('.rds.') || host.endsWith('.amazonaws.com');
  const explicitlySet = process.env.DB_ENCRYPT !== undefined;

  if (explicitlySet && config.dbEncrypt === false) {
    return false;
  }
  if (isManaged || (explicitlySet && config.dbEncrypt === true)) {
    return { rejectUnauthorized: !config.dbTrustServerCertificate };
  }
  return undefined; // let the PostgreSQL provider apply its own default
}

/**
 * Closes the shared connection(s). Call on CLI exit for cleanup.
 */
export async function closeConnectionPool(): Promise<void> {
  try {
    if (_pool?.connected) {
      await _pool.close();
    }
    if (_pgProvider) {
      await _pgProvider.Dispose();
    }
  } finally {
    _pool = null;
    _pgProvider = null;
    _provider = null;
    _initPromise = null;
    _systemUser = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System User
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the system user for Open App operations.
 * Falls back to Owner user, then first active user if no system user exists.
 */
function getSystemUserInfo(): UserInfo {
  // PostgreSQL path resolves the user directly during provider init (UserCache is
  // SQL-Server-specific and is never populated on PG).
  if (_systemUser) {
    return _systemUser;
  }

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
