import { Args, Command } from '@oclif/core';

export default class TestPromoteCriteria extends Command {
  static description = 'Copy a test\'s inline judge criteria into a Draft rubric and set Test.RubricID. Does not publish.';

  static examples = [
    '<%= config.bin %> <%= command.id %> <test-id>',
    '<%= config.bin %> <%= command.id %> "Reply check"',
  ];

  static args = {
    test: Args.string({
      description: 'Test name or ID',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { PromoteCriteriaCommand } = await import('@memberjunction/testing-cli');
    const { args } = await this.parse(TestPromoteCriteria);
    try {
      await new PromoteCriteriaCommand().Execute(args.test);
    } catch (error) {
      this.error(error as Error);
    }
  }
}
