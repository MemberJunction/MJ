import { describe, expect, it } from 'vitest';
import {
    buildWorkQueueAgentContext, formatAge, isValidPartitionCondition, isValidWorkQueueTab, needsAttention,
    resolveSubscription, sortByAttention, type WorkQueueSubscriptionSnapshot,
} from '../work-queue-agent-context';

function snapshot(overrides: Partial<WorkQueueSubscriptionSnapshot>): WorkQueueSubscriptionSnapshot {
    return {
        ID: '00000000-0000-4000-8000-000000000001', Name: 'samples.hello-log', Topic: 'samples.hello', Transport: 'Database',
        PartitionMode: 'None', Status: 'Active', Pending: 0, InFlight: 0, DeadLettered: 0, BlockedKeys: null, OldestPendingAgeSeconds: null,
        ...overrides,
    };
}

describe('tab and condition validators', () => {
    it('accept only the known values', () => {
        expect(isValidWorkQueueTab('dead-letters')).toBe(true);
        expect(isValidWorkQueueTab('jobs')).toBe(false);
        expect(isValidPartitionCondition('Blocked')).toBe(true);
        expect(isValidPartitionCondition('blocked')).toBe(false);
    });
});

describe('needsAttention and sortByAttention', () => {
    it('flags dead letters or blocked keys and sorts them first, then by name', () => {
        const quiet = snapshot({ Name: 'a.quiet' });
        const dead = snapshot({ Name: 'z.dead', DeadLettered: 2 });
        const blocked = snapshot({ Name: 'm.blocked', BlockedKeys: 1 });
        expect(needsAttention(quiet)).toBe(false);
        expect(needsAttention(dead)).toBe(true);
        expect(sortByAttention([quiet, dead, blocked]).map((s) => s.Name)).toEqual(['m.blocked', 'z.dead', 'a.quiet']);
    });
});

describe('formatAge', () => {
    it('picks the coarsest useful unit', () => {
        expect(formatAge(null)).toBe('—');
        expect(formatAge(45)).toBe('45s');
        expect(formatAge(185)).toBe('3m');
        expect(formatAge(7500)).toBe('2h 5m');
        expect(formatAge(90000)).toBe('1d 1h');
    });
});

describe('resolveSubscription', () => {
    const items = [
        { ID: '00000000-0000-4000-8000-000000000001', Name: 'samples.hello-log' },
        { ID: '00000000-0000-4000-8000-000000000002', Name: 'samples.hello-ordered' },
        { ID: '00000000-0000-4000-8000-000000000003', Name: 'demo.orders-print' },
    ];

    it('matches by id in either case, by exact name, or by a unique substring', () => {
        expect(resolveSubscription(items, '00000000-0000-4000-8000-000000000002'.toUpperCase())).toMatchObject({ Kind: 'Match', Item: items[1] });
        expect(resolveSubscription(items, 'Samples.Hello-Log')).toMatchObject({ Kind: 'Match', Item: items[0] });
        expect(resolveSubscription(items, 'orders')).toMatchObject({ Kind: 'Match', Item: items[2] });
    });

    it('reports ambiguity and misses instead of guessing', () => {
        expect(resolveSubscription(items, 'hello')).toMatchObject({ Kind: 'Ambiguous' });
        expect(resolveSubscription(items, 'nothing')).toEqual({ Kind: 'NotFound' });
        expect(resolveSubscription(items, '  ')).toEqual({ Kind: 'NotFound' });
    });
});

describe('buildWorkQueueAgentContext', () => {
    it('publishes null totals before stats load and real totals after', () => {
        const subs = [snapshot({ Pending: 3, DeadLettered: 1 }), snapshot({ Name: 'b', Pending: 2, BlockedKeys: 2 })];
        const before = buildWorkQueueAgentContext({
            ActiveTab: 'overview', Subscriptions: subs, StatsFailures: [], StatsLoaded: false, SelectedSubscription: null,
            PartitionCondition: null, DeadLetterCount: null, SelectedDeadLetterCount: 0, BindingErrorCount: null, BindingWarningCount: null, LastRefreshedAt: null,
        });
        expect(before['Totals']).toBeNull();
        const after = buildWorkQueueAgentContext({
            ActiveTab: 'dead-letters', Subscriptions: subs, StatsFailures: ['x: boom'], StatsLoaded: true, SelectedSubscription: 'b',
            PartitionCondition: 'Blocked', DeadLetterCount: 4, SelectedDeadLetterCount: 1, BindingErrorCount: null, BindingWarningCount: null, LastRefreshedAt: '2026-09-25T00:00:00Z',
        });
        expect(after['Totals']).toEqual({ Pending: 5, InFlight: 0, DeadLettered: 1, BlockedKeys: 2 });
        expect(after['SubscriptionsNeedingAttentionCount']).toBe(2);
        expect(after['DeadLetterCount']).toBe(4);
        expect(after['PartitionCondition']).toBeUndefined();
        expect(after['ActiveTabLabel']).toBe('Dead Letters');
    });
});
