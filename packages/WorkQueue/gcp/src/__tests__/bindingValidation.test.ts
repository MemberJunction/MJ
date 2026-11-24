import { describe, it, expect } from 'vitest';
import { ValidateGcpBindings } from '../driver/bindingValidation';
import { FakePubSubGateway } from '../testing/fakes';
import {
    SeedValidGcpResources,
    TestGcpResources,
    TestGcpSubscriptionBinding,
    TestGcpTopicBinding,
} from '../testing/fixtures';

describe('ValidateGcpBindings', () => {
    it('returns no issues when topic, subscription, ordering, filter, and DLQ match topology', async () => {
        const fake = new FakePubSubGateway();
        const topic = TestGcpTopicBinding(true);
        const sub = TestGcpSubscriptionBinding(true, {
            Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] },
        });
        SeedValidGcpResources(fake, topic, sub);
        expect(await ValidateGcpBindings(fake, topic, [sub])).toEqual([]);
    });

    it('reports errors for Ordered mode, missing topics/subscriptions, ordering mismatches, and filter drift', async () => {
        const fake = new FakePubSubGateway();
        const topic = TestGcpTopicBinding(false);
        const orderedSub = TestGcpSubscriptionBinding(false, { Policy: { PartitionMode: 'Ordered' } });
        const missingTopicIssues = await ValidateGcpBindings(fake, topic, [orderedSub]);
        expect(missingTopicIssues.some((i) => i.Severity === 'Error' && i.Message.includes('does not exist'))).toBe(true);
        expect(missingTopicIssues.some((i) => i.Severity === 'Error' && i.Message.includes('Ordered requires the Database transport'))).toBe(true);

        const r = TestGcpResources(false);
        fake.AddTopic(r.TopicName);
        const exclusiveSub = TestGcpSubscriptionBinding(true);
        const fifoIssues = await ValidateGcpBindings(fake, topic, [exclusiveSub]);
        expect(fifoIssues.some((i) => i.Message.includes('IsFifo=true'))).toBe(true);

        fake.AddSubscription(r.TopicName, r.SubscriptionName, {
            EnableMessageOrdering: true,
            Filter: 'attributes.eventType = "other"',
            AckDeadlineSeconds: 10,
            MaxDeliveryAttempts: 5,
            DeadLetterTopicName: r.DeadLetterTopicName,
        });
        const normalSub = TestGcpSubscriptionBinding(false, {
            Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] },
            Policy: { LeaseSeconds: 60, MaxAttempts: 5 },
        });
        const driftIssues = await ValidateGcpBindings(fake, topic, [normalSub]);
        expect(driftIssues.some((i) => i.Severity === 'Error' && i.Message.includes('EnableMessageOrdering'))).toBe(true);
        expect(driftIssues.some((i) => i.Severity === 'Error' && i.Message.includes('differs from the subscription filter'))).toBe(true);
        expect(driftIssues.some((i) => i.Severity === 'Warning' && i.Message.includes('AckDeadlineSeconds'))).toBe(true);
    });
});
