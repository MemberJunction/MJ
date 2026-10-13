import type { TransportCapabilities } from '@memberjunction/work-queue-core';

export const AWS_TRANSPORT_NAME = 'AWS';

export const AWS_TRANSPORT_CAPABILITIES: TransportCapabilities = {
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
    MaxRetryDelaySeconds: 43200,
};
