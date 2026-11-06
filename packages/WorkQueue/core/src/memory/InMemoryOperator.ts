import type { DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord, SubscriptionStats } from '../operator';
import type { SubscriptionBinding } from '../transport';
import type { InMemoryStore } from './InMemoryStore';

export class InMemoryOperator implements ITransportOperator {
    constructor(private readonly store: InMemoryStore) {}

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        return this.store.Stats(subscription);
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        return this.store.DeadLetters(subscription, cursor, pageSize);
    }

    public async ListPartitions(
        subscription: SubscriptionBinding,
        condition: PartitionCondition | null,
        cursor: string | null,
        pageSize: number,
    ): Promise<Page<PartitionStateRecord> | null> {
        return this.store.Partitions(subscription, condition, cursor, pageSize);
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        return { Supported: true, Changed: this.store.Replay(subscription, deliveryID, actorUserID, note) };
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        const result = this.store.Discard(subscription, deliveryID, reason, actorUserID);
        // CancelRequested is only set for the in-flight case, so plain discards keep the simple shape.
        return result.CancelRequested
            ? { Supported: true, Changed: result.Changed, CancelRequested: true }
            : { Supported: true, Changed: result.Changed };
    }
}
