import { Command, Flags } from '@oclif/core';
import { requireMonorepoRoot, spawnInherit } from '../../../lib/regression/docker-helpers.js';

const REGRESSION_RESULTS_DIR = 'docker/regression/test-results';

export default class TestRegressionCompare extends Command {
  static description =
    'Diff the two most recent regression runs from docker/regression/test-results/. ' +
    'Thin alias for `mj test compare --from-json <dir>` that handles the path.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --diff-only',
    '<%= config.bin %> <%= command.id %> --format=markdown --output=delta.md',
  ];

  static strict = false;

  static flags = {
    'diff-only': Flags.boolean({
      description: 'Show only differences.',
      default: false,
    }),
    format: Flags.string({
      char: 'f',
      description: 'Output format.',
      options: ['console', 'json', 'markdown'],
      default: 'console',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path.',
    }),
    verbose: Flags.boolean({
      description: 'Show detailed information.',
      default: false,
    }),
    tag: Flags.string({
      description:
        'Filter suite runs by tag. Compares the two most recent runs whose Tags array ' +
        'contains the tag — useful when an archive MJ holds runs from multiple environments.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionCompare);
    requireMonorepoRoot();

    // --tag flips us to DB mode (results.json doesn't carry Tags), so drop
    // --from-json when the user asks for tag filtering.
    const args: string[] = ['test', 'compare'];
    if (!flags.tag) {
      args.push('--from-json', REGRESSION_RESULTS_DIR);
    }
    if (flags.tag) args.push('--tag', flags.tag);
    if (flags['diff-only']) args.push('--diff-only');
    if (flags.format && flags.format !== 'console') args.push('--format', flags.format);
    if (flags.output) args.push('--output', flags.output);
    if (flags.verbose) args.push('--verbose');

    // Re-invoke the same `mj` binary. argv[1] is the entry script path.
    const mjBin = process.argv[1] ?? 'mj';
    const code = await spawnInherit(process.execPath, [mjBin, ...args]);
    if (code !== 0) this.exit(code);
  }
}
