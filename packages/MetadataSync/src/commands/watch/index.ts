import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import chokidar from 'chokidar';
import ora from 'ora-classic';
import { loadMJConfig, loadSyncConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { initializeProvider, findEntityDirectories, getSystemUser } from '../../lib/provider-utils';
import { BaseEntity } from '@memberjunction/core';
import { getSyncEngine, resetSyncEngine } from '../../lib/singleton-manager';
import { cleanupProvider } from '../../lib/provider-utils';

export default class Watch extends Command {
  static description = 'Watch for file changes and automatically push to database';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to watch' }),
  };
  
  private syncEngine!: SyncEngine;
  private syncConfig: any;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Watch);
    const spinner = ora();
    
    try {
      // Load configurations
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      this.syncConfig = await loadSyncConfig(process.cwd());
      
      // Stop spinner before provider initialization (which logs to console)
      spinner.stop();
      
      // Initialize data provider
      const provider = await initializeProvider(mjConfig);
      
      // Initialize sync engine using singleton pattern
      this.syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after all initialization is complete
      spinner.succeed('Configuration and metadata loaded');
      
      // Find entity directories to watch
      const entityDirs = findEntityDirectories(process.cwd(), flags.dir);
      
      if (entityDirs.length === 0) {
        this.error('No entity directories found');
      }
      
      this.log(`Watching ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} for changes`);
      
      // Set up watchers
      const watchers: chokidar.FSWatcher[] = [];
      
      for (const entityDir of entityDirs) {
        const entityConfig = await loadEntityConfig(entityDir);
        if (!entityConfig) {
          this.warn(`Skipping ${entityDir} - no valid entity configuration`);
          continue;
        }
        
        this.log(`Watching ${entityConfig.entity} in ${entityDir}`);
        
        // Watch for JSON files and external files
        // All JSON files will be watched, but only dot-prefixed ones will be processed
        const patterns = [
          path.join(entityDir, entityConfig.filePattern || '**/*.json'),
          path.join(entityDir, '**/*.md'),
          path.join(entityDir, '**/*.txt'),
          path.join(entityDir, '**/*.html'),
          path.join(entityDir, '**/*.liquid'),
          path.join(entityDir, '**/*.sql')
        ];
        
        const ignored = [
          '**/node_modules/**',
          '**/.git/**',
          '**/.mj-sync.json',
          '**/.mj-folder.json',
          '**/*.backup',
          ...(this.syncConfig?.watch?.ignorePatterns || [])
        ];
        
        const watcher = chokidar.watch(patterns, {
          ignored,
          persistent: true,
          ignoreInitial: true
        });
        
        watcher
          .on('add', (filePath) => this.handleFileChange(filePath, 'added', entityDir, entityConfig))
          .on('change', (filePath) => this.handleFileChange(filePath, 'changed', entityDir, entityConfig))
          .on('unlink', (filePath) => this.handleFileChange(filePath, 'deleted', entityDir, entityConfig));
        
        watchers.push(watcher);
      }
      
      this.log('\nPress Ctrl+C to stop watching');
      
      // Keep process alive
      process.stdin.resume();
      
      // Cleanup on exit
      process.on('SIGINT', async () => {
        this.log('\nStopping watchers...');
        watchers.forEach(w => w.close());
        // Reset sync engine singleton
        resetSyncEngine();
        // Clean up database connection
        await cleanupProvider();
        process.exit(0);
      });
      
    } catch (error) {
      spinner.fail('Watch failed');
      
      // Enhanced error logging for debugging
      this.log('\n=== Watch Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Log context information
      this.log(`\nContext:`);
      this.log(`- Working directory: ${process.cwd()}`);
      this.log(`- Specific directory: ${flags.dir || 'none (watching all directories)'}`);
      this.log(`- Flags: ${JSON.stringify(flags, null, 2)}`);
      
      // Check if error is related to common issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('No entity directories found')) {
        this.log(`\nHint: This appears to be an entity directory configuration issue.`);
        this.log(`Make sure directories have .mj-sync.json files or run "mj-sync init".`);
      } else if (errorMessage.includes('database') || errorMessage.includes('connection')) {
        this.log(`\nHint: This appears to be a database connectivity issue.`);
        this.log(`Check your mj.config.cjs configuration and database connectivity.`);
      } else if (errorMessage.includes('config') || errorMessage.includes('mj.config.cjs')) {
        this.log(`\nHint: This appears to be a configuration file issue.`);
        this.log(`Make sure mj.config.cjs exists and is properly configured.`);
      } else if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
        this.log(`\nHint: File or directory access issue.`);
        this.log(`Check that the directories exist and are accessible.`);
      } else if (errorMessage.includes('chokidar') || errorMessage.includes('watch')) {
        this.log(`\nHint: File watching system issue.`);
        this.log(`Check file system permissions and available file descriptors.`);
      }
      
      // Reset sync engine singleton
      resetSyncEngine();
      // Clean up database connection
      await cleanupProvider();
      this.error(error as Error);
    }
  }
  
  private async handleFileChange(
    filePath: string,
    event: string,
    entityDir: string,
    entityConfig: any
  ): Promise<void> {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new debounce timer
    const debounceMs = this.syncConfig?.watch?.debounceMs || 1000;
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      
      try {
        const relativePath = path.relative(entityDir, filePath);
        this.log(`\nFile ${event}: ${relativePath}`);
        
        if (event === 'deleted') {
          // Handle deletion
          this.log('File deletion detected - manual database cleanup may be required');
        } else if (filePath.endsWith('.json')) {
          // Handle JSON file change
          await this.syncJsonFile(filePath, entityDir, entityConfig);
        } else {
          // Handle external file change
          await this.syncExternalFile(filePath, entityDir, entityConfig);
        }
      } catch (error) {
        this.warn(`Failed to sync ${filePath}: ${(error as any).message || error}`);
      }
    }, debounceMs);
    
    this.debounceTimers.set(filePath, timer);
  }
  
  private async syncJsonFile(
    filePath: string,
    entityDir: string,
    entityConfig: any
  ): Promise<void> {
    const recordData: RecordData = await fs.readJson(filePath);
    
    // Build defaults
    const defaults = await this.syncEngine.buildDefaults(filePath, entityConfig);
    
    // Load or create entity
    let entity: BaseEntity | null = null;
    let isNew = false;
    
    if (recordData.primaryKey) {
      entity = await this.syncEngine.loadEntity(entityConfig.entity, recordData.primaryKey);
    }
    
    if (!entity) {
      // New record
      entity = await this.syncEngine.createEntityObject(entityConfig.entity);
      entity.NewRecord();
      isNew = true;
    }
    
    // Apply defaults first
    for (const [field, value] of Object.entries(defaults)) {
      if (field in entity) {
        (entity as any)[field] = value;
      }
    }
    
    // Apply record fields
    for (const [field, value] of Object.entries(recordData.fields)) {
      if (field in entity) {
        const processedValue = await this.syncEngine.processFieldValue(value, path.dirname(filePath));
        (entity as any)[field] = processedValue;
      }
    }
    
    // Save the record
    const saved = await entity.Save();
    if (!saved) {
      const message = entity.LatestResult?.Message;
      if (message) {
        throw new Error(`Failed to save record: ${message}`);
      }
      
      const errors = entity.LatestResult?.Errors?.map(err => 
        typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
      )?.join(', ') || 'Unknown error';
      throw new Error(`Failed to save record: ${errors}`);
    }
    
    this.log(`Successfully ${isNew ? 'created' : 'updated'} ${entityConfig.entity} record`);
    
    // Update the local file with new primary key if created
    if (isNew) {
      const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
      if (entityInfo) {
        const newPrimaryKey: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
          newPrimaryKey[pk.Name] = entity.Get(pk.Name);
        }
        recordData.primaryKey = newPrimaryKey;
        
        // Update sync metadata
        recordData.sync = {
          lastModified: new Date().toISOString(),
          checksum: this.syncEngine.calculateChecksum(recordData.fields)
        };
        
        // Write back to file
        await fs.writeJson(filePath, recordData, { spaces: 2 });
      }
    }
  }
  
  private async syncExternalFile(
    filePath: string,
    entityDir: string,
    entityConfig: any
  ): Promise<void> {
    // Find the corresponding JSON file
    const fileName = path.basename(filePath);
    const parts = fileName.split('.');
    
    if (parts.length >= 3) {
      // Format: uuid.fieldname.ext
      const jsonFileName = `${parts[0]}.json`;
      const fieldName = parts[1];
      const jsonFilePath = path.join(path.dirname(filePath), jsonFileName);
      
      if (await fs.pathExists(jsonFilePath)) {
        // Update the JSON file's sync metadata to trigger a sync
        const recordData: RecordData = await fs.readJson(jsonFilePath);
        recordData.sync = {
          lastModified: new Date().toISOString(),
          checksum: recordData.sync?.checksum || ''
        };
        await fs.writeJson(jsonFilePath, recordData, { spaces: 2 });
        
        this.log(`Updated sync metadata for ${jsonFileName} due to external file change`);
      }
    }
  }
}