/**
 * The guarded-write procedures of `V202609241637__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql` (plan 12 / CD9).
 * Keys match the builder methods that call them; `procedureParity.test.ts` checks that every name and its parameter
 * list, in order, exists in the migration exactly as the builders render it.
 */
export const WorkQueueProcedures = {
    // publish + deduplication ledger
    AcquirePublishOrderLock: 'spWorkQueueAcquirePublishOrderLock',
    InsertMessage: 'spWorkQueueInsertMessage',
    SelectMessage: 'spWorkQueueSelectMessage',
    InsertDeliveries: 'spWorkQueueInsertDeliveries',
    ReserveDeduplication: 'spWorkQueueReserveDeduplication',
    SelectDeduplicationOwner: 'spWorkQueueSelectDeduplicationOwner',
    ConfirmDeduplication: 'spWorkQueueConfirmDeduplication',
    ReleaseDeduplication: 'spWorkQueueReleaseDeduplication',
    PurgeExpiredDeduplications: 'spWorkQueuePurgeExpiredDeduplications',
    // consume
    ExpireLeases: 'spWorkQueueExpireLeases',
    SubscriptionBacklog: 'spWorkQueueSubscriptionBacklog',
    ClaimUnpartitioned: 'spWorkQueueClaimUnpartitioned',
    SelectPartitionCandidates: 'spWorkQueueSelectPartitionCandidates',
    ClaimPartitionCandidate: 'spWorkQueueClaimPartitionCandidate',
    ExtendLease: 'spWorkQueueExtendLease',
    SelectLeaseState: 'spWorkQueueSelectLeaseState',
    CompleteDelivery: 'spWorkQueueCompleteDelivery',
    RetryDelivery: 'spWorkQueueRetryDelivery',
    DeadLetterDelivery: 'spWorkQueueDeadLetterDelivery',
    ReleaseDelivery: 'spWorkQueueReleaseDelivery',
    AcknowledgeCancel: 'spWorkQueueAcknowledgeCancel',
    // operator + sweeper
    SubscriptionStats: 'spWorkQueueSubscriptionStats',
    ListDeadLetters: 'spWorkQueueListDeadLetters',
    ListPartitions: 'spWorkQueueListPartitions',
    ReplayDelivery: 'spWorkQueueReplayDelivery',
    DiscardDelivery: 'spWorkQueueDiscardDelivery',
    CancelInFlightDelivery: 'spWorkQueueCancelInFlightDelivery',
    ExpireLeasesAll: 'spWorkQueueExpireLeasesAll',
    AcquireSweepLock: 'spWorkQueueAcquireSweepLock',
    ReadCommittedSnapshotState: 'spWorkQueueReadCommittedSnapshotState',
    PurgeTerminalDeliveries: 'spWorkQueuePurgeTerminalDeliveries',
    PurgeOrphanMessages: 'spWorkQueuePurgeOrphanMessages',
} as const;

export type WorkQueueProcedureName = typeof WorkQueueProcedures[keyof typeof WorkQueueProcedures];
