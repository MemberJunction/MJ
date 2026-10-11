/** `Ordered` is supported by the Database transport only (spec 03 §3.1). */
export type PartitionMode = 'None' | 'Exclusive' | 'Ordered';
export type HeartbeatMode = 'Auto' | 'Manual';
export type HostType = 'MJWorker' | 'External';
export type DeliveryStatus = 'Pending' | 'InFlight' | 'Completed' | 'DeadLettered' | 'Discarded';

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
