import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import ora from 'ora-classic';
import { loadMJConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { MJConfig } from '../../config';
import { DataSource } from 'typeorm';

export default class Status extends Command {
  static description = 'Show status of local files vs database';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to check status' }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Status);
    const spinner = ora();
    
    try {
      // Load configurations
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Initialize data provider
      const provider = await this.initializeProvider(null as any, mjConfig);
      
      // Initialize sync engine
      const syncEngine = new SyncEngine(provider);
      await syncEngine.initialize();
      spinner.succeed('Configuration loaded');
      
      // Find entity directories to process
      const entityDirs = await this.findEntityDirectories(flags.dir);
      
      if (entityDirs.length === 0) {
        this.error('No entity directories found');
      }
      
      this.log(`Found ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} to check`);
      
      // Process each entity directory
      let totalNew = 0;
      let totalModified = 0;
      let totalDeleted = 0;
      let totalUnchanged = 0;
      
      for (const entityDir of entityDirs) {
        const entityConfig = await loadEntityConfig(entityDir);
        if (!entityConfig) {
          this.warn(`Skipping ${entityDir} - no valid entity configuration`);
          continue;
        }
        
        this.log(`\nChecking ${entityConfig.entity} in ${entityDir}`);
        
        const result = await this.checkEntityDirectory(
          entityDir,
          entityConfig,
          syncEngine
        );
        
        totalNew += result.new;
        totalModified += result.modified;
        totalDeleted += result.deleted;
        totalUnchanged += result.unchanged;
        
        // Show directory summary
        if (result.new > 0 || result.modified > 0 || result.deleted > 0) {
          this.log(`  New: ${result.new}, Modified: ${result.modified}, Deleted: ${result.deleted}, Unchanged: ${result.unchanged}`);
        } else {
          this.log(`  All ${result.unchanged} records are up to date`);
        }
      }
      
      // Overall summary
      this.log('\n=== Status Summary ===');
      this.log(`New (local only): ${totalNew}`);
      this.log(`Modified locally: ${totalModified}`);
      this.log(`Deleted locally: ${totalDeleted}`);
      this.log(`Unchanged: ${totalUnchanged}`);
      
    } catch (error) {
      spinner.fail('Status check failed');
      this.error(error as Error);
    }
  }
  
  private async initializeProvider(provider: SQLServerDataProvider, config: MJConfig): Promise<SQLServerDataProvider> {
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
  
  private async findEntityDirectories(specificDir?: string): Promise<string[]> {
    if (specificDir) {
      // Check if specific directory exists and has entity config
      if (await fs.pathExists(specificDir)) {
        const config = await loadEntityConfig(specificDir);
        if (config) {
          return [specificDir];
        }
      }
      return [];
    }
    
    // Find all directories with entity configs
    const dirs: string[] = [];
    
    const searchDirs = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const fullPath = path.join(dir, entry.name);
          const config = await loadEntityConfig(fullPath);
          
          if (config && config.entity) {
            dirs.push(fullPath);
          } else {
            // Recurse
            await searchDirs(fullPath);
          }
        }
      }
    };
    
    await searchDirs(process.cwd());
    return dirs;
  }
  
  private async checkEntityDirectory(
    entityDir: string,
    entityConfig: any,
    syncEngine: SyncEngine
  ): Promise<{ new: number; modified: number; deleted: number; unchanged: number }> {
    const result = { new: 0, modified: 0, deleted: 0, unchanged: 0 };
    
    // Find all JSON files
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json']
    });
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        const recordData: RecordData = await fs.readJson(filePath);
        
        if (recordData._primaryKey) {
          // Check if record exists in database
          const entity = await syncEngine.loadEntity(entityConfig.entity, recordData._primaryKey);
          
          if (!entity) {
            result.deleted++;
          } else {
            // Check if modified
            const currentChecksum = syncEngine.calculateChecksum(recordData._fields);
            if (recordData._sync?.checksum !== currentChecksum) {
              result.modified++;
            } else {
              result.unchanged++;
            }
          }
        } else {
          // New record
          result.new++;
        }
        
      } catch (error) {
        this.warn(`Failed to check ${file}: ${error}`);
      }
    }
    
    return result;
  }
}