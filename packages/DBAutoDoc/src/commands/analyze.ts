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
    '$ db-auto-doc analyze --config ./my-config.json',
    '$ db-auto-doc analyze --resume ./output/run-6/run-1/state.json',
    '$ db-auto-doc analyze --resume ./output/run-6/run-1/state.json --max-iterations 3',
    '$ db-auto-doc analyze --resume ./output/run-6/run-1/state.json --reanalyze-below 0.7',
    '$ db-auto-doc analyze --resume ./output/run-6/run-1/state.json --pruning-only'
  ];

  static flags = {
    resume: Flags.string({
      char: 'r',
      description: 'Resume from an existing state file. Skips schema introspection and discovery if state already has data.',
      required: false
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to config file',
      default: './config.json'
    }),
    'max-iterations': Flags.integer({
      char: 'n',
      description: 'Override max iterations from config for this run',
      required: false
    }),
    'reanalyze-below': Flags.string({
      description: 'Only re-analyze tables with confidence below this threshold (0-1). Use with --resume to refine low-confidence results.',
      required: false
    }),
    'pruning-only': Flags.boolean({
      description: 'Skip discovery and analysis iterations. Only run the FK pruning pass on an existing state file. Requires --resume.',
      default: false
    }),
    'skip-sampling': Flags.boolean({
      description: 'Skip table data sampling pass (useful for large databases or when schema/dictionary is already provided)',
      default: false
    }),
    'skip-data-quality': Flags.boolean({
      description: 'Skip the data quality phase for this run: no probes and no data-quality report. Set analysis.dataQuality in the config to turn single checks off instead.',
      default: false
    })
  };

  static args = {};

  async run(): Promise<void> {
    const { flags } = await this.parse(Analyze);
    const spinner = ora();

    // Validate flag combinations
    if (flags['pruning-only'] && !flags.resume) {
      this.error('--pruning-only requires --resume pointing to an existing state file');
    }

    try {
      // Load configuration
      spinner.start('Loading configuration');
      const config = await ConfigLoader.load(flags.config);
      spinner.succeed('Configuration loaded');

      // Parse reanalyze-below as number if provided
      const reanalyzeBelowConfidence = flags['reanalyze-below'] != null
        ? parseFloat(flags['reanalyze-below'])
        : undefined;

      // For pruning-only, set max iterations to 0 so iteration loop is skipped
      const maxIterations = flags['pruning-only']
        ? 0
        : flags['max-iterations'];

      // Create orchestrator
      const orchestrator = new AnalysisOrchestrator({
        config,
        resumeFromState: flags.resume,
        reanalyzeBelowConfidence,
        maxIterations,
        // --pruning-only runs the FK pruning pass alone; sampling would be new work it never asked for
        skipSampling: flags['skip-sampling'] || flags['pruning-only'],
        // Likewise for the data quality probes
        skipDataQuality: flags['skip-data-quality'] || flags['pruning-only'],
        onProgress: (message, data) => {
          if (data) {
            spinner.succeed(`${message}: ${JSON.stringify(data)}`);
          } else {
            spinner.succeed(message);
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
        this.log(`  Tokens used: ${result.run.totalTokensUsed?.toLocaleString() || 0} (input: ${(result.run.totalInputTokens || 0).toLocaleString()}, output: ${(result.run.totalOutputTokens || 0).toLocaleString()})`);
        this.log(`  Estimated cost: $${result.run.estimatedCost?.toFixed(2) || '0.00'}`);
        this.log(`  Output folder: ${result.outputFolder}`);
        this.log(`  Files:`);
        this.log(`    - state.json`);
        this.log(`    - extended-props.sql`);
        this.log(`    - summary.md`);
        this.log(`    - additionalSchemaInfo.json`);
        if (result.state.dataQuality) {
          const counts = result.state.phases.dataQuality?.FindingCounts;
          this.log(`    - data-quality.md, data-quality.json${counts ? ` (${counts.error} errors, ${counts.warning} warnings, ${counts.info} info)` : ''}`);
        }

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
