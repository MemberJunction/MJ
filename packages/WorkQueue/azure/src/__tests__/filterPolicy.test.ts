import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { AzureSqlFilterFor, NormalizeAzureSqlFilter, ToAzureSqlFilter } from '../filterPolicy';

describe('Azure Service Bus SQL filter translation', () => {
    it('translates eq, neq, startswith, isnull, isnotnull, and single-field OR groups deterministically', () => {
        const filter: SubscriptionFilter = {
            logic: 'and',
            filters: [
                { field: 'eventType', operator: 'eq', value: "bounce's" },
                { field: 'region', operator: 'neq', value: 'eu' },
                { field: 'domain', operator: 'startswith', value: 'acme_%' },
                { field: 'legacy', operator: 'isnull' },
                { field: 'tenant', operator: 'isnotnull' },
                {
                    logic: 'or',
                    filters: [
                        { field: 'tier', operator: 'eq', value: 'pro' },
                        { field: 'tier', operator: 'eq', value: 'enterprise' },
                    ],
                },
            ],
        };
        const sql = ToAzureSqlFilter(filter);
        expect(sql).toBe(
            "user.[domain] LIKE 'acme[_][%]%' AND user.[eventType] = 'bounce''s' AND NOT EXISTS(user.[legacy]) " +
            "AND (EXISTS(user.[region]) AND user.[region] <> 'eu') AND EXISTS(user.[tenant]) " +
            "AND user.[tier] IN ('enterprise', 'pro')",
        );
    });

    it('returns null for null/empty filters and normalizes default 1=1 rules', () => {
        expect(AzureSqlFilterFor(null)).toBeNull();
        expect(AzureSqlFilterFor({ logic: 'and', filters: [] })).toBeNull();
        expect(NormalizeAzureSqlFilter(null)).toBeNull();
        expect(NormalizeAzureSqlFilter('1=1')).toBeNull();
        expect(NormalizeAzureSqlFilter('1 = 1')).toBeNull();
        expect(NormalizeAzureSqlFilter("user.[a] = '1'")).toBe("user.[a] = '1'");
    });

    it('rejects unsupported filter structures and excessive combinations', () => {
        expect(() => ToAzureSqlFilter({ logic: 'or', filters: [] })).toThrow(WorkQueueConfigurationError);
        expect(() => ToAzureSqlFilter({ logic: 'and', filters: [] })).toThrow(WorkQueueConfigurationError);
        expect(() => ToAzureSqlFilter({
            logic: 'and',
            filters: [
                { field: 'a', operator: 'eq', value: '1' },
                { field: 'a', operator: 'eq', value: '2' },
            ],
        })).toThrow(WorkQueueConfigurationError);
        const or = (field: string, count: number) => ({
            logic: 'or' as const,
            filters: Array.from({ length: count }, (_, i) => ({ field, operator: 'eq' as const, value: String(i) })),
        });
        expect(() => ToAzureSqlFilter({ logic: 'and', filters: [or('a', 6), or('b', 6), or('c', 5)] })).toThrow('150');
    });
});
