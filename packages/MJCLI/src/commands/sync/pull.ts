import { Command, Flags } from '@oclif/core';
import { select } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import {
  PullService,
  ValidationService,
  FormattingService,
  loadMJConfig,
  initializeProvider,
  getSyncEngine,
  getSystemUser,
  resetSyncEngine,
  configManager
} from '@memberjunction/metadata-sync';

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
    'multi-file': Flags.string({ description: 'Create a single file with multiple records (provide filename)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before pull' }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Pull);
    const spinner = ora();
    
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
      
      // Run validation unless disabled
      if (!flags['no-validate']) {
        spinner.start('Validating metadata...');
        const validator = new ValidationService({ verbose: flags.verbose });
        const formatter = new FormattingService();
        
        const validationResult = await validator.validateDirectory(configManager.getOriginalCwd());
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
      
      // Set target directory if specified via environment
      const envTargetDir = process.env.METADATA_SYNC_TARGET_DIR;
      
      // Create pull service and execute
      const pullService = new PullService(syncEngine, getSystemUser());
      
      try {
        const result = await pullService.pull({
          entity: flags.entity,
          filter: flags.filter,
          dryRun: flags['dry-run'],
          multiFile: flags['multi-file'],
          verbose: flags.verbose,
          noValidate: flags['no-validate'],
          targetDir: envTargetDir
        }, {
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
        
        if (!flags['dry-run']) {
          this.log(`\n✅ Pull completed successfully`);
        }
        
      } catch (pullError) {
        // If it's a "multiple directories found" error, handle it specially
        if (pullError instanceof Error && pullError.message.includes('Multiple directories found')) {
          // Re-throw to be caught by outer handler
          throw pullError;
        }
        throw pullError;
      }
      
    } catch (error) {
      spinner.fail('Pull failed');
      
      // Handle multiple directories error
      if (error instanceof Error && error.message.includes('Multiple directories found')) {
        const entityDirs = await this.findEntityDirectories(flags.entity);
        
        const targetDir = await select({
          message: `Multiple directories found for entity "${flags.entity}". Which one to use?`,
          choices: entityDirs.map(dir => ({ name: dir, value: dir }))
        });
        
        // Re-run with specific target directory
        process.env.METADATA_SYNC_TARGET_DIR = targetDir;
        await this.run();
        return;
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
      this.log(`- Working directory: ${configManager.getOriginalCwd()}`);
      this.log(`- Entity: ${flags.entity || 'not specified'}`);
      this.log(`- Filter: ${flags.filter || 'none'}`);
      
      this.error(error as Error);
    } finally {
      // Reset singletons
      resetSyncEngine();
      
      // Exit process to prevent background MJ tasks from throwing errors
      process.exit(0);
    }
  }
  
  private async findEntityDirectories(entityName: string): Promise<string[]> {
    // This is a simplified version - would need full implementation
    const { findEntityDirectories } = await import('@memberjunction/metadata-sync');
    return findEntityDirectories(configManager.getOriginalCwd());
  }
}