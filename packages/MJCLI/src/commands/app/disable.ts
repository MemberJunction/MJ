import { Args, Command } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildOrchestratorContext } from '../../utils/open-app-context.js';

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

    try {
      const { DisableApp } = await import('@memberjunction/mj-open-app-engine');
      const context = await buildOrchestratorContext(this);

      const result = await DisableApp(args.name, context);

      if (result.Success) {
        spinner.succeed(chalk.green(`Disabled ${args.name}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Failed to disable: ${result.ErrorMessage}`));
        this.exit(1);
      }
    } catch (error) {
      spinner.fail('Disable failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
