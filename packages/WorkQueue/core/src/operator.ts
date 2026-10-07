import type { WorkMessage } from './envelope';
import type { SubscriptionBinding } from './transport';

export interface SubscriptionStats {
    SubscriptionName: string;
    Pending: number;
    InFlight: number;
    DeadLettered: number;
    /** null when not applicable/unsupported */
    BlockedKeys: number | null;
    /** AWS: always null in Phase 1 (no CloudWatch client; use the CloudWatch alarm) */
    OldestPendingAgeSeconds: number | null;
    /** null unless CompletedCounts */
    CompletedLastHour: number | null;
    AsOf: string;
}

export interface DeadLetterRecord {
    /** Database: Delivery.ID; AWS: envelope MessageID */
    DeliveryID: string;
    Message: WorkMessage;
    PartitionKey: string | null;
    Attempts: number;
    /** handler reason, 'MaxAttemptsExceeded', 'LeaseExpired', 'HandlerNotRegistered', 'RedrivePolicy', 'InvalidEnvelope', … */
    Reason: string;
    LastError: string | null;
    DeadLetteredAt: string | null;
    /** Ordered head on the Database transport */
    BlocksKey: boolean;
}

/** Derived from the delivery rows; nothing about a partition is stored elsewhere (spec 03 §7). */
export type PartitionCondition = 'Idle' | 'InFlight' | 'Blocked';

export interface PartitionStateRecord {
    PartitionKey: string;
    Condition: PartitionCondition;
    HeadDeliveryID: string | null;
    WaitingItems: number;
}

export interface Page<T> {
    Items: T[];
    NextCursor: string | null;
}

export type OperatorResult =
    | { Supported: false }
    /** CancelRequested: present (true) only when an InFlight delivery was asked to stop (spec 03 §7). */
    | { Supported: true; Changed: boolean; CancelRequested?: boolean };

export interface ITransportOperator {
    GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats>;
    ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null>;
    /** condition null = all non-Idle keys. Returns null when !ListPartitions. */
    ListPartitions(
        subscription: SubscriptionBinding,
        condition: PartitionCondition | null,
        cursor: string | null,
        pageSize: number,
    ): Promise<Page<PartitionStateRecord> | null>;
    Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult>;
    /** Pending (requires CancelPending) or DeadLettered → Discarded immediately.
     *  InFlight (requires CancelInFlight) → CancelRequestedAt set, `CancelRequested: true` (spec 03 §7). */
    Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult>;
}
