/**
 * Reset command - Clear state and start fresh
 */

import { Command, Flags } from '@oclif/core';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { StateManager } from '../state/StateManager.js';

export default class Reset extends Command {
  static description = 'Reset state and start fresh analysis';

  static examples = ['$ db-auto-doc reset'];

  static flags = {
    force: Flags.boolean({ char: 'f', description: 'Skip confirmation prompt' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Reset);

    try {
      const config = await ConfigLoader.load('./config.json');
      const stateManager = new StateManager(config.output.stateFile);

      // Confirm deletion unless --force
      if (!flags.force) {
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: chalk.yellow('This will delete all analysis state. Continue?'),
            default: false
          }
        ]);

        if (!answer.confirm) {
          this.log('Reset cancelled');
          return;
        }
      }

      // Delete state file
      await stateManager.delete();

      this.log(chalk.green('✓ State reset complete!'));
      this.log('Run: db-auto-doc analyze');

    } catch (error) {
      this.error((error as Error).message);
    }
  }
}
