import { Command } from '@oclif/core';

export default class RubricList extends Command {
  static description = 'List rubrics.';

  async run(): Promise<void> {
    const { CloseMJProvider, RubricCommands } = await import('@memberjunction/testing-cli');
    try {
      await new RubricCommands().List();
    } finally {
      await CloseMJProvider();
    }
  }
}
