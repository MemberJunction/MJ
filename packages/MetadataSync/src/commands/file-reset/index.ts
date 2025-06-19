import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import fastGlob from 'fast-glob';
import chalk from 'chalk';
import { loadSyncConfig } from '../../config';
import { configManager } from '../../lib/config-manager';

export default class FileReset extends Command {
  static description = 'Remove primaryKey and sync sections from metadata JSON files';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --sections=primaryKey`,
    `<%= config.bin %> <%= command.id %> --sections=sync`,
    `<%= config.bin %> <%= command.id %> --dry-run`,
    `<%= config.bin %> <%= command.id %> --no-backup`,
    `<%= config.bin %> <%= command.id %> --yes`,
  ];
  
  static flags = {
    sections: Flags.string({
      description: 'Which sections to remove',
      options: ['both', 'primaryKey', 'sync'],
      default: 'both',
    }),
    'dry-run': Flags.boolean({ 
      description: 'Show what would be removed without actually removing' 
    }),
    'no-backup': Flags.boolean({ 
      description: 'Skip creating backup files' 
    }),
    yes: Flags.boolean({ 
      char: 'y', 
      description: 'Skip confirmation prompt' 
    }),
    verbose: Flags.boolean({ 
      char: 'v', 
      description: 'Show detailed output' 
    }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(FileReset);
    const spinner = ora();
    
    try {
      // Load sync config
      const syncConfig = await loadSyncConfig(configManager.getOriginalCwd());
      if (!syncConfig) {
        this.error('No .mj-sync.json found in current directory');
      }
      
      // Find all metadata JSON files
      spinner.start('Finding metadata files');
      const pattern = syncConfig.filePattern || '.*.json';
      const files = await fastGlob(pattern, {
        cwd: configManager.getOriginalCwd(),
        absolute: true,
        ignore: ['.mj-sync.json', '.mj-folder.json'],
      });
      
      spinner.stop();
      
      if (files.length === 0) {
        this.log('No metadata files found');
        return;
      }
      
      this.log(`Found ${files.length} metadata file${files.length === 1 ? '' : 's'}`);
      
      // Count what will be removed
      let filesWithPrimaryKey = 0;
      let filesWithSync = 0;
      let totalPrimaryKeys = 0;
      let totalSyncs = 0;
      
      for (const file of files) {
        const content = await fs.readJson(file);
        const stats = this.countSections(content);
        if (stats.primaryKeyCount > 0) {
          filesWithPrimaryKey++;
          totalPrimaryKeys += stats.primaryKeyCount;
        }
        if (stats.syncCount > 0) {
          filesWithSync++;
          totalSyncs += stats.syncCount;
        }
      }
      
      // Show what will be removed
      this.log('');
      if (flags.sections === 'both' || flags.sections === 'primaryKey') {
        this.log(`Will remove ${chalk.yellow(totalPrimaryKeys)} primaryKey section${totalPrimaryKeys === 1 ? '' : 's'} from ${chalk.yellow(filesWithPrimaryKey)} file${filesWithPrimaryKey === 1 ? '' : 's'}`);
      }
      if (flags.sections === 'both' || flags.sections === 'sync') {
        this.log(`Will remove ${chalk.yellow(totalSyncs)} sync section${totalSyncs === 1 ? '' : 's'} from ${chalk.yellow(filesWithSync)} file${filesWithSync === 1 ? '' : 's'}`);
      }
      
      if (flags['dry-run']) {
        this.log('');
        this.log(chalk.cyan('Dry run mode - no files will be modified'));
        
        if (flags.verbose) {
          this.log('');
          for (const file of files) {
            const content = await fs.readJson(file);
            const stats = this.countSections(content);
            if (stats.primaryKeyCount > 0 || stats.syncCount > 0) {
              this.log(`${path.relative(configManager.getOriginalCwd(), file)}:`);
              if (stats.primaryKeyCount > 0) {
                this.log(`  - ${stats.primaryKeyCount} primaryKey section${stats.primaryKeyCount === 1 ? '' : 's'}`);
              }
              if (stats.syncCount > 0) {
                this.log(`  - ${stats.syncCount} sync section${stats.syncCount === 1 ? '' : 's'}`);
              }
            }
          }
        }
        return;
      }
      
      // Confirm before proceeding
      if (!flags.yes) {
        const confirmed = await confirm({
          message: 'Do you want to proceed?',
          default: false,
        });
        
        if (!confirmed) {
          this.log('Operation cancelled');
          return;
        }
      }
      
      // Process files
      spinner.start('Processing files');
      let processedFiles = 0;
      let modifiedFiles = 0;
      
      for (const file of files) {
        processedFiles++;
        const content = await fs.readJson(file);
        const originalContent = JSON.stringify(content);
        
        // Remove sections
        const cleanedContent = this.removeSections(content, flags.sections);
        
        // Only write if content changed
        if (JSON.stringify(cleanedContent) !== originalContent) {
          // Create backup if requested
          if (!flags['no-backup']) {
            const backupPath = `${file}.backup`;
            await fs.writeJson(backupPath, content, { spaces: 2 });
          }
          
          // Write cleaned content
          await fs.writeJson(file, cleanedContent, { spaces: 2 });
          modifiedFiles++;
          
          if (flags.verbose) {
            spinner.stop();
            this.log(`✓ ${path.relative(configManager.getOriginalCwd(), file)}`);
            spinner.start('Processing files');
          }
        }
      }
      
      spinner.stop();
      
      // Show summary
      this.log('');
      this.log(chalk.green(`✓ Reset complete`));
      this.log(`  Processed: ${processedFiles} file${processedFiles === 1 ? '' : 's'}`);
      this.log(`  Modified: ${modifiedFiles} file${modifiedFiles === 1 ? '' : 's'}`);
      if (!flags['no-backup'] && modifiedFiles > 0) {
        this.log(`  Backups created: ${modifiedFiles}`);
      }
      
    } catch (error) {
      spinner.stop();
      this.error(error instanceof Error ? error.message : String(error));
    }
  }
  
  private countSections(data: any): { primaryKeyCount: number; syncCount: number } {
    let primaryKeyCount = 0;
    let syncCount = 0;
    
    if (Array.isArray(data)) {
      for (const item of data) {
        const stats = this.countSections(item);
        primaryKeyCount += stats.primaryKeyCount;
        syncCount += stats.syncCount;
      }
    } else if (data && typeof data === 'object') {
      if ('primaryKey' in data) primaryKeyCount++;
      if ('sync' in data) syncCount++;
      
      // Check related entities
      if (data.relatedEntities) {
        for (const entityData of Object.values(data.relatedEntities)) {
          const stats = this.countSections(entityData);
          primaryKeyCount += stats.primaryKeyCount;
          syncCount += stats.syncCount;
        }
      }
    }
    
    return { primaryKeyCount, syncCount };
  }
  
  private removeSections(data: any, sections: string): any {
    if (Array.isArray(data)) {
      return data.map(item => this.removeSections(item, sections));
    } else if (data && typeof data === 'object') {
      const cleaned = { ...data };
      
      // Remove specified sections
      if (sections === 'both' || sections === 'primaryKey') {
        delete cleaned.primaryKey;
      }
      if (sections === 'both' || sections === 'sync') {
        delete cleaned.sync;
      }
      
      // Process related entities
      if (cleaned.relatedEntities) {
        const cleanedRelated: any = {};
        for (const [entityName, entityData] of Object.entries(cleaned.relatedEntities)) {
          cleanedRelated[entityName] = this.removeSections(entityData, sections);
        }
        cleaned.relatedEntities = cleanedRelated;
      }
      
      return cleaned;
    }
    
    return data;
  }
}