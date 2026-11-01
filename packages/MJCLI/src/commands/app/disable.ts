import { Args, Command } from '@oclif/core';
import { DisableApp } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { BuildOrchestratorContext } from '../../utils/open-app-context.js';

/**
 * CLI command: `mj app disable <name>`.
 *
 * Disables an installed Open App by commenting out its config entries and
 * client imports. The app data and packages remain in place.
 */
export default class AppDisable extends Command {
  static description = 'Disable an installed MJ Open App without removing it';

  static examples = [
    '<%= config.bin %> app disable acme-crm',
  ];

  static args = {
    name: Args.string({
      description: 'Name of the installed app to disable',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(AppDisable);
    const spinner = ora(`Disabling ${args.name}...`).start();
    let failed = false;

    try {
      const context = await BuildOrchestratorContext(this);

      const result = await DisableApp(args.name, context);

      if (result.Success) {
        spinner.succeed(chalk.green(`Disabled ${args.name}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Failed to disable: ${result.ErrorMessage}`));
        failed = true;
      }
    } catch (error) {
      spinner.fail('Disable failed');
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
