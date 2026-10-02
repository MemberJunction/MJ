import { Command, Flags } from '@oclif/core';

export default class RubricEvaluate extends Command {
  static description = 'Evaluate one record against a rubric. Does not publish.';
  static flags = {
    rubric: Flags.string({ required: true, description: 'Rubric name or id, optionally @version' }),
    entity: Flags.string({ required: true, description: 'Subject entity name' }),
    record: Flags.string({ required: true, description: 'Subject record id' }),
    evaluator: Flags.string({ description: 'A registered evaluator: LLM, Decision, Agent, Deterministic, or a custom one', default: 'LLM' }),
    prompt: Flags.string({ description: 'Prompt name to run (LLM and Decision). Each evaluator has a default' }),
    model: Flags.string({ description: 'AI Model ID to pin. Otherwise the prompt\'s bindings choose' }),
    mode: Flags.string({ description: 'LLM only: SinglePass or PerCriterion', options: ['SinglePass', 'PerCriterion'] }),
  };

  async run(): Promise<void> {
    const { CloseMJProvider, RubricCommands } = await import('@memberjunction/testing-cli');
    const { flags } = await this.parse(RubricEvaluate);
    try {
      await new RubricCommands().Evaluate(flags.rubric, flags.entity, flags.record, flags.evaluator, {
        ...(flags.prompt ? { PromptName: flags.prompt } : {}),
        ...(flags.model ? { ModelID: flags.model } : {}),
        ...(flags.mode === 'SinglePass' || flags.mode === 'PerCriterion' ? { Mode: flags.mode } : {}),
      });
    } finally {
      await CloseMJProvider();
    }
  }
}
