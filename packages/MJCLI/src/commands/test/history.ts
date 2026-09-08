import { Command, Flags } from '@oclif/core';
import { TEST_FORMAT_FLAG, TEST_FORMAT_MAP, resolveLegacyFormat } from '../../lib/format-compat.js';

export default class TestHistory extends Command {
  static description = 'View per-test duration and flake history across recent runs';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --test="Active Members Count"',
    '<%= config.bin %> <%= command.id %> --suite="Nightly Regression"',
    '<%= config.bin %> <%= command.id %> --limit=100 --format=json',
  ];

  static flags = {
    test: Flags.string({
      char: 't',
      description: 'Filter by test name',
    }),
    suite: Flags.string({
      char: 's',
      description: 'Filter to runs belonging to the named suite',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Max recent test-run records to analyze (default 50)',
    }),
    format: TEST_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
  };

  async run(): Promise<void> {
    const { HistoryCommand } = await import('@memberjunction/testing-cli');

    const { flags } = await this.parse(TestHistory);

    try {
      // Context user is fetched internally after MJ provider initialization
      const historyCommand = new HistoryCommand();
      await historyCommand.execute({
        test: flags.test,
        suite: flags.suite,
        limit: flags.limit,
        format: resolveLegacyFormat({
          format: flags.format,
          legacy: 'console' as const,
          legacyDefault: 'console' as const,
          map: TEST_FORMAT_MAP,
        }),
        output: flags.output,
      });
    } catch (error) {
      this.error(error as Error);
    }
  }
}
