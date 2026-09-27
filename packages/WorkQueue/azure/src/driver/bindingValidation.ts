import type { BindingValidationIssue, SubscriptionBinding, SubscriptionPolicy, TopicBinding } from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig, ReadAzureTopicConfig, type AzureSubscriptionConfig } from '../config';
import { NormalizeRuleSql, ServiceBusRuleSqlFor, SERVICE_BUS_RULE_NAME } from '../filterSql';
import type { ServiceBusAdminGateway } from '../gateway/ServiceBusAdminGateway';
import { MAX_DELIVERY_MARGIN, SERVICE_BUS_MAX_LOCK_SECONDS } from '../margins';

type IssueSink = (severity: 'Error' | 'Warning', message: string) => void;

export function ExpectedMaxDeliveryCount(policy: SubscriptionPolicy): number {
    return policy.MaxAttempts + MAX_DELIVERY_MARGIN;
}

/** 03 W7: a topic must be partitioned (IsFifo) when any subscription is Exclusive; Ordered is rejected outright here. */
export function RequiresPartitionedTopic(subscriptions: SubscriptionBinding[]): boolean {
    return subscriptions.some((s) => s.Policy.PartitionMode === 'Exclusive');
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function validateTopic(admin: ServiceBusAdminGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[], add: IssueSink): Promise<string | null> {
    let topicName: string;
    try {
        topicName = ReadAzureTopicConfig(topic.Config).TopicName;
    } catch (error) {
        add('Error', `TopicUnbound: ${describe(error)}`);
        return null;
    }
    const info = await admin.GetTopic(topicName);
    if (info === null) {
        add('Error', `Service Bus topic ${topicName} does not exist`);
        return null;
    }
    if (info.Status !== 'Active') {
        add('Error', `Service Bus topic ${topicName} status is ${info.Status}`);
    }
    if (!topic.IsFifo && RequiresPartitionedTopic(subscriptions)) {
        add('Error', 'Topic must be IsFifo: it has an Exclusive subscription (03 W7), and only partitioned topics publish with a SessionId');
    }
    if (!info.RequiresDuplicateDetection) {
        add('Warning', 'Topic does not enable duplicate detection; a redelivered publish with the same MessageID would be accepted twice');
    }
    return topicName;
}

function validateSubscriptionEntity(binding: SubscriptionBinding, config: AzureSubscriptionConfig, info: { RequiresSession: boolean; LockDurationSeconds: number; MaxDeliveryCount: number; DeadLetteringOnMessageExpiration: boolean; Status: string }, add: IssueSink): void {
    const exclusive = binding.Policy.PartitionMode === 'Exclusive';
    if (info.RequiresSession !== exclusive) {
        add('Error', `Subscription requiresSession is ${info.RequiresSession} but PartitionMode ${binding.Policy.PartitionMode} needs ${exclusive}`);
    }
    if (config.RequiresSession !== info.RequiresSession) {
        add('Error', `Binding RequiresSession is ${config.RequiresSession} but the subscription's requiresSession is ${info.RequiresSession}; re-import bindings`);
    }
    if (binding.Policy.LeaseSeconds > SERVICE_BUS_MAX_LOCK_SECONDS) {
        add('Error', `LeaseSeconds ${binding.Policy.LeaseSeconds} exceeds the Service Bus lock maximum of ${SERVICE_BUS_MAX_LOCK_SECONDS} seconds`);
    } else if (info.LockDurationSeconds < binding.Policy.LeaseSeconds) {
        add('Warning', `Subscription lockDuration ${info.LockDurationSeconds}s is below LeaseSeconds ${binding.Policy.LeaseSeconds}: policy drift — re-apply Terraform`);
    }
    const expected = ExpectedMaxDeliveryCount(binding.Policy);
    if (info.MaxDeliveryCount !== expected) {
        add('Warning', `Subscription maxDeliveryCount is ${info.MaxDeliveryCount} but the policy expects ${expected} (MaxAttempts + ${MAX_DELIVERY_MARGIN}): policy drift — re-apply Terraform`);
    }
    if (info.Status !== 'Active' && info.Status !== 'ReceiveDisabled') {
        add('Error', `Subscription status is ${info.Status}`);
    }
}

async function validateRules(admin: ServiceBusAdminGateway, binding: SubscriptionBinding, config: AzureSubscriptionConfig, add: IssueSink): Promise<void> {
    const rules = await admin.ListRules(config.TopicName, config.SubscriptionName);
    const expected = NormalizeRuleSql(ServiceBusRuleSqlFor(binding.Filter, binding.Policy.SubscriptionName));
    const mjRule = rules.find((rule) => rule.Name === SERVICE_BUS_RULE_NAME);
    if (!mjRule) {
        add('Error', `Subscription has no '${SERVICE_BUS_RULE_NAME}' rule; expected SQL: ${expected}`);
    } else if (NormalizeRuleSql(mjRule.Sql) !== expected) {
        add('Error', `Rule '${SERVICE_BUS_RULE_NAME}' SQL is ${NormalizeRuleSql(mjRule.Sql) ?? 'not a SQL filter'}; expected ${expected}`);
    }
    const extras = rules.filter((rule) => rule.Name !== SERVICE_BUS_RULE_NAME).map((rule) => rule.Name);
    if (extras.length > 0) {
        // Rules OR together: any extra rule widens delivery past the MJ filter and past the targeting clause.
        add('Error', `Subscription has extra rules (${extras.join(', ')}); rules OR together, so they bypass the MJ filter`);
    }
}

async function validateSubscription(admin: ServiceBusAdminGateway, topic: TopicBinding, topicName: string | null, binding: SubscriptionBinding, add: IssueSink): Promise<void> {
    if (binding.Policy.PartitionMode === 'Ordered') {
        add('Error', 'Ordered requires the Database transport; this subscription cannot run on the Azure transport');
        return;
    }
    let config: AzureSubscriptionConfig;
    try {
        config = ReadAzureSubscriptionConfig(binding.Config);
    } catch (error) {
        add('Error', `SubscriptionUnbound: ${describe(error)}`);
        return;
    }
    if (topicName !== null && config.TopicName !== topicName) {
        add('Error', `Subscription binding names topic ${config.TopicName}, expected ${topicName}`);
    }
    const info = await admin.GetSubscription(config.TopicName, config.SubscriptionName);
    if (info === null) {
        add('Error', `Service Bus subscription ${config.TopicName}/${config.SubscriptionName} does not exist`);
        return;
    }
    validateSubscriptionEntity(binding, config, info, add);
    await validateRules(admin, binding, config, add);
}

/** Checks that pre-provisioned Service Bus entities exist and match the topology (sessions, lock, delivery count, rule). Read-only. */
export async function ValidateAzureBindings(admin: ServiceBusAdminGateway, topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
    const issues: BindingValidationIssue[] = [];
    const sinkFor = (subject: string): IssueSink => (severity, message) => issues.push({ Severity: severity, Subject: subject, Message: message });
    try {
        const topicName = await validateTopic(admin, topic, subscriptions, sinkFor(`topic:${topic.TopicName}`));
        for (const subscription of subscriptions) {
            await validateSubscription(admin, topic, topicName, subscription, sinkFor(`subscription:${subscription.Policy.SubscriptionName}`));
        }
    } catch (error) {
        issues.push({ Severity: 'Error', Subject: `topic:${topic.TopicName}`, Message: `Validation could not complete: ${describe(error)}` });
    }
    return issues;
}
