import type {
    DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord,
    SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig } from '../config';
import { REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { MessageGroupIdFor } from '../envelope';
import type { SqsGateway } from '../gateway/SqsGateway';
import { DeadLetterIdOf, RestoreVisibility, ScanDeadLetters, ToDeadLetterRecord, type ScannedDeadLetter } from './deadLetterScan';

export const REPLAY_NOTE_ATTRIBUTE = 'mj_replay_note';
export const REPLAYED_BY_ATTRIBUTE = 'mj_replayed_by';

function count(attributes: Record<string, string>, ...names: string[]): number {
    return names.reduce((total, name) => total + Number(attributes[name] ?? '0'), 0);
}

export class AwsTransportOperator implements ITransportOperator {
    private readonly now: () => number;

    constructor(private readonly sqs: SqsGateway, options: { Now?: () => number } = {}) {
        this.now = options.Now ?? Date.now;
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const queue = await this.sqs.GetAttributes(config.QueueUrl);
        if (queue === null) {
            throw new Error(`SQS queue ${config.QueueUrl} does not exist`);
        }
        const deadLetter = (await this.sqs.GetAttributes(config.DeadLetterQueueUrl)) ?? {};
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: count(queue, 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed'),
            InFlight: count(queue, 'ApproximateNumberOfMessagesNotVisible'),
            DeadLettered: count(deadLetter, 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'),
            BlockedKeys: null,
            OldestPendingAgeSeconds: null,
            CompletedLastHour: null,
            AsOf: new Date(this.now()).toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, _cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const { Items } = await ScanDeadLetters(this.sqs, config.DeadLetterQueueUrl, Math.max(1, pageSize));
        await RestoreVisibility(this.sqs, config.DeadLetterQueueUrl, Items);
        return { Items: Items.map(ToDeadLetterRecord), NextCursor: null };
    }

    public async ListPartitions(_subscription: SubscriptionBinding, _condition: PartitionCondition | null, _cursor: string | null, _pageSize: number): Promise<Page<PartitionStateRecord> | null> {
        return null;
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const { Items, Match } = await this.find(config.DeadLetterQueueUrl, deliveryID);
        let removed = false;
        try {
            if (Match === null || Match.Envelope === null) {
                return { Supported: true, Changed: false };
            }
            await this.sqs.Send({
                QueueUrl: config.QueueUrl,
                Body: Match.Raw.Body,
                Attributes: {
                    [REPLAY_ATTRIBUTE]: '1',
                    ...(note ? { [REPLAY_NOTE_ATTRIBUTE]: note.slice(0, 500) } : {}),
                    ...(actorUserID ? { [REPLAYED_BY_ATTRIBUTE]: actorUserID } : {}),
                },
                ...(config.IsFifo ? { MessageGroupId: MessageGroupIdFor(Match.Envelope), MessageDeduplicationId: `${Match.Envelope.MessageID}:replay:${this.now()}` } : {}),
            });
            await this.sqs.Delete(config.DeadLetterQueueUrl, Match.Raw.ReceiptHandle);
            removed = true;
            return { Supported: true, Changed: true };
        } finally {
            // A match that stayed on the queue (unreadable body, or the delete failed) must become visible again too.
            await RestoreVisibility(this.sqs, config.DeadLetterQueueUrl, Items, removed ? Match?.Raw.ReceiptHandle : undefined);
        }
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, _reason: string, _actorUserID: string | null): Promise<OperatorResult> {
        const config = ReadAwsSubscriptionConfig(subscription.Config);
        const { Items, Match } = await this.find(config.DeadLetterQueueUrl, deliveryID);
        let removed = false;
        try {
            if (Match === null) {
                return { Supported: false };
            }
            await this.sqs.Delete(config.DeadLetterQueueUrl, Match.Raw.ReceiptHandle);
            removed = true;
            return { Supported: true, Changed: true };
        } finally {
            await RestoreVisibility(this.sqs, config.DeadLetterQueueUrl, Items, removed ? Match?.Raw.ReceiptHandle : undefined);
        }
    }

    private find(queueUrl: string, messageID: string): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
        return ScanDeadLetters(this.sqs, queueUrl, Number.MAX_SAFE_INTEGER, (item) => DeadLetterIdOf(item) === messageID);
    }
}
