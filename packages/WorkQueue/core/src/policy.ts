/** `Ordered` is supported by the Database transport only (spec 03 §3.1). */
export type PartitionMode = 'None' | 'Exclusive' | 'Ordered';
export type HeartbeatMode = 'Auto' | 'Manual';
export type HostType = 'MJWorker' | 'External';
export type DeliveryStatus = 'Pending' | 'InFlight' | 'Completed' | 'DeadLettered' | 'Discarded';
/**
 * Terminal disposition when a delivery exhausts `MaxAttempts` or encounters a fatal error.
 * - `'DeadLetter'` (default): moves to `'DeadLettered'`, preserving head-of-line blocking on `Ordered` partitions until replayed or discarded.
 * - `'Discard'`: transitions directly to `'Discarded'`, recording the failure reason while automatically unblocking subsequent deliveries on `Ordered` partitions.
 */
export type ExhaustionBehavior = 'DeadLetter' | 'Discard';

export interface RateLimitConfig {
    /** Maximum number of deliveries allowed per window per key. */
    MaxPerWindow: number;
    /** Sliding window duration in milliseconds. */
    WindowMs: number;
    /**
     * Optional key path to extract the grouping key from `Attributes` or `Payload`
     * (e.g. `'CredentialID'`, `'SendingDomain'`, `'CommunicationSenderID'`).
     * Falls back to `Message.PartitionKey`, then `'__default__'`.
     */
    KeyPath?: string;
}

export interface SubscriptionPolicy {
    SubscriptionName: string;
    TopicName: string;
    PartitionMode: PartitionMode;
    /** default 5 */
    MaxAttempts: number;
    /** default 10 */
    BackoffBaseSeconds: number;
    /** default 900 */
    BackoffMaxSeconds: number;
    /** default 60 */
    LeaseSeconds: number;
    /** default 'Auto' */
    HeartbeatMode: HeartbeatMode;
    MaxProcessingSeconds?: number;
    /** default 'DeadLetter' */
    ExhaustionBehavior?: ExhaustionBehavior;
    /** Optional per-key sliding-window rate limit enforced by the consumer runtime. */
    RateLimit?: RateLimitConfig;
}

/** Column defaults from spec 03 §6.3, for callers that build policies outside the database. */
export const SUBSCRIPTION_POLICY_DEFAULTS: Readonly<
    Pick<SubscriptionPolicy, 'PartitionMode' | 'MaxAttempts' | 'BackoffBaseSeconds' | 'BackoffMaxSeconds' | 'LeaseSeconds' | 'HeartbeatMode'>
> = {
    PartitionMode: 'None',
    MaxAttempts: 5,
    BackoffBaseSeconds: 10,
    BackoffMaxSeconds: 900,
    LeaseSeconds: 60,
    HeartbeatMode: 'Auto',
};
