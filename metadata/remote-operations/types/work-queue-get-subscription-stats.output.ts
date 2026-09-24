/** One subscription's counts, read from its transport. */
export interface WorkQueueSubscriptionStatsRow {
    SubscriptionName: string;
    Pending: number;
    InFlight: number;
    DeadLettered: number;
    /** Null when the transport cannot count blocked keys. */
    BlockedKeys: number | null;
    /** Null when unknown (always null on AWS in Phase 1). */
    OldestPendingAgeSeconds: number | null;
    /** Null unless the transport keeps completed rows. */
    CompletedLastHour: number | null;
    /** ISO 8601 time the counts were read. */
    AsOf: string;
}

/** A subscription whose stats could not be read. camelCase, as 03 §8 writes it. */
export interface WorkQueueStatsFailureRow {
    subscriptionName: string;
    /** A sanitised message — never raw driver or SQL text. */
    error: string;
}

/** Output of `WorkQueue.GetSubscriptionStats`. */
export interface WorkQueueGetSubscriptionStatsOutput {
    subscriptions: WorkQueueSubscriptionStatsRow[];
    /** Populated only when no subscriptionName was given; a named subscription that fails fails the operation. */
    failures: WorkQueueStatsFailureRow[];
}
