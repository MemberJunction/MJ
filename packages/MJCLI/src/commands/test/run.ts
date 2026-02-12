import { Command, Flags, Args } from '@oclif/core';

export default class TestRun extends Command {
  static description = 'Execute a single test by ID or name';

  static examples = [
    '<%= config.bin %> <%= command.id %> <test-id>',
    '<%= config.bin %> <%= command.id %> --name="Active Members Count"',
    '<%= config.bin %> <%= command.id %> <test-id> --environment=staging',
    '<%= config.bin %> <%= command.id %> <test-id> --format=json --output=results.json',
    '<%= config.bin %> <%= command.id %> <test-id> --dry-run',
  ];

  static args = {
    testId: Args.string({
      description: 'Test ID to execute',
      required: false,
    }),
  };

  static flags = {
    name: Flags.string({
      char: 'n',
      description: 'Test name to execute',
    }),
    environment: Flags.string({
      char: 'e',
      description: 'Environment context (dev, staging, prod)',
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
    'dry-run': Flags.boolean({
      description: 'Validate without executing',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed execution information',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { RunCommand } = await import('@memberjunction/testing-cli');

    const { args, flags } = await this.parse(TestRun);

    try {
      // Create RunCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const runCommand = new RunCommand();
      await runCommand.execute(args.testId, {
        name: flags.name,
        environment: flags.environment,
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
