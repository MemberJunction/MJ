import type { TransportCapabilities } from '@memberjunction/work-queue-core';

export const AZURE_TRANSPORT_NAME = 'Azure';

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
    MaxRetryDelaySeconds: 2_147_483_647,
};
