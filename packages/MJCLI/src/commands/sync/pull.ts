import { Command, Flags } from '@oclif/core';
import { select } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

export default class Pull extends Command {
  static description = 'Pull metadata from database to local files';
  
  static examples = [
    `<%= config.bin %> <%= command.id %> --entity="MJ: AI Prompts"`,
    `<%= config.bin %> <%= command.id %> --entity="MJ: AI Prompts" --filter="CategoryID='customer-service-id'"`,
    `<%= config.bin %> <%= command.id %> --entity="MJ: AI Agents" --merge-strategy=overwrite`,
    `<%= config.bin %> <%= command.id %> --entity="Actions" --target-dir=./custom-actions --no-validate`,
    `<%= config.bin %> <%= command.id %> --entity="Templates" --dry-run --verbose`,
    `<%= config.bin %> <%= command.id %> --entity="MJ: AI Prompts" --exclude-fields=InternalNotes,DebugInfo`,
  ];
  
  static flags = {
    entity: Flags.string({ description: 'Entity name to pull', required: true }),
    filter: Flags.string({ description: 'Additional filter for pulling specific records' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pulled without actually pulling' }),
    'multi-file': Flags.string({ description: 'Create a single file with multiple records (provide filename)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before pull' }),
    'update-existing': Flags.boolean({ description: 'Update existing records during pull', default: true }),
    'create-new': Flags.boolean({ description: 'Create new files for records not found locally', default: true }),
    'backup-before-update': Flags.boolean({ description: 'Create backups before updating files', default: true }),
    'merge-strategy': Flags.string({ 
      description: 'Merge strategy for updates', 
      options: ['merge', 'overwrite', 'skip'],
      default: 'merge'
    }),
    'backup-directory': Flags.string({ description: 'Custom backup directory (default: .backups)' }),
    'preserve-fields': Flags.string({ description: 'Comma-separated list of fields to preserve during updates', multiple: true }),
    'exclude-fields': Flags.string({ description: 'Comma-separated list of fields to exclude from pull', multiple: true }),
    'target-dir': Flags.string({ description: 'Specific target directory (overrides auto-discovery)' })
  };
  
  async run(): Promise<void> {
    const {
      PullService, ValidationService, FormattingService,
      loadMJConfig, initializeProvider, getSyncEngine, getSystemUser,
      resetSyncEngine, configManager, loadEntityConfig, FileBackupManager,
    } = await import('@memberjunction/metadata-sync');

    const { flags } = await this.parse(Pull);
    const spinner = ora();
    let backupManager: InstanceType<typeof FileBackupManager> | null = null;
    
    try {
      // Load MJ config first
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Stop spinner before provider initialization
      spinner.stop();
      
      // Initialize data provider
      await initializeProvider(mjConfig);
      
      // Get singleton sync engine
      const syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after initialization
      if (flags.verbose) {
        spinner.succeed('Configuration and metadata loaded');
      } else {
        spinner.stop();
      }
      
      // Find entity directories
      const entityDirectories = await this.findEntityDirectories(flags.entity, configManager, loadEntityConfig);
      
      if (entityDirectories.length === 0) {
        this.error(`No directories found for entity "${flags.entity}". Make sure the entity configuration exists in a .mj-sync.json file.`);
      }
      
      // Select target directory
      let targetDir = flags['target-dir'];
      if (!targetDir) {
        if (entityDirectories.length === 1) {
          targetDir = entityDirectories[0];
        } else {
          targetDir = await select({
            message: `Multiple directories found for entity "${flags.entity}". Which one to use?`,
            choices: entityDirectories.map(dir => ({ name: dir, value: dir }))
          });
        }
      }
      
      // Run validation on target directory unless disabled
      if (!flags['no-validate']) {
        spinner.start('Validating target directory...');
        const validator = new ValidationService({ verbose: flags.verbose });
        const formatter = new FormattingService();
        
        const validationResult = await validator.validateDirectory(targetDir);
        spinner.stop();
        
        if (!validationResult.isValid || validationResult.warnings.length > 0) {
          // Show validation results
          this.log('\n' + formatter.formatValidationResult(validationResult, flags.verbose));
          
          if (!validationResult.isValid) {
            // Ask for confirmation
            const shouldContinue = await select({
              message: 'Validation failed with errors. Do you want to continue anyway?',
              choices: [
                { name: 'No, fix the errors first', value: false },
                { name: 'Yes, continue anyway', value: true }
              ],
              default: false
            });
            
            if (!shouldContinue) {
              this.error('Pull cancelled due to validation errors.');
            }
          }
        } else {
          this.log(chalk.green('✓ Validation passed'));
        }
      }
      
      // Initialize backup manager if backups are enabled
      if (flags['backup-before-update']) {
        backupManager = new FileBackupManager();
        await backupManager.initialize();
      }
      
      // Create pull service and execute
      const pullService = new PullService(syncEngine, getSystemUser());
      
      // Build pull options - only include CLI flags that were explicitly provided
      const pullOptions: any = {
        entity: flags.entity,
        targetDir,
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
        noValidate: flags['no-validate']
      };

      // Add optional flags only if explicitly provided to avoid overriding entity config
      if (flags.filter !== undefined) pullOptions.filter = flags.filter;
      if (flags['multi-file'] !== undefined) pullOptions.multiFile = flags['multi-file'];
      if (flags['update-existing'] !== undefined) pullOptions.updateExistingRecords = flags['update-existing'];
      if (flags['create-new'] !== undefined) pullOptions.createNewFileIfNotFound = flags['create-new'];
      if (flags['backup-before-update'] !== undefined) pullOptions.backupBeforeUpdate = flags['backup-before-update'];
      if (flags['merge-strategy'] !== undefined) pullOptions.mergeStrategy = flags['merge-strategy'] as 'merge' | 'overwrite' | 'skip';
      if (flags['backup-directory'] !== undefined) pullOptions.backupDirectory = flags['backup-directory'];
      if (flags['preserve-fields'] !== undefined) pullOptions.preserveFields = flags['preserve-fields'];
      if (flags['exclude-fields'] !== undefined) pullOptions.excludeFields = flags['exclude-fields'];
      
      await pullService.pull(pullOptions, {
        onProgress: (message) => {
          spinner.start(message);
        },
        onSuccess: (message) => {
          spinner.succeed(message);
        },
        onError: (message) => {
          spinner.fail(message);
        },
        onWarn: (message) => {
          this.warn(message);
        },
        onLog: (message) => {
          this.log(message);
        }
      });
      
      // Clean up backups on success
      if (backupManager && !flags['dry-run']) {
        await backupManager.cleanup();
        if (flags.verbose) {
          this.log(chalk.green('✓ Temporary backup files cleaned up'));
        }
      }
      
      // Clean up persistent backup files created by PullService
      if (!flags['dry-run']) {
        try {
          const backupCount = pullService.getCreatedBackupFiles().length;
          await pullService.cleanupBackupFiles();
          if (flags.verbose && backupCount > 0) {
            this.log(chalk.green(`✓ Cleaned up ${backupCount} persistent backup files`));
          }
        } catch (cleanupError) {
          this.warn(`Failed to cleanup persistent backup files: ${cleanupError}`);
        }
      }
      
      if (!flags['dry-run']) {
        this.log(`\n✅ Pull completed successfully`);
      }
      
    } catch (error) {
      spinner.fail('Pull failed');
      
      // Rollback backups on error
      if (backupManager) {
        try {
          await backupManager.rollback();
          if (flags.verbose) {
            this.log(chalk.yellow('↩️  Backup files restored'));
          }
        } catch (rollbackError) {
          this.warn(`Failed to rollback backup files: ${rollbackError}`);
        }
      }
      
      // Enhanced error logging
      this.log('\n=== Pull Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Context information
      this.log(`\nContext:`);
      this.log(`- Working directory: ${process.cwd()}`);
      this.log(`- Entity: ${flags.entity || 'not specified'}`);
      this.log(`- Filter: ${flags.filter || 'none'}`);
      
      this.error(error as Error);
    } finally {
      // Reset singletons
      resetSyncEngine();
    }
  }
  
  private async findEntityDirectories(
    entityName: string,
    configMgr: { getOriginalCwd(): string },
    loadConfig: (dir: string) => Promise<{ entity: string } | null>,
  ): Promise<string[]> {
    try {
      const workingDir = configMgr.getOriginalCwd();

      // Search recursively for all directories with .mj-sync.json files
      const allDirs = this.findAllEntityDirectoriesRecursive(workingDir);

      // Filter directories that match the requested entity
      const entityDirs: string[] = [];

      for (const dir of allDirs) {
        try {
          const config = await loadConfig(dir);
          if (config && config.entity === entityName) {
            entityDirs.push(dir);
          }
        } catch (error) {
          this.warn(`Skipping directory ${dir}: invalid configuration (${error})`);
        }
      }

      return entityDirs;
    } catch (error) {
      this.error(`Failed to find entity directories: ${error}`);
    }
  }

  private findAllEntityDirectoriesRecursive(dir: string): string[] {
    const directories: string[] = [];
    
    try {
      // Check if current directory has .mj-sync.json
      const syncConfigPath = path.join(dir, '.mj-sync.json');
      if (fs.existsSync(syncConfigPath)) {
        directories.push(dir);
      }
      
      // Recursively search subdirectories
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          const subdirPath = path.join(dir, item.name);
          directories.push(...this.findAllEntityDirectoriesRecursive(subdirPath));
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return directories;
  }
}