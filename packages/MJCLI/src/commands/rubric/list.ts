import { Command } from '@oclif/core';

export default class RubricList extends Command {
  static description = 'List rubrics.';

  async run(): Promise<void> {
    const { RubricCommands } = await import('@memberjunction/testing-cli');
    await new RubricCommands().List();
  }
}
