export interface SnsPublishEntry {
    /** Batch-unique entry ID (the driver uses the entry's index). */
    Id: string;
    Message: string;
    /** String message attributes (DataType 'String'). */
    MessageAttributes: Record<string, string>;
    MessageGroupId?: string;
    MessageDeduplicationId?: string;
}

export type SnsPublishEntryResult =
    | { Id: string; Kind: 'Published' }
    | { Id: string; Kind: 'Failed'; Code: string; Message: string; SenderFault: boolean };

export interface SnsGateway {
    /** At most 10 entries. Throws AwsGatewayError when the whole call fails. */
    PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]>;
    /** Null when the topic does not exist. */
    GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null>;
    /** Null when the subscription does not exist. */
    GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null>;
}
