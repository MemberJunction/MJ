/** Reference to data held outside the queue (claim-check). */
export interface WorkQueuePayloadRefRow {
    Uri: string;
    ContentType?: string;
    SizeBytes?: number;
    Checksum?: string;
}

/** The dead-lettered message envelope. */
export interface WorkQueueDeadLetterMessageRow {
    MessageID: string;
    Topic: string;
    PartitionKey?: string;
    Attributes: Record<string, string>;
    /** The inline payload serialized as JSON, or null when the message carries none. */
    PayloadJSON: string | null;
    PayloadRef?: WorkQueuePayloadRefRow;
    CorrelationID?: string;
    /** ISO 8601 publish time. */
    PublishedAt: string;
}

/** One dead-lettered delivery. */
export interface WorkQueueDeadLetterRow {
    /** Database: MJ: Work Queue Deliveries ID. AWS: the envelope MessageID. */
    DeliveryID: string;
    Message: WorkQueueDeadLetterMessageRow;
    PartitionKey: string | null;
    Attempts: number;
    /** Handler reason, MaxAttemptsExceeded, LeaseExpired, HandlerNotRegistered, RedrivePolicy, InvalidEnvelope, … */
    Reason: string;
    LastError: string | null;
    DeadLetteredAt: string | null;
    /** True when this delivery is the dead-lettered head of an Ordered key (Database transport). */
    BlocksKey: boolean;
}

/** Output of `WorkQueue.ListDeadLetters`. */
export interface WorkQueueListDeadLettersOutput {
    /** False when the subscription's transport cannot list dead letters; items is then empty. */
    supported: boolean;
    items: WorkQueueDeadLetterRow[];
    nextCursor: string | null;
}
