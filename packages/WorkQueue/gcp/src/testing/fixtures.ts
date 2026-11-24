import type {
    HostType, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { ExpectedMaxDeliveryAttempts } from '../driver/bindingValidation';
import { GcpPubSubFilterFor } from '../filterPolicy';
import type { FakePubSubGateway } from './fakes';

export interface TestGcpResourceSet {
    ProjectId: string;
    TopicName: string;
    SubscriptionName: string;
    DeadLetterTopicName: string;
    DeadLetterSubscriptionName: string;
    EnableMessageOrdering: boolean;
}

export interface TestGcpSubscriptionOptions {
    Policy?: Partial<SubscriptionPolicy>;
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
}

const PROJECT_ID = 'mj-wq-test';

export function TestGcpResources(enableOrdering: boolean): TestGcpResourceSet {
    const suffix = enableOrdering ? '-ordered' : '';
    return {
        ProjectId: PROJECT_ID,
        TopicName: `mj-wq-test-email-events${suffix}`,
        SubscriptionName: `mj-wq-test-email-unsubscribe${suffix}`,
        DeadLetterTopicName: `mj-wq-test-email-events${suffix}-dlq`,
        DeadLetterSubscriptionName: `mj-wq-test-email-unsubscribe${suffix}-dlq-sub`,
        EnableMessageOrdering: enableOrdering,
    };
}

export function TestGcpPolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'email.unsubscribe',
        TopicName: 'email.events',
        PartitionMode: 'Exclusive',
        MaxAttempts: 5,
        BackoffBaseSeconds: 10,
        BackoffMaxSeconds: 600,
        LeaseSeconds: 60,
        HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function TestGcpTopicBinding(enableOrdering = true, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'email.events',
        IsFifo: enableOrdering,
        MaxPayloadBytes: 262_144,
        Config: {
            ProjectId: PROJECT_ID,
            TopicName: TestGcpResources(enableOrdering).TopicName,
        },
        ...overrides,
    };
}

export function TestGcpSubscriptionBinding(
    enableOrdering = true,
    options: TestGcpSubscriptionOptions = {},
): SubscriptionBinding {
    const r = TestGcpResources(enableOrdering);
    return {
        Policy: TestGcpPolicy({ ...(enableOrdering ? {} : { PartitionMode: 'None' }), ...options.Policy }),
        Filter: options.Filter ?? null,
        HostType: options.HostType ?? 'External',
        Config: options.Config ?? {
            ProjectId: r.ProjectId,
            TopicName: r.TopicName,
            SubscriptionName: r.SubscriptionName,
            DeadLetterTopicName: r.DeadLetterTopicName,
            DeadLetterSubscriptionName: r.DeadLetterSubscriptionName,
            EnableMessageOrdering: enableOrdering,
            AckDeadlineSeconds: options.Policy?.LeaseSeconds ?? 60,
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

/** Seeds topic, subscription, DLQ topic/subscription, and filter into FakePubSubGateway matching validation rules. */
export function SeedValidGcpResources(
    gateway: FakePubSubGateway,
    topic: TopicBinding,
    subscription: SubscriptionBinding,
): void {
    const topicName = String(topic.Config['TopicName']);
    const subName = String(subscription.Config['SubscriptionName']);
    const dlqTopic = typeof subscription.Config['DeadLetterTopicName'] === 'string'
        ? subscription.Config['DeadLetterTopicName']
        : `${topicName}-dlq`;
    const dlqSub = typeof subscription.Config['DeadLetterSubscriptionName'] === 'string'
        ? subscription.Config['DeadLetterSubscriptionName']
        : `${subName}-dlq-sub`;
    const filterExpr = GcpPubSubFilterFor(subscription.Filter);

    gateway.AddTopic(topicName);
    gateway.AddTopic(dlqTopic);
    gateway.AddSubscription(dlqTopic, dlqSub, {
        EnableMessageOrdering: topic.IsFifo,
        AckDeadlineSeconds: 60,
    });
    gateway.AddSubscription(topicName, subName, {
        EnableMessageOrdering: topic.IsFifo,
        AckDeadlineSeconds: subscription.Policy.LeaseSeconds,
        DeadLetterTopicName: dlqTopic,
        MaxDeliveryAttempts: ExpectedMaxDeliveryAttempts(subscription.Policy),
        Filter: filterExpr,
        FilterObject: subscription.Filter,
    });
}
