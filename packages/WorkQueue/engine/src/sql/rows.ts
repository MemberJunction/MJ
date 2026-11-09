import type { PartitionCondition } from '@memberjunction/work-queue-core';

/** Values for one WorkQueueMessage insert. JSON columns are pre-serialised. PublishedAt is the database clock. */
export interface MessageInsertRow {
    ID: string;
    TopicID: string;
    PartitionKey: string | null;
    AttributesJSON: string | null;
    PayloadJSON: string | null;
    PayloadRefJSON: string | null;
    CorrelationID: string | null;
    PublishedByUserID: string | null;
}

export interface MessageInsertedRow {
    ID: string;
    PublishOrdinal: number | string;
}

/** The stored message with a given MessageID, for the canonical-envelope comparison (03 §2.1, F10). */
export interface ExistingMessageRow {
    ID: string;
    TopicID: string;
    PartitionKey: string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
}

export interface DeliveryInsertRow {
    MessageID: string;
    SubscriptionID: string;
    /** Only for Exclusive/Ordered subscriptions; null otherwise. */
    PartitionKey: string | null;
    /** Always the message's PublishOrdinal. */
    OrderKey: number;
}

/** A ledger row: who owns a deduplication key and whether the publish was confirmed. */
export interface ReservationRow {
    MessageID: string;
    Status: 'Reserved' | 'Confirmed';
}

export interface ClaimedDeliveryRow {
    DeliveryID: string;
    AttemptCount: number | string;
    LeaseToken: string;
    LeaseExpiresAt: Date | string;
    IsReplay: boolean | number;
    MessageID: string;
    PartitionKey: string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

export interface PartitionCandidateRow {
    DeliveryID: string;
    PartitionKey: string;
}

/** Present when the delivery is still InFlight under this token; CancelRequested tells Cancelled from Lost. */
export interface LeaseStateRow {
    CancelRequested: boolean | number;
}

export interface StatsRow {
    Pending: number | string | null;
    InFlight: number | string | null;
    DeadLettered: number | string | null;
    BlockedKeys: number | string | null;
    OldestPendingAgeSeconds: number | string | null;
    CompletedLastHour: number | string | null;
}

export interface DeadLetterRow {
    DeliveryID: string;
    AttemptCount: number | string;
    DeadLetterReason: string | null;
    LastError: string | null;
    DeadLetteredAt: Date | string | null;
    DeliveryPartitionKey: string | null;
    BlocksKey: boolean | number;
    MessageID: string;
    PartitionKey: string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

export interface PartitionRow {
    PartitionKey: string;
    Condition: PartitionCondition;
    HeadDeliveryID: string | null;
    WaitingItems: number | string;
}

/** A delivery that an expire pass moved to DeadLettered; feeds the engine's NotifyDeadLettered seam (03 §11). */
export interface ExpiredDeadLetterRow {
    DeliveryID: string;
    SubscriptionID: string;
    PartitionKey: string | null;
    /** The DeadLetterReason the procedure wrote ('LeaseExpired'); passed through, never hardcoded by callers. */
    Reason: string;
}

/** One row from SubscriptionBacklog: the autoscaler metric (03 §11). Each count is capped. */
export interface BacklogRow {
    Claimable: number | string;
    InFlight: number | string;
}

export interface SweepLockRow {
    Acquired: boolean | number;
}

/** READ_COMMITTED_SNAPSHOT state (SQL Server); always true on PostgreSQL, which is MVCC by design. */
export interface IsolationRow {
    SnapshotOn: boolean | number;
}

/** The result of spWorkQueueAcquirePublishOrderLock: sp_getapplock's return code (0 granted, 1 granted after waiting). */
export interface LockResultRow {
    LockResult: number | string;
}

/** Keyset position for ListDeadLetters (ordered by delivery ID, which is stable and unique). */
export interface DeadLetterCursor {
    DeliveryID: string;
}

export type ClaimPartitionMode = 'Exclusive' | 'Ordered';
export type BacklogPartitionMode = ClaimPartitionMode | 'None';
