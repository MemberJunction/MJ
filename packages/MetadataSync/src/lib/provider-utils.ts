/**
 * @fileoverview Database provider utilities for MetadataSync
 * @module provider-utils
 * 
 * This module provides utilities for initializing and managing the database
 * connection, accessing system users, and finding entity directories. It handles
 * the mssql ConnectionPool lifecycle and MemberJunction provider initialization.
 */

import * as sql from 'mssql';
import { SQLServerDataProvider, SQLServerProviderConfigData, UserCache, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import type { MJConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { UserInfo } from '@memberjunction/core';
import { configManager } from './config-manager';

/** Global ConnectionPool instance for connection lifecycle management */
let globalPool: sql.ConnectionPool | null = null;

/** Global provider instance to ensure single initialization */
let globalProvider: SQLServerDataProvider | null = null;

/** Promise to track ongoing initialization */
let initializationPromise: Promise<SQLServerDataProvider> | null = null;

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
export async function initializeProvider(config: MJConfig): Promise<SQLServerDataProvider> {
  // Return existing provider if already initialized
  if (globalProvider) {
    return globalProvider;
  }
  
  // Return ongoing initialization if in progress
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // Start new initialization
  initializationPromise = (async () => {
    // Create mssql config
    const poolConfig: sql.config = {
      server: config.dbHost,
      port: config.dbPort ? Number(config.dbPort) : 1433,
      database: config.dbDatabase,
      user: config.dbUsername,
      password: config.dbPassword,
      options: {
        encrypt: config.dbEncrypt === 'Y' || config.dbEncrypt === 'true' || 
                 config.dbHost.includes('.database.windows.net'), // Auto-detect Azure SQL
        trustServerCertificate: config.dbTrustServerCertificate === 'Y',
        instanceName: config.dbInstanceName,
        enableArithAbort: true
      }
    };
    
    // Create and connect pool
    const pool = new sql.ConnectionPool(poolConfig);
    await pool.connect();
    
    // Store for cleanup
    globalPool = pool;
    
    // Create provider config
    const providerConfig = new SQLServerProviderConfigData(
      pool,
      'system@sync.cli', // Default user for CLI
      config.mjCoreSchema || '__mj',
      0
    );
    
    // Use setupSQLServerClient to properly initialize
    globalProvider = await setupSQLServerClient(providerConfig);
    return globalProvider;
  })();
  
  return initializationPromise;
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
    await globalPool.close();
    globalPool = null;
  }
  globalProvider = null;
  initializationPromise = null;
}

/**
 * Get the system user from the UserCache
 * 
 * Retrieves the "System" user from MemberJunction's UserCache. This user is
 * typically used for CLI operations where no specific user context exists.
 * 
 * @returns The System UserInfo object
 * @throws Error if System user is not found in the cache
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
export function getDataProvider(): SQLServerDataProvider | null {
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
 * ```
 */
export function findEntityDirectories(dir: string, specificDir?: string, directoryOrder?: string[]): string[] {
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
            return findEntityDirectories(targetDir, undefined, config.directoryOrder);
          }
        } catch (error) {
          // If we can't parse the config, treat it as a regular directory
        }
      }
      
      // Fallback: look for entity subdirectories in the target directory
      return findEntityDirectories(targetDir, undefined, directoryOrder);
    }
    return results;
  }
  
  // Otherwise, find all immediate subdirectories with .mj-sync.json
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const foundDirectories: string[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
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
    
    return [...orderedDirs, ...unorderedDirs];
  }
  
  // No ordering specified, return in alphabetical order (existing behavior)
  return foundDirectories.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}