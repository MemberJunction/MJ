import { Command, Flags } from '@oclif/core';
import { WorkQueueGetBacklogOperation } from '@memberjunction/core-entities';
import { FormatBacklog, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueBacklog extends Command {
  static description = 'Show the autoscaler metric for one subscription: claimable pending plus in-flight deliveries';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription venue-import', '<%= config.bin %> <%= command.id %> --subscription venue-import --json'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    json: Flags.boolean({ description: 'Print JSON instead of text', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueBacklog);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const result = await new WorkQueueGetBacklogOperation().Execute({ subscriptionName: flags.subscription }, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.GetBacklog');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatBacklog(output));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
