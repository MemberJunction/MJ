import { Args, Command } from '@oclif/core';

export default class RubricShow extends Command {
  static description = 'Show a rubric version and its criteria.';
  static args = { rubric: Args.string({ description: 'Rubric name or id, optionally @version', required: true }) };

  async run(): Promise<void> {
    const { CloseMJProvider, RubricCommands } = await import('@memberjunction/testing-cli');
    const { args } = await this.parse(RubricShow);
    try {
      await new RubricCommands().Show(args.rubric);
    } finally {
      await CloseMJProvider();
    }
  }
}
