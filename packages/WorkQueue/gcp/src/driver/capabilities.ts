import type { TransportCapabilities } from '@memberjunction/work-queue-core';

export const GCP_TRANSPORT_NAME = 'GCP';

export const GCP_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    Filters: { Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50 },
    DetectsMessageIDDuplicates: false,
    PersistsProgress: false,
    SupportsOrdered: false,
    SupportsExternalHosts: true,
    CancelPending: false,
    CancelInFlight: false,
    ListPartitions: false,
    PeekDeadLetters: 'BestEffort',
    ReplaySingleDeadLetter: true,
    CompletedCounts: false,
    MaxRetryDelaySeconds: 600,
};
