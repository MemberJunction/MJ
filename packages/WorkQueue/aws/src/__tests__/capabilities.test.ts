import { describe, it, expect } from 'vitest';
import { AWS_TRANSPORT_CAPABILITIES, AWS_TRANSPORT_NAME } from '../driver/capabilities';

describe('AWS transport capabilities', () => {
    it('declares exactly the 03 §5 AWS values', () => {
        expect(AWS_TRANSPORT_NAME).toBe('AWS');
        expect(AWS_TRANSPORT_CAPABILITIES).toEqual({
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
        });
    });
});
