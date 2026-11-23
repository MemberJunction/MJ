import { describe, it, expect, beforeEach } from 'vitest';
import { ExpectedMaxDeliveryCount, RequiresSessionTopic, ValidateAzureBindings } from '../driver/bindingValidation';
import { FakeServiceBusGateway } from '../testing/fakes';
import {
    SeedValidAzureResources,
    TestAzurePolicy,
    TestAzureResources,
    TestAzureSubscriptionBinding,
    TestAzureTopicBinding,
} from '../testing/fixtures';

let fake: FakeServiceBusGateway;

beforeEach(() => {
    fake = new FakeServiceBusGateway();
});

function messages(issues: { Severity: string; Message: string }[]): string[] {
    return issues.map((issue) => `${issue.Severity}: ${issue.Message}`);
}

describe('ExpectedMaxDeliveryCount and RequiresSessionTopic', () => {
    it('uses MaxAttempts + 5 for every subscription', () => {
        expect(ExpectedMaxDeliveryCount(TestAzurePolicy({ MaxAttempts: 5, PartitionMode: 'Exclusive' }))).toBe(10);
        expect(ExpectedMaxDeliveryCount(TestAzurePolicy({ MaxAttempts: 1, PartitionMode: 'None' }))).toBe(6);
    });

    it('requires sessions as soon as one subscription is Exclusive', () => {
        const none = TestAzureSubscriptionBinding(false, { Policy: { PartitionMode: 'None' } });
        expect(RequiresSessionTopic([none])).toBe(false);
        expect(RequiresSessionTopic([none, TestAzureSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } })])).toBe(true);
    });
});

describe('ValidateAzureBindings', () => {
    it('reports nothing for valid provisioned resources and matching SQL filter', async () => {
        const topic = TestAzureTopicBinding(true);
        const sub = TestAzureSubscriptionBinding(true, {
            Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] },
        });
        SeedValidAzureResources(fake, topic, sub);
        expect(await ValidateAzureBindings(fake, topic, [sub])).toEqual([]);
    });

    it('reports unbound and missing topics and missing subscriptions', async () => {
        const unbound = await ValidateAzureBindings(fake, TestAzureTopicBinding(true, { Config: {} }), []);
        expect(messages(unbound)).toEqual([expect.stringMatching(/^Error: TopicUnbound: .*'ServiceBusTopicName'/)]);

        const topic = TestAzureTopicBinding(true);
        const missing = await ValidateAzureBindings(fake, topic, []);
        expect(messages(missing)).toEqual([`Error: Azure Service Bus topic ${TestAzureResources(true).ServiceBusTopicName} does not exist`]);

        fake.AddTopic(TestAzureResources(true).ServiceBusTopicName);
        const sub = TestAzureSubscriptionBinding(true);
        expect(messages(await ValidateAzureBindings(fake, topic, [sub]))).toEqual([
            `Error: Azure Service Bus subscription ${TestAzureResources(true).ServiceBusTopicName}/${TestAzureResources(true).SubscriptionName} does not exist`,
        ]);
    });

    it('rejects Ordered subscriptions and reports session, maxDeliveryCount, lock duration, and SQL filter drift', async () => {
        const topic = TestAzureTopicBinding(true);
        const ordered = TestAzureSubscriptionBinding(true, { Policy: { PartitionMode: 'Ordered' } });
        SeedValidAzureResources(fake, topic, ordered);
        expect(messages(await ValidateAzureBindings(fake, topic, [ordered]))).toEqual([
            'Error: Ordered requires the Database transport; this subscription cannot run on the Azure Service Bus transport',
        ]);

        const sub = TestAzureSubscriptionBinding(true, {
            Policy: { MaxAttempts: 5, LeaseSeconds: 120 },
            Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] },
        });
        const r = TestAzureResources(true);
        fake.AddTopic(r.ServiceBusTopicName);
        fake.AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, {
            RequiresSession: false,
            MaxDeliveryCount: 7,
            LockDurationSeconds: 60,
            SqlFilterExpression: "user.[eventType] = 'click'",
        });

        expect(messages(await ValidateAzureBindings(fake, topic, [sub]))).toEqual([
            'Error: Azure Service Bus subscription RequiresSession is false but the binding says true',
            'Warning: MaxDeliveryCount is 7 but the policy expects 10 (MaxAttempts + 5)',
            'Warning: Subscription LockDuration 60s is below LeaseSeconds 120s',
            "Error: Service Bus subscription SQL filter user.[eventType] = 'click' differs from the subscription filter user.[eventType] = 'unsubscribe'",
        ]);
    });
});
