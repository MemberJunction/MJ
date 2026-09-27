import type { TransportCapabilities } from '@memberjunction/work-queue-core';

export const AZURE_TRANSPORT_NAME = 'Azure';

/** 09a "Capabilities": the AWS profile, except that dead letters are peeked non-destructively (Full). */
export const AZURE_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    Filters: { Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50 },
    DetectsMessageIDDuplicates: false,
    PersistsProgress: false,
    SupportsOrdered: false,
    SupportsExternalHosts: true,
    CancelPending: false,
    CancelInFlight: false,
    ListPartitions: false,
    PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true,
    CompletedCounts: false,
    /** Scheduled enqueue has no service limit below the message TTL; 30 days keeps a retry inside any sane retention. */
    MaxRetryDelaySeconds: 2_592_000,
};
