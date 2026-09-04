import { Command, Flags, Args } from '@oclif/core';
import { TEST_FORMAT_FLAG, TEST_FORMAT_MAP, resolveLegacyFormat } from '../../lib/format-compat.js';

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
    format: TEST_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
    verbose: Flags.boolean({
      description: 'Show detailed information',
      default: false,
    }),
    tag: Flags.string({
      description:
        'Filter suite runs by tag (matches against MJTestSuiteRunEntity.Tags). Useful for ' +
        'isolating runs from a specific source environment in an archive MJ. DB mode only — ' +
        '--from-json ignores this flag.',
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
        format: resolveLegacyFormat({
          format: flags.format,
          legacy: 'console' as const,
          legacyDefault: 'console' as const,
          map: TEST_FORMAT_MAP,
        }),
        output: flags.output,
        verbose: flags.verbose,
        tag: flags.tag,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
