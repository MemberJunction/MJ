import { describe, it, expect } from 'vitest';
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import { AZURE_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { SdkServiceBusAdminGateway } from '../gateway/SdkServiceBusAdminGateway';
import { SdkServiceBusGateway } from '../gateway/SdkServiceBusGateway';
import { AzureTransportOperator } from '../operator/AzureTransportOperator';
import { AzureConformanceHarness } from '../testing/AzureConformanceHarness';
import { FakeServiceBusGateway } from '../testing/fakes';
import {
    SeedValidAzureResources,
    TestAzureResources,
    TestAzureSubscriptionBinding,
    TestAzureTopicBinding,
    TestMessage,
} from '../testing/fixtures';

describe('AzureTransportDriver', () => {
    it('declares its name and capabilities and caches its operator', () => {
        const fake = new FakeServiceBusGateway();
        const driver = new AzureTransportDriver(fake, fake);
        expect(driver.Name).toBe('Azure');
        expect(driver.Capabilities).toBe(AZURE_TRANSPORT_CAPABILITIES);
        expect(driver.Operator()).toBeInstanceOf(AzureTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
    });

    it('publishes, validates, checks health, provisions topics/subscriptions, and closes cleanly', async () => {
        const fake = new FakeServiceBusGateway();
        const driver = new AzureTransportDriver(fake, fake, { Now: () => fake.Now });
        const topic = TestAzureTopicBinding(true);
        const subscription = TestAzureSubscriptionBinding(true);
        SeedValidAzureResources(fake, topic, subscription);

        const health = await driver.CheckHealth();
        expect(health).toEqual({ Healthy: true, Namespace: fake.Namespace, MessagingSku: 'Standard' });

        fake.ThrowOnHealthCheck = new Error('network unreachable');
        expect(await driver.CheckHealth()).toEqual({
            Healthy: false,
            Namespace: null,
            MessagingSku: null,
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

        // Provisioning helpers
        await driver.EnsureTopic('provisioned-topic');
        await driver.EnsureSubscription('provisioned-topic', 'provisioned-sub', { RequiresSession: true, MaxDeliveryCount: 8 });
        expect(await fake.GetSubscription('provisioned-topic', 'provisioned-sub')).toMatchObject({ RequiresSession: true, MaxDeliveryCount: 8 });
        expect(await driver.DeleteSubscription('provisioned-topic', 'provisioned-sub')).toBe(true);
        expect(await driver.DeleteTopic('provisioned-topic')).toBe(true);

        await consumer.Close();
        await driver.Close();
    });

    it('creates SDK-backed gateways from transport configuration', async () => {
        const driver = AzureTransportDriver.Create(
            { Namespace: 'mj-wq-test.servicebus.windows.net', Endpoint: null, UseEmulator: false },
            { ConnectionString: 'Endpoint=sb://mj-wq-test.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=dGVzdGtleQ==' },
        );
        expect(driver.Gateway).toBeInstanceOf(SdkServiceBusGateway);
        expect(driver.Admin).toBeInstanceOf(SdkServiceBusAdminGateway);
        expect(TestAzureResources(true).RequiresSession).toBe(true);
        await driver.Close();
    });
});

RunTransportConformanceSuite('AzureTransportDriver (FakeServiceBusGateway)', new AzureConformanceHarness());
