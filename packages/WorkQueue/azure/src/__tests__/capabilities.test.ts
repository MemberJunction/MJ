import { describe, it, expect } from 'vitest';
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import { AZURE_TRANSPORT_CAPABILITIES, AZURE_TRANSPORT_NAME } from '../driver/capabilities';

describe('AZURE_TRANSPORT_CAPABILITIES', () => {
    it('matches the 09a profile', () => {
        expect(AZURE_TRANSPORT_NAME).toBe('Azure');
        expect(AZURE_TRANSPORT_CAPABILITIES).toMatchObject({
            SupportsOrdered: false, SupportsExternalHosts: true, CancelPending: false, CancelInFlight: false, ListPartitions: false,
            PeekDeadLetters: 'Full', ReplaySingleDeadLetter: true, CompletedCounts: false, DetectsMessageIDDuplicates: false, PersistsProgress: false,
        });
        expect(AZURE_TRANSPORT_CAPABILITIES.Filters).toEqual(WORK_QUEUE_FILTER_SUPPORT);
        expect(AZURE_TRANSPORT_CAPABILITIES.MaxRetryDelaySeconds).toBeGreaterThan(43200);
    });
});
