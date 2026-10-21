import { Command, Flags } from '@oclif/core';
import { WorkQueueListPartitionsOperation } from '@memberjunction/core-entities';
import { FormatPartitions, PARTITION_CONDITION_OPTIONS, RequireOperationOutput, ToPartitionCondition } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueuePartitions extends Command {
  static description = "List a work-queue subscription's in-flight or blocked partition keys";

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --condition Blocked'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    condition: Flags.string({ description: 'Only keys in this condition', options: [...PARTITION_CONDITION_OPTIONS] }),
    cursor: Flags.string({ description: 'nextCursor from a previous page' }),
    'page-size': Flags.integer({ description: 'Items per page (1–500)', default: 50 }),
    json: Flags.boolean({ description: 'Print JSON instead of a table', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuePartitions);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, condition: ToPartitionCondition(flags.condition), cursor: flags.cursor, pageSize: flags['page-size'] };
      const result = await new WorkQueueListPartitionsOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ListPartitions');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatPartitions(output));
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
