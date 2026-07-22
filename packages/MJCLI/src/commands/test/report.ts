import { Command, Flags } from '@oclif/core';

export default class TestReport extends Command {
  static description = 'Generate a per-run aggregate report (pass rate, duration, flake) with a cross-run trend';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --suite="Nightly Regression"',
    '<%= config.bin %> <%= command.id %> --baseline=<suite-run-id>',
    '<%= config.bin %> <%= command.id %> --suite="Nightly Regression" --format=json',
  ];

  static flags = {
    suite: Flags.string({
      char: 's',
      description: 'Restrict to the named test suite',
    }),
    baseline: Flags.string({
      char: 'b',
      description: 'Report on this specific suite-run ID instead of the latest run',
    }),
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['console', 'json'],
      default: 'console',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
  };

  async run(): Promise<void> {
    const { ReportCommand } = await import('@memberjunction/testing-cli');

    const { flags } = await this.parse(TestReport);

    try {
      // Context user is fetched internally after MJ provider initialization
      const reportCommand = new ReportCommand();
      await reportCommand.execute({
        suite: flags.suite,
        baseline: flags.baseline,
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
      });
    } catch (error) {
      this.error(error as Error);
    }
  }
}
