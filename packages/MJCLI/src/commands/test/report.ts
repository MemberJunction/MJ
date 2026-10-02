import { Args, Command } from '@oclif/core';

export default class TestReport extends Command {
  static description = 'Print the per-criterion rubric breakdown for a test run.';

  static args = {
    runId: Args.string({ description: 'Test run ID', required: true }),
  };

  async run(): Promise<void> {
    const { CloseMJProvider, ReportCommand } = await import('@memberjunction/testing-cli');
    const { args } = await this.parse(TestReport);
    try {
      await new ReportCommand().execute(args.runId, {}, undefined as never);
    } finally {
      await CloseMJProvider();
    }
  }
}
