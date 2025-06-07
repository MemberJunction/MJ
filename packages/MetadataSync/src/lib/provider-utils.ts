import { DataSource } from 'typeorm';
import { SQLServerDataProvider, SQLServerProviderConfigData, UserCache, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import type { MJConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { UserInfo } from '@memberjunction/core';

/**
 * Initialize a SQLServerDataProvider with the given configuration
 * @param config MemberJunction configuration with database connection details
 * @returns Initialized SQLServerDataProvider instance
 */
let globalDataSource: DataSource | null = null;

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

export async function cleanupProvider(): Promise<void> {
  if (globalDataSource && globalDataSource.isInitialized) {
    await globalDataSource.destroy();
    globalDataSource = null;
  }
}

export function getSystemUser(): UserInfo {
  const sysUser = UserCache.Instance.UserByName("System", false);
  if (!sysUser) {
    throw new Error("System user not found in cache. Ensure the system user exists in the database.");    
  }
  return sysUser;
}

/**
 * Find entity directories (with .mj-sync.json files) at the immediate level only
 * @param dir Directory to search
 * @param specificDir Optional specific directory to check
 * @returns Array of directory paths containing .mj-sync.json files
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