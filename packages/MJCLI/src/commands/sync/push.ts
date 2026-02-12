import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import path from 'path';

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
    'delete-db-only': Flags.boolean({
      description: 'Delete database-only records that reference records being deleted (prevents FK errors)',
      default: false
    }),
    'parallel-batch-size': Flags.integer({
      description: 'Number of records to process in parallel (default: 10)',
      default: 10,
      min: 1,
      max: 50
    }),
    include: Flags.string({
      description: 'Only process these directories (comma-separated, supports patterns)',
      multiple: false
    }),
    exclude: Flags.string({
      description: 'Skip these directories (comma-separated, supports patterns)',
      multiple: false
    }),
  };

  async run(): Promise<void> {
    const {
      PushService, ValidationService, FormattingService,
      loadMJConfig, loadSyncConfig, initializeProvider,
      getSyncEngine, getSystemUser, resetSyncEngine, configManager,
    } = await import('@memberjunction/metadata-sync');

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

      // Load sync config (currently only used internally by PushService)
      const syncConfigDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
      await loadSyncConfig(syncConfigDir);

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

      // Parse include/exclude filters
      const includeFilter = flags.include ? flags.include.split(',').map(s => s.trim()) : undefined;
      const excludeFilter = flags.exclude ? flags.exclude.split(',').map(s => s.trim()) : undefined;

      // Run validation unless disabled
      if (!flags['no-validate']) {
        spinner.start('Validating metadata...');
        const validator = new ValidationService({
          verbose: flags.verbose,
          include: includeFilter,
          exclude: excludeFilter
        });
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
              default: false,
            });

            if (!shouldContinue) {
              this.log(chalk.yellow('\n⚠️  Push cancelled due to validation errors.'));
              // Exit cleanly without throwing an error
              return;
            }
          }
        } else {
          this.log(chalk.green('✓ Validation passed'));
        }
      }

      // Create push service and execute
      const pushService = new PushService(syncEngine, getSystemUser());

      const result = await pushService.push(
        {
          dir: flags.dir,
          dryRun: flags['dry-run'],
          verbose: flags.verbose,
          noValidate: flags['no-validate'],
          deleteDbOnly: flags['delete-db-only'],
          parallelBatchSize: flags['parallel-batch-size'],
          include: includeFilter,
          exclude: excludeFilter,
        },
        {
          onProgress: (message) => {
            spinner.start(message);
          },
          onSuccess: (message) => {
            spinner.succeed(message);
          },
          onError: (message) => {
            // For rollback messages, just log them - don't throw
            if (message.includes('Rolling back database') || message.includes('rolled back successfully')) {
              spinner.fail(message);
            } else {
              // For actual errors, throw to stop execution
              this.error(message);
            }
          },
          onWarn: (message) => {
            // Check if this is a user-friendly warning that doesn't need a stack trace
            const userFriendlyPatterns = [
              'Record not found:',
              'To auto-create missing records',
              'Circular dependencies detected',
              'Skipping',
              'File backups rolled back',
              'Failed to rollback file backups',
              'SQL logging requested but provider does not support it',
              'Failed to close SQL logging session',
              'WARNING: alwaysPush is enabled',
              'WARNING: autoCreateMissingRecords is enabled'
            ];

            const isUserFriendly = userFriendlyPatterns.some(pattern =>
              message.includes(pattern)
            );

            if (isUserFriendly) {
              // Log as a styled warning without stack trace
              this.log(chalk.yellow(message));
            } else {
              // Use standard warn for unexpected warnings that need debugging info
              this.warn(message);
            }
          },
          onLog: (message) => {
            this.log(message);
          },
          onConfirm: async (message) => {
            if (flags.ci) {
              return true; // Always confirm in CI mode
            }
            return await confirm({ message });
          },
        }
      );

      // Show summary
      const endTime = Date.now();
      const formatter = new FormattingService();
      const summary = formatter.formatSyncSummary('push', {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        deleted: result.deleted || 0,
        skipped: result.skipped || 0,
        deferred: result.deferred || 0,
        errors: result.errors,
        duration: endTime - startTime,
      });
      this.log('\n' + summary);

      // Handle result
      if (result.errors > 0) {
        if (flags.ci) {
          this.error('Push failed with errors in CI mode');
        }

        const shouldContinue = await confirm({
          message: 'Push completed with errors. Do you want to commit the successful changes?',
          default: false,
        });

        if (!shouldContinue) {
          throw new Error('Push cancelled due to errors');
        }
      }

      // Show warnings summary
      if (result.warnings.length > 0) {
        this.log(chalk.yellow(`\n⚠️  ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''} during push`));
        if (flags.verbose) {
          result.warnings.forEach((warning) => this.log(`   - ${warning}`));
        }
      }

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

      // Show concise error message without duplicate stack traces
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(chalk.red(`\n❌ Error: ${errorMessage}\n`));

      // Exit with error code but don't show stack trace again (already logged by handlers)
      this.exit(1);
    } finally {
      // Reset singletons
      resetSyncEngine();
    }
  }
}
