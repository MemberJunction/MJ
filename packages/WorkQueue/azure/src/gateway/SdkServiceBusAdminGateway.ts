import type { ServiceBusAdministrationClient } from '@azure/service-bus';
import { IsEntityNotFound, ToGatewayError } from './errors';
import {
    DurationSeconds, type ServiceBusAdminGateway, type ServiceBusRuleInfo, type ServiceBusSubscriptionCounts, type ServiceBusSubscriptionInfo, type ServiceBusTopicInfo,
} from './ServiceBusAdminGateway';

/** Management reads over ServiceBusAdministrationClient (needs the Azure Service Bus Data Owner role, or Reader on the namespace). */
export class SdkServiceBusAdminGateway implements ServiceBusAdminGateway {
    constructor(private readonly client: ServiceBusAdministrationClient) {}

    public async GetTopic(topicName: string): Promise<ServiceBusTopicInfo | null> {
        try {
            const topic = await this.client.getTopic(topicName);
            return {
                Name: topic.name,
                SupportOrdering: topic.supportOrdering,
                RequiresDuplicateDetection: topic.requiresDuplicateDetection,
                MaxMessageSizeInKilobytes: topic.maxMessageSizeInKilobytes ?? null,
                Status: topic.status,
            };
        } catch (error) {
            return this.nullWhenMissing(error, 'Service Bus getTopic');
        }
    }

    public async GetSubscription(topicName: string, subscriptionName: string): Promise<ServiceBusSubscriptionInfo | null> {
        try {
            const subscription = await this.client.getSubscription(topicName, subscriptionName);
            return {
                TopicName: subscription.topicName,
                Name: subscription.subscriptionName,
                RequiresSession: subscription.requiresSession,
                LockDurationSeconds: DurationSeconds(subscription.lockDuration),
                MaxDeliveryCount: subscription.maxDeliveryCount,
                DeadLetteringOnMessageExpiration: subscription.deadLetteringOnMessageExpiration,
                Status: subscription.status,
            };
        } catch (error) {
            return this.nullWhenMissing(error, 'Service Bus getSubscription');
        }
    }

    public async GetSubscriptionCounts(topicName: string, subscriptionName: string): Promise<ServiceBusSubscriptionCounts | null> {
        try {
            const runtime = await this.client.getSubscriptionRuntimeProperties(topicName, subscriptionName);
            return { Active: runtime.activeMessageCount, DeadLettered: runtime.deadLetterMessageCount };
        } catch (error) {
            return this.nullWhenMissing(error, 'Service Bus getSubscriptionRuntimeProperties');
        }
    }

    public async ListRules(topicName: string, subscriptionName: string): Promise<ServiceBusRuleInfo[]> {
        const rules: ServiceBusRuleInfo[] = [];
        try {
            for await (const rule of this.client.listRules(topicName, subscriptionName)) {
                const sql = 'sqlExpression' in rule.filter && typeof rule.filter.sqlExpression === 'string' ? rule.filter.sqlExpression : null;
                rules.push({ Name: rule.name, Sql: sql });
            }
        } catch (error) {
            if (IsEntityNotFound(error)) {
                return [];
            }
            throw ToGatewayError(error, 'Service Bus listRules');
        }
        return rules;
    }

    private nullWhenMissing(error: unknown, operation: string): null {
        if (IsEntityNotFound(error)) {
            return null;
        }
        throw ToGatewayError(error, operation);
    }
}
