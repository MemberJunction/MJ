import { MatchesFilter, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { ExtractGcpResourceShortName } from '../config';
import { GcpPubSubFilterFor } from '../filterPolicy';
import type {
    EnsureGcpSubscriptionOptions,
    EnsureGcpTopicOptions,
    GcpSubscriptionProperties,
    GcpSubscriptionStatsProperties,
    GcpTopicProperties,
    PubSubAdminGateway,
} from '../gateway/PubSubAdminGateway';
import type {
    PubSubAckRequest,
    PubSubGateway,
    PubSubModifyAckDeadlineRequest,
    PubSubOutgoingMessage,
    PubSubPublishEntryResult,
    PubSubPullRequest,
    PubSubReceivedRecord,
} from '../gateway/PubSubGateway';

export interface FakePubSubMessage {
    ServerMessageId: string;
    MessageId: string;
    Data: string;
    Attributes: Record<string, string>;
    OrderingKey: string | null;
    DeliveryAttempt: number;
    PublishTimeMs: number;
    LockedUntil: number;
    AckId: string | null;
    Acked: boolean;
}

interface FakeSubscription {
    TopicName: string;
    SubscriptionName: string;
    AckDeadlineSeconds: number;
    EnableMessageOrdering: boolean;
    FilterExpression: string | null;
    Filter: SubscriptionFilter | null;
    DeadLetterTopicName: string | null;
    MaxDeliveryAttempts: number;
    Messages: FakePubSubMessage[];
}

interface FakeTopic {
    Name: string;
    Labels: Record<string, string>;
    Subscriptions: Set<string>;
}

export type FakePubSubOperation =
    | 'Publish'
    | 'PublishBatch'
    | 'Pull'
    | 'Acknowledge'
    | 'ModifyAckDeadline'
    | 'PullDeadLetters'
    | 'AcknowledgeDeadLetter'
    | 'NackDeadLetter';

/**
 * Deterministic in-memory Google Cloud Pub/Sub broker + admin plane:
 * models topics, filtered subscriptions, ordering-key single-flight isolation,
 * ack-deadline leases/extensions/nacks, delivery attempts, and dead-letter topics/subscriptions.
 */
export class FakePubSubGateway implements PubSubGateway, PubSubAdminGateway {
    public Now = 1_800_000_000_000;
    public readonly ProjectId = 'mj-wq-test';
    public readonly Calls: { Op: FakePubSubOperation; Target: string; Count?: number }[] = [];
    public readonly FailedBatchMessages = new Map<string, { Code: string; Message: string; SenderFault: boolean }>();
    public ThrowOnPublishBatch: Error | null = null;
    public ThrowOnHealthCheck: Error | null = null;

    private readonly topics = new Map<string, FakeTopic>();
    private readonly subscriptions = new Map<string, FakeSubscription>();
    private readonly failures = new Map<FakePubSubOperation, Error>();
    private sequence = 0;

    public Advance(seconds: number): void {
        this.Now += seconds * 1000;
    }

    public FailNext(op: FakePubSubOperation, error: Error): void {
        this.failures.set(op, error);
    }

    public AddTopic(name: string, options: EnsureGcpTopicOptions = {}): this {
        const shortName = ExtractGcpResourceShortName(name);
        if (!this.topics.has(shortName)) {
            this.topics.set(shortName, {
                Name: shortName,
                Labels: { ...(options.Labels ?? {}) },
                Subscriptions: new Set(),
            });
        }
        return this;
    }

    public AddSubscription(
        topicName: string,
        subscriptionName: string,
        options: EnsureGcpSubscriptionOptions & { FilterObject?: SubscriptionFilter | null } = {},
    ): this {
        const shortTopic = ExtractGcpResourceShortName(topicName);
        const shortSub = ExtractGcpResourceShortName(subscriptionName);
        this.AddTopic(shortTopic);
        const topic = this.requireTopic(shortTopic);
        const dlqTopic = options.DeadLetterTopicName ? ExtractGcpResourceShortName(options.DeadLetterTopicName) : null;
        if (dlqTopic) {
            this.AddTopic(dlqTopic);
        }
        const filterExpr = options.Filter ?? (options.FilterObject ? GcpPubSubFilterFor(options.FilterObject) : null);
        this.subscriptions.set(shortSub, {
            TopicName: shortTopic,
            SubscriptionName: shortSub,
            AckDeadlineSeconds: options.AckDeadlineSeconds ?? 60,
            EnableMessageOrdering: options.EnableMessageOrdering ?? false,
            FilterExpression: filterExpr,
            Filter: options.FilterObject ?? null,
            DeadLetterTopicName: dlqTopic,
            MaxDeliveryAttempts: options.MaxDeliveryAttempts ?? 10,
            Messages: [],
        });
        topic.Subscriptions.add(shortSub);
        return this;
    }

    /** Active (unacked) messages on a subscription, oldest first. */
    public Messages(subscriptionName: string): FakePubSubMessage[] {
        return this.requireSubscription(subscriptionName).Messages.filter((m) => !m.Acked);
    }

    // ── Data Plane (PubSubGateway) ──

    public async Publish(topicName: string, message: PubSubOutgoingMessage): Promise<string> {
        const shortTopic = ExtractGcpResourceShortName(topicName);
        this.record('Publish', shortTopic);
        this.requireTopic(shortTopic);
        return this.fanOut(shortTopic, message);
    }

    public async PublishBatch(topicName: string, messages: PubSubOutgoingMessage[]): Promise<PubSubPublishEntryResult[]> {
        const shortTopic = ExtractGcpResourceShortName(topicName);
        this.record('PublishBatch', shortTopic, messages.length);
        if (this.ThrowOnPublishBatch) {
            throw this.ThrowOnPublishBatch;
        }
        this.requireTopic(shortTopic);
        return messages.map((msg) => {
            const failure = this.FailedBatchMessages.get(msg.MessageId);
            if (failure) {
                return { Id: msg.MessageId, Kind: 'Failed', ...failure };
            }
            const serverId = this.fanOut(shortTopic, msg);
            return { Id: msg.MessageId, Kind: 'Published', ServerMessageId: serverId };
        });
    }

    public async Pull(request: PubSubPullRequest): Promise<PubSubReceivedRecord[]> {
        const shortSub = ExtractGcpResourceShortName(request.SubscriptionName);
        this.record('Pull', shortSub, request.MaxMessages);
        if (request.Signal?.aborted) {
            return [];
        }
        const sub = this.requireSubscription(shortSub);
        const deadlineSec = request.AckDeadlineSeconds > 0 ? request.AckDeadlineSeconds : sub.AckDeadlineSeconds;
        const lockMs = deadlineSec * 1000;
        const max = Math.max(1, request.MaxMessages);
        const busyKeys = new Set<string>();
        const pulled: PubSubReceivedRecord[] = [];

        if (sub.EnableMessageOrdering) {
            for (const m of sub.Messages) {
                if (!m.Acked && m.OrderingKey !== null && m.LockedUntil > this.Now) {
                    busyKeys.add(m.OrderingKey);
                }
            }
        }

        for (const msg of sub.Messages) {
            if (pulled.length >= max) {
                break;
            }
            if (msg.Acked || msg.LockedUntil > this.Now) {
                continue;
            }
            if (sub.EnableMessageOrdering && msg.OrderingKey !== null) {
                if (busyKeys.has(msg.OrderingKey)) {
                    continue;
                }
                busyKeys.add(msg.OrderingKey);
            }
            msg.DeliveryAttempt += 1;
            msg.AckId = `ack-${++this.sequence}`;
            msg.LockedUntil = this.Now + lockMs;
            pulled.push(this.toReceivedRecord(msg));
        }
        return pulled;
    }

    public async Acknowledge(request: PubSubAckRequest): Promise<boolean> {
        const shortSub = ExtractGcpResourceShortName(request.SubscriptionName);
        this.record('Acknowledge', shortSub, request.AckIds.length);
        let anySettled = false;
        for (const ackId of request.AckIds) {
            const msg = this.ownedActive(shortSub, ackId);
            if (msg) {
                msg.Acked = true;
                anySettled = true;
            }
        }
        return anySettled;
    }

    public async ModifyAckDeadline(request: PubSubModifyAckDeadlineRequest): Promise<boolean> {
        const shortSub = ExtractGcpResourceShortName(request.SubscriptionName);
        this.record('ModifyAckDeadline', shortSub, request.AckIds.length);
        let anyModified = false;
        for (const ackId of request.AckIds) {
            const msg = this.ownedActive(shortSub, ackId);
            if (!msg) {
                continue;
            }
            if (request.AckDeadlineSeconds <= 0) {
                msg.LockedUntil = this.Now;
                msg.AckId = null;
            } else {
                msg.LockedUntil = this.Now + request.AckDeadlineSeconds * 1000;
            }
            anyModified = true;
        }
        return anyModified;
    }

    public async PullDeadLetters(deadLetterSubscriptionName: string, maxMessages: number): Promise<PubSubReceivedRecord[]> {
        const shortSub = ExtractGcpResourceShortName(deadLetterSubscriptionName);
        this.record('PullDeadLetters', shortSub, maxMessages);
        const sub = this.requireSubscription(shortSub);
        const lockMs = sub.AckDeadlineSeconds * 1000;
        const pulled: PubSubReceivedRecord[] = [];
        for (const msg of sub.Messages) {
            if (pulled.length >= maxMessages) {
                break;
            }
            if (msg.Acked || msg.LockedUntil > this.Now) {
                continue;
            }
            msg.AckId = `dlq-ack-${++this.sequence}`;
            msg.LockedUntil = this.Now + lockMs;
            pulled.push(this.toReceivedRecord(msg));
        }
        return pulled;
    }

    public async AcknowledgeDeadLetter(deadLetterSubscriptionName: string, ackId: string): Promise<boolean> {
        const shortSub = ExtractGcpResourceShortName(deadLetterSubscriptionName);
        this.record('AcknowledgeDeadLetter', shortSub);
        const msg = this.ownedActive(shortSub, ackId);
        if (!msg) {
            return false;
        }
        msg.Acked = true;
        return true;
    }

    public async NackDeadLetter(deadLetterSubscriptionName: string, ackId: string): Promise<boolean> {
        const shortSub = ExtractGcpResourceShortName(deadLetterSubscriptionName);
        this.record('NackDeadLetter', shortSub);
        const msg = this.ownedActive(shortSub, ackId);
        if (!msg) {
            return false;
        }
        msg.LockedUntil = this.Now;
        msg.AckId = null;
        return true;
    }

    public async Close(): Promise<void> {
        // No-op for in-memory fake.
    }

    // ── Management Plane (PubSubAdminGateway) ──

    public async CheckHealth(): Promise<boolean> {
        if (this.ThrowOnHealthCheck) {
            throw this.ThrowOnHealthCheck;
        }
        return true;
    }

    public async GetTopic(topicName: string): Promise<GcpTopicProperties | null> {
        const shortTopic = ExtractGcpResourceShortName(topicName);
        const topic = this.topics.get(shortTopic);
        if (!topic) {
            return null;
        }
        return { Name: topic.Name, Labels: { ...topic.Labels } };
    }

    public async EnsureTopic(topicName: string, options: EnsureGcpTopicOptions = {}): Promise<GcpTopicProperties> {
        this.AddTopic(topicName, options);
        const props = await this.GetTopic(topicName);
        if (!props) {
            throw new Error(`FakePubSubGateway: failed to create topic ${topicName}`);
        }
        return props;
    }

    public async DeleteTopic(topicName: string): Promise<boolean> {
        const shortTopic = ExtractGcpResourceShortName(topicName);
        return this.topics.delete(shortTopic);
    }

    public async GetSubscription(subscriptionName: string): Promise<GcpSubscriptionProperties | null> {
        const shortSub = ExtractGcpResourceShortName(subscriptionName);
        const sub = this.subscriptions.get(shortSub);
        if (!sub) {
            return null;
        }
        return {
            TopicName: sub.TopicName,
            SubscriptionName: sub.SubscriptionName,
            AckDeadlineSeconds: sub.AckDeadlineSeconds,
            EnableMessageOrdering: sub.EnableMessageOrdering,
            Filter: sub.FilterExpression,
            DeadLetterPolicy: sub.DeadLetterTopicName
                ? { DeadLetterTopic: sub.DeadLetterTopicName, MaxDeliveryAttempts: sub.MaxDeliveryAttempts }
                : null,
        };
    }

    public async GetSubscriptionStats(
        subscriptionName: string,
        deadLetterSubscriptionName: string | null,
    ): Promise<GcpSubscriptionStatsProperties | null> {
        const shortSub = ExtractGcpResourceShortName(subscriptionName);
        const sub = this.subscriptions.get(shortSub);
        if (!sub) {
            return null;
        }
        const undelivered = sub.Messages.filter((m) => !m.Acked).length;
        const dlqCount = deadLetterSubscriptionName
            ? (this.subscriptions.get(ExtractGcpResourceShortName(deadLetterSubscriptionName))?.Messages.filter((m) => !m.Acked).length ?? 0)
            : 0;
        return {
            SubscriptionName: sub.SubscriptionName,
            UndeliveredMessageCount: undelivered,
            DeadLetterMessageCount: dlqCount,
        };
    }

    public async EnsureSubscription(
        topicName: string,
        subscriptionName: string,
        options: EnsureGcpSubscriptionOptions = {},
    ): Promise<GcpSubscriptionProperties> {
        this.AddSubscription(topicName, subscriptionName, options);
        const props = await this.GetSubscription(subscriptionName);
        if (!props) {
            throw new Error(`FakePubSubGateway: failed to create subscription ${subscriptionName}`);
        }
        return props;
    }

    public async DeleteSubscription(subscriptionName: string): Promise<boolean> {
        const shortSub = ExtractGcpResourceShortName(subscriptionName);
        const sub = this.subscriptions.get(shortSub);
        if (!sub) {
            return false;
        }
        this.topics.get(sub.TopicName)?.Subscriptions.delete(shortSub);
        return this.subscriptions.delete(shortSub);
    }

    private fanOut(topicName: string, message: PubSubOutgoingMessage): string {
        const topic = this.requireTopic(topicName);
        const serverId = `ps-${++this.sequence}`;
        for (const subName of topic.Subscriptions) {
            const sub = this.subscriptions.get(subName);
            if (!sub || !this.matchesSubscription(sub, message.Attributes)) {
                continue;
            }
            sub.Messages.push({
                ServerMessageId: serverId,
                MessageId: message.MessageId,
                Data: message.Data,
                Attributes: { ...message.Attributes },
                OrderingKey: message.OrderingKey ?? null,
                DeliveryAttempt: 0,
                PublishTimeMs: this.Now,
                LockedUntil: 0,
                AckId: null,
                Acked: false,
            });
        }
        return serverId;
    }

    private matchesSubscription(sub: FakeSubscription, attrs: Record<string, string>): boolean {
        if (sub.Filter !== null) {
            return MatchesFilter(sub.Filter, attrs);
        }
        if (sub.FilterExpression === null || sub.FilterExpression.trim() === '') {
            return true;
        }
        return evaluateSimplePubSubFilter(sub.FilterExpression, attrs);
    }

    private record(op: FakePubSubOperation, target: string, count?: number): void {
        this.Calls.push({ Op: op, Target: target, Count: count });
        const failure = this.failures.get(op);
        if (failure) {
            this.failures.delete(op);
            throw failure;
        }
    }

    private requireTopic(topicName: string): FakeTopic {
        const topic = this.topics.get(topicName);
        if (!topic) {
            throw new Error(`FakePubSubGateway: topic ${topicName} does not exist`);
        }
        return topic;
    }

    private requireSubscription(subscriptionName: string): FakeSubscription {
        const sub = this.subscriptions.get(subscriptionName);
        if (!sub) {
            throw new Error(`FakePubSubGateway: subscription ${subscriptionName} does not exist`);
        }
        return sub;
    }

    private ownedActive(subscriptionName: string, ackId: string): FakePubSubMessage | undefined {
        const sub = this.requireSubscription(subscriptionName);
        return sub.Messages.find((m) => !m.Acked && m.AckId === ackId && m.LockedUntil > this.Now);
    }

    private toReceivedRecord(msg: FakePubSubMessage): PubSubReceivedRecord {
        return {
            ServerMessageId: msg.ServerMessageId,
            AckId: msg.AckId ?? `peek-${msg.ServerMessageId}`,
            Data: msg.Data,
            DeliveryAttempt: msg.DeliveryAttempt,
            OrderingKey: msg.OrderingKey,
            PublishTimeMs: msg.PublishTimeMs,
            AckDeadlineExpiresAtMs: msg.LockedUntil > 0 ? msg.LockedUntil : null,
            Attributes: { ...msg.Attributes },
        };
    }
}

/** Minimal Pub/Sub filter subset evaluator matching ToGcpPubSubFilter output when FilterObject is not directly attached. */
function evaluateSimplePubSubFilter(expr: string, attrs: Record<string, string>): boolean {
    const clauses = expr.split(' AND ').map((c) => c.trim());
    return clauses.every((clause) => {
        const eqMatch = /^attributes\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"$/.exec(clause);
        if (eqMatch) {
            const val = eqMatch[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            return attrs[eqMatch[1]] === val;
        }
        const hasMatch = /^attributes:([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(clause);
        if (hasMatch) {
            return Object.prototype.hasOwnProperty.call(attrs, hasMatch[1]);
        }
        const notHasMatch = /^NOT attributes:([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(clause);
        if (notHasMatch) {
            return !Object.prototype.hasOwnProperty.call(attrs, notHasMatch[1]);
        }
        return true;
    });
}
