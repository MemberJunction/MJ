import { describe, it, expect } from 'vitest';
import { AwsTransportDriver } from '../driver/AwsTransportDriver';
import { AWS_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { SdkSnsGateway } from '../gateway/SdkSnsGateway';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { FakeSnsGateway, FakeSqsGateway } from '../testing/fakes';
import { SeedValidAwsResources, TestAwsResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

describe('AwsTransportDriver', () => {
    it('declares its name and capabilities and caches its operator', () => {
        const driver = new AwsTransportDriver(new FakeSnsGateway(), new FakeSqsGateway());
        expect(driver.Name).toBe('AWS');
        expect(driver.Capabilities).toBe(AWS_TRANSPORT_CAPABILITIES);
        expect(driver.Operator()).toBeInstanceOf(AwsTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
    });

    it('publishes through SNS and consumes through SQS', async () => {
        const sns = new FakeSnsGateway();
        const sqs = new FakeSqsGateway();
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        const driver = new AwsTransportDriver(sns, sqs, { Now: () => sqs.Now });
        const results = await driver.Publish(topic, [TestMessage(1)], [subscription]);
        expect(results[0].Status).toBe('Accepted');
        expect(sns.Batches).toHaveLength(1);
        const entry = sns.Batches[0].Entries[0];
        await sqs.Send({ QueueUrl: TestAwsResources(true).QueueUrl, Body: entry.Message, MessageGroupId: entry.MessageGroupId, MessageDeduplicationId: entry.MessageDeduplicationId });
        const consumer = driver.OpenConsumer(subscription);
        const [delivery] = await consumer.Receive(1, 0, new AbortController().signal);
        expect(delivery.Message).toEqual(TestMessage(1));
    });

    it('validates bindings', async () => {
        const sns = new FakeSnsGateway();
        const sqs = new FakeSqsGateway();
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        expect(await new AwsTransportDriver(sns, sqs).ValidateBindings(topic, [subscription])).toEqual([]);
    });

    it('creates SDK-backed gateways from transport configuration', () => {
        const driver = AwsTransportDriver.Create({ Region: 'us-east-1', Endpoint: 'http://localhost:4566' });
        expect(driver.Sns).toBeInstanceOf(SdkSnsGateway);
        expect(driver.Sqs).toBeInstanceOf(SdkSqsGateway);
    });
});
