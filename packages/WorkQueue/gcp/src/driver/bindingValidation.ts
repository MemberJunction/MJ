import type {
    BindingValidationIssue, SubscriptionBinding, SubscriptionPolicy, TopicBinding,
} from '@memberjunction/work-queue-core';
import {
    ExtractGcpResourceShortName,
    ReadGcpSubscriptionConfig,
    ReadGcpTopicConfig,
    type GcpSubscriptionConfig,
} from '../config';
import { GcpPubSubFilterFor, NormalizeGcpPubSubFilter } from '../filterPolicy';
import type { PubSubAdminGateway } from '../gateway/PubSubAdminGateway';
import { REDRIVE_MARGIN } from '../margins';

type IssueSink = (severity: 'Error' | 'Warning', message: string) => void;

export function ExpectedMaxDeliveryAttempts(policy: SubscriptionPolicy): number {
    return Math.max(5, policy.MaxAttempts + REDRIVE_MARGIN);
}

/** A topic must have ordering-enabled subscriptions when any subscription is Exclusive. */
export function RequiresOrderingTopic(subscriptions: SubscriptionBinding[]): boolean {
    return subscriptions.some((s) => s.Policy.PartitionMode === 'Exclusive');
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function validateTopic(
    admin: PubSubAdminGateway,
    topic: TopicBinding,
    subscriptions: SubscriptionBinding[],
    add: IssueSink,
): Promise<string | null> {
    let gcpTopicName: string;
    try {
        gcpTopicName = ReadGcpTopicConfig(topic.Config).TopicName;
    } catch (error) {
        add('Error', `TopicUnbound: ${describe(error)}`);
        return null;
    }
    const props = await admin.GetTopic(gcpTopicName);
    if (props === null) {
        add('Error', `Google Cloud Pub/Sub topic ${gcpTopicName} does not exist`);
        return null;
    }
    if (!topic.IsFifo && RequiresOrderingTopic(subscriptions)) {
        add('Error', 'Topic must set IsFifo=true: it has an Exclusive subscription requiring Pub/Sub message ordering');
    }
    return ExtractGcpResourceShortName(gcpTopicName);
}

async function validateDeadLetterResources(
    admin: PubSubAdminGateway,
    config: GcpSubscriptionConfig,
    add: IssueSink,
): Promise<void> {
    if (config.DeadLetterTopicName !== null) {
        const dlqTopic = await admin.GetTopic(config.DeadLetterTopicName);
        if (dlqTopic === null) {
            add('Error', `Google Cloud Pub/Sub dead-letter topic ${config.DeadLetterTopicName} does not exist`);
        }
    }
    if (config.DeadLetterSubscriptionName !== null) {
        const dlqSub = await admin.GetSubscription(config.DeadLetterSubscriptionName);
        if (dlqSub === null) {
            add('Error', `Google Cloud Pub/Sub dead-letter subscription ${config.DeadLetterSubscriptionName} does not exist`);
        }
    }
}

async function validateSubscription(
    admin: PubSubAdminGateway,
    topic: TopicBinding,
    expectedTopicShortName: string | null,
    binding: SubscriptionBinding,
    add: IssueSink,
): Promise<void> {
    if (binding.Policy.PartitionMode === 'Ordered') {
        add('Error', 'Ordered requires the Database transport; this subscription cannot run on the Google Cloud Pub/Sub transport');
        return;
    }
    let config: GcpSubscriptionConfig;
    try {
        config = ReadGcpSubscriptionConfig(binding.Config);
    } catch (error) {
        add('Error', `SubscriptionUnbound: ${describe(error)}`);
        return;
    }
    const subTopicShort = ExtractGcpResourceShortName(config.TopicName);
    if (expectedTopicShortName !== null && subTopicShort !== expectedTopicShortName) {
        add('Error', `Subscription targets topic '${config.TopicName}', expected '${expectedTopicShortName}'`);
    }
    if (config.EnableMessageOrdering !== topic.IsFifo) {
        add('Error', `Subscription EnableMessageOrdering ${config.EnableMessageOrdering} does not match topic IsFifo ${topic.IsFifo}`);
    }
    const props = await admin.GetSubscription(config.SubscriptionName);
    if (props === null) {
        add('Error', `Google Cloud Pub/Sub subscription ${config.SubscriptionName} does not exist`);
        return;
    }
    if (props.EnableMessageOrdering !== config.EnableMessageOrdering) {
        add('Error', `Pub/Sub subscription EnableMessageOrdering is ${props.EnableMessageOrdering} but the binding says ${config.EnableMessageOrdering}`);
    }
    const expectedFilter = GcpPubSubFilterFor(binding.Filter);
    const actualFilter = NormalizeGcpPubSubFilter(props.Filter);
    if (actualFilter !== expectedFilter) {
        add('Error', `Pub/Sub subscription filter ${actualFilter ?? 'none'} differs from the subscription filter ${expectedFilter ?? 'none'}`);
    }
    const expectedMaxAttempts = ExpectedMaxDeliveryAttempts(binding.Policy);
    if (props.DeadLetterPolicy === null) {
        add('Warning', `Pub/Sub subscription ${config.SubscriptionName} has no native deadLetterPolicy (expected maxDeliveryAttempts ${expectedMaxAttempts})`);
    } else if (props.DeadLetterPolicy.MaxDeliveryAttempts !== expectedMaxAttempts) {
        add('Warning', `MaxDeliveryAttempts is ${props.DeadLetterPolicy.MaxDeliveryAttempts} but the policy expects ${expectedMaxAttempts} (max(5, MaxAttempts + ${REDRIVE_MARGIN}))`);
    }
    if (props.AckDeadlineSeconds < binding.Policy.LeaseSeconds) {
        add('Warning', `Subscription AckDeadlineSeconds ${props.AckDeadlineSeconds}s is below LeaseSeconds ${binding.Policy.LeaseSeconds}s`);
    }
    await validateDeadLetterResources(admin, config, add);
}

/** Checks that pre-provisioned Google Cloud Pub/Sub topics, subscriptions, ordering flags, filters, and DLQs match topology. */
export async function ValidateGcpBindings(
    admin: PubSubAdminGateway,
    topic: TopicBinding,
    subscriptions: SubscriptionBinding[],
): Promise<BindingValidationIssue[]> {
    const issues: BindingValidationIssue[] = [];
    const sinkFor = (subject: string): IssueSink => (severity, message) => issues.push({ Severity: severity, Subject: subject, Message: message });
    try {
        const expectedTopicName = await validateTopic(admin, topic, subscriptions, sinkFor(`topic:${topic.TopicName}`));
        for (const subscription of subscriptions) {
            await validateSubscription(admin, topic, expectedTopicName, subscription, sinkFor(`subscription:${subscription.Policy.SubscriptionName}`));
        }
    } catch (error) {
        issues.push({ Severity: 'Error', Subject: `topic:${topic.TopicName}`, Message: `Validation could not complete: ${describe(error)}` });
    }
    return issues;
}
