import { Args, Command } from '@oclif/core';

export default class RubricDiff extends Command {
  static description = 'Print the version bump between two rubric versions.';
  static args = {
    rubric: Args.string({ description: 'Rubric name or id', required: true }),
    from: Args.string({ description: 'Version 1.2.0 or id', required: true }),
    to: Args.string({ description: 'Version 1.2.0 or id', required: true }),
  };

  async run(): Promise<void> {
    const { CloseMJProvider, RubricCommands } = await import('@memberjunction/testing-cli');
    const { args } = await this.parse(RubricDiff);
    try {
      await new RubricCommands().Diff(args.rubric, args.from, args.to);
    } finally {
      await CloseMJProvider();
    }
  }
}
