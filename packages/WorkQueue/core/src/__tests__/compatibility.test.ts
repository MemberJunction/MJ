import { describe, it, expect } from 'vitest';
import { FilterUnsupportedReason, SubscriptionUnsupportedReason } from '../compatibility';
import { WORK_QUEUE_FILTER_SUPPORT } from '../filter';
import type { SubscriptionBinding, TransportCapabilities } from '../transport';
import type { HostType, PartitionMode } from '../policy';

const DATABASE_LIKE: TransportCapabilities = {
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

const CLOUD_LIKE: TransportCapabilities = {
    ...DATABASE_LIKE,
    Filters: { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'] },
    DetectsMessageIDDuplicates: false,
    PersistsProgress: false,
    SupportsOrdered: false,
    SupportsExternalHosts: true,
    CancelPending: false,
    CancelInFlight: false,
    ListPartitions: false,
    PeekDeadLetters: 'BestEffort',
    CompletedCounts: false,
    MaxRetryDelaySeconds: 43200,
};

function binding(hostType: HostType, partitionMode: PartitionMode, backoffMaxSeconds = 900): SubscriptionBinding {
    return {
        Policy: {
            SubscriptionName: 'integration.apply',
            TopicName: 'integration.batch-ready',
            PartitionMode: partitionMode,
            MaxAttempts: 5,
            BackoffBaseSeconds: 10,
            BackoffMaxSeconds: backoffMaxSeconds,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
        },
        Filter: null,
        HostType: hostType,
        Config: {},
    };
}

describe('SubscriptionUnsupportedReason', () => {
    it('accepts supported combinations', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'Ordered'), DATABASE_LIKE)).toBeNull();
        expect(SubscriptionUnsupportedReason(binding('External', 'Exclusive'), CLOUD_LIKE)).toBeNull();
    });

    it('rejects External hosts on a transport that cannot host them', () => {
        expect(SubscriptionUnsupportedReason(binding('External', 'None'), DATABASE_LIKE)).toContain('HostType External');
    });

    it('rejects Ordered on a transport without ordering, whatever the host', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'Ordered'), CLOUD_LIKE)).toContain('Ordered requires the Database transport');
        expect(SubscriptionUnsupportedReason(binding('External', 'Ordered'), CLOUD_LIKE)).toContain('Ordered requires the Database transport');
    });

    it('rejects a maximum backoff above the transport limit', () => {
        expect(SubscriptionUnsupportedReason(binding('MJWorker', 'None', 86400), CLOUD_LIKE)).toContain('BackoffMaxSeconds 86400');
    });

    it('reports the first failing rule', () => {
        const reason = SubscriptionUnsupportedReason(binding('External', 'Ordered', 999999), DATABASE_LIKE);
        expect(reason).toContain('HostType External');
    });

    it('rejects a filter this transport cannot express, naming the subscription', () => {
        const withFilter = {
            ...binding('MJWorker', 'None'),
            Filter: { logic: 'and' as const, filters: [{ field: 'tenant', operator: 'startswith' as const, value: 'acme' }] },
        };
        const eqOnly: TransportCapabilities = { ...CLOUD_LIKE, Filters: { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq'] } };
        const reason = SubscriptionUnsupportedReason(withFilter, eqOnly);
        expect(reason).toContain("integration.apply");
        expect(reason).toContain("operator 'startswith' on field 'tenant'");
        expect(SubscriptionUnsupportedReason(withFilter, DATABASE_LIKE)).toBeNull();
    });
});

describe('FilterUnsupportedReason', () => {
    it('passes a null filter and a supported filter, and explains an unsupported one', () => {
        expect(FilterUnsupportedReason(null, CLOUD_LIKE)).toBeNull();
        const filter = { logic: 'and' as const, filters: [{ field: 'eventType', operator: 'eq' as const, value: 'click' }] };
        expect(FilterUnsupportedReason(filter, CLOUD_LIKE)).toBeNull();
        const groups: TransportCapabilities = { ...CLOUD_LIKE, Filters: { ...WORK_QUEUE_FILTER_SUPPORT, SingleFieldOrGroups: false } };
        const grouped = { logic: 'and' as const, filters: [{ logic: 'or' as const, filters: [
            { field: 'tenant', operator: 'eq' as const, value: 'acme' },
            { field: 'tenant', operator: 'eq' as const, value: 'globex' },
        ] }] };
        expect(FilterUnsupportedReason(grouped, groups)).toContain('does not support OR groups');
    });
});
