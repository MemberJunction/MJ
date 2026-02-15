import { Args, Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildOrchestratorContext } from '../../utils/open-app-context.js';

/**
 * CLI command: `mj app remove <name>`.
 *
 * Removes an installed Open App, optionally preserving its database schema
 * and data. Prompts for confirmation unless `--yes` is passed.
 */
export default class AppRemove extends Command {
  static description = 'Remove an installed MJ Open App';

  static examples = [
    '<%= config.bin %> app remove acme-crm',
    '<%= config.bin %> app remove acme-crm --keep-data',
    '<%= config.bin %> app remove acme-crm --force',
  ];

  static args = {
    name: Args.string({
      description: 'Name of the installed app to remove',
      required: true,
    }),
  };

  static flags = {
    'keep-data': Flags.boolean({ description: 'Keep the database schema and data' }),
    force: Flags.boolean({ description: 'Force removal even if other apps depend on this one' }),
    yes: Flags.boolean({ char: 'y', description: 'Skip confirmation prompt' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppRemove);
    const spinner = ora();

    if (!flags.yes) {
      const confirmed = await confirm({
        message: `Are you sure you want to remove '${args.name}'?${flags['keep-data'] ? ' (data will be kept)' : ' This will DROP the app schema and all data.'}`,
        default: false,
      });

      if (!confirmed) {
        this.log(chalk.yellow('Removal cancelled.'));
        return;
      }
    }

    try {
      const { RemoveApp } = await import('@memberjunction/open-app-engine');
      const context = await buildOrchestratorContext(this, flags.verbose);

      const result = await RemoveApp(
        { AppName: args.name, KeepData: flags['keep-data'], Force: flags.force, Verbose: flags.verbose },
        context
      );

      if (result.Success) {
        spinner.succeed(chalk.green(`Removed ${result.AppName}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Remove failed: ${result.ErrorMessage}`));
        this.exit(1);
      }
    } catch (error) {
      spinner.fail('Remove failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
