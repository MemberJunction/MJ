export interface ServiceBusTopicInfo {
    Name: string;
    SupportOrdering: boolean;
    RequiresDuplicateDetection: boolean;
    /** Kilobytes; Standard tier reports 256. */
    MaxMessageSizeInKilobytes: number | null;
    Status: string;
}

export interface ServiceBusSubscriptionInfo {
    TopicName: string;
    Name: string;
    RequiresSession: boolean;
    /** Parsed from the ISO-8601 duration (PT1M → 60). */
    LockDurationSeconds: number;
    MaxDeliveryCount: number;
    DeadLetteringOnMessageExpiration: boolean;
    Status: string;
}

export interface ServiceBusRuleInfo {
    Name: string;
    /** Null for a correlation or true filter (not a SQL filter). */
    Sql: string | null;
}

export interface ServiceBusSubscriptionCounts {
    Active: number;
    DeadLettered: number;
}

/** Management-plane reads the driver needs for stats and binding validation. Null means the entity does not exist. */
export interface ServiceBusAdminGateway {
    GetTopic(topicName: string): Promise<ServiceBusTopicInfo | null>;
    GetSubscription(topicName: string, subscriptionName: string): Promise<ServiceBusSubscriptionInfo | null>;
    GetSubscriptionCounts(topicName: string, subscriptionName: string): Promise<ServiceBusSubscriptionCounts | null>;
    ListRules(topicName: string, subscriptionName: string): Promise<ServiceBusRuleInfo[]>;
}

/** Seconds in an ISO-8601 duration such as PT5M, PT30S or P1D (Service Bus durations never carry months or years). */
export function DurationSeconds(iso: string): number {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
    if (!match) {
        return Number.NaN;
    }
    const [, days, hours, minutes, seconds] = match;
    return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

/** ISO-8601 duration for a number of seconds (what the management API and Terraform expect). */
export function IsoDuration(seconds: number): string {
    return `PT${Math.max(1, Math.floor(seconds))}S`;
}
