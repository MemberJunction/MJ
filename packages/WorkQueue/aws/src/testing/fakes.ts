import type { SnsGateway, SnsPublishEntry, SnsPublishEntryResult } from '../gateway/SnsGateway';
import type { SqsGateway, SqsReceivedMessage, SqsReceiveRequest, SqsSendRequest } from '../gateway/SqsGateway';

export interface FakeSqsMessage {
    MessageId: string;
    Body: string;
    Attributes: Record<string, string>;
    GroupId: string | null;
    DeduplicationId: string | null;
    ReceiveCount: number;
    /** Epoch ms. */
    VisibleAt: number;
    ReceiptHandle: string | null;
    SentTimestamp: number;
    Deleted: boolean;
}

interface FakeQueue {
    Fifo: boolean;
    VisibilityTimeoutSeconds: number;
    Attributes: Record<string, string>;
    Messages: FakeSqsMessage[];
}

export type FakeSqsOperation = 'Receive' | 'Send' | 'ChangeVisibility' | 'Delete' | 'GetAttributes';

/** In-memory SQS: FIFO group blocking, visibility, receive counts, receipt-handle ownership, 5-minute FIFO dedup. */
export class FakeSqsGateway implements SqsGateway {
    /** Fake clock, epoch ms. */
    public Now = 1_800_000_000_000;
    public readonly Calls: { Op: FakeSqsOperation; QueueUrl: string; MaxMessages?: number; WaitTimeSeconds?: number }[] = [];
    private readonly queues = new Map<string, FakeQueue>();
    private readonly failures = new Map<FakeSqsOperation, Error>();
    private sequence = 0;

    public AddQueue(url: string, options: { Fifo: boolean; VisibilityTimeoutSeconds?: number; Attributes?: Record<string, string> }): this {
        this.queues.set(url, {
            Fifo: options.Fifo,
            VisibilityTimeoutSeconds: options.VisibilityTimeoutSeconds ?? 30,
            Attributes: options.Attributes ?? {},
            Messages: [],
        });
        return this;
    }

    /** Undeleted messages, oldest first. */
    public Messages(url: string): FakeSqsMessage[] {
        return this.queue(url).Messages.filter((m) => !m.Deleted);
    }

    public Advance(seconds: number): void {
        this.Now += seconds * 1000;
    }

    public FailNext(op: FakeSqsOperation, error: Error): void {
        this.failures.set(op, error);
    }

    public async Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]> {
        this.record('Receive', request.QueueUrl, { MaxMessages: request.MaxMessages, WaitTimeSeconds: request.WaitTimeSeconds });
        const queue = this.queue(request.QueueUrl);
        const visibility = (request.VisibilityTimeoutSeconds ?? queue.VisibilityTimeoutSeconds) * 1000;
        const blockedGroups = new Set<string>();
        const received: SqsReceivedMessage[] = [];
        for (const message of queue.Messages) {
            if (message.Deleted || received.length >= Math.min(Math.max(request.MaxMessages, 1), 10)) {
                continue;
            }
            const visible = message.VisibleAt <= this.Now;
            if (queue.Fifo && message.GroupId !== null && (blockedGroups.has(message.GroupId) || !visible)) {
                blockedGroups.add(message.GroupId);
                continue;
            }
            if (!visible) {
                continue;
            }
            message.ReceiveCount += 1;
            message.ReceiptHandle = `rh-${++this.sequence}`;
            message.VisibleAt = this.Now + visibility;
            received.push(this.toReceived(message));
        }
        return received;
    }

    public async Send(request: SqsSendRequest): Promise<string> {
        this.record('Send', request.QueueUrl);
        const queue = this.queue(request.QueueUrl);
        const dedupId = request.MessageDeduplicationId ?? null;
        if (queue.Fifo && dedupId !== null) {
            const duplicate = queue.Messages.find((m) => m.DeduplicationId === dedupId && m.SentTimestamp > this.Now - 300_000);
            if (duplicate) {
                return duplicate.MessageId;
            }
        }
        const message: FakeSqsMessage = {
            MessageId: `msg-${++this.sequence}`, Body: request.Body, Attributes: { ...(request.Attributes ?? {}) },
            GroupId: request.MessageGroupId ?? null, DeduplicationId: dedupId, ReceiveCount: 0, VisibleAt: this.Now,
            ReceiptHandle: null, SentTimestamp: this.Now, Deleted: false,
        };
        queue.Messages.push(message);
        return message.MessageId;
    }

    public async ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean> {
        this.record('ChangeVisibility', queueUrl);
        const message = this.owned(queueUrl, receiptHandle);
        if (!message || message.VisibleAt <= this.Now) {
            return false;
        }
        message.VisibleAt = this.Now + seconds * 1000;
        return true;
    }

    public async Delete(queueUrl: string, receiptHandle: string): Promise<boolean> {
        this.record('Delete', queueUrl);
        const message = this.owned(queueUrl, receiptHandle);
        if (!message) {
            return false;
        }
        message.Deleted = true;
        return true;
    }

    public async GetAttributes(queueUrl: string): Promise<Record<string, string> | null> {
        this.record('GetAttributes', queueUrl);
        const queue = this.queues.get(queueUrl);
        if (!queue) {
            return null;
        }
        const live = queue.Messages.filter((m) => !m.Deleted);
        return {
            FifoQueue: String(queue.Fifo),
            VisibilityTimeout: String(queue.VisibilityTimeoutSeconds),
            ApproximateNumberOfMessages: String(live.filter((m) => m.VisibleAt <= this.Now).length),
            ApproximateNumberOfMessagesNotVisible: String(live.filter((m) => m.VisibleAt > this.Now).length),
            ApproximateNumberOfMessagesDelayed: '0',
            ...queue.Attributes,
        };
    }

    private record(op: FakeSqsOperation, queueUrl: string, detail: { MaxMessages?: number; WaitTimeSeconds?: number } = {}): void {
        this.Calls.push({ Op: op, QueueUrl: queueUrl, ...detail });
        const failure = this.failures.get(op);
        if (failure) {
            this.failures.delete(op);
            throw failure;
        }
    }

    private queue(url: string): FakeQueue {
        const queue = this.queues.get(url);
        if (!queue) {
            throw new Error(`FakeSqsGateway: no queue ${url}`);
        }
        return queue;
    }

    private owned(url: string, receiptHandle: string): FakeSqsMessage | undefined {
        return this.queue(url).Messages.find((m) => !m.Deleted && m.ReceiptHandle === receiptHandle);
    }

    private toReceived(message: FakeSqsMessage): SqsReceivedMessage {
        return {
            MessageId: message.MessageId, ReceiptHandle: message.ReceiptHandle ?? '', Body: message.Body,
            ReceiveCount: message.ReceiveCount, MessageGroupId: message.GroupId, SentTimestamp: message.SentTimestamp,
            Attributes: { ...message.Attributes },
        };
    }
}

/** Records PublishBatch calls; entries listed in FailedEntries fail with the scripted reason. */
export class FakeSnsGateway implements SnsGateway {
    public readonly Batches: { TopicArn: string; Entries: SnsPublishEntry[] }[] = [];
    public readonly FailedEntries = new Map<string, { Code: string; Message: string; SenderFault: boolean }>();
    public readonly TopicAttributes = new Map<string, Record<string, string>>();
    public readonly SubscriptionAttributes = new Map<string, Record<string, string>>();
    public ThrowOnPublish: Error | null = null;

    public async PublishBatch(topicArn: string, entries: SnsPublishEntry[]): Promise<SnsPublishEntryResult[]> {
        if (this.ThrowOnPublish) {
            throw this.ThrowOnPublish;
        }
        this.Batches.push({ TopicArn: topicArn, Entries: entries.map((e) => ({ ...e })) });
        return entries.map((entry): SnsPublishEntryResult => {
            const failure = this.FailedEntries.get(entry.MessageDeduplicationId ?? entry.Id);
            return failure ? { Id: entry.Id, Kind: 'Failed', ...failure } : { Id: entry.Id, Kind: 'Published' };
        });
    }

    public async GetTopicAttributes(topicArn: string): Promise<Record<string, string> | null> {
        return this.TopicAttributes.get(topicArn) ?? null;
    }

    public async GetSubscriptionAttributes(subscriptionArn: string): Promise<Record<string, string> | null> {
        return this.SubscriptionAttributes.get(subscriptionArn) ?? null;
    }
}
