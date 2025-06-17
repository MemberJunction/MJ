import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import ora from 'ora-classic';
import { loadMJConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { initializeProvider, findEntityDirectories, getSystemUser } from '../../lib/provider-utils';
import { getSyncEngine, resetSyncEngine } from '../../lib/singleton-manager';
import { cleanupProvider } from '../../lib/provider-utils';

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
      
      // Stop spinner before provider initialization (which logs to console)
      spinner.stop();
      
      // Initialize data provider
      const provider = await initializeProvider(mjConfig);
      
      // Initialize sync engine using singleton pattern
      const syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after all initialization is complete
      spinner.succeed('Configuration and metadata loaded');
      
      // Find entity directories to process
      const entityDirs = findEntityDirectories(process.cwd(), flags.dir);
      
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
      
      // Enhanced error logging for debugging
      this.log('\n=== Status Check Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Log context information
      this.log(`\nContext:`);
      this.log(`- Working directory: ${process.cwd()}`);
      this.log(`- Specific directory: ${flags.dir || 'none (checking all directories)'}`);
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
      } else if (errorMessage.includes('metadata')) {
        this.log(`\nHint: This appears to be a metadata loading issue.`);
        this.log(`Check database connectivity and entity configurations.`);
      }
      
      this.error(error as Error);
    } finally {
      // Reset sync engine singleton
      resetSyncEngine();
      // Clean up database connection
      await cleanupProvider();
      
      // Exit process to prevent background MJ tasks from throwing errors
      process.exit(0);
    }
  }
  
  private async checkEntityDirectory(
    entityDir: string,
    entityConfig: any,
    syncEngine: SyncEngine
  ): Promise<{ new: number; modified: number; deleted: number; unchanged: number }> {
    const result = { new: 0, modified: 0, deleted: 0, unchanged: 0 };
    
    // Find files matching the configured pattern
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json', '**/*.backup'],
      dot: true  // Include dotfiles (files starting with .)
    });
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        const recordData: RecordData = await fs.readJson(filePath);
        
        if (recordData.primaryKey) {
          // Check if record exists in database
          const entity = await syncEngine.loadEntity(entityConfig.entity, recordData.primaryKey);
          
          if (!entity) {
            result.deleted++;
          } else {
            // Check if modified
            const currentChecksum = syncEngine.calculateChecksum(recordData.fields);
            if (recordData.sync?.checksum !== currentChecksum) {
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
    
    // Recursively process subdirectories
    const entries = await fs.readdir(entityDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subDir = path.join(entityDir, entry.name);
        
        // Load subdirectory config and merge with parent config
        let subEntityConfig = { ...entityConfig };
        const subDirConfig = await loadEntityConfig(subDir);
        
        if (subDirConfig) {
          // Check if this is a new entity type (has different entity name)
          if (subDirConfig.entity && subDirConfig.entity !== entityConfig.entity) {
            // This is a different entity type, skip it (will be processed separately)
            continue;
          }
          
          // Merge defaults: parent defaults + subdirectory overrides
          subEntityConfig = {
            ...entityConfig,
            ...subDirConfig,
            defaults: {
              ...entityConfig.defaults,
              ...(subDirConfig.defaults || {})
            }
          };
        }
        
        // Process subdirectory with merged config
        const subResult = await this.checkEntityDirectory(
          subDir,
          subEntityConfig,
          syncEngine
        );
        
        result.new += subResult.new;
        result.modified += subResult.modified;
        result.deleted += subResult.deleted;
        result.unchanged += subResult.unchanged;
      }
    }
    
    return result;
  }
}