import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { StateManager } from '../state/state-manager';

export default class Reset extends Command {
  static description = 'Reset state file';

  static examples = [
    '<%= config.bin %> <%= command.id %> --all',
  ];

  static flags = {
    all: Flags.boolean({
      description: 'Reset entire state file',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Reset);

    if (flags.all) {
      const confirmed = await confirm({
        message: chalk.yellow('Reset entire state file? This cannot be undone.'),
        default: false,
      });

      if (confirmed) {
        const stateManager = new StateManager();
        await stateManager.reset(
          process.env.DB_SERVER || 'localhost',
          process.env.DB_DATABASE || 'master'
        );
        this.log(chalk.green('✅ State file reset'));
      }
    }
  }
}
