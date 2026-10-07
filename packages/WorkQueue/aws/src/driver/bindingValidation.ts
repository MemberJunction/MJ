import type {
    BindingValidationIssue, SubscriptionBinding, SubscriptionPolicy, TopicBinding,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig, ReadAwsTopicConfig, type AwsSubscriptionConfig } from '../config';
import { NormalizeSnsFilterPolicy, SnsFilterPolicyFor } from '../filterPolicy';
import { REDRIVE_MARGIN } from '../margins';
import type { SnsGateway } from '../gateway/SnsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';

const REQUIRED_MAX_MESSAGE_SIZE = 262_144;

type IssueSink = (severity: 'Error' | 'Warning', message: string) => void;

export function ExpectedMaxReceiveCount(policy: SubscriptionPolicy): number {
    return policy.MaxAttempts + REDRIVE_MARGIN;
}

/** 03 W7: a topic must be FIFO when any subscription is Exclusive. (Ordered is rejected outright on this transport.) */
export function RequiresFifoTopic(subscriptions: SubscriptionBinding[]): boolean {
    return subscriptions.some((s) => s.Policy.PartitionMode === 'Exclusive');
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function validateTopic(sns: SnsGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[], add: IssueSink): Promise<string | null> {
    let topicArn: string;
    try {
        topicArn = ReadAwsTopicConfig(topic.Config).SnsTopicArn;
    } catch (error) {
        add('Error', `TopicUnbound: ${describe(error)}`);
        return null;
    }
    const attributes = await sns.GetTopicAttributes(topicArn);
    if (attributes === null) {
        add('Error', `SNS topic ${topicArn} does not exist`);
        return null;
    }
    if ((attributes['FifoTopic'] === 'true') !== topic.IsFifo) {
        add('Error', `SNS topic FifoTopic is ${attributes['FifoTopic'] === 'true'} but the topic binding says IsFifo ${topic.IsFifo}`);
    }
    if (!topic.IsFifo && RequiresFifoTopic(subscriptions)) {
        add('Error', 'Topic must be FIFO: it has an Exclusive subscription (03 W7)');
    }
    return topicArn;
}

function readRedrive(value: string | undefined): { deadLetterTargetArn: string | null; maxReceiveCount: number | null } {
    try {
        const parsed: unknown = value ? JSON.parse(value) : {};
        const target = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'deadLetterTargetArn') : undefined;
        const count = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'maxReceiveCount') : undefined;
        return { deadLetterTargetArn: typeof target === 'string' ? target : null, maxReceiveCount: count === undefined ? null : Number(count) };
    } catch {
        return { deadLetterTargetArn: null, maxReceiveCount: null };
    }
}

async function validateQueues(sqs: SqsGateway, binding: SubscriptionBinding, config: AwsSubscriptionConfig, add: IssueSink): Promise<void> {
    const queue = await sqs.GetAttributes(config.QueueUrl);
    if (queue === null) {
        add('Error', `SQS queue ${config.QueueUrl} does not exist`);
    } else {
        if ((queue['FifoQueue'] === 'true') !== config.IsFifo) {
            add('Error', `SQS queue FifoQueue is ${queue['FifoQueue'] === 'true'} but the binding says IsFifo ${config.IsFifo}`);
        }
        const redrive = readRedrive(queue['RedrivePolicy']);
        if (redrive.deadLetterTargetArn !== config.DeadLetterQueueArn) {
            add('Error', `Redrive policy targets ${redrive.deadLetterTargetArn ?? 'nothing'}, expected ${config.DeadLetterQueueArn}`);
        }
        const expectedCount = ExpectedMaxReceiveCount(binding.Policy);
        if (redrive.maxReceiveCount !== expectedCount) {
            add('Warning', `Redrive maxReceiveCount is ${redrive.maxReceiveCount ?? 'unset'} but the policy expects ${expectedCount} (MaxAttempts + ${REDRIVE_MARGIN}): policy drift — re-apply Terraform`);
        }
        const visibility = Number(queue['VisibilityTimeout'] ?? '0');
        if (visibility < binding.Policy.LeaseSeconds) {
            add('Warning', `Queue VisibilityTimeout ${visibility} is below LeaseSeconds ${binding.Policy.LeaseSeconds}`);
        }
        const maxSize = Number(queue['MaximumMessageSize'] ?? '0');
        if (maxSize < REQUIRED_MAX_MESSAGE_SIZE) {
            add('Warning', `Queue MaximumMessageSize ${maxSize} is below ${REQUIRED_MAX_MESSAGE_SIZE}`);
        }
    }
    const deadLetter = await sqs.GetAttributes(config.DeadLetterQueueUrl);
    if (deadLetter === null) {
        add('Error', `SQS dead-letter queue ${config.DeadLetterQueueUrl} does not exist`);
    } else if ((deadLetter['FifoQueue'] === 'true') !== config.IsFifo) {
        add('Error', `SQS dead-letter queue FifoQueue does not match IsFifo ${config.IsFifo}`);
    }
}

async function validateSnsSubscription(sns: SnsGateway, binding: SubscriptionBinding, config: AwsSubscriptionConfig, topicArn: string, add: IssueSink): Promise<void> {
    if (config.SnsSubscriptionArn === null) {
        add('Warning', 'SnsSubscriptionArn is not bound; raw delivery and filter policy were not checked');
        return;
    }
    const attributes = await sns.GetSubscriptionAttributes(config.SnsSubscriptionArn);
    if (attributes === null) {
        add('Error', `SNS subscription ${config.SnsSubscriptionArn} does not exist`);
        return;
    }
    if (attributes['RawMessageDelivery'] !== 'true') {
        add('Error', 'SNS subscription RawMessageDelivery must be true');
    }
    if (attributes['Endpoint'] !== config.QueueArn) {
        add('Error', `SNS subscription endpoint is ${attributes['Endpoint'] ?? 'unset'}, expected ${config.QueueArn}`);
    }
    if (attributes['TopicArn'] !== topicArn) {
        add('Error', `SNS subscription belongs to ${attributes['TopicArn'] ?? 'unknown'}, expected ${topicArn}`);
    }
    const scope = attributes['FilterPolicyScope'];
    if (scope !== undefined && scope !== 'MessageAttributes') {
        add('Error', `SNS filter policy scope is ${scope}, expected MessageAttributes`);
    }
    const actual = NormalizeSnsFilterPolicy(attributes['FilterPolicy']);
    const expected = SnsFilterPolicyFor(binding.Filter);
    if (actual !== expected) {
        add('Error', `SNS filter policy ${actual ?? 'none'} differs from the subscription filter ${expected ?? 'none'}`);
    }
}

async function validateSubscription(sns: SnsGateway, sqs: SqsGateway, topic: TopicBinding, topicArn: string | null, binding: SubscriptionBinding, add: IssueSink): Promise<void> {
    if (binding.Policy.PartitionMode === 'Ordered') {
        add('Error', 'Ordered requires the Database transport; this subscription cannot run on the AWS transport');
        return;
    }
    let config: AwsSubscriptionConfig;
    try {
        config = ReadAwsSubscriptionConfig(binding.Config);
    } catch (error) {
        add('Error', `SubscriptionUnbound: ${describe(error)}`);
        return;
    }
    if (config.IsFifo !== topic.IsFifo) {
        add('Error', `Subscription IsFifo ${config.IsFifo} does not match topic IsFifo ${topic.IsFifo}`);
    }
    await validateQueues(sqs, binding, config, add);
    if (topicArn !== null) {
        await validateSnsSubscription(sns, binding, config, topicArn, add);
    }
}

/** Checks that pre-provisioned SNS/SQS resources exist and match the topology (FIFO, redrive, raw delivery, filter).
 *  Read-only: it needs sns:GetTopicAttributes, sns:GetSubscriptionAttributes and sqs:GetQueueAttributes (Task 9 IAM). */
export async function ValidateAwsBindings(sns: SnsGateway, sqs: SqsGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
    const issues: BindingValidationIssue[] = [];
    const sinkFor = (subject: string): IssueSink => (severity, message) => issues.push({ Severity: severity, Subject: subject, Message: message });
    try {
        const topicArn = await validateTopic(sns, topic, subscriptions, sinkFor(`topic:${topic.TopicName}`));
        for (const subscription of subscriptions) {
            await validateSubscription(sns, sqs, topic, topicArn, subscription, sinkFor(`subscription:${subscription.Policy.SubscriptionName}`));
        }
    } catch (error) {
        issues.push({ Severity: 'Error', Subject: `topic:${topic.TopicName}`, Message: `Validation could not complete: ${describe(error)}` });
    }
    return issues;
}
