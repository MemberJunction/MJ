import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { GcpPubSubFilterFor, NormalizeGcpPubSubFilter, ToGcpPubSubFilter } from '../filterPolicy';

describe('GCP Pub/Sub filter translation', () => {
    it('translates eq, neq, startswith, isnull, isnotnull, and single-field OR groups deterministically', () => {
        const filter: SubscriptionFilter = {
            logic: 'and',
            filters: [
                { field: 'region', operator: 'neq', value: 'eu"1' },
                { field: 'eventType', operator: 'eq', value: 'unsubscribe' },
                { field: 'source', operator: 'startswith', value: 'mail' },
                { field: 'trace', operator: 'isnotnull' },
                { field: 'obsolete', operator: 'isnull' },
                {
                    logic: 'or',
                    filters: [
                        { field: 'tier', operator: 'eq', value: 'pro' },
                        { field: 'tier', operator: 'eq', value: 'enterprise' },
                    ],
                },
            ],
        };
        expect(ToGcpPubSubFilter(filter)).toBe(
            'attributes.eventType = "unsubscribe" AND NOT attributes:obsolete AND attributes:region AND attributes.region != "eu\\"1" AND hasPrefix(attributes.source, "mail") AND (attributes.tier = "enterprise" OR attributes.tier = "pro") AND attributes:trace',
        );
        expect(GcpPubSubFilterFor(null)).toBeNull();
        expect(GcpPubSubFilterFor({ logic: 'and', filters: [] })).toBeNull();
        expect(NormalizeGcpPubSubFilter('  ')).toBeNull();
        expect(NormalizeGcpPubSubFilter(' attributes.a  =  "1" ')).toBe('attributes.a = "1"');
    });

    it('rejects unsupported filter structures and combination limits', () => {
        expect(() => ToGcpPubSubFilter({ logic: 'or', filters: [{ field: 'a', operator: 'eq', value: '1' }] })).toThrow(WorkQueueConfigurationError);
        expect(() => ToGcpPubSubFilter({ logic: 'and', filters: [] })).toThrow(WorkQueueConfigurationError);
        expect(() => ToGcpPubSubFilter({
            logic: 'and',
            filters: [
                { field: 'a', operator: 'eq', value: '1' },
                { field: 'a', operator: 'neq', value: '2' },
            ],
        })).toThrow(WorkQueueConfigurationError);

        const or = (field: string, count: number) => ({
            logic: 'or' as const,
            filters: Array.from({ length: count }, (_, i) => ({ field, operator: 'eq' as const, value: String(i) })),
        });
        expect(() => ToGcpPubSubFilter({
            logic: 'and',
            filters: [or('a', 6), or('b', 6), or('c', 5)],
        })).toThrow(WorkQueueConfigurationError);
    });
});
