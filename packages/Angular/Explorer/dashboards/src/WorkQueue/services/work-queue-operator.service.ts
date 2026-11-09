import { Injectable } from '@angular/core';
import type { IMetadataProvider, RemoteOpResult } from '@memberjunction/core';
import {
    WorkQueueDiscardDeliveryOperation, WorkQueueGetBacklogOperation, WorkQueueGetSubscriptionStatsOperation,
    WorkQueueListDeadLettersOperation, WorkQueueListPartitionsOperation, WorkQueueReplayDeadLetterOperation,
    WorkQueueValidateBindingsOperation,
    type WorkQueueDiscardDeliveryOutput, type WorkQueueGetBacklogOutput, type WorkQueueGetSubscriptionStatsOutput,
    type WorkQueueListDeadLettersOutput, type WorkQueueListPartitionsOutput, type WorkQueueReplayDeadLetterOutput,
    type WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import type { WorkQueuePartitionCondition } from '../work-queue-agent-context';

/**
 * Thin, provider-scoped wrapper over the seven WorkQueue.* Remote Operations (03 §8). Every call takes the
 * caller's provider so the dashboard stays multi-provider safe; a failed operation throws an Error carrying the
 * ResultCode (FORBIDDEN, EXECUTION_ERROR, …) and the server's message.
 */
@Injectable()
export class WorkQueueOperatorService {
    public GetStats(provider: IMetadataProvider, subscriptionName?: string): Promise<WorkQueueGetSubscriptionStatsOutput> {
        return this.run(new WorkQueueGetSubscriptionStatsOperation().Execute({ subscriptionName }, { provider }), 'WorkQueue.GetSubscriptionStats');
    }

    public ListDeadLetters(provider: IMetadataProvider, subscriptionName: string, pageSize = 100, cursor?: string): Promise<WorkQueueListDeadLettersOutput> {
        return this.run(new WorkQueueListDeadLettersOperation().Execute({ subscriptionName, pageSize, cursor }, { provider }), 'WorkQueue.ListDeadLetters');
    }

    public ListPartitions(provider: IMetadataProvider, subscriptionName: string, condition?: WorkQueuePartitionCondition, pageSize = 100, cursor?: string): Promise<WorkQueueListPartitionsOutput> {
        return this.run(new WorkQueueListPartitionsOperation().Execute({ subscriptionName, condition, pageSize, cursor }, { provider }), 'WorkQueue.ListPartitions');
    }

    public Replay(provider: IMetadataProvider, subscriptionName: string, deliveryID: string, note?: string): Promise<WorkQueueReplayDeadLetterOutput> {
        return this.run(new WorkQueueReplayDeadLetterOperation().Execute({ subscriptionName, deliveryID, note }, { provider }), 'WorkQueue.ReplayDeadLetter');
    }

    public Discard(provider: IMetadataProvider, subscriptionName: string, deliveryID: string, reason: string): Promise<WorkQueueDiscardDeliveryOutput> {
        return this.run(new WorkQueueDiscardDeliveryOperation().Execute({ subscriptionName, deliveryID, reason }, { provider }), 'WorkQueue.DiscardDelivery');
    }

    public GetBacklog(provider: IMetadataProvider, subscriptionName: string): Promise<WorkQueueGetBacklogOutput> {
        return this.run(new WorkQueueGetBacklogOperation().Execute({ subscriptionName }, { provider }), 'WorkQueue.GetBacklog');
    }

    public ValidateBindings(provider: IMetadataProvider, transportName?: string): Promise<WorkQueueValidateBindingsOutput> {
        return this.run(new WorkQueueValidateBindingsOperation().Execute({ transportName }, { provider }), 'WorkQueue.ValidateBindings');
    }

    private async run<T>(pending: Promise<RemoteOpResult<T>>, key: string): Promise<T> {
        const result = await pending;
        if (!result.Success || result.Output === undefined) {
            throw new Error(`${key} failed (${result.ResultCode ?? 'UNKNOWN'}): ${result.ErrorMessage ?? 'no details'}`);
        }
        return result.Output;
    }
}
