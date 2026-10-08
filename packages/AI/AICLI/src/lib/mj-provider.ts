import { IMetadataProvider } from '@memberjunction/core';
import { SetupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import { AICliConfig, LoadAIConfig, ParseBooleanSetting, ParsePortSetting } from '../config';
import { DiscoverMJConfig, EffectiveProcessId, LoadDynamicPackages, StderrDynamicPackagesLogger } from '@memberjunction/dynamic-packages';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

// Import action and agent registrations
import '@memberjunction/core-actions';  // Register core actions
import '@memberjunction/ai-agents';     // Register agent types

// Import LLM providers to register them with ClassFactory
import '@memberjunction/ai-openai';
import '@memberjunction/ai-groq';
import '@memberjunction/ai-anthropic';

/**
 * Seconds between metadata-refresh checks, and zero turns them off.
 *
 * Each `mj ai` command is a short-lived process that never needs to see metadata change under it.
 * A non-zero value also makes `SetupSQLServerClient` start a `setInterval` that is not unref'd, so
 * it kept the process alive after the command had finished. The value used to be 180000, which
 * the provider reads as seconds: a fifty-hour timer.
 */
const METADATA_REFRESH_INTERVAL_SECONDS = 0;

/** Connection-pool sizing for a single CLI process. */
const CLI_POOL_SETTINGS = { max: 10, min: 2, idleTimeoutMillis: 30000 };

/** Driver error codes that mean the server could not be reached at all. */
const UNREACHABLE_SERVER_CODES = new Set(['ESOCKET', 'ECONNREFUSED', 'ETIMEOUT', 'ENOTFOUND']);

/** The fields this module reads off a driver error. mssql's `ConnectionError` carries them. */
interface DriverErrorDetails {
  message?: string;
  code?: string;
  userName?: string;
}

/** The connection settings that must be present before a connection is attempted. */
type CompleteDatabaseSettings = AICliConfig & Required<Pick<AICliConfig, 'dbDatabase' | 'dbUsername' | 'dbPassword'>>;

let isInitialized = false;
let connectionPool: sql.ConnectionPool | null = null;
let cliProvider: IMetadataProvider | null = null;

/**
 * Builds the SQL Server connection settings from this CLI's configuration.
 *
 * Every setting comes from mj.config.cjs or, when the file does not set it, from the environment
 * (see `BuildAIConfigDefaults`), so this connects wherever MJAPI does. `trustServerCertificate`
 * follows `dbTrustServerCertificate` / `DB_TRUST_SERVER_CERTIFICATE` as MJAPI's does, and is off
 * when neither is set. It used to be hard-coded on.
 *
 * @throws when the database name or the credentials are missing, naming where to set them.
 */
export function BuildSqlServerConnectionConfig(config: AICliConfig): sql.config {
  assertDatabaseSettings(config);

  const options: sql.config['options'] = {
    encrypt: true,
    trustServerCertificate: ParseBooleanSetting(config.dbTrustServerCertificate),
    enableArithAbort: true,
  };
  const instanceName = config.dbInstanceName?.trim();
  if (instanceName) {
    options.instanceName = instanceName;
  }

  return {
    server: config.dbHost || 'localhost',
    port: ParsePortSetting(config.dbPort, 'dbPort') ?? 1433,
    database: config.dbDatabase,
    user: config.dbUsername,
    password: config.dbPassword,
    options,
    pool: { ...CLI_POOL_SETTINGS },
  };
}

/**
 * Initialize this CLI process's MJ data provider and return it.
 *
 * The returned provider is also registered as the process-global default by
 * `SetupSQLServerClient`, which is the established CLI/server bootstrap pattern in MJ
 * (see `MJServer/src/index.ts`, `CodeGenLib`, etc.). Callers that want to thread the
 * provider explicitly through their own code can capture the return value here rather
 * than reaching for `Metadata.Provider` later.
 *
 * Calling this more than once in a process is idempotent — the cached provider is returned.
 * Call {@link CloseMJProvider} when done: the pool keeps connections open, and they keep the
 * process alive.
 */
export async function InitializeMJProvider(): Promise<IMetadataProvider> {
  if (isInitialized && cliProvider) {
    return cliProvider;
  }

  let sqlConfig: sql.config | undefined;
  try {
    const config = await LoadAIConfig();
    await loadAppServerPackages();
    sqlConfig = BuildSqlServerConnectionConfig(config);
    cliProvider = await connectProvider(sqlConfig, config.coreSchema || '__mj');
    isInitialized = true;
    return cliProvider;
  } catch (error: unknown) {
    await releasePoolAfterFailedStart();
    throw describeStartupFailure(error, sqlConfig);
  }
}

/** @deprecated Use {@link InitializeMJProvider}. */
export async function initializeMJProvider(): Promise<IMetadataProvider> {
  return InitializeMJProvider();
}

/**
 * Loads the installed Open Apps' server packages, which register their entity/action subclasses,
 * before the provider exists.
 *
 * When this CLI runs inside `mj`, the prerun hook has already loaded them and published its
 * process id (`cli:ai:…`), which EffectiveProcessId adopts so the same scoping and policy apply
 * here; packages already loaded are returned from cache, their startup export not re-run. Search
 * strategy 'none' matches LoadAIConfig() (cwd only), so the packages come from the same
 * mj.config.cjs the database settings did.
 */
async function loadAppServerPackages(): Promise<void> {
  const raw = DiscoverMJConfig(undefined, { searchStrategy: 'none' });
  // Stderr logger: this CLI's stdout is a JSON envelope under --format=json / --output=json,
  // and the loader's default console logger would print its progress lines ahead of it.
  await LoadDynamicPackages({
    processId: EffectiveProcessId('ai-cli'),
    tier: 'server',
    config: raw.config,
    configFilePath: raw.configFilePath,
    log: StderrDynamicPackagesLogger,
  });
}

/** Opens the pool and builds the provider on it. The pool is kept so {@link CloseMJProvider} can close it. */
async function connectProvider(sqlConfig: sql.config, coreSchema: string): Promise<IMetadataProvider> {
  connectionPool = new sql.ConnectionPool(sqlConfig);
  await connectionPool.connect();

  const providerConfig = new SQLServerProviderConfigData(connectionPool, coreSchema, METADATA_REFRESH_INTERVAL_SECONDS);

  // SetupSQLServerClient creates the SQLServerDataProvider and registers it as the
  // global default — the established CLI bootstrap pattern. Capture the same instance
  // here so callers receive it directly without reading Metadata.Provider later.
  return await SetupSQLServerClient(providerConfig);
}

/**
 * Closes a pool that was opened before startup failed, so a failed start does not leave
 * connections holding the process open. A failure to close is reported, not thrown: the startup
 * error is the one the caller needs.
 */
async function releasePoolAfterFailedStart(): Promise<void> {
  const pool = connectionPool;
  connectionPool = null;
  cliProvider = null;
  if (!pool) {
    return;
  }
  try {
    await pool.close();
  } catch (closeError: unknown) {
    console.error(`Also could not close the database connection pool: ${readDriverError(closeError).message ?? 'unknown error'}`);
  }
}

function assertDatabaseSettings(config: AICliConfig): asserts config is CompleteDatabaseSettings {
  if (!config.dbDatabase) {
    throw new Error(`❌ Database configuration missing

Problem: No database name is configured
Required: DB_DATABASE in the environment or .env, or dbDatabase in mj.config.cjs

Next steps:
1. Run this command from the workspace root, where .env and mj.config.cjs live
2. Check that .env sets DB_DATABASE (mj install writes it there)
3. Or set dbDatabase in mj.config.cjs`);
  }

  if (!config.dbUsername || !config.dbPassword) {
    throw new Error(`❌ Database credentials missing

Problem: The database username or password is not configured
Required: DB_USERNAME and DB_PASSWORD in the environment or .env, or dbUsername and dbPassword in mj.config.cjs

Next steps:
1. Run this command from the workspace root, where .env and mj.config.cjs live
2. Check that .env sets DB_USERNAME and DB_PASSWORD (mj install writes them there)
3. Or set dbUsername and dbPassword in mj.config.cjs`);
  }
}

/** Reads the fields this module reports off whatever a failed start threw. */
function readDriverError(error: unknown): DriverErrorDetails {
  if (typeof error === 'object' && error !== null) {
    const details = error as DriverErrorDetails;
    return { message: details.message, code: details.code, userName: details.userName };
  }
  return { message: String(error) };
}

/** Turns whatever a failed start threw into one error that says what went wrong and what to check. */
function describeStartupFailure(error: unknown, sqlConfig: sql.config | undefined): Error {
  const details = readDriverError(error);
  if (details.message?.startsWith('❌')) {
    // Already formatted (missing settings, a bad port) — pass it through untouched.
    return error instanceof Error ? error : new Error(details.message);
  }
  if (details.code === 'ELOGIN') {
    return new Error(`❌ Database authentication failed

Problem: The server rejected the username or password${details.userName ? ` (user: ${details.userName})` : ''}

Next steps:
1. Check DB_USERNAME and DB_PASSWORD in .env, or dbUsername and dbPassword in mj.config.cjs
2. Check that the user may access the database
3. Ensure SQL Server authentication is enabled`);
  }
  if (details.code && UNREACHABLE_SERVER_CODES.has(details.code)) {
    const target = sqlConfig ? `${sqlConfig.server}:${sqlConfig.port ?? 1433}` : 'the configured server';
    return new Error(`❌ Failed to connect to database server

Problem: Could not reach ${target} (${details.code}: ${details.message ?? 'no detail'})

Next steps:
1. Verify SQL Server is running and reachable at that host and port
2. Check DB_HOST and DB_PORT in .env, or dbHost and dbPort in mj.config.cjs
3. If the server uses a self-signed certificate, set DB_TRUST_SERVER_CERTIFICATE=1`);
  }
  return new Error(`❌ Failed to initialize MJ data provider

Problem: ${details.message || 'Unknown error'}
Context: Setting up SQL Server connection and MJ infrastructure

Next steps:
1. Check the database settings in .env (DB_*) and mj.config.cjs
2. Verify SQL Server is accessible
3. Ensure MJ core packages are built: pnpm run build

For debugging, run with --verbose flag for detailed error information.`);
}

export function GetConnectionPool(): sql.ConnectionPool {
  if (!connectionPool) {
    throw new Error(`❌ MJ Provider not initialized

Problem: Database connection not established
Likely cause: initializeMJProvider() was not called

This is an internal error. Please report this issue.`);
  }
  return connectionPool;
}

/** @deprecated Use {@link GetConnectionPool}. */
export function getConnectionPool(): sql.ConnectionPool {
  return GetConnectionPool();
}

/**
 * Returns the bound provider for this CLI process, or null if `initializeMJProvider()`
 * hasn't been called yet. Prefer calling `initializeMJProvider()` and capturing its
 * return value instead of relying on this getter — that keeps callers explicit about
 * provider ownership.
 */
export function GetMJProvider(): IMetadataProvider | null {
  return cliProvider;
}

/** @deprecated Use {@link GetMJProvider}. */
export function getMJProvider(): IMetadataProvider | null {
  return GetMJProvider();
}

/**
 * Closes the database pool this process opened, so nothing is left holding the process open.
 *
 * Safe to call when nothing was opened, and more than once. The module forgets the pool and the
 * provider before closing, so a later {@link InitializeMJProvider} starts fresh even if the close
 * itself fails — which it reports by throwing.
 */
export async function CloseMJProvider(): Promise<void> {
  const pool = connectionPool;
  connectionPool = null;
  cliProvider = null;
  isInitialized = false;
  if (pool) {
    await pool.close();
  }
}

/** @deprecated Use {@link CloseMJProvider}. */
export async function closeMJProvider(): Promise<void> {
  return CloseMJProvider();
}
