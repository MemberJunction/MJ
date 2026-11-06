import {
    GetSubscriptionAttributesCommand, GetTopicAttributesCommand, PublishBatchCommand, type SNSClient,
} from '@aws-sdk/client-sns';
import { ErrorCode, ToGatewayError } from './errors';
import type { SnsGateway, SnsPublishEntry, SnsPublishEntryResult } from './SnsGateway';

const NOT_FOUND_CODES = new Set(['NotFound', 'NotFoundException']);

function stringMap(source: Record<string, string> | undefined): Record<string, string> {
    return { ...(source ?? {}) };
}

export class SdkSnsGateway implements SnsGateway {
    constructor(private readonly client: SNSClient) {}

    public async PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]> {
        const command = new PublishBatchCommand({
            TopicArn: topicArn,
            PublishBatchRequestEntries: entries.map((entry) => ({
                Id: entry.Id,
                Message: entry.Message,
                ...(entry.MessageGroupId ? { MessageGroupId: entry.MessageGroupId } : {}),
                ...(entry.MessageDeduplicationId ? { MessageDeduplicationId: entry.MessageDeduplicationId } : {}),
                MessageAttributes: Object.fromEntries(
                    Object.entries(entry.MessageAttributes).map(([k, v]) => [k, { DataType: 'String', StringValue: v }]),
                ),
            })),
        });
        try {
            const output = await this.client.send(command);
            const published = new Set((output.Successful ?? []).map((s) => s.Id));
            const failed = new Map((output.Failed ?? []).map((f) => [f.Id, f]));
            return entries.map((entry): SnsPublishEntryResult => {
                if (published.has(entry.Id)) {
                    return { Id: entry.Id, Kind: 'Published' };
                }
                const failure = failed.get(entry.Id);
                return failure
                    ? { Id: entry.Id, Kind: 'Failed', Code: failure.Code ?? 'Unknown', Message: failure.Message ?? '', SenderFault: failure.SenderFault ?? false }
                    : { Id: entry.Id, Kind: 'Failed', Code: 'Unreported', Message: 'SNS reported no result for this entry', SenderFault: false };
            });
        } catch (error) {
            throw ToGatewayError(error, 'SNS PublishBatch');
        }
    }

    public async GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null> {
        try {
            const output = await this.client.send(new GetTopicAttributesCommand({ TopicArn: topicArn }));
            return stringMap(output.Attributes);
        } catch (error) {
            if (NOT_FOUND_CODES.has(ErrorCode(error))) {
                return null;
            }
            throw ToGatewayError(error, 'SNS GetTopicAttributes');
        }
    }

    public async GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null> {
        try {
            const output = await this.client.send(new GetSubscriptionAttributesCommand({ SubscriptionArn: subscriptionArn }));
            return stringMap(output.Attributes);
        } catch (error) {
            if (NOT_FOUND_CODES.has(ErrorCode(error))) {
                return null;
            }
            throw ToGatewayError(error, 'SNS GetSubscriptionAttributes');
        }
    }
}
