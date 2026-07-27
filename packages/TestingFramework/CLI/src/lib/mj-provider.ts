/**
 * mj-provider.ts — provider setup for every `mj test` subcommand.
 *
 * Resolves the target backend from configuration and brings up the matching MJ data provider.
 * SQL Server and PostgreSQL are both first-class here: the whole point of the PG lane is to run
 * the SAME check code against a second backend, so anything one path does and the other skips
 * becomes a difference the parity suite would misattribute to the database.
 *
 * The two paths are deliberately symmetric — provider config → provider → user cache →
 * MJ startup. On SQL Server `setupSQLServerClient` performs the last two internally; the
 * PostgreSQL path performs them explicitly.
 */
import { SetProvider, Metadata, StartupManager } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { feedUserCacheFromPG, getActiveIntegrationStorage, _setCurrentServerBootstrap } from '@memberjunction/testing-integration';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { loadMJConfig } from '../utils/config-loader';
import type { MJConfig, MJDbPlatform } from '../utils/config-loader';

// Load environment variables from .env file
// Note: config-loader.ts also loads dotenv with override:true, but we include it here
// for completeness in case mj-provider is used standalone
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });

let isInitialized = false;
let connectionPool: sql.ConnectionPool | null = null;
/** Teardown for the PostgreSQL path, registered once its provider owns a pool. */
let closePostgresPool: (() => Promise<void>) | null = null;

/** Database settings for this run, after config values, env fallbacks and validation. */
interface ResolvedDbSettings {
  Platform: MJDbPlatform;
  Host: string;
  Port: number;
  Database: string;
  User: string;
  Password: string;
  Schema: string;
}

export async function initializeMJProvider(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Check if MJ provider is already initialized
  if (Metadata.Provider) { // global-provider-ok: CLI tool, single-provider context
    console.log('MJ Provider already initialized');
    isInitialized = true;
    return;
  }

  try {
    const config = await loadMJConfig();

    // Debug: Check what's in process.env and config
    console.log(`process.env.DB_DATABASE: ${process.env.DB_DATABASE}`);
    console.log(`config.dbDatabase: ${config.dbDatabase}`);

    const db = resolveDbSettings(config);

    console.log(`Connecting to ${db.Platform} database: ${db.Database} on ${db.Host}:${db.Port}`);
    if (db.Platform === 'postgresql') {
      await setupPostgreSQLProvider(db);
    } else {
      await setupSqlServerProvider(db);
    }

    logLoadedEntities();
    await publishIntegrationBootstrap(db);

    isInitialized = true;

  } catch (error) {
    throw describeInitializationFailure(error);
  }
}

/**
 * The driver-error shape both backends surface on a failed connect. `mssql` and `pg` both
 * decorate their errors with a `code` plus connection details; neither exposes a shared type,
 * so this names the fields we actually read rather than reaching for `any`.
 */
interface DatabaseConnectionError {
  message?: string;
  code?: string;
  address?: string;
  port?: number;
  userName?: string;
}

function asConnectionError(error: unknown): DatabaseConnectionError {
  return (error ?? {}) as DatabaseConnectionError;
}

/**
 * Pull the database settings out of the config (new and legacy shapes) and validate them.
 *
 * The platform is already resolved by `loadMJConfig`, which also layers the environment under
 * any missing key — so by the time we get here `dbPlatform` is always populated and every
 * other field reflects config-then-env precedence.
 */
function resolveDbSettings(config: MJConfig): ResolvedDbSettings {
  // Get database config from either legacy or new format
  const dbName = config.database?.name || config.dbDatabase;
  const dbHost = config.database?.host || config.dbHost;
  const dbPort = config.database?.port || config.dbPort;
  const dbUsername = config.database?.username || config.dbUsername;
  const dbPassword = config.database?.password || config.dbPassword;
  const dbSchema = config.database?.schema || config.coreSchema;

  // Validate required configuration
  if (!dbName) {
    throw new Error(`❌ Database configuration missing

Problem: Database name not specified in configuration
Required: Database name must be set in mj.config.cjs

Next steps:
1. Check your mj.config.cjs file
2. Set dbDatabase property to your MJ database name
3. Verify other database settings (dbHost, dbUsername, dbPassword)

Example configuration:
  module.exports = {
    dbDatabase: 'MemberJunction_Dev',
    dbHost: 'localhost',
    dbUsername: process.env.DB_USERNAME,
    dbPassword: process.env.DB_PASSWORD
  }`);
  }

  if (!dbUsername || !dbPassword) {
    throw new Error(`❌ Database credentials missing

Problem: Database username or password not configured
Required: Both dbUsername and dbPassword must be set

Next steps:
1. Check your mj.config.cjs file
2. Set dbUsername and dbPassword properties
3. Verify credentials are correct for your database

For security, use environment variables:
  module.exports = {
    dbUsername: process.env.DB_USERNAME,
    dbPassword: process.env.DB_PASSWORD
  }`);
  }

  return {
    Platform: config.dbPlatform ?? 'sqlserver',
    Host: dbHost || 'localhost',
    Port: typeof dbPort === 'string' ? parseInt(dbPort) : (dbPort as number),
    Database: dbName,
    User: dbUsername,
    Password: dbPassword,
    Schema: dbSchema || '__mj',
  };
}

/** SQL Server: one mssql pool, then setupSQLServerClient (user cache + MJ startup included). */
async function setupSqlServerProvider(db: ResolvedDbSettings): Promise<void> {
  const sqlConfig: sql.config = {
    server: db.Host,
    port: db.Port,
    database: db.Database,
    user: db.User,
    password: db.Password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
    },
  };

  connectionPool = new sql.ConnectionPool(sqlConfig);
  await connectionPool.connect();

  const providerConfig = new SQLServerProviderConfigData(
    connectionPool,
    db.Schema,
    180000
  );

  await setupSQLServerClient(providerConfig);
}

/**
 * PostgreSQL: the provider owns its own pool, so the user cache and MJ startup — which
 * `setupSQLServerClient` performs internally on the other path — are run explicitly here.
 *
 * Omitting the Startup call would leave the PG lane running every bundle through a different
 * engine-initialization sequence than SQL Server, and any engine-dependent PG-only failure
 * would then be triaged as a genuine parity bug when it is really a harness gap.
 */
async function setupPostgreSQLProvider(db: ResolvedDbSettings): Promise<void> {
  // Dynamic import — CLAUDE.md dynamic-import category 2 (optional peer dependency).
  // PostgreSQL is an optional backend for `mj test`; a SQL-Server-only install must not have
  // to resolve this provider or its `pg` transitive dependency. Declared in optionalDependencies.
  const { PostgreSQLDataProvider, PostgreSQLProviderConfigData } = await import('@memberjunction/postgresql-dataprovider');

  const provider = new PostgreSQLDataProvider();
  await provider.Config(new PostgreSQLProviderConfigData(
    { Host: db.Host, Port: db.Port, Database: db.Database, User: db.User, Password: db.Password },
    db.Schema,
    1 // must be > 0 to trigger the initial metadata load (the AllowRefresh gate in the provider)
  ));
  SetProvider(provider);
  closePostgresPool = () => provider.DatabaseConnection.end();

  // Pass the provider we just built, not Metadata.Provider — the specific instance is in scope,
  // so reaching for the global here would bake in an assumption this code does not need.
  await feedUserCacheFromPG(provider.DatabaseConnection, db.Schema, provider);

  const sysUser = UserCache.Instance.GetSystemUser();
  const backupSysUser = UserCache.Instance.Users.find(u => u.IsActive && u.Type === 'Owner');
  await StartupManager.Instance.Startup(false, sysUser || backupSysUser, provider);
}

/**
 * Publish this run's bootstrap context so the IntegrationTestDriver can read the connection
 * pool, the active platform and the provider off a single source of truth.
 *
 * Only an integration run has anything to publish: the instrumented storage this context
 * requires is created by `installInstrumentedCacheFirst()`, which `mj test suite` / `mj test run`
 * call under MJ_INTEGRATION_TEST=1. Outside that mode there is no storage and the driver keeps
 * its previous behavior exactly.
 *
 * Until this existed the driver saw a null bootstrap on the CLI path, so `ctx.Pool` was
 * undefined on BOTH backends — which is why every `metadata-consistency` check skipped-as-pass
 * on SQL Server too, not only on PostgreSQL.
 */
async function publishIntegrationBootstrap(db: ResolvedDbSettings): Promise<void> {
  const storage = getActiveIntegrationStorage();
  if (!storage) {
    return;
  }

  _setCurrentServerBootstrap({
    Pool: connectionPool ?? undefined,
    User: await getContextUser(),
    Storage: storage,
    Provider: Metadata.Provider, // global-provider-ok: the CLI just installed the one provider for this process
    Db: {
      Host: db.Host,
      Port: db.Port,
      User: db.User,
      Password: db.Password,
      Database: db.Database,
      Schema: db.Schema,
      Platform: db.Platform,
    },
    // Deliberately inert. The CLI owns its connection lifetime and releases it in
    // closeMJProvider(); a caller closing the connection through this context would pull it
    // out from under the command still using it. One owner, not two.
    ClosePool: async () => { /* no-op — the CLI owns pool lifetime, see above */ },
  });
}

/** Debug visibility into what metadata actually loaded — identical on both backends. */
function logLoadedEntities(): void {
  const md = new Metadata(); // global-provider-ok: CLI tool, single-provider context
  console.log(`Total entities loaded: ${md.Entities.length}`);
  const testEntities = md.Entities.filter(e => e.Name.toLowerCase().includes('test'));
  console.log(`Test-related entities found: ${testEntities.length}`);
  testEntities.forEach(e => console.log(`  - ${e.Name}`));

  // Show first 10 entities as sample
  console.log(`First 10 entities loaded:`);
  md.Entities.slice(0, 10).forEach(e => console.log(`  - ${e.Name}`));
}

/** Map a raw connection/setup failure onto an actionable message, preserving formatted ones. */
function describeInitializationFailure(error: unknown): Error {
  const err = asConnectionError(error);
  if (err.message?.startsWith('❌')) {
    // Already formatted error, re-throw as is
    return error as Error;
  }
  if (err.code === 'ECONNREFUSED') {
    return new Error(`❌ Failed to connect to database server

Problem: Connection refused to ${err.address}:${err.port}
Likely cause: Database server not running or incorrect host/port

Next steps:
1. Verify the database server is running on the specified host/port
2. Check firewall settings allow connections
3. Verify host and port in mj.config.cjs (note: the default port follows DB_PLATFORM — 1433 for SQL Server, 5432 for PostgreSQL)`);
  }
  if (err.code === 'ELOGIN') {
    return new Error(`❌ Database authentication failed

Problem: Invalid username or password
User: ${err.userName}

Next steps:
1. Verify username and password in mj.config.cjs
2. Check user has permission to access the database
3. Ensure SQL Server authentication is enabled`);
  }
  return new Error(`❌ Failed to initialize MJ data provider

Problem: ${err.message || 'Unknown error'}
Context: Setting up the database connection and MJ infrastructure

Next steps:
1. Check your mj.config.cjs database settings
2. Verify the database is accessible
3. Ensure MJ core packages are built: npm run build

For debugging, run with --verbose flag for detailed error information.`);
}

export async function closeMJProvider(): Promise<void> {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
  }
  if (closePostgresPool) {
    await closePostgresPool();
    closePostgresPool = null;
  }
  isInitialized = false;
}

/**
 * Get a context user for CLI operations
 * Tries to get the "System" user first, falls back to first available user
 */
export async function getContextUser(): Promise<UserInfo> {
  // Try to get the System user like other CLIs do
  let user = UserCache.Instance.UserByName("System", false);

  if (!user) {
    // Fallback to first available user if System user doesn't exist
    if (!UserCache.Instance.Users || UserCache.Instance.Users.length === 0) {
      throw new Error(`❌ No users found in UserCache

Problem: UserCache is empty or not properly initialized
Likely cause: Database connection or UserCache refresh issue

Next steps:
1. Verify database connection is working
2. Check that Users table has data
3. Ensure the user cache was populated during initialization

This is typically a configuration or database setup issue.`);
    }

    user = UserCache.Instance.Users[0];
  }

  if (!user) {
    throw new Error('No valid user found for execution context');
  }

  return user;
}
