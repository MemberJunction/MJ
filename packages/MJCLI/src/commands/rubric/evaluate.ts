import { Command, Flags } from '@oclif/core';

export default class RubricEvaluate extends Command {
  static description = 'Evaluate one record against a rubric. Does not publish.';
  static flags = {
    rubric: Flags.string({ required: true, description: 'Rubric name or id, optionally @version' }),
    entity: Flags.string({ required: true, description: 'Subject entity name' }),
    record: Flags.string({ required: true, description: 'Subject record id' }),
    evaluator: Flags.string({ description: 'LLM or Deterministic', default: 'LLM' }),
  };

  async run(): Promise<void> {
    const { CloseMJProvider, RubricCommands } = await import('@memberjunction/testing-cli');
    const { flags } = await this.parse(RubricEvaluate);
    try {
      await new RubricCommands().Evaluate(flags.rubric, flags.entity, flags.record, flags.evaluator);
    } finally {
      await CloseMJProvider();
    }
  }
}
