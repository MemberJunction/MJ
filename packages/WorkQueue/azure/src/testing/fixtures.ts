import type {
    HostType, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { ExpectedMaxDeliveryCount } from '../driver/bindingValidation';
import { AzureSqlFilterFor } from '../filterPolicy';
import type { FakeServiceBusGateway } from './fakes';

export interface TestAzureResourceSet {
    Namespace: string;
    ServiceBusTopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
}

export interface TestAzureSubscriptionOptions {
    Policy?: Partial<SubscriptionPolicy>;
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
}

const NAMESPACE = 'mj-wq-test.servicebus.windows.net';

export function TestAzureResources(requiresSession: boolean): TestAzureResourceSet {
    return {
        Namespace: NAMESPACE,
        ServiceBusTopicName: requiresSession ? 'mj-wq-test-email-events-session' : 'mj-wq-test-email-events',
        SubscriptionName: requiresSession ? 'email-unsubscribe-session' : 'email-unsubscribe',
        RequiresSession: requiresSession,
    };
}

export function TestAzurePolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'email.unsubscribe',
        TopicName: 'email.events',
        PartitionMode: 'Exclusive',
        MaxAttempts: 5,
        BackoffBaseSeconds: 10,
        BackoffMaxSeconds: 900,
        LeaseSeconds: 60,
        HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function TestAzureTopicBinding(requiresSession = true, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'email.events',
        IsFifo: requiresSession,
        MaxPayloadBytes: 262_144,
        Config: { ServiceBusTopicName: TestAzureResources(requiresSession).ServiceBusTopicName },
        ...overrides,
    };
}

export function TestAzureSubscriptionBinding(
    requiresSession = true,
    options: TestAzureSubscriptionOptions = {},
): SubscriptionBinding {
    const r = TestAzureResources(requiresSession);
    return {
        Policy: TestAzurePolicy({ ...(requiresSession ? {} : { PartitionMode: 'None' }), ...options.Policy }),
        Filter: options.Filter ?? null,
        HostType: options.HostType ?? 'External',
        Config: options.Config ?? {
            Namespace: r.Namespace,
            ServiceBusTopicName: r.ServiceBusTopicName,
            SubscriptionName: r.SubscriptionName,
            RequiresSession: requiresSession,
            LockDurationSeconds: options.Policy?.LeaseSeconds ?? 60,
        },
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

/** Seeds topic, subscription, and SQL filter rule into FakeServiceBusGateway matching binding validation rules. */
export function SeedValidAzureResources(
    gateway: FakeServiceBusGateway,
    topic: TopicBinding,
    subscription: SubscriptionBinding,
): void {
    const topicName = String(topic.Config['ServiceBusTopicName']);
    const subName = String(subscription.Config['SubscriptionName']);
    const sqlExpr = AzureSqlFilterFor(subscription.Filter) ?? '1=1';
    gateway.AddTopic(topicName);
    gateway.AddSubscription(topicName, subName, {
        RequiresSession: topic.IsFifo,
        MaxDeliveryCount: ExpectedMaxDeliveryCount(subscription.Policy),
        LockDurationSeconds: subscription.Policy.LeaseSeconds,
        SqlFilterExpression: sqlExpr,
        Filter: subscription.Filter,
    });
}
