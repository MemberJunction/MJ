import { Command, Flags } from '@oclif/core';
import { WorkQueueListDeadLettersOperation } from '@memberjunction/core-entities';
import { FormatDeadLetters, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueDeadLetters extends Command {
  static description = "List a work-queue subscription's dead-lettered deliveries";

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --page-size 20'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    cursor: Flags.string({ description: 'nextCursor from a previous page' }),
    'page-size': Flags.integer({ description: 'Items per page (1–500)', default: 50 }),
    json: Flags.boolean({ description: 'Print JSON instead of a table', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueDeadLetters);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, cursor: flags.cursor, pageSize: flags['page-size'] };
      const result = await new WorkQueueListDeadLettersOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ListDeadLetters');
      this.log(flags.json ? JSON.stringify(output, null, 2) : FormatDeadLetters(output));
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
