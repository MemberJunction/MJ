import { Command, Flags } from '@oclif/core';
import { WorkQueueGetSubscriptionStatsOperation } from '@memberjunction/core-entities';
import { FormatStatsTable, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueStats extends Command {
  static description = 'Show pending, in-flight and dead-lettered counts for work-queue subscriptions';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --subscription email.unsubscribe --json',
  ];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name; omit for every subscription' }),
    json: Flags.boolean({ description: 'Print JSON instead of a table', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueStats);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const result = await new WorkQueueGetSubscriptionStatsOperation().Execute({ subscriptionName: flags.subscription }, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.GetSubscriptionStats');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatStatsTable(output.subscriptions, output.failures));
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
