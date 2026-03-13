import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';

export default class Status extends Command {
  static description = 'Show status of local files vs database';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --verbose`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to check status' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed field-level differences' }),
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
      StatusService, loadMJConfig, initializeProvider,
      getSyncEngine, getSystemUser, resetSyncEngine, configManager,
    } = await import('@memberjunction/metadata-sync');

    const { flags } = await this.parse(Status);
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
      
      // Parse include/exclude filters
      const includeFilter = flags.include ? flags.include.split(',').map(s => s.trim()) : undefined;
      const excludeFilter = flags.exclude ? flags.exclude.split(',').map(s => s.trim()) : undefined;

      // Create status service and execute
      const statusService = new StatusService(syncEngine);

      spinner.start('Checking status...');

      const result = await statusService.checkStatus({
        dir: flags.dir,
        include: includeFilter,
        exclude: excludeFilter
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
      
      // Display results
      
      // Show summary
      const summary = result.summary;
      const totalFiles = summary.new + summary.modified + summary.deleted + summary.unchanged;
      
      if (totalFiles === 0) {
        this.log(chalk.yellow('\nNo metadata files found in the specified directory.'));
      } else {
        this.log(chalk.bold('\nSummary:'));
        if (summary.new > 0) {
          this.log(chalk.green(`  ${summary.new} new file(s) to push`));
        }
        if (summary.modified > 0) {
          this.log(chalk.yellow(`  ${summary.modified} modified file(s) to push`));
        }
        if (summary.deleted > 0) {
          this.log(chalk.red(`  ${summary.deleted} deleted file(s) to remove`));
        }
        if (summary.unchanged > 0) {
          this.log(chalk.gray(`  ${summary.unchanged} unchanged file(s)`));
        }
        
        // Show details by entity if verbose
        if (flags.verbose && result.details.length > 0) {
          this.log(chalk.bold('\nDetails by entity:'));
          for (const detail of result.details) {
            this.log(`\n  ${detail.entityName} (${detail.directory}):`);
            this.log(`    New: ${detail.new}, Modified: ${detail.modified}, Deleted: ${detail.deleted}, Unchanged: ${detail.unchanged}`);
          }
        }
      }
      
    } catch (error) {
      spinner.fail('Status check failed');
      
      // Enhanced error logging
      this.log('\n=== Status Error Details ===');
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