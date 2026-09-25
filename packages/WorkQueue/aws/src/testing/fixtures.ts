import type {
    HostType, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { ExpectedMaxReceiveCount } from '../driver/bindingValidation';
import { SnsFilterPolicyFor } from '../filterPolicy';
import type { FakeSnsGateway, FakeSqsGateway } from './fakes';

export interface TestAwsResourceSet {
    TopicArn: string;
    QueueUrl: string;
    QueueArn: string;
    DeadLetterQueueUrl: string;
    DeadLetterQueueArn: string;
    SnsSubscriptionArn: string;
    IsFifo: boolean;
}

export interface TestSubscriptionOptions {
    Policy?: Partial<SubscriptionPolicy>;
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
}

const ACCOUNT = '123456789012';
const REGION = 'us-east-1';

export function TestAwsResources(isFifo: boolean): TestAwsResourceSet {
    const fifo = isFifo ? '.fifo' : '';
    const topicArn = `arn:aws:sns:${REGION}:${ACCOUNT}:mj-wq-test-email-events${fifo}`;
    return {
        TopicArn: topicArn,
        QueueUrl: `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/mj-wq-test-email-unsubscribe${fifo}`,
        QueueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:mj-wq-test-email-unsubscribe${fifo}`,
        DeadLetterQueueUrl: `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/mj-wq-test-email-unsubscribe-dlq${fifo}`,
        DeadLetterQueueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:mj-wq-test-email-unsubscribe-dlq${fifo}`,
        SnsSubscriptionArn: `${topicArn}:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0`,
        IsFifo: isFifo,
    };
}

export function TestPolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'email.unsubscribe', TopicName: 'email.events', PartitionMode: 'Exclusive',
        MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function TestTopicBinding(isFifo: boolean = true, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'email.events', IsFifo: isFifo, MaxPayloadBytes: 262_144,
        Config: { SnsTopicArn: TestAwsResources(isFifo).TopicArn },
        ...overrides,
    };
}

export function TestSubscriptionBinding(isFifo: boolean = true, options: TestSubscriptionOptions = {}): SubscriptionBinding {
    const r = TestAwsResources(isFifo);
    return {
        Policy: TestPolicy({ ...(isFifo ? {} : { PartitionMode: 'None' }), ...options.Policy }),
        Filter: options.Filter ?? null,
        HostType: options.HostType ?? 'External',
        Config: options.Config ?? {
            Region: REGION, QueueUrl: r.QueueUrl, QueueArn: r.QueueArn, DeadLetterQueueUrl: r.DeadLetterQueueUrl,
            DeadLetterQueueArn: r.DeadLetterQueueArn, IsFifo: isFifo, SnsSubscriptionArn: r.SnsSubscriptionArn,
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

/** Creates the queue, dead-letter queue, topic and SNS subscription exactly as the Terraform module would. */
export function SeedValidAwsResources(sns: FakeSnsGateway, sqs: FakeSqsGateway, topic: TopicBinding, subscription: SubscriptionBinding): void {
    const r = TestAwsResources(topic.IsFifo);
    sqs.AddQueue(r.QueueUrl, {
        Fifo: topic.IsFifo,
        VisibilityTimeoutSeconds: subscription.Policy.LeaseSeconds,
        Attributes: {
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: r.DeadLetterQueueArn, maxReceiveCount: ExpectedMaxReceiveCount(subscription.Policy) }),
            MaximumMessageSize: '262144',
            QueueArn: r.QueueArn,
        },
    });
    sqs.AddQueue(r.DeadLetterQueueUrl, { Fifo: topic.IsFifo, Attributes: { MaximumMessageSize: '262144', QueueArn: r.DeadLetterQueueArn } });
    sns.TopicAttributes.set(r.TopicArn, { FifoTopic: String(topic.IsFifo), TopicArn: r.TopicArn });
    const policy = SnsFilterPolicyFor(subscription.Filter);
    sns.SubscriptionAttributes.set(r.SnsSubscriptionArn, {
        RawMessageDelivery: 'true', Endpoint: r.QueueArn, TopicArn: r.TopicArn, FilterPolicyScope: 'MessageAttributes',
        ...(policy ? { FilterPolicy: policy } : {}),
    });
}
