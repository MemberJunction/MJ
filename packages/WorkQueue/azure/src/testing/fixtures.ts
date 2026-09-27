import type {
    HostType, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { ExpectedMaxDeliveryCount } from '../driver/bindingValidation';
import type { FakeServiceBus } from './fakes';

export interface TestAzureResourceSet {
    FullyQualifiedNamespace: string;
    TopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
}

export interface TestSubscriptionOptions {
    Policy?: Partial<SubscriptionPolicy>;
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
}

const NAMESPACE = 'mj-test.servicebus.windows.net';

export function TestAzureResources(isFifo: boolean): TestAzureResourceSet {
    return { FullyQualifiedNamespace: NAMESPACE, TopicName: 'mj-wq-test-email-events', SubscriptionName: 'email-unsubscribe', RequiresSession: isFifo };
}

export function TestPolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'email.unsubscribe', TopicName: 'email.events', PartitionMode: 'Exclusive',
        MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function TestTopicBinding(isFifo: boolean = true, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return { TopicName: 'email.events', IsFifo: isFifo, MaxPayloadBytes: 262_144, Config: { TopicName: TestAzureResources(isFifo).TopicName }, ...overrides };
}

export function TestSubscriptionBinding(isFifo: boolean = true, options: TestSubscriptionOptions = {}): SubscriptionBinding {
    const r = TestAzureResources(isFifo);
    return {
        Policy: TestPolicy({ ...(isFifo ? {} : { PartitionMode: 'None' }), ...options.Policy }),
        Filter: options.Filter ?? null,
        HostType: options.HostType ?? 'External',
        Config: options.Config ?? { FullyQualifiedNamespace: r.FullyQualifiedNamespace, TopicName: r.TopicName, SubscriptionName: r.SubscriptionName, RequiresSession: r.RequiresSession },
    };
}

export function TestMessage(index: number, overrides: Partial<WorkMessage> = {}): WorkMessage {
    return {
        MessageID: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        Topic: 'email.events',
        Attributes: { eventType: 'unsubscribe' },
        Payload: { index },
        PublishedAt: '2026-09-16T12:00:00.000Z',
        ...overrides,
    };
}

/** Creates the topic, subscription and rule exactly as the Terraform module would. */
export function SeedValidAzureResources(bus: FakeServiceBus, topic: TopicBinding, subscription: SubscriptionBinding): void {
    const r = TestAzureResources(topic.IsFifo);
    bus.AddTopic(r.TopicName, { SupportOrdering: topic.IsFifo, RequiresDuplicateDetection: true });
    bus.AddSubscription(r.TopicName, r.SubscriptionName, {
        MjSubscriptionName: subscription.Policy.SubscriptionName,
        RequiresSession: subscription.Policy.PartitionMode === 'Exclusive',
        LockDurationSeconds: subscription.Policy.LeaseSeconds,
        MaxDeliveryCount: ExpectedMaxDeliveryCount(subscription.Policy),
        Filter: subscription.Filter,
    });
}
