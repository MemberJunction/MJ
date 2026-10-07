import type { WorkJson, WorkMessage } from './envelope';
import type { FilterSupport, SubscriptionFilter } from './filterTypes';
import type { WorkProgress } from './handler';
import type { ITransportOperator } from './operator';
import type { DeliveryStatus, HostType, SubscriptionPolicy } from './policy';
import type { PublishResult } from './publishing';

export interface TopicBinding {
    TopicName: string;
    IsFifo: boolean;
    MaxPayloadBytes: number;
    /** e.g. { SnsTopicArn } */
    Config: Record<string, WorkJson>;
}

export interface SubscriptionBinding {
    Policy: SubscriptionPolicy;
    Filter: SubscriptionFilter | null;
    HostType: HostType;
    /** e.g. { Region, QueueUrl, QueueArn, DeadLetterQueueUrl, DeadLetterQueueArn, SnsSubscriptionArn, IsFifo } */
    Config: Record<string, WorkJson>;
}

export interface ReceivedDelivery<TPayload extends WorkJson = WorkJson> {
    Message: WorkMessage<TPayload>;
    DeliveryID: string;
    /** Database: per-claim UUID; SQS: receipt handle */
    LeaseToken: string;
    Attempt: number;
    IsReplay: boolean;
    LeaseExpiresAt: Date;
}

export type SettleResult =
    | { Kind: 'Settled'; DeliveryID: string; Status: DeliveryStatus }
    /** The guarded write changed no row: taken over, expired or cancelled. */
    | { Kind: 'LeaseLost'; DeliveryID: string }
    | { Kind: 'Failed'; DeliveryID: string; Error: string };

export type LeaseExtension = 'Held' | 'Lost' | 'Cancelled';

export interface TransportCapabilities {
    /** Filter operators and structure this transport accepts (spec 03 §4.1). */
    Filters: FilterSupport;
    /** Database true; AWS false */
    DetectsMessageIDDuplicates: boolean;
    /** Database true; AWS false */
    PersistsProgress: boolean;
    /** Database true; AWS false — Ordered requires the Database transport */
    SupportsOrdered: boolean;
    /** Database false; AWS true */
    SupportsExternalHosts: boolean;
    /** Database true; AWS false */
    CancelPending: boolean;
    /** Cancel an InFlight delivery with the cancel flag + AcknowledgeCancel (spec 03 §7). Database true; AWS false. */
    CancelInFlight: boolean;
    /** Database true; AWS false */
    ListPartitions: boolean;
    /** Database Full; AWS BestEffort (≤ 100 scanned) */
    PeekDeadLetters: 'Full' | 'BestEffort';
    /** Database true; AWS true (scan-based) */
    ReplaySingleDeadLetter: boolean;
    /** Database true; AWS false */
    CompletedCounts: boolean;
    /** Database 2147483647; AWS 43200 */
    MaxRetryDelaySeconds: number;
}

/** Opaque to core; the Database driver narrows it (transaction enlistment, PublishedByUserID). Cloud drivers ignore it. */
export interface DatabasePublishOptions {
    readonly Kind: 'Database';
}

export interface ITransportDriver {
    readonly Name: string;
    readonly Capabilities: TransportCapabilities;
    Publish(
        topic: TopicBinding,
        messages: WorkMessage[],
        subscriptions: SubscriptionBinding[],
        opts?: DatabasePublishOptions,
    ): Promise<PublishResult[]>;
    OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload>;
    Operator(): ITransportOperator;
    ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]>;
}

export interface ITransportConsumer<TPayload extends WorkJson = WorkJson> {
    /** Never returns two deliveries of one partition key for a partitioned subscription (spec 03 §7). */
    Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]>;
    /** A thrown error is transient (the runtime retries next tick). 'Cancelled' only where CancelInFlight. */
    ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension>;
    Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
    Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult>;
    DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult>;
    /** Database: no attempt consumed. SQS: the receive is already counted (spec 03 §5.1). */
    Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
    /**
     * Token-fenced: a cancelled InFlight delivery held by this token → Discarded now, freeing its key (spec 03 §7).
     * Anything else → LeaseLost with no change. Transports without CancelInFlight always return LeaseLost.
     */
    AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
    /** Releases the consumer's independent executor / clients (spec 03 §11). */
    Close(): Promise<void>;
}

export interface BindingValidationIssue {
    Severity: 'Error' | 'Warning';
    Subject: string;
    Message: string;
}
