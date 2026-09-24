import { describe, it, expect } from 'vitest';
import { CompositeFilter } from '@memberjunction/core';
import { MatchesFilter, ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';

/**
 * Core ships its own evaluator because work-queue-core may not depend on @memberjunction/core (03 §0, §4.3). The
 * engine can, so this is where the two are held together: for every case, core's MatchesFilter must agree with MJ's
 * CompositeFilter.Evaluate. Case-insensitive fixtures are deliberately absent — work-queue matching is
 * case-sensitive to match the brokers, and that divergence is the point of 03 §4.3 item 3.
 */
const CASES: { Name: string; Filter: string; Attributes: Record<string, string> }[] = [
    {
        Name: 'single eq match',
        Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"}]}',
        Attributes: { eventType: 'click' },
    },
    {
        Name: 'single eq miss',
        Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"}]}',
        Attributes: { eventType: 'open' },
    },
    {
        Name: 'and across fields',
        Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"},{"field":"tenant","operator":"eq","value":"acme"}]}',
        Attributes: { eventType: 'click', tenant: 'acme' },
    },
    {
        Name: 'single-field or group, second value',
        Filter: '{"logic":"and","filters":[{"logic":"or","filters":[{"field":"tenant","operator":"eq","value":"acme"},{"field":"tenant","operator":"eq","value":"globex"}]}]}',
        Attributes: { tenant: 'globex' },
    },
    {
        Name: 'neq on a present attribute',
        Filter: '{"logic":"and","filters":[{"field":"source","operator":"neq","value":"test"}]}',
        Attributes: { source: 'live' },
    },
    {
        Name: 'startswith prefix match',
        Filter: '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}',
        Attributes: { tenant: 'acme-eu' },
    },
    {
        Name: 'isnotnull with the attribute present',
        Filter: '{"logic":"and","filters":[{"field":"campaign","operator":"isnotnull"}]}',
        Attributes: { campaign: 'spring' },
    },
    {
        Name: 'isnull with the attribute absent',
        Filter: '{"logic":"and","filters":[{"field":"campaign","operator":"isnull"}]}',
        Attributes: { eventType: 'click' },
    },
    {
        Name: 'missing attribute fails eq',
        Filter: '{"logic":"and","filters":[{"field":"campaign","operator":"eq","value":"spring"}]}',
        Attributes: {},
    },
];

describe('filter parity with @memberjunction/core CompositeFilter', () => {
    for (const testCase of CASES) {
        it(`agrees on: ${testCase.Name}`, () => {
            const ours = MatchesFilter(ParseSubscriptionFilter(testCase.Filter, WORK_QUEUE_FILTER_SUPPORT), testCase.Attributes);
            const theirs = CompositeFilter.FromJSON(testCase.Filter).Evaluate({ '': testCase.Attributes });
            expect(ours, `${testCase.Name}: work-queue evaluator`).toBe(theirs);
        });
    }

    it('is case-sensitive where CompositeFilter is not (the one deliberate divergence, 03 §4.3)', () => {
        const filter = '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"Click"}]}';
        const attributes = { eventType: 'click' };
        expect(MatchesFilter(ParseSubscriptionFilter(filter, WORK_QUEUE_FILTER_SUPPORT), attributes)).toBe(false);
        expect(CompositeFilter.FromJSON(filter).Evaluate({ '': attributes })).toBe(true);
    });
});
