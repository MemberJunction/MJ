import { Command, Flags } from '@oclif/core';
import { confirm, checkbox } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import * as path from 'path';

export default class FileReset extends Command {
  static description = 'Reset file metadata sections';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --sections="dependencies,references"`,
    `<%= config.bin %> <%= command.id %> --all`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to reset' }),
    sections: Flags.string({ description: 'Comma-separated list of sections to reset (dependencies,references,related,lookup)' }),
    all: Flags.boolean({ description: 'Reset all metadata sections' }),
    'dry-run': Flags.boolean({ description: 'Show what would be reset without actually resetting' }),
    force: Flags.boolean({ description: 'Skip confirmation prompts' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };
  
  async run(): Promise<void> {
    const {
      FileResetService, loadMJConfig, initializeProvider,
      getSyncEngine, getSystemUser, resetSyncEngine, configManager,
    } = await import('@memberjunction/metadata-sync');

    const { flags } = await this.parse(FileReset);
    const spinner = ora();
    
    try {
      // Load configuration
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Stop spinner before provider initialization
      spinner.stop();
      
      // Initialize data provider
      await initializeProvider(mjConfig);
      
      // Initialize sync engine
      const syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after initialization
      if (flags.verbose) {
        spinner.succeed('Configuration and metadata loaded');
      } else {
        spinner.stop();
      }
      
      // Determine sections to reset
      let sectionsToReset: string[] = [];
      const availableSections = ['primaryKey', 'sync'];
      
      if (flags.all) {
        sectionsToReset = availableSections;
      } else if (flags.sections) {
        sectionsToReset = flags.sections.split(',').map(s => s.trim());
        
        // Validate sections
        const invalidSections = sectionsToReset.filter(s => !availableSections.includes(s));
        if (invalidSections.length > 0) {
          this.error(`Invalid sections: ${invalidSections.join(', ')}. Valid sections are: ${availableSections.join(', ')}`);
        }
      } else {
        // Interactive selection
        sectionsToReset = await checkbox({
          message: 'Select sections to reset:',
          choices: [
            { name: 'Primary Key metadata', value: 'primaryKey', checked: false },
            { name: 'Sync metadata', value: 'sync', checked: false }
          ]
        });
        
        if (sectionsToReset.length === 0) {
          this.log(chalk.yellow('No sections selected. Exiting.'));
          return;
        }
      }
      
      // Determine target directory
      const targetDir = flags.dir 
        ? path.resolve(configManager.getOriginalCwd(), flags.dir) 
        : configManager.getOriginalCwd();
      
      // Show what will be reset
      this.log(chalk.bold('\nFile Reset Summary:'));
      this.log(`Target directory: ${path.relative(process.cwd(), targetDir)}`);
      this.log(`Sections to reset: ${sectionsToReset.join(', ')}`);
      this.log(`Mode: ${flags['dry-run'] ? 'Dry run (no changes will be made)' : 'Live (files will be modified)'}`);
      
      // Confirm unless forced or dry-run
      if (!flags.force && !flags['dry-run']) {
        const shouldContinue = await confirm({
          message: 'This will reset the selected metadata sections. Continue?',
          default: false
        });
        
        if (!shouldContinue) {
          this.log(chalk.yellow('\nFile reset cancelled.'));
          return;
        }
      }
      
      // Create file reset service and execute
      const fileResetService = new FileResetService();
      
      spinner.start('Resetting file metadata...');
      
      // Map selected sections to service options
      let serviceSection: 'both' | 'primaryKey' | 'sync' = 'both';
      if (sectionsToReset.includes('primaryKey') && sectionsToReset.includes('sync')) {
        serviceSection = 'both';
      } else if (sectionsToReset.includes('primaryKey')) {
        serviceSection = 'primaryKey';
      } else if (sectionsToReset.includes('sync')) {
        serviceSection = 'sync';
      }
      
      const result = await fileResetService.resetFiles({
        sections: serviceSection,
        dryRun: flags['dry-run'],
        noBackup: false,
        verbose: flags.verbose
      }, {
        onProgress: (message: string) => {
          spinner.start(message);
        },
        onWarn: (message: string) => {
          this.warn(message);
        },
        onLog: (message: string) => {
          this.log(message);
        }
      });
      
      spinner.stop();
      
      // Show summary
      if (result.modifiedFiles > 0) {
        if (flags['dry-run']) {
          this.log(chalk.blue(`\n🔍 Dry run complete. ${result.modifiedFiles} file(s) would be reset.`));
        } else {
          this.log(chalk.green(`\n✅ Successfully reset ${result.modifiedFiles} file(s).`));
          if (result.backupsCreated > 0) {
            this.log(chalk.gray(`   📁 Created ${result.backupsCreated} backup(s).`));
          }
        }
      } else {
        this.log(chalk.yellow('\n⚠️  No files needed resetting.'));
      }
      
      if (flags.verbose) {
        this.log(`\n📊 Statistics:`);
        this.log(`   Files processed: ${result.processedFiles}`);
        this.log(`   Files with primaryKey: ${result.filesWithPrimaryKey}`);
        this.log(`   Files with sync: ${result.filesWithSync}`);
        this.log(`   Total primaryKeys removed: ${result.totalPrimaryKeys}`);
        this.log(`   Total syncs removed: ${result.totalSyncs}`);
      }
      
    } catch (error) {
      spinner.fail('File reset failed');
      
      // Enhanced error logging
      this.log('\n=== File Reset Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      this.error(error as Error);
    } finally {
      // Reset singletons
      resetSyncEngine();
    }
  }
}