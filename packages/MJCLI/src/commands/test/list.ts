import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import path from 'path';
import { getTestService } from '../../services/test';
import { EvalListOptions } from '../../services/test/types';

export default class List extends Command {
  static description = 'List available tests';

  static examples = [
    '<%= config.bin %> <%= command.id %> --type=eval',
    '<%= config.bin %> <%= command.id %> --type=eval --category=simple_aggregation',
    '<%= config.bin %> <%= command.id %> --type=eval --difficulty=easy',
    '<%= config.bin %> <%= command.id %> --type=eval --tags=membership',
    '<%= config.bin %> <%= command.id %> --type=eval --verbose',
    '<%= config.bin %> <%= command.id %> --type=eval --format=json',
  ];

  static flags = {
    type: Flags.string({
      description: 'Type of tests to list',
      options: ['eval'],
      required: true,
    }),
    category: Flags.string({
      description: 'Filter by category',
      options: ['simple_aggregation', 'trend', 'cross_domain', 'drill_down', 'complex'],
    }),
    difficulty: Flags.string({
      description: 'Filter by difficulty',
      options: ['easy', 'medium', 'hard', 'very_hard'],
    }),
    tags: Flags.string({
      description: 'Filter by tags (comma-separated)',
    }),
    dir: Flags.string({
      description: 'Directory containing test files',
      default: './evals',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed information',
    }),
    format: Flags.string({
      description: 'Output format',
      options: ['console', 'json'],
      default: 'console',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(List);
    const spinner = ora();

    try {
      // Resolve directory
      const testDir = path.resolve(flags.dir);

      // Build list options
      const options: EvalListOptions = {
        category: flags.category as any,
        difficulty: flags.difficulty as any,
        tags: flags.tags ? flags.tags.split(',').map(t => t.trim()) : undefined,
        verbose: flags.verbose,
      };

      spinner.start('Discovering tests...');
      const testService = getTestService();
      const evals = await testService.listEvals(testDir, options);
      spinner.succeed(`Found ${evals.length} eval(s)`);

      // Display results
      const reporter = testService.getReporter();

      if (flags.format === 'json') {
        this.log(reporter.formatAsJSON(evals));
      } else {
        this.log(reporter.formatEvalList(evals, flags.verbose));
      }

    } catch (error: any) {
      spinner.fail(error.message);
      this.error(error);
    }
  }
}
