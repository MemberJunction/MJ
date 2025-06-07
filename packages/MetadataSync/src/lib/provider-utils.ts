import { DataSource } from 'typeorm';
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import type { MJConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize a SQLServerDataProvider with the given configuration
 * @param config MemberJunction configuration with database connection details
 * @returns Initialized SQLServerDataProvider instance
 */
export async function initializeProvider(config: MJConfig): Promise<SQLServerDataProvider> {
  // Create TypeORM DataSource
  const dataSource = new DataSource({
    type: 'mssql',
    host: config.db.host,
    port: config.db.port || 1433,
    database: config.db.database,
    username: config.db.username,
    password: config.db.password,
    synchronize: false,
    logging: false,
    options: {
      ...config.db.options,
      encrypt: config.db.options?.encrypt !== false,
      trustServerCertificate: config.db.options?.trustServerCertificate !== false
    }
  });
  
  // Initialize the data source
  await dataSource.initialize();
  
  // Create provider config
  const providerConfig = new SQLServerProviderConfigData(
    dataSource,
    'system@sync.cli', // Default user for CLI
    '__mj',
    0
  );
  
  // Use setupSQLServerClient to properly initialize
  return await setupSQLServerClient(providerConfig);
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
    const targetDir = path.join(dir, specificDir);
    if (fs.existsSync(targetDir)) {
      search(targetDir);
    }
  } else {
    search(dir);
  }
  
  return results;
}