import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import {
  PushService,
  ValidationService,
  FormattingService,
  loadMJConfig,
  loadSyncConfig,
  initializeProvider,
  getSyncEngine,
  getSystemUser,
  resetSyncEngine,
  configManager,
  getDataProvider
} from '@memberjunction/metadata-sync';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import path from 'path';
import fs from 'fs-extra';

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
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed field-level output' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before push' }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Push);
    const spinner = ora();
    const startTime = Date.now();
    
    try {
      // Load configurations
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Load sync config
      const syncConfigDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
      const syncConfig = await loadSyncConfig(syncConfigDir);
      
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
      
      // SQL logging is not currently supported in the public API
      let sqlLogPath: string | undefined;
      
      // Run validation unless disabled
      if (!flags['no-validate']) {
        spinner.start('Validating metadata...');
        const validator = new ValidationService({ verbose: flags.verbose });
        const formatter = new FormattingService();
        
        const targetDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
        const validationResult = await validator.validateDirectory(targetDir);
        spinner.stop();
        
        if (!validationResult.isValid || validationResult.warnings.length > 0) {
          // Show validation results
          this.log('\n' + formatter.formatValidationResult(validationResult, flags.verbose));
          
          if (!validationResult.isValid) {
            // In CI mode, fail immediately
            if (flags.ci) {
              this.error('Validation failed. Cannot proceed with push.');
            }
            
            // Otherwise, ask for confirmation
            const shouldContinue = await confirm({
              message: 'Validation failed with errors. Do you want to continue anyway?',
              default: false
            });
            
            if (!shouldContinue) {
              this.error('Push cancelled due to validation errors.');
            }
          }
        } else {
          this.log(chalk.green('✓ Validation passed'));
        }
      }
      
      // Transaction support is not available in the public API
      // Each save operation will be its own transaction
      
      // Create push service and execute
      const pushService = new PushService(syncEngine, getSystemUser());
      
      const result = await pushService.push({
        dir: flags.dir,
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
        noValidate: flags['no-validate']
      }, {
        onProgress: (message) => {
          spinner.start(message);
        },
        onSuccess: (message) => {
          spinner.succeed(message);
        },
        onError: (message) => {
          this.error(message);
        },
        onWarn: (message) => {
          this.warn(message);
        },
        onLog: (message) => {
          this.log(message);
        },
        onConfirm: async (message) => {
          if (flags.ci) {
            return true; // Always confirm in CI mode
          }
          return await confirm({ message });
        }
      });
      
      // Show summary
      const endTime = Date.now();
      const formatter = new FormattingService();
      const summary = formatter.formatSyncSummary('push', {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        deleted: 0,
        skipped: 0,
        errors: result.errors,
        duration: endTime - startTime
      });
      this.log('\n' + summary);
      
      // Handle result
      if (result.errors > 0) {
        if (flags.ci) {
          this.error('Push failed with errors in CI mode');
        }
        
        const shouldContinue = await confirm({
          message: 'Push completed with errors. Do you want to commit the successful changes?',
          default: false
        });
        
        if (!shouldContinue) {
          throw new Error('Push cancelled due to errors');
        }
      }
      
      // Show warnings summary
      if (result.warnings.length > 0) {
        this.log(chalk.yellow(`\n⚠️  ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''} during push`));
        if (flags.verbose) {
          result.warnings.forEach(warning => this.log(`   - ${warning}`));
        }
      }
      
      // Transaction commits are handled automatically by each save operation
      
      // Show final status
      if (!flags['dry-run']) {
        if (result.errors === 0) {
          this.log(chalk.green('\n✅ Push completed successfully'));
        } else {
          this.log(chalk.yellow('\n⚠️  Push completed with errors'));
        }
        
        if (result.sqlLogPath) {
          this.log(`\n📄 SQL log saved to: ${path.relative(process.cwd(), result.sqlLogPath)}`);
        }
      }
      
    } catch (error) {
      spinner.fail('Push failed');
      
      // Error handling - individual operations may have partially succeeded
      
      // Enhanced error logging
      this.log('\n=== Push Error Details ===');
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
      
      // Exit process
      process.exit(0);
    }
  }
}