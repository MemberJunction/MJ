import { Command, Flags, Args } from '@oclif/core';

export default class TestCompare extends Command {
  static description = 'Compare test runs for regression detection';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --latest',
    '<%= config.bin %> <%= command.id %> <run-id-1> <run-id-2>',
    '<%= config.bin %> <%= command.id %> -v 5.17.0 -v 5.18.0',
    '<%= config.bin %> <%= command.id %> -c abc1234 -c def5678',
    '<%= config.bin %> <%= command.id %> --from-json baseline.json latest.json',
    '<%= config.bin %> <%= command.id %> --latest --format=markdown --output=report.md',
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
    latest: Flags.boolean({
      char: 'l',
      description: 'Compare the two most recent completed suite runs',
      default: false,
    }),
    'from-json': Flags.string({
      description: 'Compare two results.json files directly (no DB). Pass twice: --from-json PREV --from-json CURR',
      multiple: true,
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
        latest: flags.latest,
        fromJson: flags['from-json'],
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
        verbose: flags.verbose,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
