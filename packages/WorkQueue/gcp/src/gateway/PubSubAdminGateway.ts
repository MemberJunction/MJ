export interface GcpTopicProperties {
    Name: string;
    Labels?: Record<string, string>;
}

export interface GcpDeadLetterPolicy {
    DeadLetterTopic: string;
    MaxDeliveryAttempts: number;
}

export interface GcpSubscriptionProperties {
    TopicName: string;
    SubscriptionName: string;
    AckDeadlineSeconds: number;
    EnableMessageOrdering: boolean;
    Filter: string | null;
    DeadLetterPolicy: GcpDeadLetterPolicy | null;
}

export interface GcpSubscriptionStatsProperties {
    SubscriptionName: string;
    UndeliveredMessageCount: number;
    DeadLetterMessageCount: number;
}

export interface EnsureGcpTopicOptions {
    Labels?: Record<string, string>;
}

export interface EnsureGcpSubscriptionOptions {
    AckDeadlineSeconds?: number;
    EnableMessageOrdering?: boolean;
    Filter?: string | null;
    DeadLetterTopicName?: string | null;
    MaxDeliveryAttempts?: number;
}

export interface PubSubAdminGateway {
    CheckHealth(): Promise<boolean>;
    GetTopic(topicName: string): Promise<GcpTopicProperties | null>;
    EnsureTopic(topicName: string, options?: EnsureGcpTopicOptions): Promise<GcpTopicProperties>;
    DeleteTopic(topicName: string): Promise<boolean>;
    GetSubscription(subscriptionName: string): Promise<GcpSubscriptionProperties | null>;
    GetSubscriptionStats(subscriptionName: string, deadLetterSubscriptionName: string | null): Promise<GcpSubscriptionStatsProperties | null>;
    EnsureSubscription(topicName: string, subscriptionName: string, options?: EnsureGcpSubscriptionOptions): Promise<GcpSubscriptionProperties>;
    DeleteSubscription(subscriptionName: string): Promise<boolean>;
}
