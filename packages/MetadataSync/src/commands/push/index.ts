import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import fastGlob from 'fast-glob';
import { loadMJConfig, loadSyncConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { MJConfig } from '../../config';
import { BaseEntity } from '@memberjunction/core';
import { DataSource } from 'typeorm';

export default class Push extends Command {
  static description = 'Push local file changes to the database';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dry-run`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --ci`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to push' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pushed without actually pushing' }),
    ci: Flags.boolean({ description: 'CI mode - no prompts, fail on issues' }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Push);
    const spinner = ora();
    
    try {
      // Load configurations
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      const syncConfig = await loadSyncConfig(process.cwd());
      
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
      
      this.log(`Found ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} to process`);
      
      // Process each entity directory
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      
      for (const entityDir of entityDirs) {
        const entityConfig = await loadEntityConfig(entityDir);
        if (!entityConfig) {
          this.warn(`Skipping ${entityDir} - no valid entity configuration`);
          continue;
        }
        
        this.log(`\nProcessing ${entityConfig.entity} in ${entityDir}`);
        
        const result = await this.processEntityDirectory(
          entityDir,
          entityConfig,
          syncEngine,
          flags,
          syncConfig
        );
        
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalErrors += result.errors;
      }
      
      // Summary
      this.log('\n=== Push Summary ===');
      this.log(`Created: ${totalCreated}`);
      this.log(`Updated: ${totalUpdated}`);
      this.log(`Errors: ${totalErrors}`);
      
      if (totalErrors > 0 && flags.ci) {
        this.error('Push failed with errors in CI mode');
      }
      
    } catch (error) {
      spinner.fail('Push failed');
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
  
  private async processEntityDirectory(
    entityDir: string,
    entityConfig: any,
    syncEngine: SyncEngine,
    flags: any,
    syncConfig: any
  ): Promise<{ created: number; updated: number; errors: number }> {
    const result = { created: 0, updated: 0, errors: 0 };
    
    // Find all JSON files
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json']
    });
    
    this.log(`Found ${jsonFiles.length} records to process`);
    
    if (jsonFiles.length === 0) {
      return result;
    }
    
    // Confirm if needed
    if (!flags['dry-run'] && !flags.ci && syncConfig?.push?.requireConfirmation) {
      const proceed = await confirm({
        message: `Push ${jsonFiles.length} ${entityConfig.entity} records to database?`
      });
      
      if (!proceed) {
        this.log('Push cancelled');
        return result;
      }
    }
    
    // Process each file
    const spinner = ora();
    spinner.start('Processing records');
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        const recordData: RecordData = await fs.readJson(filePath);
        
        // Build defaults
        const defaults = await syncEngine.buildDefaults(filePath, entityConfig);
        
        // Process the record
        const isNew = await this.pushRecord(
          recordData,
          entityConfig.entity,
          path.dirname(filePath),
          defaults,
          syncEngine,
          flags['dry-run']
        );
        
        if (!flags['dry-run']) {
          if (isNew) {
            result.created++;
          } else {
            result.updated++;
          }
        }
        
        spinner.text = `Processing records (${result.created + result.updated + result.errors}/${jsonFiles.length})`;
        
      } catch (error) {
        result.errors++;
        this.warn(`Failed to process ${file}: ${error}`);
      }
    }
    
    spinner.succeed(`Processed ${jsonFiles.length} records`);
    return result;
  }
  
  private async pushRecord(
    recordData: RecordData,
    entityName: string,
    baseDir: string,
    defaults: Record<string, any>,
    syncEngine: SyncEngine,
    dryRun: boolean
  ): Promise<boolean> {
    // Load or create entity
    let entity: BaseEntity | null = null;
    let isNew = false;
    
    if (recordData._primaryKey) {
      entity = await syncEngine.loadEntity(entityName, recordData._primaryKey);
    }
    
    if (!entity) {
      // New record
      entity = await syncEngine.createEntityObject(entityName);
      entity.NewRecord();
      isNew = true;
    }
    
    // Apply defaults first
    for (const [field, value] of Object.entries(defaults)) {
      if ((entity as any).Fields.find((f: any) => f.Name === field)) {
        entity.Set(field, value);
      }
    }
    
    // Apply record fields
    for (const [field, value] of Object.entries(recordData._fields)) {
      if ((entity as any).Fields.find((f: any) => f.Name === field)) {
        const processedValue = await syncEngine.processFieldValue(value, baseDir);
        entity.Set(field, processedValue);
      }
    }
    
    if (dryRun) {
      this.log(`Would ${isNew ? 'create' : 'update'} ${entityName} record`);
      return isNew;
    }
    
    // Save the record
    const saved = await entity.Save();
    if (!saved) {
      const errors = entity.LatestResult?.Errors?.join(', ') || 'Unknown error';
      throw new Error(`Failed to save record: ${errors}`);
    }
    
    // Update the local file with new primary key if created
    if (isNew) {
      const entityInfo = syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const newPrimaryKey: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
          newPrimaryKey[pk.Name] = entity.Get(pk.Name);
        }
        recordData._primaryKey = newPrimaryKey;
        
        // Update sync metadata
        recordData._sync = {
          lastModified: new Date().toISOString(),
          checksum: syncEngine.calculateChecksum(recordData._fields)
        };
        
        // Write back to file
        const fileName = path.basename(baseDir) + '.json';
        const filePath = path.join(baseDir, fileName);
        await fs.writeJson(filePath, recordData, { spaces: 2 });
      }
    }
    
    return isNew;
  }
}