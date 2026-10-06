/** Physical table names (03 §6). */
export const WorkQueueTables = {
    Transport: 'WorkQueueTransport',
    Topic: 'WorkQueueTopic',
    Subscription: 'WorkQueueSubscription',
    Message: 'WorkQueueMessage',
    Delivery: 'WorkQueueDelivery',
    Deduplication: 'WorkQueueDeduplication',
} as const;

export type WorkQueueTableName = typeof WorkQueueTables[keyof typeof WorkQueueTables];

// Entity names and the Database DriverClass live in `@memberjunction/work-queue-base`; import them from there
// (no cross-package re-exports — 03 §0).

/** Unique index enforcing one in-flight delivery per (subscription, partition key). */
export const IN_FLIGHT_PARTITION_INDEX = 'UQ_WorkQueueDelivery_InFlightPartition';

/** Unique constraint enforcing one delivery per (subscription, message). */
export const DELIVERY_SUBSCRIPTION_MESSAGE_INDEX = 'UQ_WorkQueueDelivery_Subscription_Message';

/** Primary key of WorkQueueMessage: MessageID is globally unique (03 §2.1, F10). */
export const MESSAGE_PRIMARY_KEY = 'PK_WorkQueueMessage';

/** Unique constraint enforcing one ledger row per (topic, deduplication key). */
export const DEDUPLICATION_KEY_INDEX = 'UQ_WorkQueueDeduplication_Topic_Key';

/** Lifetime of a Reserved ledger row while a cloud send is in progress (03 §2.1). */
export const DEDUP_RESERVATION_SECONDS = 120;

/** Deliveries per spWorkQueueInsertDeliveries call: bounds the JSON argument and the rows locked per round trip. */
export const DELIVERY_INSERT_CHUNK = 250;

/** Rows one sweeper expire pass moves per call (spWorkQueueExpireLeasesAll); the next cycle continues. */
export const EXPIRE_LEASES_BATCH = 500;

/** Backlog and scaler counts stop here (03 §7 "Bounded work"): an autoscaler never needs more. */
export const BACKLOG_COUNT_CAP = 1000;

/** How long a publish waits for a per-key publish-order lock before failing as retryable (03 §7). */
export const PUBLISH_LOCK_TIMEOUT_MS = 5000;

/** Transaction-owned application lock that lets one sweeper run at a time (03 §7). */
export const SWEEP_LOCK_RESOURCE = 'mj-wq-sweep';

/** Partition candidates fetched per free slot: Exclusive may return several rows of one key, and some keys are lost to other workers. */
export const CANDIDATE_OVERSCAN = 4;
