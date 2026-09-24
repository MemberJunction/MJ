import type { PartitionCondition } from '@memberjunction/work-queue-core';
import type { SqlStatement } from './WorkQueueSqlExecutor';
import type { BacklogPartitionMode, ClaimPartitionMode, DeadLetterCursor, DeliveryInsertRow, MessageInsertRow } from './rows';

/**
 * Every method returns a **procedure call** (plan 12 / CD9): the SQL lives in the `spWorkQueue*` procedures of
 * `V202609241637__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql`, and the builders only render the call and bind its
 * parameters in the procedure's declared order. Methods documented as "rows …" are read with `ExecuteRows`; every
 * other method is a guarded write whose single result set carries `AffectedRows`, read with `ExecuteWrite`.
 */

/** Calls used while publishing and by the deduplication ledger. */
export interface PublishSqlBuilder {
    /** Per-transaction setup the platform needs before taking publish-order locks; null when none. */
    PreparePublishOrderLock(timeoutMs: number): SqlStatement | null;
    /** rows `LockResultRow` (1); a timeout raises an error `IsTransientDatabaseError` recognises. */
    AcquirePublishOrderLock(topicID: string, partitionKey: string, timeoutMs: number): SqlStatement;
    /** Inserts when no message has this ID; rows `MessageInsertedRow` (0 = a message with this ID already exists). */
    InsertMessage(row: MessageInsertRow): SqlStatement;
    /** rows `ExistingMessageRow` (0–1). */
    SelectMessage(messageID: string): SqlStatement;
    /** One Pending delivery per row, at most `DELIVERY_INSERT_CHUNK` per call. */
    InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement;
    /** Takes a free or expired key, or re-takes this MessageID's own Reserved row; rows `ReservationRow` it now owns (0–1). */
    ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement;
    /** rows `ReservationRow` (0–1). */
    SelectDeduplicationOwner(topicID: string, key: string): SqlStatement;
    ConfirmDeduplication(topicID: string, key: string, messageID: string, ttlSeconds: number): SqlStatement;
    ReleaseDeduplication(topicID: string, key: string, messageID: string): SqlStatement;
    PurgeExpiredDeduplications(batchSize: number): SqlStatement;
}

/** Calls used by a Database consumer: expire, claim, heartbeat, settle, acknowledge a cancel. */
export interface ConsumeSqlBuilder {
    /** rows `ExpiredDeadLetterRow`: ONLY the deliveries this pass dead-lettered. */
    ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement;
    /** rows `ClaimedDeliveryRow`. */
    ClaimUnpartitioned(subscriptionID: string, leaseOwner: string, leaseSeconds: number, maxRows: number): SqlStatement;
    /** rows `PartitionCandidateRow`: visible Pending rows that satisfy the partition rules, oldest first. May return
     *  several rows of one key for Exclusive — the consumer keeps the first per key (03 §7). */
    SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, maxRows: number): SqlStatement;
    /** rows `BacklogRow` (exactly 1): the autoscaler metric (03 §11), each count capped. */
    SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, cap: number): SqlStatement;
    /** rows `ClaimedDeliveryRow` (0–1). */
    ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode,
                            leaseOwner: string, leaseSeconds: number): SqlStatement;
    ExtendLease(deliveryID: string, leaseToken: string, leaseSeconds: number, progressJSON: string | null): SqlStatement;
    /** rows `LeaseStateRow` (0–1): tells Cancelled from Lost after a zero-row ExtendLease. */
    SelectLeaseState(deliveryID: string, leaseToken: string): SqlStatement;
    CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement;
    RetryDelivery(deliveryID: string, leaseToken: string, delaySeconds: number, error: string): SqlStatement;
    DeadLetterDelivery(deliveryID: string, leaseToken: string, reason: string, error: string | null): SqlStatement;
    ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement;
    /** Token-fenced and requires CancelRequestedAt: the cancelled delivery becomes Discarded now (03 §7, F2). */
    AcknowledgeCancel(deliveryID: string, leaseToken: string): SqlStatement;
    /** Test-only raw UPDATE (not a procedure — never grantable to a runtime role); the conformance harness ages rows. */
    ShiftTimestampsForConformance(subscriptionID: string, seconds: number): SqlStatement;
}

/** Calls used by the operator, the sweeper and topology validation. */
export interface OperatorSqlBuilder {
    /** rows `StatsRow` (1). */
    SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement;
    /** rows `DeadLetterRow`, keyset-paged by delivery ID. */
    ListDeadLetters(subscriptionID: string, ordered: boolean, after: DeadLetterCursor | null, pageSize: number): SqlStatement;
    /** rows `PartitionRow`, keyset-paged by partition key; `condition` null = every non-Idle key. */
    ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null,
                   afterPartitionKey: string | null, pageSize: number): SqlStatement;
    ReplayDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, note: string | null): SqlStatement;
    DiscardDelivery(subscriptionID: string, deliveryID: string, allowPending: boolean, actorUserID: string | null, reason: string): SqlStatement;
    /** Cancels an in-flight delivery (03 §7, F2): stamps CancelRequestedAt. The lease token is left unchanged. */
    CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement;
    /** Sweeper-wide expiry in bounded batches; rows `ExpiredDeadLetterRow` as `ConsumeSqlBuilder.ExpireLeases`.
     *  `batchSize` defaults to EXPIRE_LEASES_BATCH: plan 06's sweeper calls it with no argument. */
    ExpireLeasesAll(batchSize?: number): SqlStatement;
    /** Transaction-owned, non-blocking application lock (03 §7 "one sweeper at a time"). rows `SweepLockRow` (1). */
    AcquireSweepLock(resource: string): SqlStatement;
    /** Database prerequisite check (03 §6): READ_COMMITTED_SNAPSHOT on SQL Server. rows `IsolationRow` (1). */
    ReadCommittedSnapshotState(): SqlStatement;
    PurgeTerminalDeliveries(batchSize: number): SqlStatement;
    PurgeOrphanMessages(batchSize: number): SqlStatement;
}

export interface WorkQueueSqlBuilder {
    readonly Publish: PublishSqlBuilder;
    readonly Consume: ConsumeSqlBuilder;
    readonly Operator: OperatorSqlBuilder;
}

/**
 * Lock resource serialising publishes per (topic, partition key) so PublishOrdinal is monotonic per key in
 * commit order (sp_getapplock allows 255 characters: 3 + 36 + 1 + 200 fits). The key is used **exactly as supplied**:
 * partition keys compare byte-exactly on both dialects (03 §6 "Key collation"), so 'Venue-42' and 'venue-42' are two
 * keys and take two locks.
 */
export function PublishOrderLockResource(topicID: string, partitionKey: string): string {
    return `wq:${topicID.trim().toLowerCase()}:${partitionKey}`;
}
