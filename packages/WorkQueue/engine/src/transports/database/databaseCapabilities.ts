import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';

/** Database transport capabilities (03 §5). */
export const DATABASE_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    // The Database transport evaluates filters in TypeScript, so it accepts the whole queue-wide subset (03 §4.1).
    Filters: WORK_QUEUE_FILTER_SUPPORT,
    DetectsMessageIDDuplicates: true,
    PersistsProgress: true,
    SupportsOrdered: true,
    SupportsExternalHosts: false,
    CancelPending: true,
    CancelInFlight: true,
    ListPartitions: true,
    PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true,
    CompletedCounts: true,
    MaxRetryDelaySeconds: 2147483647,
};
