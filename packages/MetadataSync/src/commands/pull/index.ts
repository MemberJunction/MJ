import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { select } from '@inquirer/prompts';
import ora from 'ora-classic';
import { loadMJConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { RunView } from '@memberjunction/core';
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { MJConfig } from '../../config';
import { DataSource } from 'typeorm';

export default class Pull extends Command {
  static description = 'Pull metadata from database to local files';
  
  static examples = [
    `<%= config.bin %> <%= command.id %> --entity="AI Prompts"`,
    `<%= config.bin %> <%= command.id %> --entity="AI Prompts" --filter="CategoryID='customer-service-id'"`,
  ];
  
  static flags = {
    entity: Flags.string({ description: 'Entity name to pull', required: true }),
    filter: Flags.string({ description: 'Additional filter for pulling specific records' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pulled without actually pulling' }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Pull);
    const spinner = ora();
    
    try {
      // Load MJ config
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Initialize data provider
      const provider = new SQLServerDataProvider();
      await this.initializeProvider(provider, mjConfig);
      
      // Initialize sync engine
      const syncEngine = new SyncEngine(provider);
      await syncEngine.initialize();
      spinner.succeed('Configuration loaded');
      
      // Find entity directory
      const entityDirs = await this.findEntityDirectories(flags.entity);
      
      if (entityDirs.length === 0) {
        this.error(`No directory found for entity "${flags.entity}". Run "mj-sync init" first.`);
      }
      
      let targetDir: string;
      if (entityDirs.length === 1) {
        targetDir = entityDirs[0];
      } else {
        // Multiple directories found, ask user
        targetDir = await select({
          message: `Multiple directories found for entity "${flags.entity}". Which one to use?`,
          choices: entityDirs.map(dir => ({ name: dir, value: dir }))
        });
      }
      
      const entityConfig = await loadEntityConfig(targetDir);
      if (!entityConfig) {
        this.error(`Invalid entity configuration in ${targetDir}`);
      }
      
      // Pull records
      spinner.start(`Pulling ${flags.entity} records`);
      const rv = new RunView();
      
      let filter = '';
      if (flags.filter) {
        filter = flags.filter;
      }
      
      const result = await rv.RunView({
        EntityName: flags.entity,
        ExtraFilter: filter
      });
      
      if (!result.Success) {
        this.error(`Failed to pull records: ${result.ErrorMessage}`);
      }
      
      spinner.succeed(`Found ${result.Results.length} records`);
      
      if (flags['dry-run']) {
        this.log(`\nDry run mode - would pull ${result.Results.length} records to ${targetDir}`);
        return;
      }
      
      // Process each record
      const entityInfo = syncEngine.getEntityInfo(flags.entity);
      if (!entityInfo) {
        this.error(`Entity information not found for: ${flags.entity}`);
      }
      
      spinner.start('Processing records');
      let processed = 0;
      
      for (const record of result.Results) {
        try {
          // Build primary key
          const primaryKey: Record<string, any> = {};
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKey[pk.Name] = record[pk.Name];
          }
          
          // Process record
          await this.processRecord(record, primaryKey, targetDir, entityConfig, syncEngine);
          processed++;
          
          spinner.text = `Processing records (${processed}/${result.Results.length})`;
        } catch (error) {
          this.warn(`Failed to process record: ${(error as any).message || error}`);
        }
      }
      
      spinner.succeed(`Pulled ${processed} records to ${targetDir}`);
      
    } catch (error) {
      spinner.fail('Pull failed');
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
  
  private async findEntityDirectories(entityName: string): Promise<string[]> {
    const dirs: string[] = [];
    
    // Search for directories with matching entity config
    const searchDirs = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          const config = await loadEntityConfig(fullPath);
          
          if (config && config.entity === entityName) {
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
  
  private async processRecord(
    record: any, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: any,
    syncEngine: SyncEngine
  ): Promise<void> {
    // Build record data
    const recordData: RecordData = {
      _primaryKey: primaryKey,
      _fields: {},
      _sync: {
        lastModified: new Date().toISOString(),
        checksum: ''
      }
    };
    
    // Process fields
    for (const [fieldName, fieldValue] of Object.entries(record)) {
      // Skip primary key fields
      if (primaryKey[fieldName] !== undefined) {
        continue;
      }
      
      // Skip internal fields
      if (fieldName.startsWith('__mj_')) {
        continue;
      }
      
      // Check if this is an external file field
      if (await this.shouldExternalizeField(fieldName, fieldValue, entityConfig)) {
        const fileName = await this.createExternalFile(
          targetDir,
          primaryKey,
          fieldName,
          String(fieldValue)
        );
        recordData._fields[fieldName] = `@file:${fileName}`;
      } else {
        recordData._fields[fieldName] = fieldValue;
      }
    }
    
    // Calculate checksum
    recordData._sync!.checksum = syncEngine.calculateChecksum(recordData._fields);
    
    // Determine file path
    const fileName = this.buildFileName(primaryKey, entityConfig);
    const filePath = path.join(targetDir, fileName);
    
    // Write JSON file
    await fs.writeJson(filePath, recordData, { spaces: 2 });
  }
  
  private async shouldExternalizeField(
    fieldName: string, 
    fieldValue: any,
    entityConfig: any
  ): Promise<boolean> {
    // Only externalize string fields with significant content
    if (typeof fieldValue !== 'string') {
      return false;
    }
    
    // Check if it's a known large text field
    const largeTextFields = ['Prompt', 'Template', 'Notes', 'Description', 
                           'Content', 'Body', 'Text', 'HTML', 'SQL'];
    
    if (largeTextFields.some(f => fieldName.toLowerCase().includes(f.toLowerCase()))) {
      // Only externalize if content is substantial (more than 100 chars or has newlines)
      return fieldValue.length > 100 || fieldValue.includes('\n');
    }
    
    return false;
  }
  
  private async createExternalFile(
    targetDir: string,
    primaryKey: Record<string, any>,
    fieldName: string,
    content: string
  ): Promise<string> {
    // Determine file extension based on field name and content
    let extension = '.txt';
    
    if (fieldName.toLowerCase().includes('prompt')) {
      extension = '.md';
    } else if (fieldName.toLowerCase().includes('template')) {
      if (content.includes('<html') || content.includes('<!DOCTYPE')) {
        extension = '.html';
      } else if (content.includes('{{') || content.includes('{%')) {
        extension = '.liquid';
      }
    } else if (fieldName.toLowerCase().includes('sql')) {
      extension = '.sql';
    } else if (fieldName.toLowerCase().includes('notes') || fieldName.toLowerCase().includes('description')) {
      extension = '.md';
    }
    
    const baseFileName = this.buildFileName(primaryKey, null).replace('.json', '');
    const fileName = `${baseFileName}.${fieldName.toLowerCase()}${extension}`;
    const filePath = path.join(targetDir, fileName);
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    return fileName;
  }
  
  private buildFileName(primaryKey: Record<string, any>, entityConfig: any): string {
    // Use primary key values to build filename
    const keys = Object.values(primaryKey);
    
    if (keys.length === 1 && typeof keys[0] === 'string') {
      // Single string key - use as base if it's a guid
      const key = keys[0];
      if (key.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // It's a GUID, use first 8 chars
        return `${key.substring(0, 8)}.json`;
      }
      // Use the whole key if not too long
      if (key.length <= 50) {
        return `${key.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
      }
    }
    
    // Multiple keys or numeric - create composite name
    return keys.map(k => String(k).replace(/[^a-zA-Z0-9-_]/g, '_')).join('-') + '.json';
  }
}