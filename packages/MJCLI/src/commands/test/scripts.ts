import { Command, Flags } from '@oclif/core';

export default class TestScripts extends Command {
  static description =
    'Review and promote recorded replay scripts. A run that re-derives a test which already had a ' +
    'script stores the new one as pending rather than replacing what replay uses, so a UI change ' +
    'never rewrites the suite unnoticed. This is where you see the drift and decide.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --test "T042 - Filter Grid"',
    '<%= config.bin %> <%= command.id %> --promote --test "T042 - Filter Grid"',
    '<%= config.bin %> <%= command.id %> --promote',
    '<%= config.bin %> <%= command.id %> --discard --test "T042 - Filter Grid"',
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
      });
    } catch (error) {
      this.error(error as Error);
    }
  }
}
