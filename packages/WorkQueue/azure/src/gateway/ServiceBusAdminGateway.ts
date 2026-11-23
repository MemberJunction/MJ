export interface AzureNamespaceProperties {
    Name: string;
    MessagingSku: 'Basic' | 'Standard' | 'Premium';
}

export interface AzureTopicProperties {
    Name: string;
    RequiresDuplicateDetection: boolean;
    SupportOrdering: boolean;
    DefaultMessageTimeToLive: string;
    MaxMessageSizeInKilobytes?: number;
}

export interface AzureSubscriptionProperties {
    TopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
    MaxDeliveryCount: number;
    LockDurationSeconds: number;
    DeadLetteringOnMessageExpiration: boolean;
}

export interface AzureSubscriptionRuntimeProperties {
    TopicName: string;
    SubscriptionName: string;
    ActiveMessageCount: number;
    DeadLetterMessageCount: number;
    ScheduledMessageCount: number;
    TotalMessageCount: number;
}

export interface AzureRuleProperties {
    Name: string;
    SqlExpression: string | null;
}

export interface EnsureAzureTopicOptions {
    RequiresDuplicateDetection?: boolean;
    SupportOrdering?: boolean;
    DefaultMessageTimeToLive?: string;
}

export interface EnsureAzureSubscriptionOptions {
    RequiresSession?: boolean;
    MaxDeliveryCount?: number;
    LockDurationSeconds?: number;
    DeadLetteringOnMessageExpiration?: boolean;
    SqlFilterExpression?: string | null;
}

export interface ServiceBusAdminGateway {
    GetNamespaceProperties(): Promise<AzureNamespaceProperties>;
    GetTopic(topicName: string): Promise<AzureTopicProperties | null>;
    EnsureTopic(topicName: string, options?: EnsureAzureTopicOptions): Promise<AzureTopicProperties>;
    DeleteTopic(topicName: string): Promise<boolean>;
    GetSubscription(topicName: string, subscriptionName: string): Promise<AzureSubscriptionProperties | null>;
    GetSubscriptionRuntimeProperties(topicName: string, subscriptionName: string): Promise<AzureSubscriptionRuntimeProperties | null>;
    EnsureSubscription(topicName: string, subscriptionName: string, options?: EnsureAzureSubscriptionOptions): Promise<AzureSubscriptionProperties>;
    DeleteSubscription(topicName: string, subscriptionName: string): Promise<boolean>;
    ListRules(topicName: string, subscriptionName: string): Promise<AzureRuleProperties[]>;
    EnsureRule(topicName: string, subscriptionName: string, ruleName: string, sqlExpression: string): Promise<void>;
}
