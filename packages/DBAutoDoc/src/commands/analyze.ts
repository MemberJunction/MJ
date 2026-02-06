/**
 * Analyze command - Thin CLI wrapper around AnalysisOrchestrator
 */

import { Command, Flags } from '@oclif/core';
import ora from 'ora';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { AnalysisOrchestrator } from '../core/AnalysisOrchestrator.js';

export default class Analyze extends Command {
  static description = 'Analyze database and generate documentation';

  static examples = [
    '$ db-auto-doc analyze',
    '$ db-auto-doc analyze --resume ./output/run-6/state.json',
    '$ db-auto-doc analyze --config ./my-config.json',
    '$ db-auto-doc analyze --soft-keys ./soft-keys.json',
    '$ db-auto-doc analyze --config ./my-config.json --soft-keys ./soft-keys.json'
  ];

  static flags = {
    resume: Flags.string({
      char: 'r',
      description: 'Resume from an existing state file',
      required: false
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to config file',
      default: './config.json'
    }),
    'soft-keys': Flags.string({
      char: 's',
      description: 'Path to soft keys configuration file (JSON)',
      required: false
    })
  };

  static args = {};

  async run(): Promise<void> {
    const { flags } = await this.parse(Analyze);
    const spinner = ora();

    try {
      // Load configuration
      spinner.start('Loading configuration');
      const config = await ConfigLoader.load(flags.config);

      // Override with soft keys from CLI if provided
      if (flags['soft-keys']) {
        config.softKeys = flags['soft-keys'];
      }

      spinner.succeed('Configuration loaded');

      // Create orchestrator
      const orchestrator = new AnalysisOrchestrator({
        config,
        resumeFromState: flags.resume,
        onProgress: (message, data) => {
          if (data) {
            spinner.succeed(`${message}: ${JSON.stringify(data)}`);
          } else {
            spinner.text = message;
          }
        }
      });

      // Execute analysis
      spinner.start('Starting analysis');
      const result = await orchestrator.execute();

      if (result.success) {
        spinner.succeed('Analysis complete!');
        this.log(chalk.green('\n✓ Analysis complete!'));
        this.log(`  Iterations: ${result.run.iterationsPerformed}`);
        this.log(`  Tokens used: ${result.run.totalTokensUsed?.toLocaleString() || 0}`);
        this.log(`  Estimated cost: $${result.run.estimatedCost?.toFixed(2) || '0.00'}`);
        this.log(`  Output folder: ${result.outputFolder}`);
        this.log(`  Files:`);
        this.log(`    - state.json`);
        this.log(`    - extended-props.sql`);
        this.log(`    - summary.md`);

        if (flags.resume) {
          this.log(chalk.blue(`\n  Resumed from: ${flags.resume}`));
        }
      } else {
        spinner.fail('Analysis failed');
        this.error(result.message || 'Unknown error');
      }

    } catch (error) {
      spinner.fail('Analysis failed');
      this.error((error as Error).message);
    }
  }
}
