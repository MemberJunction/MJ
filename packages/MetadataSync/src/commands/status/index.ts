import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import ora from 'ora-classic';
import { loadMJConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { initializeProvider, findEntityDirectories, getSystemUser } from '../../lib/provider-utils';

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
      const provider = await initializeProvider(mjConfig);
      
      // Initialize sync engine
      const syncEngine = new SyncEngine(getSystemUser());
      await syncEngine.initialize();
      spinner.succeed('Configuration loaded');
      
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
      this.error(error as Error);
    }
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
    
    return result;
  }
}