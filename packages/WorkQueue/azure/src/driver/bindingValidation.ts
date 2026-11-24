import type {
    BindingValidationIssue, SubscriptionBinding, SubscriptionPolicy, TopicBinding,
} from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig, ReadAzureTopicConfig, type AzureSubscriptionConfig } from '../config';
import { AzureSqlFilterFor, NormalizeAzureSqlFilter } from '../filterPolicy';
import type { ServiceBusAdminGateway } from '../gateway/ServiceBusAdminGateway';
import { REDRIVE_MARGIN } from '../margins';

const DEFAULT_RULE_NAME = '$Default';

type IssueSink = (severity: 'Error' | 'Warning', message: string) => void;

export function ExpectedMaxDeliveryCount(policy: SubscriptionPolicy): number {
    return policy.MaxAttempts + REDRIVE_MARGIN;
}

/** A topic must have session-enabled subscriptions when any subscription is Exclusive. */
export function RequiresSessionTopic(subscriptions: SubscriptionBinding[]): boolean {
    return subscriptions.some((s) => s.Policy.PartitionMode === 'Exclusive');
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function validateTopic(
    admin: ServiceBusAdminGateway,
    topic: TopicBinding,
    subscriptions: SubscriptionBinding[],
    add: IssueSink,
): Promise<string | null> {
    let sbTopicName: string;
    try {
        sbTopicName = ReadAzureTopicConfig(topic.Config).ServiceBusTopicName;
    } catch (error) {
        add('Error', `TopicUnbound: ${describe(error)}`);
        return null;
    }
    const props = await admin.GetTopic(sbTopicName);
    if (props === null) {
        add('Error', `Azure Service Bus topic ${sbTopicName} does not exist`);
        return null;
    }
    if (!topic.IsFifo && RequiresSessionTopic(subscriptions)) {
        add('Error', 'Topic must set IsFifo=true: it has an Exclusive subscription requiring Service Bus sessions');
    }
    return sbTopicName;
}

async function validateSubscriptionRule(
    admin: ServiceBusAdminGateway,
    binding: SubscriptionBinding,
    config: AzureSubscriptionConfig,
    add: IssueSink,
): Promise<void> {
    const expected = AzureSqlFilterFor(binding.Filter);
    const rules = await admin.ListRules(config.ServiceBusTopicName, config.SubscriptionName);
    const defaultRule = rules.find((r) => r.Name === DEFAULT_RULE_NAME) ?? rules[0] ?? null;
    const actual = NormalizeAzureSqlFilter(defaultRule?.SqlExpression ?? null);
    if (actual !== expected) {
        add('Error', `Service Bus subscription SQL filter ${actual ?? 'none'} differs from the subscription filter ${expected ?? 'none'}`);
    }
}

async function validateSubscription(
    admin: ServiceBusAdminGateway,
    topic: TopicBinding,
    sbTopicName: string | null,
    binding: SubscriptionBinding,
    add: IssueSink,
): Promise<void> {
    if (binding.Policy.PartitionMode === 'Ordered') {
        add('Error', 'Ordered requires the Database transport; this subscription cannot run on the Azure Service Bus transport');
        return;
    }
    let config: AzureSubscriptionConfig;
    try {
        config = ReadAzureSubscriptionConfig(binding.Config);
    } catch (error) {
        add('Error', `SubscriptionUnbound: ${describe(error)}`);
        return;
    }
    if (sbTopicName !== null && config.ServiceBusTopicName !== sbTopicName) {
        add('Error', `Subscription targets topic '${config.ServiceBusTopicName}', expected '${sbTopicName}'`);
    }
    if (config.RequiresSession !== topic.IsFifo) {
        add('Error', `Subscription RequiresSession ${config.RequiresSession} does not match topic IsFifo ${topic.IsFifo}`);
    }
    const props = await admin.GetSubscription(config.ServiceBusTopicName, config.SubscriptionName);
    if (props === null) {
        add('Error', `Azure Service Bus subscription ${config.ServiceBusTopicName}/${config.SubscriptionName} does not exist`);
        return;
    }
    if (props.RequiresSession !== config.RequiresSession) {
        add('Error', `Azure Service Bus subscription RequiresSession is ${props.RequiresSession} but the binding says ${config.RequiresSession}`);
    }
    const expectedDeliveryCount = ExpectedMaxDeliveryCount(binding.Policy);
    if (props.MaxDeliveryCount !== expectedDeliveryCount) {
        add('Warning', `MaxDeliveryCount is ${props.MaxDeliveryCount} but the policy expects ${expectedDeliveryCount} (MaxAttempts + ${REDRIVE_MARGIN})`);
    }
    if (props.LockDurationSeconds < binding.Policy.LeaseSeconds) {
        add('Warning', `Subscription LockDuration ${props.LockDurationSeconds}s is below LeaseSeconds ${binding.Policy.LeaseSeconds}s`);
    }
    await validateSubscriptionRule(admin, binding, config, add);
}

/** Checks that pre-provisioned Azure Service Bus topics, subscriptions, sessions, and SQL filter rules match topology. */
export async function ValidateAzureBindings(
    admin: ServiceBusAdminGateway,
    topic: TopicBinding,
    subscriptions: SubscriptionBinding[],
): Promise<BindingValidationIssue[]> {
    const issues: BindingValidationIssue[] = [];
    const sinkFor = (subject: string): IssueSink => (severity, message) => issues.push({ Severity: severity, Subject: subject, Message: message });
    try {
        const sbTopicName = await validateTopic(admin, topic, subscriptions, sinkFor(`topic:${topic.TopicName}`));
        for (const subscription of subscriptions) {
            await validateSubscription(admin, topic, sbTopicName, subscription, sinkFor(`subscription:${subscription.Policy.SubscriptionName}`));
        }
    } catch (error) {
        issues.push({ Severity: 'Error', Subject: `topic:${topic.TopicName}`, Message: `Validation could not complete: ${describe(error)}` });
    }
    return issues;
}
