import { Command, Flags } from '@oclif/core';

export default class TestHistory extends Command {
  static description = 'View test execution history';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --test=<test-id>',
    '<%= config.bin %> <%= command.id %> --suite=<suite-id>',
    '<%= config.bin %> <%= command.id %> --since="2024-01-01"',
    '<%= config.bin %> <%= command.id %> --limit=50',
  ];

  static flags = {
    test: Flags.string({
      char: 't',
      description: 'Filter by test ID',
    }),
    recent: Flags.integer({
      char: 'r',
      description: 'Number of recent runs to show',
    }),
    from: Flags.string({
      description: 'Show history from date (YYYY-MM-DD)',
    }),
    status: Flags.string({
      char: 's',
      description: 'Filter by status',
    }),
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['console', 'json', 'markdown'],
      default: 'console',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed information',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { HistoryCommand } = await import('@memberjunction/testing-cli');

    const { flags } = await this.parse(TestHistory);

    try {
      // Create HistoryCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const historyCommand = new HistoryCommand();
      await historyCommand.execute(flags.test, {
        recent: flags.recent,
        from: flags.from,
        status: flags.status,
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
        verbose: flags.verbose,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
