import { describe, it, expect } from 'vitest';
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { GCP_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { GcpTransportDriver } from '../driver/GcpTransportDriver';
import { SdkPubSubAdminGateway } from '../gateway/SdkPubSubAdminGateway';
import { SdkPubSubGateway } from '../gateway/SdkPubSubGateway';
import { GcpTransportOperator } from '../operator/GcpTransportOperator';
import { FakePubSubGateway } from '../testing/fakes';
import {
    SeedValidGcpResources,
    TestGcpResources,
    TestGcpSubscriptionBinding,
    TestGcpTopicBinding,
    TestMessage,
} from '../testing/fixtures';
import { GcpConformanceHarness } from '../testing/GcpConformanceHarness';

describe('GcpTransportDriver', () => {
    it('declares its name and capabilities and caches its operator', () => {
        const fake = new FakePubSubGateway();
        const driver = new GcpTransportDriver(fake, fake, { ProjectId: fake.ProjectId });
        expect(driver.Name).toBe('GCP');
        expect(driver.Capabilities).toBe(GCP_TRANSPORT_CAPABILITIES);
        expect(driver.Operator()).toBeInstanceOf(GcpTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
    });

    it('publishes, validates, checks health, provisions topics/subscriptions, and closes cleanly', async () => {
        const fake = new FakePubSubGateway();
        const driver = new GcpTransportDriver(fake, fake, { Now: () => fake.Now, ProjectId: fake.ProjectId });
        const topic = TestGcpTopicBinding(true);
        const subscription = TestGcpSubscriptionBinding(true);
        SeedValidGcpResources(fake, topic, subscription);

        expect(await driver.CheckHealth()).toEqual({ Healthy: true, ProjectId: fake.ProjectId });

        fake.ThrowOnHealthCheck = new Error('network unreachable');
        expect(await driver.CheckHealth()).toEqual({
            Healthy: false,
            ProjectId: fake.ProjectId,
            Error: 'network unreachable',
        });
        fake.ThrowOnHealthCheck = null;

        const results = await driver.Publish(topic, [TestMessage(1)], [subscription]);
        expect(results).toEqual([{ MessageID: TestMessage(1).MessageID, Status: 'Accepted' }]);

        const consumer = driver.OpenConsumer(subscription);
        const [delivery] = await consumer.Receive(1, 0, new AbortController().signal);
        expect(delivery.Message).toEqual(TestMessage(1));
        expect(await consumer.Complete(delivery)).toEqual({ Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' });

        expect(await driver.ValidateBindings(topic, [subscription])).toEqual([]);

        await driver.EnsureTopic('provisioned-topic');
        await driver.EnsureSubscription('provisioned-topic', 'provisioned-sub', {
            EnableMessageOrdering: true,
            MaxDeliveryAttempts: 8,
        });
        expect(await fake.GetSubscription('provisioned-sub')).toMatchObject({
            EnableMessageOrdering: true,
            DeadLetterPolicy: null,
        });
        expect(await driver.DeleteSubscription('provisioned-sub')).toBe(true);
        expect(await driver.DeleteTopic('provisioned-topic')).toBe(true);

        await consumer.Close();
        await driver.Close();
    });

    it('creates SDK-backed gateways from transport configuration', async () => {
        const driver = GcpTransportDriver.Create({
            ProjectId: 'mj-wq-test',
            ApiEndpoint: 'localhost:8085',
            UseEmulator: true,
        });
        expect(driver.Gateway).toBeInstanceOf(SdkPubSubGateway);
        expect(driver.Admin).toBeInstanceOf(SdkPubSubAdminGateway);
        expect(TestGcpResources(true).EnableMessageOrdering).toBe(true);
        await driver.Close();
    });
});

RunTransportConformanceSuite('GcpTransportDriver (FakePubSubGateway)', new GcpConformanceHarness());
