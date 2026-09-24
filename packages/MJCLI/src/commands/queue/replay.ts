import { Command, Flags } from '@oclif/core';
import { WorkQueueReplayDeadLetterOperation } from '@memberjunction/core-entities';
import { RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueReplay extends Command {
  static description = 'Replay one dead-lettered work-queue delivery';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --delivery <id> --note "mapping fixed"'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    delivery: Flags.string({ char: 'd', description: 'DeliveryID from `mj queue dead-letters`', required: true }),
    note: Flags.string({ description: 'Operator note stored with the resolution' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueReplay);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, deliveryID: flags.delivery, note: flags.note };
      const result = await new WorkQueueReplayDeadLetterOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ReplayDeadLetter');
      if (!output.supported) {
        failure = "This subscription's transport cannot replay a single dead letter.";
      } else if (!output.replayed) {
        failure = 'Nothing replayed: the delivery does not exist or is not dead-lettered.';
      } else {
        this.log(`Replayed ${flags.delivery}.`);
      }
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
