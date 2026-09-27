import { describe, it, expect } from 'vitest';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import { AZURE_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { SdkServiceBusAdminGateway } from '../gateway/SdkServiceBusAdminGateway';
import { SdkServiceBusGateway } from '../gateway/SdkServiceBusGateway';
import { AzureTransportOperator } from '../operator/AzureTransportOperator';
import { FakeServiceBus } from '../testing/fakes';
import { SeedValidAzureResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

describe('AzureTransportDriver', () => {
    it('declares its name and capabilities and caches its operator', () => {
        const bus = new FakeServiceBus();
        const driver = new AzureTransportDriver(bus, bus);
        expect(driver.Name).toBe('Azure');
        expect(driver.Capabilities).toBe(AZURE_TRANSPORT_CAPABILITIES);
        expect(driver.Operator()).toBeInstanceOf(AzureTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
    });

    it('publishes to and consumes from Service Bus, and validates bindings', async () => {
        const bus = new FakeServiceBus();
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        SeedValidAzureResources(bus, topic, subscription);
        const driver = new AzureTransportDriver(bus, bus, { Now: () => bus.Now });
        const [result] = await driver.Publish(topic, [TestMessage(1, { PartitionKey: 'k' })], [subscription]);
        expect(result.Status).toBe('Accepted');
        const consumer = driver.OpenConsumer(subscription);
        const [delivery] = await consumer.Receive(1, 0, new AbortController().signal);
        expect(delivery.Message).toEqual(TestMessage(1, { PartitionKey: 'k' }));
        expect(await driver.ValidateBindings(topic, [subscription])).toEqual([]);
    });

    it('creates SDK-backed gateways from transport configuration', () => {
        const driver = AzureTransportDriver.Create({ FullyQualifiedNamespace: 'contoso.servicebus.windows.net' });
        expect(driver.Bus).toBeInstanceOf(SdkServiceBusGateway);
        expect(driver.Admin).toBeInstanceOf(SdkServiceBusAdminGateway);
    });
});
