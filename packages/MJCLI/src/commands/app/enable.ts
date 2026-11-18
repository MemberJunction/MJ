import { Args, Command } from '@oclif/core';
import { EnableApp } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { BuildOrchestratorContext } from '../../utils/open-app-context.js';

/**
 * CLI command: `mj app enable <name>`.
 *
 * Re-enables a previously disabled Open App by restoring its config
 * entries and client imports.
 */
export default class AppEnable extends Command {
  static description = 'Re-enable a disabled MJ Open App';

  static examples = [
    '<%= config.bin %> app enable acme-crm',
  ];

  static args = {
    name: Args.string({
      description: 'Name of the installed app to enable',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(AppEnable);
    const spinner = ora(`Enabling ${args.name}...`).start();
    let failed = false;

    try {
      const context = await BuildOrchestratorContext(this);

      const result = await EnableApp(args.name, context);

      if (result.Success) {
        spinner.succeed(chalk.green(`Enabled ${args.name}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Failed to enable: ${result.ErrorMessage}`));
        failed = true;
      }
    } catch (error) {
      spinner.fail('Enable failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
    // Outside the try on purpose: oclif's exit() works by throwing, and the catch above would
    // swallow it — printing a second failure line and exiting 2 with "EEXIT: 1".
    if (failed) {
      this.exit(1);
    }
  }
}
