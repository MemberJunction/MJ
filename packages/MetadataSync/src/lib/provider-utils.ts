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
      encrypt: config.dbTrustServerCertificate !== 'Y' ? false : true,
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
 * Recursively find all entity directories with .mj-sync.json files
 * @param dir Directory to search
 * @param specificDir Optional specific directory to limit search to
 * @returns Array of directory paths containing .mj-sync.json files
 */
export function findEntityDirectories(dir: string, specificDir?: string): string[] {
  const results: string[] = [];
  
  function search(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    // Check if this directory has .mj-sync.json (and it's not the root)
    const hasSyncConfig = entries.some(e => e.name === '.mj-sync.json');
    const isRoot = currentDir === dir;
    
    if (hasSyncConfig && !isRoot) {
      results.push(currentDir);
    }
    
    // Recursively search subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        search(path.join(currentDir, entry.name));
      }
    }
  }
  
  // If specific directory is provided, only search within it
  if (specificDir) {
    // Handle both absolute and relative paths
    const targetDir = path.isAbsolute(specificDir) ? specificDir : path.join(dir, specificDir);
    if (fs.existsSync(targetDir)) {
      search(targetDir);
    }
  } else {
    search(dir);
  }
  
  return results;
}