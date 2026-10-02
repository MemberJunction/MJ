import { Args, Command } from '@oclif/core';

export default class RubricValidate extends Command {
  static description = 'Check a rubric snapshot file for duplicate keys, gates, weights, and scales.';
  static args = { file: Args.string({ description: 'JSON snapshot file', required: true }) };

  async run(): Promise<void> {
    const { CloseMJProvider, RubricCommands } = await import('@memberjunction/testing-cli');
    const { args } = await this.parse(RubricValidate);
    try {
      new RubricCommands().Validate(args.file);
    } finally {
      await CloseMJProvider();
    }
  }
}
