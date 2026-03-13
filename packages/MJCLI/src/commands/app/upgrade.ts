import { Args, Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildOrchestratorContext } from '../../utils/open-app-context.js';

/**
 * CLI command: `mj app upgrade <name>`.
 *
 * Upgrades an installed Open App to a newer version, running new migrations,
 * updating packages, and recording upgrade history.
 */
export default class AppUpgrade extends Command {
  static description = 'Upgrade an installed MJ Open App to a newer version';

  static examples = [
    '<%= config.bin %> app upgrade acme-crm',
    '<%= config.bin %> app upgrade acme-crm --version 1.3.0',
  ];

  static args = {
    name: Args.string({
      description: 'Name of the installed app to upgrade',
      required: true,
    }),
  };

  static flags = {
    version: Flags.string({ description: 'Specific version to upgrade to (default: latest)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppUpgrade);
    const spinner = ora();

    try {
      const { UpgradeApp } = await import('@memberjunction/open-app-engine');
      const context = await buildOrchestratorContext(this, flags.verbose);

      const result = await UpgradeApp(
        { AppName: args.name, Version: flags.version, Verbose: flags.verbose },
        context
      );

      if (result.Success) {
        spinner.succeed(chalk.green(`Upgraded ${result.AppName} to v${result.Version}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Upgrade failed: ${result.ErrorMessage}`));
        this.exit(1);
      }
    } catch (error) {
      spinner.fail('Upgrade failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
