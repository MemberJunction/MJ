/**
 * Status command - Show current analysis status
 */

import { Command } from '@oclif/core';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { StateManager } from '../state/StateManager.js';

export default class Status extends Command {
  static description = 'Show current analysis status';

  static examples = ['$ db-auto-doc status'];

  async run(): Promise<void> {
    try {
      const config = await ConfigLoader.load('./config.json');
      const stateManager = new StateManager(config.output.stateFile);
      const state = await stateManager.load();

      if (!state) {
        this.log(chalk.yellow('No analysis has been run yet.'));
        this.log('Run: db-auto-doc analyze');
        return;
      }

      this.log(chalk.blue(`\nDatabase Documentation Status\n`));
      this.log(`Database: ${state.database.name}`);
      this.log(`Server: ${state.database.server}`);
      this.log(`Last Modified: ${state.summary.lastModified}\n`);

      // Schemas
      this.log(`Schemas: ${state.schemas.length}`);
      const tableCount = state.schemas.reduce((sum, s) => sum + s.tables.length, 0);
      this.log(`Tables: ${tableCount}\n`);

      // Latest run
      if (state.phases.descriptionGeneration.length > 0) {
        const lastRun = state.phases.descriptionGeneration[state.phases.descriptionGeneration.length - 1];

        this.log(chalk.blue('Latest Analysis Run:'));
        this.log(`  Status: ${lastRun.status}`);
        this.log(`  Iterations: ${lastRun.iterationsPerformed}`);
        this.log(`  Tokens Used: ${lastRun.totalTokensUsed.toLocaleString()}`);
        this.log(`  Estimated Cost: $${lastRun.estimatedCost.toFixed(2)}`);

        if (lastRun.converged) {
          this.log(chalk.green(`  Converged: ${lastRun.convergenceReason}`));
        } else {
          this.log(chalk.yellow('  Not yet converged'));
        }
      }

      // Low confidence tables
      const lowConfidence = stateManager.getLowConfidenceTables(state, 0.7);
      if (lowConfidence.length > 0) {
        this.log(chalk.yellow(`\nLow Confidence Tables (< 0.7): ${lowConfidence.length}`));
      }

      // Unprocessed tables
      const unprocessed = stateManager.getUnprocessedTables(state);
      if (unprocessed.length > 0) {
        this.log(chalk.yellow(`Unprocessed Tables: ${unprocessed.length}`));
      }

    } catch (error) {
      this.error((error as Error).message);
    }
  }
}
