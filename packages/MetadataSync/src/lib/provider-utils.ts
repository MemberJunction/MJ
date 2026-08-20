/**
 * @fileoverview Database provider utilities for MetadataSync
 * @module provider-utils
 * 
 * This module provides utilities for initializing and managing the database
 * connection, accessing system users, and finding entity directories. It handles
 * the mssql ConnectionPool lifecycle and MemberJunction provider initialization.
 */

import sql from 'mssql';
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { MJConfig } from '../config';
import type { DynamicServerPackageConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseProviderBase, Metadata, ResolveStartupMode, SetProvider, StartupManager, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { minimatch } from 'minimatch';

/** Global mssql ConnectionPool (SQL Server path only) */
let globalPool: sql.ConnectionPool | null = null;

/** Global pg.Pool (PostgreSQL path only) — typed loosely to avoid a hard pg dep at import time */
let globalPgPool: { end: () => Promise<void> } | null = null;

/** Global provider instance to ensure single initialization */
let globalProvider: DatabaseProviderBase | null = null;

/** Promise to track ongoing initialization */
let initializationPromise: Promise<DatabaseProviderBase> | null = null;

/**
 * Initialize a SQLServerDataProvider with the given configuration
 * 
 * Creates and initializes a mssql ConnectionPool for SQL Server, then sets up
 * the MemberJunction SQLServerDataProvider. The connection is stored globally
 * for proper cleanup. Auto-detects Azure SQL databases for encryption settings.
 * 
 * @param config - MemberJunction configuration with database connection details
 * @returns Promise resolving to initialized SQLServerDataProvider instance
 * @throws Error if database connection fails
 * 
 * @example
 * ```typescript
 * const config = loadMJConfig();
 * const provider = await initializeProvider(config);
 * // Provider is ready for use
 * ```
 */
export async function initializeProvider(config: MJConfig): Promise<DatabaseProviderBase> {
  // Return existing provider if already initialized
  if (globalProvider) {
    return globalProvider;
  }

  // Return ongoing initialization if in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  const platform = (config.dbPlatform ?? 'sqlserver').toLowerCase();

  initializationPromise = (platform === 'postgresql'
    ? initializePostgresProvider(config)
    : initializeSqlServerProvider(config)
  ).then(async (provider) => {
    // Register dynamic (Open App) entity subclasses AFTER provider init so app
    // registrations land last and win ClassFactory priority — same ordering as
    // ServerBootstrap. Must happen before any sync operation instantiates entity
    // objects, or non-MJ-namespace entities fall back to bare BaseEntity (#3415).
    await loadDynamicServerPackages(config.dynamicPackages?.server);
    return provider;
  });

  return initializationPromise;
}

/**
 * Dynamically import each enabled `dynamicPackages.server` entry from mj.config.cjs so
 * its `@RegisterClass` entity subclasses are registered, and invoke its StartupExport
 * when declared. Mirrors ServerBootstrap's `loadDynamicAppPackages` robustness contract
 * (minus GraphQL resolver-path collection, which has no meaning in a CLI process):
 * no-op when the section is absent, per-package try/catch, tolerate
 * `ERR_MODULE_NOT_FOUND`, warn on anything else, never crash the CLI.
 *
 * Exported for tests.
 */
export async function loadDynamicServerPackages(serverPackages: DynamicServerPackageConfig[] | undefined): Promise<void> {
  if (!serverPackages || serverPackages.length === 0) {
    return;
  }
  for (const entry of serverPackages) {
    const pkgName = entry?.PackageName;
    if (!pkgName || entry.Enabled === false) {
      continue;
    }
    try {
      const mod = (await import(pkgName)) as Record<string, unknown>;
      const startup = entry.StartupExport ? mod[entry.StartupExport] : undefined;
      if (typeof startup === 'function') {
        await Promise.resolve((startup as () => unknown)());
      }
      console.log(`Loaded dynamic server package: ${pkgName}${entry.StartupExport ? ` (ran ${entry.StartupExport})` : ''}`);
    } catch (error: unknown) {
      const errObj = error as { code?: string };
      if (errObj.code === 'ERR_MODULE_NOT_FOUND') {
        console.log(`Dynamic server package not found (run 'npm install'?): ${pkgName}`);
      } else {
        console.warn(`Error loading dynamic server package ${pkgName}:`, error);
      }
    }
  }
}

async function initializeSqlServerProvider(config: MJConfig): Promise<DatabaseProviderBase> {
  const poolConfig: sql.config = {
    server: config.dbHost,
    port: config.dbPort ? Number(config.dbPort) : 1433,
    database: config.dbDatabase,
    user: config.dbUsername,
    password: config.dbPassword,
    // Honor the configured per-request timeout; without it mssql falls back to its
    // 15s default, which prematurely aborts long-running operations such as
    // `mj app remove` dropping a large schema.
    ...(config.dbRequestTimeout ? { requestTimeout: Number(config.dbRequestTimeout) } : {}),
    options: {
      encrypt: config.dbEncrypt === 'Y' || config.dbEncrypt === 'true' ||
               config.dbHost?.includes('.database.windows.net'),
      trustServerCertificate: config.dbTrustServerCertificate === 'Y',
      instanceName: config.dbInstanceName,
      enableArithAbort: true
    }
  };

  const pool = new sql.ConnectionPool(poolConfig);
  await pool.connect();
  globalPool = pool;

  const providerConfig = new SQLServerProviderConfigData(
    pool,
    config.mjCoreSchema || '__mj'
  );

  // CLI-style process ⇒ 'task' entry-point default: no engine pre-warm, engines lazy-load
  // on first touch. MJ_STARTUP_MODE or mj.config.cjs startup.mode can override.
  const startupMode = ResolveStartupMode({ configValue: config.startup?.mode, defaultMode: 'task' });
  const sqlProvider = await setupSQLServerClient(providerConfig, { mode: startupMode.mode });
  globalProvider = sqlProvider as unknown as DatabaseProviderBase;
  return globalProvider;
}

async function initializePostgresProvider(config: MJConfig): Promise<DatabaseProviderBase> {
  // Dynamic imports so SQL-Server-only environments never resolve pg/PG provider
  const pg = (await import('pg')).default;
  const { PostgreSQLDataProvider, PostgreSQLProviderConfigData, MJPostgresTypes } =
    await import('@memberjunction/postgresql-dataprovider');

  const coreSchema = config.mjCoreSchema || '__mj';
  const pgPool = new pg.Pool({
    host: config.dbHost,
    port: config.dbPort ? Number(config.dbPort) : 5432,
    user: config.dbUsername,
    password: config.dbPassword,
    database: config.dbDatabase,
    max: 10,
    min: 1,
    // NUMERIC/BIGINT → JS numbers, same parsers the provider's own pool uses
    types: MJPostgresTypes,
    // Mirror the SQL Server path: honor the configured per-request timeout as the
    // PG per-statement timeout when set (pg defaults to no statement timeout).
    ...(config.dbRequestTimeout ? { statement_timeout: Number(config.dbRequestTimeout) } : {}),
  });

  const testClient = await pgPool.connect();
  await testClient.query('SELECT 1');
  testClient.release();
  globalPgPool = pgPool;

  const pgConfigData = new PostgreSQLProviderConfigData(
    {
      Host: config.dbHost,
      Port: config.dbPort ? Number(config.dbPort) : 5432,
      Database: config.dbDatabase,
      User: config.dbUsername,
      Password: config.dbPassword,
      MaxConnections: 10,
      MinConnections: 1,
      // The provider's OWN pool (PGConnectionManager creates a separate pg.Pool from this config) is
      // what `provider.ExecuteSQL` — including the schema DROP on `mj app remove` — runs on. Carry the
      // configured per-request timeout as a libpq `statement_timeout` startup option so it reaches THAT
      // pool, not just the local connectivity-check pool above. (Otherwise the "PG parity" is inert.)
      ...(config.dbRequestTimeout ? { Options: `-c statement_timeout=${Number(config.dbRequestTimeout)}` } : {}),
    },
    coreSchema,
    1, // must be > 0 to trigger initial metadata load (AllowRefresh gate in PostgreSQLDataProvider)
  );

  const provider = new PostgreSQLDataProvider();
  await provider.Config(pgConfigData);
  SetProvider(provider);
  globalProvider = provider;

  await UserCache.Instance.Refresh(provider);

  // Run MJ startup with the same 'task' entry-point default as the SQL Server path
  // (where setupSQLServerClient runs this internally). Previously the PG path skipped
  // Startup() entirely — adding it initializes LocalCacheManager and makes an
  // MJ_STARTUP_MODE=full opt-up actually pre-warm engines on PG too.
  const startupMode = ResolveStartupMode({ configValue: config.startup?.mode, defaultMode: 'task' });
  const sysUser = UserCache.Instance.GetSystemUser();
  const backupSysUser = UserCache.Instance.Users.find(u => u.IsActive && u.Type === 'Owner');
  await StartupManager.Instance.Startup(false, sysUser || backupSysUser, provider, { mode: startupMode.mode });

  return provider;
}

/**
 * Clean up the global database connection
 * 
 * Closes the mssql ConnectionPool if it exists and is connected.
 * Should be called when the CLI command completes to ensure proper cleanup.
 * 
 * @returns Promise that resolves when cleanup is complete
 * 
 * @example
 * ```typescript
 * try {
 *   // Do work with database
 * } finally {
 *   await cleanupProvider();
 * }
 * ```
 */
export async function cleanupProvider(): Promise<void> {
  if (globalPool && globalPool.connected) {
    // mssql pool.close() can hang indefinitely when a query is still in flight
    // against the closing pool (e.g. a late async metadata load racing teardown).
    // Race it against a short timeout so callers never block on teardown — the
    // CLI force-exits afterward, which reaps any lingering socket.
    await Promise.race([
      globalPool.close(),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 4000);
        t.unref();
      }),
    ]).catch(() => {
      /* swallow — best-effort cleanup */
    });
    globalPool = null;
  }
  if (globalPgPool) {
    try {
      await globalPgPool.end();
    } catch {
      /* swallow — best-effort cleanup */
    }
    globalPgPool = null;
  }
  globalProvider = null;
  initializationPromise = null;
}

/**
 * Get the system user from the UserCache
 * 
 * Retrieves the "System" user from MemberJunction's UserCache. This user is
 * typically used for CLI operations where no specific user context exists.
 * The System user must have the Developer role to perform metadata sync operations.
 * 
 * @returns The System UserInfo object
 * @throws Error if System user is not found in the cache or doesn't have Developer role
 * 
 * @example
 * ```typescript
 * const systemUser = getSystemUser();
 * const syncEngine = new SyncEngine(systemUser);
 * ```
 */
export function getSystemUser(): UserInfo {
  const sysUser = UserCache.Instance.UserByName("System", false);
  if (!sysUser) {
    throw new Error("System user not found in cache. Ensure the system user exists in the database.");    
  }
  
  // Check if the System user has the Developer role
  const hasDeveloperRole = sysUser.UserRoles && sysUser.UserRoles.some(
    userRole => userRole.Role.trim().toLowerCase() === 'developer'
  );
  
  if (!hasDeveloperRole) {
    throw new Error(
      "System user does not have the 'Developer' role. " +
      "The Developer role is required for metadata sync operations. " +
      "Please ensure the System user is assigned the Developer role in the database:\n" +
      "* Add a record to the __mj.UserRole table linking the System user to the Developer role"
    );
  }
  
  return sysUser;
}

/**
 * Get the current data provider instance
 * 
 * Returns the global SQLServerDataProvider instance that was initialized by
 * initializeProvider. This allows access to data provider features like SQL logging.
 * 
 * @returns The global SQLServerDataProvider instance or null if not initialized
 * 
 * @example
 * ```typescript
 * const provider = getDataProvider();
 * if (provider?.CreateSqlLogger) {
 *   const logger = await provider.CreateSqlLogger('/path/to/log.sql');
 * }
 * ```
 */
export function getDataProvider(): DatabaseProviderBase | null {
  return globalProvider;
}

/**
 * Find entity directories at the immediate level only
 *
 * Searches for directories containing .mj-sync.json files, which indicate
 * entity data directories. Only searches immediate subdirectories, not recursive.
 * If a specific directory is provided, only checks that directory.
 *
 * @param dir - Base directory to search from
 * @param specificDir - Optional specific subdirectory name to check
 * @param directoryOrder - Optional array specifying the order directories should be processed
 * @param ignoreDirectories - Optional array of directory patterns to ignore
 * @param includeFilter - Optional array of directory patterns to include (whitelist)
 * @param excludeFilter - Optional array of directory patterns to exclude (blacklist)
 * @returns Array of absolute directory paths containing .mj-sync.json files, ordered according to directoryOrder
 *
 * @example
 * ```typescript
 * // Find all entity directories
 * const dirs = findEntityDirectories(process.cwd());
 *
 * // Check specific directory
 * const dirs = findEntityDirectories(process.cwd(), 'ai-prompts');
 *
 * // Find directories with custom ordering
 * const dirs = findEntityDirectories(process.cwd(), undefined, ['prompts', 'agent-types']);
 *
 * // Filter with include patterns
 * const dirs = findEntityDirectories(process.cwd(), undefined, undefined, undefined, ['prompts', 'agent-*']);
 *
 * // Filter with exclude patterns
 * const dirs = findEntityDirectories(process.cwd(), undefined, undefined, undefined, undefined, ['*-test', 'temp']);
 * ```
 */
export function findEntityDirectories(
  dir: string,
  specificDir?: string,
  directoryOrder?: string[],
  ignoreDirectories?: string[],
  includeFilter?: string[],
  excludeFilter?: string[]
): string[] {
  const results: string[] = [];
  
  // If specific directory is provided, check if it's an entity directory or root config directory
  if (specificDir) {
    const targetDir = path.isAbsolute(specificDir) ? specificDir : path.join(dir, specificDir);
    if (fs.existsSync(targetDir)) {
      const syncConfigPath = path.join(targetDir, '.mj-sync.json');
      const hasSyncConfig = fs.existsSync(syncConfigPath);
      
      if (hasSyncConfig) {
        try {
          const config = JSON.parse(fs.readFileSync(syncConfigPath, 'utf8'));
          
          // If this config has an entity field, it's an entity directory
          if (config.entity) {
            results.push(targetDir);
            return results;
          }
          
          // If this config has directoryOrder but no entity, treat it as a root config
          // and look for entity directories in its subdirectories
          if (config.directoryOrder) {
            // Merge ignore directories from parent with current config
            const mergedIgnoreDirectories = [
              ...(ignoreDirectories || []),
              ...(config.ignoreDirectories || [])
            ];
            return findEntityDirectories(
              targetDir,
              undefined,
              config.directoryOrder,
              mergedIgnoreDirectories,
              includeFilter,
              excludeFilter
            );
          }
        } catch (error) {
          // If we can't parse the config, treat it as a regular directory
        }
      }
      
      // Fallback: look for entity subdirectories in the target directory
      return findEntityDirectories(targetDir, undefined, directoryOrder, ignoreDirectories, includeFilter, excludeFilter);
    }
    return results;
  }
  
  // Otherwise, find all immediate subdirectories with .mj-sync.json
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const foundDirectories: string[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      // Check if this directory should be ignored
      if (ignoreDirectories && ignoreDirectories.some(pattern => {
        // Simple pattern matching: exact name or ends with pattern
        return entry.name === pattern || entry.name.endsWith(pattern);
      })) {
        continue;
      }
      
      const subDir = path.join(dir, entry.name);
      const hasSyncConfig = fs.existsSync(path.join(subDir, '.mj-sync.json'));
      
      if (hasSyncConfig) {
        foundDirectories.push(subDir);
      }
    }
  }
  
  // If directoryOrder is specified, sort directories according to it
  if (directoryOrder && directoryOrder.length > 0) {
    const orderedDirs: string[] = [];
    const unorderedDirs: string[] = [];
    
    // First, add directories in the specified order
    for (const dirName of directoryOrder) {
      const matchingDir = foundDirectories.find(fullPath => 
        path.basename(fullPath) === dirName
      );
      if (matchingDir) {
        orderedDirs.push(matchingDir);
      }
    }
    
    // Then, add any remaining directories in alphabetical order
    for (const foundDir of foundDirectories) {
      const dirName = path.basename(foundDir);
      if (!directoryOrder.includes(dirName)) {
        unorderedDirs.push(foundDir);
      }
    }
    
    // Sort unordered directories alphabetically
    unorderedDirs.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

    const allDirs = [...orderedDirs, ...unorderedDirs];
    return applyDirectoryFilters(allDirs, includeFilter, excludeFilter);
  }

  // No ordering specified, return in alphabetical order (existing behavior)
  const sortedDirs = foundDirectories.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return applyDirectoryFilters(sortedDirs, includeFilter, excludeFilter);
}

/**
 * Apply include/exclude filters to a list of directories
 *
 * @param directories - Array of directory paths to filter
 * @param includeFilter - Optional array of patterns to include (whitelist)
 * @param excludeFilter - Optional array of patterns to exclude (blacklist)
 * @returns Filtered array of directory paths
 */
function applyDirectoryFilters(
  directories: string[],
  includeFilter?: string[],
  excludeFilter?: string[]
): string[] {
  let filteredDirs = directories;

  // Apply include filter (whitelist)
  if (includeFilter && includeFilter.length > 0) {
    filteredDirs = directories.filter(dir => {
      const dirName = path.basename(dir);
      return includeFilter.some(pattern =>
        minimatch(dirName, pattern, { nocase: true })
      );
    });
  }

  // Apply exclude filter (blacklist)
  if (excludeFilter && excludeFilter.length > 0) {
    filteredDirs = filteredDirs.filter(dir => {
      const dirName = path.basename(dir);
      return !excludeFilter.some(pattern =>
        minimatch(dirName, pattern, { nocase: true })
      );
    });
  }

  return filteredDirs;
}