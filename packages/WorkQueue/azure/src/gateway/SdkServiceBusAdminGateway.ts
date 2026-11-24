import type { RuleProperties, ServiceBusAdministrationClient, SqlRuleFilter } from '@azure/service-bus';
import { DEFAULT_LOCK_DURATION_SECONDS } from '../config';
import { IsNotFoundError, ToGatewayError } from './errors';
import type {
    AzureNamespaceProperties,
    AzureRuleProperties,
    AzureSubscriptionProperties,
    AzureSubscriptionRuntimeProperties,
    AzureTopicProperties,
    EnsureAzureSubscriptionOptions,
    EnsureAzureTopicOptions,
    ServiceBusAdminGateway,
} from './ServiceBusAdminGateway';

const DEFAULT_RULE_NAME = '$Default';

/** Parses simple ISO-8601 durations returned by Service Bus (e.g. 'PT1M', 'PT30S', 'PT1M30S'). */
export function ParseIsoDurationSeconds(duration: string | undefined): number {
    if (!duration) {
        return DEFAULT_LOCK_DURATION_SECONDS;
    }
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration);
    if (!match) {
        return DEFAULT_LOCK_DURATION_SECONDS;
    }
    const days = Number(match[1] ?? 0);
    const hours = Number(match[2] ?? 0);
    const minutes = Number(match[3] ?? 0);
    const seconds = Number(match[4] ?? 0);
    return Math.round(days * 86400 + hours * 3600 + minutes * 60 + seconds);
}

export function FormatIsoDurationSeconds(seconds: number): string {
    return `PT${Math.max(1, Math.round(seconds))}S`;
}

function isSqlRuleFilter(filter: RuleProperties['filter']): filter is SqlRuleFilter {
    return typeof filter === 'object' && filter !== null && 'sqlExpression' in filter && typeof filter.sqlExpression === 'string';
}

export type ServiceBusAdminClientLike = Pick<
    ServiceBusAdministrationClient,
    | 'getNamespaceProperties'
    | 'getTopic'
    | 'createTopic'
    | 'deleteTopic'
    | 'getSubscription'
    | 'getSubscriptionRuntimeProperties'
    | 'createSubscription'
    | 'deleteSubscription'
    | 'listRules'
    | 'getRule'
    | 'updateRule'
    | 'createRule'
>;

export class SdkServiceBusAdminGateway implements ServiceBusAdminGateway {
    constructor(private readonly client: ServiceBusAdminClientLike) {}

    public async GetNamespaceProperties(): Promise<AzureNamespaceProperties> {
        try {
            const props = await this.client.getNamespaceProperties();
            return {
                Name: props.name,
                MessagingSku: props.messagingSku,
            };
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus getNamespaceProperties');
        }
    }

    public async GetTopic(topicName: string): Promise<AzureTopicProperties | null> {
        try {
            const topic = await this.client.getTopic(topicName);
            return {
                Name: topic.name,
                RequiresDuplicateDetection: topic.requiresDuplicateDetection,
                SupportOrdering: topic.supportOrdering,
                DefaultMessageTimeToLive: topic.defaultMessageTimeToLive,
                MaxMessageSizeInKilobytes: topic.maxMessageSizeInKilobytes,
            };
        } catch (error) {
            if (IsNotFoundError(error)) {
                return null;
            }
            throw ToGatewayError(error, 'ServiceBus getTopic');
        }
    }

    public async EnsureTopic(topicName: string, options: EnsureAzureTopicOptions = {}): Promise<AzureTopicProperties> {
        const existing = await this.GetTopic(topicName);
        if (existing) {
            return existing;
        }
        try {
            const created = await this.client.createTopic(topicName, {
                requiresDuplicateDetection: options.RequiresDuplicateDetection ?? false,
                supportOrdering: options.SupportOrdering ?? false,
                ...(options.DefaultMessageTimeToLive ? { defaultMessageTimeToLive: options.DefaultMessageTimeToLive } : {}),
            });
            return {
                Name: created.name,
                RequiresDuplicateDetection: created.requiresDuplicateDetection,
                SupportOrdering: created.supportOrdering,
                DefaultMessageTimeToLive: created.defaultMessageTimeToLive,
                MaxMessageSizeInKilobytes: created.maxMessageSizeInKilobytes,
            };
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus createTopic');
        }
    }

    public async DeleteTopic(topicName: string): Promise<boolean> {
        try {
            await this.client.deleteTopic(topicName);
            return true;
        } catch (error) {
            if (IsNotFoundError(error)) {
                return false;
            }
            throw ToGatewayError(error, 'ServiceBus deleteTopic');
        }
    }

    public async GetSubscription(topicName: string, subscriptionName: string): Promise<AzureSubscriptionProperties | null> {
        try {
            const sub = await this.client.getSubscription(topicName, subscriptionName);
            return {
                TopicName: sub.topicName,
                SubscriptionName: sub.subscriptionName,
                RequiresSession: sub.requiresSession,
                MaxDeliveryCount: sub.maxDeliveryCount,
                LockDurationSeconds: ParseIsoDurationSeconds(sub.lockDuration),
                DeadLetteringOnMessageExpiration: sub.deadLetteringOnMessageExpiration,
            };
        } catch (error) {
            if (IsNotFoundError(error)) {
                return null;
            }
            throw ToGatewayError(error, 'ServiceBus getSubscription');
        }
    }

    public async GetSubscriptionRuntimeProperties(
        topicName: string,
        subscriptionName: string,
    ): Promise<AzureSubscriptionRuntimeProperties | null> {
        try {
            const runtime = await this.client.getSubscriptionRuntimeProperties(topicName, subscriptionName);
            return {
                TopicName: runtime.topicName,
                SubscriptionName: runtime.subscriptionName,
                ActiveMessageCount: runtime.activeMessageCount,
                DeadLetterMessageCount: runtime.deadLetterMessageCount,
                ScheduledMessageCount: Math.max(
                    0,
                    runtime.totalMessageCount - runtime.activeMessageCount - runtime.deadLetterMessageCount,
                ),
                TotalMessageCount: runtime.totalMessageCount,
            };
        } catch (error) {
            if (IsNotFoundError(error)) {
                return null;
            }
            throw ToGatewayError(error, 'ServiceBus getSubscriptionRuntimeProperties');
        }
    }

    public async EnsureSubscription(
        topicName: string,
        subscriptionName: string,
        options: EnsureAzureSubscriptionOptions = {},
    ): Promise<AzureSubscriptionProperties> {
        const existing = await this.GetSubscription(topicName, subscriptionName);
        if (existing) {
            if (options.SqlFilterExpression !== undefined) {
                await this.EnsureRule(topicName, subscriptionName, DEFAULT_RULE_NAME, options.SqlFilterExpression ?? '1=1');
            }
            return existing;
        }
        try {
            const created = await this.client.createSubscription(topicName, subscriptionName, {
                requiresSession: options.RequiresSession ?? false,
                ...(options.MaxDeliveryCount !== undefined ? { maxDeliveryCount: options.MaxDeliveryCount } : {}),
                ...(options.LockDurationSeconds !== undefined ? { lockDuration: FormatIsoDurationSeconds(options.LockDurationSeconds) } : {}),
                deadLetteringOnMessageExpiration: options.DeadLetteringOnMessageExpiration ?? true,
                ...(options.SqlFilterExpression
                    ? { defaultRuleOptions: { name: DEFAULT_RULE_NAME, filter: { sqlExpression: options.SqlFilterExpression } } }
                    : {}),
            });
            return {
                TopicName: created.topicName,
                SubscriptionName: created.subscriptionName,
                RequiresSession: created.requiresSession,
                MaxDeliveryCount: created.maxDeliveryCount,
                LockDurationSeconds: ParseIsoDurationSeconds(created.lockDuration),
                DeadLetteringOnMessageExpiration: created.deadLetteringOnMessageExpiration,
            };
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus createSubscription');
        }
    }

    public async DeleteSubscription(topicName: string, subscriptionName: string): Promise<boolean> {
        try {
            await this.client.deleteSubscription(topicName, subscriptionName);
            return true;
        } catch (error) {
            if (IsNotFoundError(error)) {
                return false;
            }
            throw ToGatewayError(error, 'ServiceBus deleteSubscription');
        }
    }

    public async ListRules(topicName: string, subscriptionName: string): Promise<AzureRuleProperties[]> {
        try {
            const rules: AzureRuleProperties[] = [];
            for await (const rule of this.client.listRules(topicName, subscriptionName)) {
                rules.push({
                    Name: rule.name,
                    SqlExpression: isSqlRuleFilter(rule.filter) ? rule.filter.sqlExpression : null,
                });
            }
            return rules;
        } catch (error) {
            if (IsNotFoundError(error)) {
                return [];
            }
            throw ToGatewayError(error, 'ServiceBus listRules');
        }
    }

    public async EnsureRule(topicName: string, subscriptionName: string, ruleName: string, sqlExpression: string): Promise<void> {
        try {
            const existing = await this.client.getRule(topicName, subscriptionName, ruleName).catch((err: unknown) => {
                if (IsNotFoundError(err)) {
                    return null;
                }
                throw err;
            });
            if (existing) {
                await this.client.updateRule(topicName, subscriptionName, {
                    ...existing,
                    filter: { sqlExpression },
                });
            } else {
                await this.client.createRule(topicName, subscriptionName, ruleName, { sqlExpression });
            }
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus ensureRule');
        }
    }
}
