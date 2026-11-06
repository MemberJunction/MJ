import { describe, it, expect } from 'vitest';
import { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from '../memory/InMemoryTransport';
import { BuildSubscriptionBinding, BuildTopicBinding, CONFORMANCE_CASES, ManualClock, RunConformanceChecks } from '../testing';
import type { ConformanceHarness } from '../testing';
import type { ITransportDriver } from '../transport';

function inMemoryHarness(overrides: Partial<ConformanceHarness> = {}): ConformanceHarness & { Disposed: ITransportDriver[] } {
    // A fresh clock per driver: cases run sequentially, so no case inherits time another one advanced.
    let clock = new ManualClock();
    const disposed: ITransportDriver[] = [];
    return {
        Capabilities: IN_MEMORY_TRANSPORT_CAPABILITIES,
        Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 },
        CreateDriver: async () => {
            clock = new ManualClock();
            return new InMemoryTransport({ Now: () => clock.Now() });
        },
        CreateTopic: async (_driver, name, topicOverrides) => BuildTopicBinding(name, topicOverrides),
        CreateSubscription: async (_driver, topic, name, subscriptionOverrides) => BuildSubscriptionBinding(topic, name, subscriptionOverrides),
        AdvanceTime: async (ms) => clock.Advance(ms),
        Dispose: async (driver) => {
            disposed.push(driver);
        },
        Disposed: disposed,
        ...overrides,
    };
}

describe('RunConformanceChecks', () => {
    it('passes every case against InMemoryTransport and disposes each driver', async () => {
        const harness = inMemoryHarness();
        const results = await RunConformanceChecks(harness);
        expect(results.map((result) => result.Id)).toEqual(CONFORMANCE_CASES.map((conformanceCase) => conformanceCase.Id));
        expect(results.filter((result) => result.Status === 'Failed')).toEqual([]);
        expect(results.every((result) => result.Status === 'Passed')).toBe(true);
        expect(harness.Disposed).toHaveLength(CONFORMANCE_CASES.length);
    });

    it('reports environment skips as Skipped with the reason, before the capability gate', async () => {
        const harness = inMemoryHarness({
            Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0, EnvironmentSkips: { C07: 'the emulator does not expire receipt handles' } },
        });
        const results = await RunConformanceChecks(harness);
        const c07 = results.find((result) => result.Id === 'C07');
        expect(c07).toMatchObject({ Status: 'Skipped', Detail: 'environment: the emulator does not expire receipt handles' });
        expect(results.filter((result) => result.Status === 'Skipped')).toHaveLength(1);
        expect(results.filter((result) => result.Status === 'Failed')).toEqual([]);
    });

    it('reports gated cases as Skipped with the reason', async () => {
        const harness = inMemoryHarness({ Capabilities: { ...IN_MEMORY_TRANSPORT_CAPABILITIES, SupportsOrdered: false, CancelPending: false } });
        const results = await RunConformanceChecks(harness);
        const byId = new Map(results.map((result) => [result.Id, result]));
        expect(byId.get('C14')).toMatchObject({ Status: 'Skipped', Detail: 'Transport does not support Ordered subscriptions', DurationMs: 0 });
        expect(byId.get('C18')?.Status).toBe('Skipped');
        expect(results.filter((result) => result.Status === 'Failed')).toEqual([]);
    });

    it('records failures without throwing and still disposes the driver', async () => {
        const harness = inMemoryHarness({ Traits: { ReleaseConsumesAttempt: true, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 } });
        const results = await RunConformanceChecks(harness);
        const release = results.find((result) => result.Id === 'C21');
        expect(release?.Status).toBe('Failed');
        expect(release?.Detail).toContain('attempt: expected 2 but got 1');
        expect(harness.Disposed).toHaveLength(CONFORMANCE_CASES.length);
    });
});
