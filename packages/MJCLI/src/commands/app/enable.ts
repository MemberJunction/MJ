import { Args, Command } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildOrchestratorContext } from '../../utils/open-app-context.js';

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

    try {
      const { EnableApp } = await import('@memberjunction/mj-open-app-engine');
      const context = await buildOrchestratorContext(this);

      const result = await EnableApp(args.name, context);

      if (result.Success) {
        spinner.succeed(chalk.green(`Enabled ${args.name}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Failed to enable: ${result.ErrorMessage}`));
        this.exit(1);
      }
    } catch (error) {
      spinner.fail('Enable failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
