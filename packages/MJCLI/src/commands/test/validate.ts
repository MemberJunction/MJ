import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import path from 'path';
import { getTestService } from '../../services/test';

export default class Validate extends Command {
  static description = 'Validate test files';

  static examples = [
    '<%= config.bin %> <%= command.id %> --type=eval',
    '<%= config.bin %> <%= command.id %> --type=eval --dir=./custom-evals',
    '<%= config.bin %> <%= command.id %> --type=eval --verbose',
    '<%= config.bin %> <%= command.id %> --type=eval --format=json',
  ];

  static flags = {
    type: Flags.string({
      description: 'Type of tests to validate',
      options: ['eval'],
      required: true,
    }),
    dir: Flags.string({
      description: 'Directory containing test files',
      default: './evals',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed validation output',
    }),
    format: Flags.string({
      description: 'Output format',
      options: ['console', 'json'],
      default: 'console',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Validate);
    const spinner = ora();

    try {
      // Resolve directory
      const testDir = path.resolve(flags.dir);

      spinner.start('Validating test files...');
      const testService = getTestService();
      const result = await testService.validateEvals(testDir, flags.verbose);
      spinner.stop();

      // Display results
      const reporter = testService.getReporter();

      if (flags.format === 'json') {
        this.log(reporter.formatAsJSON(result));
      } else {
        this.log(reporter.formatValidationResult(result, flags.verbose));
      }

      // Exit with error code if validation failed
      if (!result.is_valid) {
        this.exit(1);
      }

    } catch (error: any) {
      spinner.fail(error.message);
      this.error(error);
    }
  }
}
