import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import { BuildSubscriptionBinding, BuildTopicBinding, type ConformanceHarness, type ConformanceTraits, type SubscriptionBindingOverrides } from '@memberjunction/work-queue-core/testing';
import { ExpectedMaxDeliveryCount } from '../driver/bindingValidation';
import { AZURE_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import { AzureEntityName } from '../names';
import { FakeServiceBus } from './fakes';

const NAMESPACE = 'mj-fake.servicebus.windows.net';

/**
 * Runs core's transport conformance cases against the in-memory FakeServiceBus: every case the Azure transport
 * claims to support passes here without a namespace. The real-service run (`pnpm run test:servicebus`) is what
 * proves the SDK gateways; this proves the consumer, operator and driver logic on top of them.
 */
export class FakeServiceBusHarness implements ConformanceHarness {
    public readonly Capabilities = AZURE_TRANSPORT_CAPABILITIES;
    public readonly Traits: ConformanceTraits = { ReleaseConsumesAttempt: true, ExpiredLeaseDeadLetters: false, ReceiveWaitSeconds: 0 };
    public readonly Bus = new FakeServiceBus();

    public async CreateDriver(): Promise<ITransportDriver> {
        return new AzureTransportDriver(this.Bus, this.Bus, { Now: () => this.Bus.Now });
    }

    public async CreateTopic(_driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> {
        const binding = BuildTopicBinding(name, overrides);
        const topicName = AzureEntityName('wqc', 'fake', name, 'Topic');
        this.Bus.AddTopic(topicName, { SupportOrdering: binding.IsFifo, RequiresDuplicateDetection: true });
        return { ...binding, Config: { TopicName: topicName } };
    }

    public async CreateSubscription(_driver: ITransportDriver, topic: TopicBinding, name: string, overrides: SubscriptionBindingOverrides = {}): Promise<SubscriptionBinding> {
        const binding = BuildSubscriptionBinding(topic, name, overrides);
        const topicName = String(topic.Config['TopicName']);
        const subscriptionName = AzureEntityName('wqc', 'fake', name, 'Subscription');
        const requiresSession = binding.Policy.PartitionMode === 'Exclusive';
        this.Bus.AddSubscription(topicName, subscriptionName, {
            MjSubscriptionName: name, RequiresSession: requiresSession, LockDurationSeconds: binding.Policy.LeaseSeconds,
            MaxDeliveryCount: ExpectedMaxDeliveryCount(binding.Policy), Filter: binding.Filter,
        });
        return { ...binding, Config: { FullyQualifiedNamespace: NAMESPACE, TopicName: topicName, SubscriptionName: subscriptionName, RequiresSession: requiresSession } };
    }

    public async AdvanceTime(ms: number): Promise<void> {
        this.Bus.Now += ms;
    }
}
