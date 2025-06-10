/**
 * @fileoverview Database provider utilities for MetadataSync
 * @module provider-utils
 * 
 * This module provides utilities for initializing and managing the database
 * connection, accessing system users, and finding entity directories. It handles
 * the TypeORM DataSource lifecycle and MemberJunction provider initialization.
 */

import { DataSource } from 'typeorm';
import { SQLServerDataProvider, SQLServerProviderConfigData, UserCache, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import type { MJConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { UserInfo } from '@memberjunction/core';
import { configManager } from './config-manager';

/** Global DataSource instance for connection lifecycle management */
let globalDataSource: DataSource | null = null;

/**
 * Initialize a SQLServerDataProvider with the given configuration
 * 
 * Creates and initializes a TypeORM DataSource for SQL Server, then sets up
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
  // Create TypeORM DataSource
  const dataSource = new DataSource({
    type: 'mssql',
    host: config.dbHost,
    port: config.dbPort ? Number(config.dbPort) : 1433,
    database: config.dbDatabase,
    username: config.dbUsername,
    password: config.dbPassword,
    synchronize: false,
    logging: false,
    options: {
      encrypt: config.dbEncrypt === 'Y' || config.dbEncrypt === 'true' || 
               config.dbHost.includes('.database.windows.net'), // Auto-detect Azure SQL
      trustServerCertificate: config.dbTrustServerCertificate === 'Y',
      instanceName: config.dbInstanceName
    }
  });
  
  // Initialize the data source
  await dataSource.initialize();
  
  // Store for cleanup
  globalDataSource = dataSource;
  
  // Create provider config
  const providerConfig = new SQLServerProviderConfigData(
    dataSource,
    'system@sync.cli', // Default user for CLI
    config.mjCoreSchema || '__mj',
    0
  );
  
  // Use setupSQLServerClient to properly initialize
  return await setupSQLServerClient(providerConfig);
}

/**
 * Clean up the global database connection
 * 
 * Destroys the TypeORM DataSource if it exists and is initialized.
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
  if (globalDataSource && globalDataSource.isInitialized) {
    await globalDataSource.destroy();
    globalDataSource = null;
  }
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
 * Find entity directories at the immediate level only
 * 
 * Searches for directories containing .mj-sync.json files, which indicate
 * entity data directories. Only searches immediate subdirectories, not recursive.
 * If a specific directory is provided, only checks that directory.
 * 
 * @param dir - Base directory to search from
 * @param specificDir - Optional specific subdirectory name to check
 * @returns Array of absolute directory paths containing .mj-sync.json files
 * 
 * @example
 * ```typescript
 * // Find all entity directories
 * const dirs = findEntityDirectories(process.cwd());
 * 
 * // Check specific directory
 * const dirs = findEntityDirectories(process.cwd(), 'ai-prompts');
 * ```
 */
export function findEntityDirectories(dir: string, specificDir?: string): string[] {
  const results: string[] = [];
  
  // If specific directory is provided, check if it's an entity directory
  if (specificDir) {
    const targetDir = path.isAbsolute(specificDir) ? specificDir : path.join(dir, specificDir);
    if (fs.existsSync(targetDir)) {
      const hasSyncConfig = fs.existsSync(path.join(targetDir, '.mj-sync.json'));
      if (hasSyncConfig) {
        results.push(targetDir);
      }
    }
    return results;
  }
  
  // Otherwise, find all immediate subdirectories with .mj-sync.json
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const subDir = path.join(dir, entry.name);
      const hasSyncConfig = fs.existsSync(path.join(subDir, '.mj-sync.json'));
      
      if (hasSyncConfig) {
        results.push(subDir);
      }
    }
  }
  
  return results;
}