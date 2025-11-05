import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import path from 'path';
import { getTestService } from '../../services/test';
import { EvalRunOptions } from '../../services/test/types';

export default class Eval extends Command {
  static description = 'Run AI evaluations for Skip Analytics Agent';

  static examples = [
    '<%= config.bin %> <%= command.id %> active-members-basic',
    '<%= config.bin %> <%= command.id %> --category=simple_aggregation',
    '<%= config.bin %> <%= command.id %> --all',
    '<%= config.bin %> <%= command.id %> --all --dry-run',
    '<%= config.bin %> <%= command.id %> --difficulty=easy',
    '<%= config.bin %> <%= command.id %> --tags=membership,kpi',
  ];

  static args = [
    {
      name: 'eval-id',
      description: 'Specific eval ID to run',
      required: false,
    },
  ];

  static flags = {
    category: Flags.string({
      description: 'Run all evals in this category',
      options: ['simple_aggregation', 'trend', 'cross_domain', 'drill_down', 'complex'],
    }),
    difficulty: Flags.string({
      description: 'Run evals of this difficulty level',
      options: ['easy', 'medium', 'hard', 'very_hard'],
    }),
    tags: Flags.string({
      description: 'Run evals matching these tags (comma-separated)',
    }),
    all: Flags.boolean({
      description: 'Run all evals',
    }),
    'dry-run': Flags.boolean({
      description: 'Validate only, don\'t execute',
    }),
    dir: Flags.string({
      description: 'Directory containing eval files',
      default: './evals',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed output',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Save results to file (JSON format)',
    }),
    'output-format': Flags.string({
      description: 'Output format',
      options: ['console', 'json', 'markdown'],
      default: 'console',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Eval);
    const spinner = ora();

    try {
      // Resolve directory
      const evalDir = path.resolve(flags.dir);

      // Build run options
      const options: EvalRunOptions = {
        eval_ids: args['eval-id'] ? [args['eval-id']] : undefined,
        category: flags.category as any,
        difficulty: flags.difficulty as any,
        tags: flags.tags ? flags.tags.split(',').map(t => t.trim()) : undefined,
        all: flags.all,
        dry_run: flags['dry-run'],
        verbose: flags.verbose,
        output_format: flags['output-format'] as any,
      };

      // Validate that at least one selection criteria is provided
      if (!args['eval-id'] && !flags.category && !flags.difficulty && !flags.tags && !flags.all) {
        this.error('Please specify an eval-id, category, difficulty, tags, or use --all');
      }

      spinner.start('Initializing test service...');
      const testService = getTestService();
      spinner.succeed('Test service initialized');

      // Run evals
      spinner.start('Running evaluations...');
      const results = await testService.runEvals(evalDir, options);
      spinner.stop();

      // Display results
      const reporter = testService.getReporter();

      if (flags['output-format'] === 'json') {
        // JSON output
        this.log(reporter.formatAsJSON(results));
      } else if (flags['output-format'] === 'markdown') {
        // Markdown output
        const evalDefs = new Map();
        for (const result of results) {
          const evalFiles = await testService.listEvals(evalDir, {});
          const evalInfo = evalFiles.find(e => e.eval_id === result.eval_id);
          if (evalInfo) {
            const evalDef = await testService.getEvalDefinition(evalInfo.file_path);
            evalDefs.set(result.eval_id, evalDef);
          }
        }
        this.log(reporter.formatAsMarkdown(results, evalDefs));
      } else {
        // Console output (default)
        for (const result of results) {
          const evalFiles = await testService.listEvals(evalDir, {});
          const evalInfo = evalFiles.find(e => e.eval_id === result.eval_id);
          if (evalInfo) {
            const evalDef = await testService.getEvalDefinition(evalInfo.file_path);
            this.log(reporter.formatExecutionResult(evalDef, result));
          }
        }

        // Summary
        this.log('');
        this.log(chalk.bold('═══════════════════════════════════════'));
        this.log(chalk.bold('Summary'));
        this.log(chalk.bold('═══════════════════════════════════════'));
        const passed = results.filter(r => r.status === 'pass').length;
        const failed = results.filter(r => r.status === 'fail').length;
        const errors = results.filter(r => r.status === 'error').length;
        this.log(`Total: ${results.length}`);
        this.log(`${chalk.green('Passed:')} ${passed}`);
        this.log(`${chalk.red('Failed:')} ${failed}`);
        this.log(`${chalk.yellow('Errors:')} ${errors}`);
      }

      // Save results if output file specified
      if (flags.output) {
        spinner.start(`Saving results to ${flags.output}...`);
        await testService.saveResults(results, flags.output);
        spinner.succeed(`Results saved to ${flags.output}`);
      }

      // Exit with error code if any tests failed
      const hasFailures = results.some(r => r.status === 'fail' || r.status === 'error');
      if (hasFailures) {
        this.exit(1);
      }

    } catch (error: any) {
      spinner.fail(error.message);
      this.error(error);
    }
  }
}
