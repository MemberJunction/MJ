import { Command, Flags, Args } from '@oclif/core';

export default class TestCompare extends Command {
  static description = 'Compare test runs for regression detection';

  static examples = [
    '<%= config.bin %> <%= command.id %> <run-id-1> <run-id-2>',
    '<%= config.bin %> <%= command.id %> --baseline=<run-id> --current=<run-id>',
    '<%= config.bin %> <%= command.id %> --suite=<suite-id> --since="2024-01-01"',
    '<%= config.bin %> <%= command.id %> <run-id-1> <run-id-2> --format=json',
  ];

  static args = {
    runId1: Args.string({
      description: 'First test run ID to compare',
      required: false,
    }),
    runId2: Args.string({
      description: 'Second test run ID to compare',
      required: false,
    }),
  };

  static flags = {
    version: Flags.string({
      char: 'v',
      description: 'Compare runs by version',
      multiple: true,
    }),
    commit: Flags.string({
      char: 'c',
      description: 'Compare runs by git commit',
      multiple: true,
    }),
    'diff-only': Flags.boolean({
      description: 'Show only differences',
      default: false,
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
      description: 'Show detailed information',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { CompareCommand } = await import('@memberjunction/testing-cli');

    const { args, flags } = await this.parse(TestCompare);

    try {
      // Create CompareCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const compareCommand = new CompareCommand();
      await compareCommand.execute(args.runId1, args.runId2, {
        version: flags.version,
        commit: flags.commit,
        diffOnly: flags['diff-only'],
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
        verbose: flags.verbose,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
