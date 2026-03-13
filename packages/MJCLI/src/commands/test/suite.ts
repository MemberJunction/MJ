import { Command, Flags, Args } from '@oclif/core';

export default class TestSuite extends Command {
  static description = 'Execute a test suite';

  static examples = [
    '<%= config.bin %> <%= command.id %> <suite-id>',
    '<%= config.bin %> <%= command.id %> --name="Agent Quality Suite"',
    '<%= config.bin %> <%= command.id %> <suite-id> --format=json',
    '<%= config.bin %> <%= command.id %> <suite-id> --output=suite-results.json',
  ];

  static args = {
    suiteId: Args.string({
      description: 'Test suite ID to execute',
      required: false,
    }),
  };

  static flags = {
    name: Flags.string({
      char: 'n',
      description: 'Test suite name to execute',
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
      description: 'Show detailed execution information',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { SuiteCommand } = await import('@memberjunction/testing-cli');

    const { args, flags } = await this.parse(TestSuite);

    try {
      // Create SuiteCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const suiteCommand = new SuiteCommand();
      await suiteCommand.execute(args.suiteId, {
        name: flags.name,
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
        verbose: flags.verbose,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
