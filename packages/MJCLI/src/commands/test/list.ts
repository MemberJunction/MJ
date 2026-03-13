import { Command, Flags } from '@oclif/core';

export default class TestList extends Command {
  static description = 'List available tests, suites, and types';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --suites',
    '<%= config.bin %> <%= command.id %> --types',
    '<%= config.bin %> <%= command.id %> --type=agent-eval',
    '<%= config.bin %> <%= command.id %> --tag=smoke',
    '<%= config.bin %> <%= command.id %> --status=active --verbose',
  ];

  static flags = {
    suites: Flags.boolean({
      description: 'List test suites instead of tests',
      default: false,
    }),
    types: Flags.boolean({
      description: 'List test types',
      default: false,
    }),
    type: Flags.string({
      char: 't',
      description: 'Filter by test type',
    }),
    tag: Flags.string({
      description: 'Filter by tag',
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
    const { ListCommand } = await import('@memberjunction/testing-cli');

    const { flags } = await this.parse(TestList);

    try {
      // Create ListCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const listCommand = new ListCommand();
      await listCommand.execute({
        suites: flags.suites,
        types: flags.types,
        type: flags.type,
        tag: flags.tag,
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
