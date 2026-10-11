import { Command, Flags } from '@oclif/core';
import { WorkQueueDiscardDeliveryOperation } from '@memberjunction/core-entities';
import { RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueDiscard extends Command {
  static description = 'Discard one pending or dead-lettered work-queue delivery, or cancel one that is in flight';

  static examples = ['<%= config.bin %> <%= command.id %> --subscription integration.apply --delivery <id> --reason "bad batch, republished"'];

  static flags = {
    subscription: Flags.string({ char: 's', description: 'Subscription name', required: true }),
    delivery: Flags.string({ char: 'd', description: 'DeliveryID to discard', required: true }),
    reason: Flags.string({ char: 'r', description: 'Why the work is dropped (at most 1000 characters)', required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueDiscard);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const input = { subscriptionName: flags.subscription, deliveryID: flags.delivery, reason: flags.reason };
      const result = await new WorkQueueDiscardDeliveryOperation().Execute(input, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.DiscardDelivery');
      if (!output.supported) {
        failure = "This subscription's transport cannot discard this delivery.";
      } else if (!output.discarded) {
        failure = 'Nothing discarded: the delivery does not exist or is already finished.';
      } else if (output.cancelRequested) {
        this.log(`Cancel requested for ${flags.delivery}: its handler is told to stop within 30 seconds, and the delivery becomes Discarded once it does.`);
      } else {
        this.log(`Discarded ${flags.delivery}.`);
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
