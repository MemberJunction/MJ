import { Command, Flags } from '@oclif/core';
import { TEST_FORMAT_FLAG, TEST_FORMAT_MAP, ResolveLegacyFormat } from '../../lib/format-compat.js';

export default class TestScripts extends Command {
  static description =
    'Review and promote recorded replay scripts. A run that re-derives a test which already had a ' +
    'script stores the new one as pending rather than replacing what replay uses, so a UI change ' +
    'never rewrites the suite unnoticed. This is where you see the drift and decide.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --test "T042 - Filter Grid"',
    '<%= config.bin %> <%= command.id %> --promote --test "T042 - Filter Grid"',
    '<%= config.bin %> <%= command.id %> --promote --yes',
    '<%= config.bin %> <%= command.id %> --discard --test "T042 - Filter Grid"',
    '<%= config.bin %> <%= command.id %> --format=md --output=drift.md',
  ];

  static flags = {
    test: Flags.string({
      description: 'Limit to one test, by name or ID',
    }),
    promote: Flags.boolean({
      description: 'Promote the pending script(s) into the slot replay uses',
      default: false,
      exclusive: ['discard'],
    }),
    discard: Flags.boolean({
      description: 'Drop the pending script(s), keeping the promoted one',
      default: false,
      exclusive: ['promote'],
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Confirm a bulk --promote/--discard that was not narrowed with --test',
      default: false,
    }),
    format: TEST_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description: 'Write the pending-script report to this file',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestScripts);
    const { ScriptsCommand } = await import('@memberjunction/testing-cli');

    try {
      const scriptsCommand = new ScriptsCommand();
      await scriptsCommand.execute({
        test: flags.test,
        promote: flags.promote,
        discard: flags.discard,
        yes: flags.yes,
        format: ResolveLegacyFormat({
          Format: flags.format,
          Legacy: 'console' as const,
          LegacyDefault: 'console' as const,
          Map: TEST_FORMAT_MAP,
        }),
        output: flags.output,
      });
    } catch (error) {
      this.error(error as Error);
    }
  }
}
