import { describe, it, expect, beforeEach } from 'vitest';
import { ExpectedMaxDeliveryCount, RequiresPartitionedTopic, ValidateAzureBindings } from '../driver/bindingValidation';
import { ServiceBusRuleSqlFor } from '../filterSql';
import { FakeServiceBus } from '../testing/fakes';
import { SeedValidAzureResources, TestAzureResources, TestPolicy, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

const r = TestAzureResources(true);
let bus: FakeServiceBus;

beforeEach(() => {
    bus = new FakeServiceBus();
});

function messages(issues: { Severity: string; Message: string }[]): string[] {
    return issues.map((i) => `${i.Severity}: ${i.Message}`);
}

describe('ValidateAzureBindings', () => {
    it('passes a correctly provisioned topology', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
        SeedValidAzureResources(bus, topic, subscription);
        expect(await ValidateAzureBindings(bus, topic, [subscription])).toEqual([]);
        expect(ExpectedMaxDeliveryCount(TestPolicy({ MaxAttempts: 3 }))).toBe(8);
        expect(RequiresPartitionedTopic([subscription])).toBe(true);
    });

    it('reports missing entities and an unbound topic', async () => {
        const topic = TestTopicBinding(true);
        expect(messages(await ValidateAzureBindings(bus, topic, [TestSubscriptionBinding(true)]))).toEqual([
            `Error: Service Bus topic ${r.TopicName} does not exist`,
            `Error: Service Bus subscription ${r.TopicName}/${r.SubscriptionName} does not exist`,
        ]);
        const [unbound] = await ValidateAzureBindings(bus, TestTopicBinding(true, { Config: {} }), []);
        expect(unbound.Message).toMatch(/^TopicUnbound/);
    });

    it('flags session, lock, delivery-count and rule mismatches', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { LeaseSeconds: 120 } });
        bus.AddTopic(r.TopicName, { SupportOrdering: true, RequiresDuplicateDetection: false });
        bus.AddSubscription(r.TopicName, r.SubscriptionName, {
            MjSubscriptionName: 'email.unsubscribe', RequiresSession: false, LockDurationSeconds: 30, MaxDeliveryCount: 3,
            Rules: [{ Name: '$Default', Sql: '1=1' }, { Name: 'extra', Sql: null }],
        });
        expect(messages(await ValidateAzureBindings(bus, topic, [subscription]))).toEqual([
            'Warning: Topic does not enable duplicate detection; a redelivered publish with the same MessageID would be accepted twice',
            'Error: Subscription requiresSession is false but PartitionMode Exclusive needs true',
            "Error: Binding RequiresSession is true but the subscription's requiresSession is false; re-import bindings",
            'Warning: Subscription lockDuration 30s is below LeaseSeconds 120: policy drift — re-apply Terraform',
            'Warning: Subscription maxDeliveryCount is 3 but the policy expects 10 (MaxAttempts + 5): policy drift — re-apply Terraform',
            `Error: Rule '$Default' SQL is 1=1; expected ${ServiceBusRuleSqlFor(null, 'email.unsubscribe')}`,
            'Error: Subscription has extra rules (extra); rules OR together, so they bypass the MJ filter',
        ]);
    });

    it('rejects Ordered, a lease above the lock maximum, and an Exclusive subscription on a standard topic', async () => {
        const topic = TestTopicBinding(false);
        const ordered = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Ordered' } });
        const longLease = TestSubscriptionBinding(false, { Policy: { LeaseSeconds: 600 } });
        const exclusive = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } });
        SeedValidAzureResources(bus, topic, longLease);
        const issues = messages(await ValidateAzureBindings(bus, topic, [ordered, longLease, exclusive]));
        expect(issues).toContain('Error: Topic must be IsFifo: it has an Exclusive subscription (03 W7), and only partitioned topics publish with a SessionId');
        expect(issues).toContain('Error: Ordered requires the Database transport; this subscription cannot run on the Azure transport');
        expect(issues).toContain('Error: LeaseSeconds 600 exceeds the Service Bus lock maximum of 300 seconds');
        expect(issues).toContain('Error: Subscription requiresSession is false but PartitionMode Exclusive needs true');
    });
});
