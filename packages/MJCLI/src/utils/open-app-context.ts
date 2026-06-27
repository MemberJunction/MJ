/**
 * Shared context builder for MJ Open App CLI commands.
 *
 * Constructs the OrchestratorContext needed by the engine's install/upgrade/remove
 * functions, using the MJ entity framework (Metadata, RunView, BaseEntity). The
 * backing data provider is db-generic and is bootstrapped by MetadataSync's shared
 * provider lifecycle (`initializeProvider`), which selects SQL Server (default) or
 * PostgreSQL from the configured platform — so `mj app …` and `mj sync` share ONE
 * provider-init implementation, and the engine's platform-aware install/migration
 * paths receive a provider whose `Dialect.PlatformKey` matches the real database.
 */
import ora from 'ora-classic';
import { createRequire } from 'node:module';
import { UserInfo, type DatabaseProviderBase } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { initializeProvider, cleanupProvider } from '@memberjunction/metadata-sync';
import { getValidatedConfig } from '../config.js';

type ResolvedConfig = ReturnType<typeof getValidatedConfig>;

// ─────────────────────────────────────────────────────────────────────────────
// Provider initialization — delegated to MetadataSync's shared, db-generic
// provider lifecycle (lazy singleton; SQL Server or PostgreSQL). It builds +
// registers the provider and, on both platforms, populates UserCache (PG via its
// vwUsers/vwUserRoles bootstrap) — so getSystemUserInfo() reads UserCache uniformly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initializes (or returns the already-initialized) MJ data provider for the
 * configured platform, by adapting MJCLI's config to the `MJConfig` shape that
 * MetadataSync's shared `initializeProvider` consumes.
 */
async function ensureProviderInitialized(): Promise<DatabaseProviderBase> {
  return initializeProvider(toMJConfig(getValidatedConfig()));
}

/**
 * Adapts MJCLI's `ResolvedConfig` to MetadataSync's `MJConfig`. The two carry the
 * same connection facts under different names (codeGenLogin/coreSchema vs
 * dbUsername/mjCoreSchema). `dbTrustServerCertificate` and `dbEncrypt` are passed as
 * the Y/N strings MetadataSync reads; encrypt preserves the prior behavior of
 * auto-detecting Azure SQL only (DB_ENCRYPT is not honored for local SQL Server,
 * where encrypt-on without a trusted cert would break the connection).
 */
function toMJConfig(config: ResolvedConfig) {
  return {
    dbPlatform: config.dbPlatform,
    dbHost: config.dbHost,
    dbPort: config.dbPort,
    dbDatabase: config.dbDatabase,
    dbUsername: config.codeGenLogin,
    dbPassword: config.codeGenPassword,
    dbEncrypt: config.dbHost.includes('.database.windows.net') ? 'Y' : 'N',
    dbTrustServerCertificate: config.dbTrustServerCertificate ? 'Y' : 'N',
    mjCoreSchema: config.coreSchema ?? '__mj',
  };
}

/**
 * Closes the shared connection(s). Call on CLI exit for cleanup. Delegates to
 * MetadataSync's `cleanupProvider`, which tears down whichever pool (mssql or pg)
 * was opened and resets the shared provider singleton.
 */
export async function closeConnectionPool(): Promise<void> {
  await cleanupProvider();
}

// ─────────────────────────────────────────────────────────────────────────────
// System User
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the system user for Open App operations.
 * Falls back to Owner user, then first active user if no system user exists.
 */
function getSystemUserInfo(): UserInfo {
  // UserCache is populated by initializeProvider on BOTH platforms (PG via its
  // vwUsers/vwUserRoles bootstrap), so the same lookup works regardless of backend.
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
