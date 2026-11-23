import { MatchesFilter, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { AzureSqlFilterFor } from '../filterPolicy';
import type {
    AzureNamespaceProperties,
    AzureRuleProperties,
    AzureSubscriptionProperties,
    AzureSubscriptionRuntimeProperties,
    AzureTopicProperties,
    EnsureAzureSubscriptionOptions,
    EnsureAzureTopicOptions,
    ServiceBusAdminGateway,
} from '../gateway/ServiceBusAdminGateway';
import type {
    ServiceBusDeadLetterRequest,
    ServiceBusGateway,
    ServiceBusOutgoingMessage,
    ServiceBusReceivedRecord,
    ServiceBusReceiveRequest,
    ServiceBusScheduleRequest,
    ServiceBusSendEntryResult,
    ServiceBusSettleRequest,
} from '../gateway/ServiceBusGateway';

export interface FakeServiceBusMessage {
    MessageId: string;
    Body: string;
    ApplicationProperties: Record<string, string>;
    SessionId: string | null;
    SequenceNumber: number;
    DeliveryCount: number;
    /** Epoch ms when the message becomes available for receive (enqueued or scheduled). */
    AvailableAt: number;
    /** Epoch ms until which a peekLock is held. */
    LockedUntil: number;
    LockToken: string | null;
    EnqueuedTimeUtc: number;
    Settled: boolean;
    DeadLettered: boolean;
    DeadLetterReason: string | null;
    DeadLetterErrorDescription: string | null;
}

interface FakeSubscription {
    TopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
    MaxDeliveryCount: number;
    LockDurationSeconds: number;
    DeadLetteringOnMessageExpiration: boolean;
    Rules: AzureRuleProperties[];
    Filter: SubscriptionFilter | null;
    Messages: FakeServiceBusMessage[];
    DeadLetters: FakeServiceBusMessage[];
}

interface FakeTopic {
    Name: string;
    RequiresDuplicateDetection: boolean;
    SupportOrdering: boolean;
    DefaultMessageTimeToLive: string;
    Subscriptions: Map<string, FakeSubscription>;
}

export type FakeServiceBusOperation =
    | 'SendBatch'
    | 'Send'
    | 'Schedule'
    | 'Receive'
    | 'Complete'
    | 'Abandon'
    | 'DeadLetter'
    | 'RenewLock'
    | 'PeekDeadLetters'
    | 'ReceiveDeadLetters'
    | 'CompleteDeadLetter'
    | 'AbandonDeadLetter';

/**
 * Deterministic in-memory Azure Service Bus broker + ATOM management plane:
 * models topics, subscriptions, SQL rules, session exclusive locks, lock expiry,
 * scheduled retries, delivery counts, and per-subscription $DeadLetterQueue subqueues.
 */
export class FakeServiceBusGateway implements ServiceBusGateway, ServiceBusAdminGateway {
    public Now = 1_800_000_000_000;
    public readonly Namespace = 'mj-wq-test.servicebus.windows.net';
    public readonly Calls: { Op: FakeServiceBusOperation; TopicName: string; SubscriptionName?: string; Count?: number }[] = [];
    public readonly FailedBatchMessages = new Map<string, { Code: string; Message: string; SenderFault: boolean }>();
    public ThrowOnSendBatch: Error | null = null;
    public ThrowOnHealthCheck: Error | null = null;

    private readonly topics = new Map<string, FakeTopic>();
    private readonly failures = new Map<FakeServiceBusOperation, Error>();
    private sequence = 0;

    public Advance(seconds: number): void {
        this.Now += seconds * 1000;
    }

    public FailNext(op: FakeServiceBusOperation, error: Error): void {
        this.failures.set(op, error);
    }

    public AddTopic(name: string, options: EnsureAzureTopicOptions = {}): this {
        if (!this.topics.has(name)) {
            this.topics.set(name, {
                Name: name,
                RequiresDuplicateDetection: options.RequiresDuplicateDetection ?? false,
                SupportOrdering: options.SupportOrdering ?? false,
                DefaultMessageTimeToLive: options.DefaultMessageTimeToLive ?? 'P14D',
                Subscriptions: new Map(),
            });
        }
        return this;
    }

    public AddSubscription(
        topicName: string,
        subscriptionName: string,
        options: EnsureAzureSubscriptionOptions & { Filter?: SubscriptionFilter | null } = {},
    ): this {
        this.AddTopic(topicName);
        const topic = this.requireTopic(topicName);
        const expr = options.SqlFilterExpression ?? (options.Filter ? AzureSqlFilterFor(options.Filter) : null) ?? '1=1';
        topic.Subscriptions.set(subscriptionName, {
            TopicName: topicName,
            SubscriptionName: subscriptionName,
            RequiresSession: options.RequiresSession ?? false,
            MaxDeliveryCount: options.MaxDeliveryCount ?? 10,
            LockDurationSeconds: options.LockDurationSeconds ?? 60,
            DeadLetteringOnMessageExpiration: options.DeadLetteringOnMessageExpiration ?? true,
            Rules: [{ Name: '$Default', SqlExpression: expr }],
            Filter: options.Filter ?? null,
            Messages: [],
            DeadLetters: [],
        });
        return this;
    }

    /** Active (unsettled, non-dead-lettered) messages on a subscription, oldest first. */
    public Messages(topicName: string, subscriptionName: string): FakeServiceBusMessage[] {
        return this.requireSubscription(topicName, subscriptionName).Messages.filter((m) => !m.Settled && !m.DeadLettered);
    }

    /** Messages in a subscription's $DeadLetterQueue subqueue, oldest first. */
    public DeadLetters(topicName: string, subscriptionName: string): FakeServiceBusMessage[] {
        return this.requireSubscription(topicName, subscriptionName).DeadLetters.filter((m) => !m.Settled);
    }

    // ── Data Plane (ServiceBusGateway) ──

    public async SendBatch(topicName: string, messages: ServiceBusOutgoingMessage[]): Promise<ServiceBusSendEntryResult[]> {
        this.record('SendBatch', topicName, undefined, messages.length);
        if (this.ThrowOnSendBatch) {
            throw this.ThrowOnSendBatch;
        }
        this.requireTopic(topicName);
        return messages.map((msg) => {
            const failure = this.FailedBatchMessages.get(msg.MessageId);
            if (failure) {
                return { Id: msg.MessageId, Kind: 'Failed', ...failure };
            }
            this.fanOut(topicName, msg, msg.ScheduledEnqueueTimeUtc ? msg.ScheduledEnqueueTimeUtc.getTime() : this.Now);
            return { Id: msg.MessageId, Kind: 'Published' };
        });
    }

    public async Send(topicName: string, message: ServiceBusOutgoingMessage): Promise<string> {
        this.record('Send', topicName);
        this.requireTopic(topicName);
        this.fanOut(topicName, message, message.ScheduledEnqueueTimeUtc ? message.ScheduledEnqueueTimeUtc.getTime() : this.Now);
        return message.MessageId;
    }

    public async Schedule(request: ServiceBusScheduleRequest): Promise<string> {
        this.record('Schedule', request.TopicName);
        this.requireTopic(request.TopicName);
        const seq = ++this.sequence;
        this.fanOut(request.TopicName, request.Message, request.ScheduledEnqueueTimeUtc.getTime(), seq);
        return String(seq);
    }

    public async Receive(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedRecord[]> {
        this.record('Receive', request.TopicName, request.SubscriptionName, request.MaxMessages);
        if (request.Signal?.aborted) {
            return [];
        }
        const sub = this.requireSubscription(request.TopicName, request.SubscriptionName);
        const lockMs = sub.LockDurationSeconds * 1000;
        const max = Math.max(1, request.MaxMessages);
        const busySessions = new Set<string>();
        const received: ServiceBusReceivedRecord[] = [];

        if (sub.RequiresSession) {
            for (const m of sub.Messages) {
                if (!m.Settled && !m.DeadLettered && m.SessionId !== null && m.LockedUntil > this.Now) {
                    busySessions.add(m.SessionId);
                }
            }
        }

        for (const msg of sub.Messages) {
            if (received.length >= max) {
                break;
            }
            if (msg.Settled || msg.DeadLettered) {
                continue;
            }
            const available = msg.AvailableAt <= this.Now;
            const unlocked = msg.LockedUntil <= this.Now;
            if (sub.RequiresSession && msg.SessionId !== null) {
                if (busySessions.has(msg.SessionId)) {
                    continue;
                }
                if (!available || !unlocked) {
                    continue;
                }
                busySessions.add(msg.SessionId);
            } else if (!available || !unlocked) {
                continue;
            }

            msg.DeliveryCount += 1;
            msg.LockToken = `lock-${++this.sequence}`;
            msg.LockedUntil = this.Now + lockMs;
            received.push(this.toReceivedRecord(msg));
        }

        return received;
    }

    public async Complete(request: ServiceBusSettleRequest): Promise<boolean> {
        this.record('Complete', request.TopicName, request.SubscriptionName);
        const msg = this.ownedActive(request.TopicName, request.SubscriptionName, request.LockToken);
        if (!msg) {
            return false;
        }
        msg.Settled = true;
        return true;
    }

    public async Abandon(request: ServiceBusSettleRequest): Promise<boolean> {
        this.record('Abandon', request.TopicName, request.SubscriptionName);
        const msg = this.ownedActive(request.TopicName, request.SubscriptionName, request.LockToken);
        if (!msg) {
            return false;
        }
        if (request.PropertiesToModify) {
            Object.assign(msg.ApplicationProperties, request.PropertiesToModify);
        }
        msg.LockedUntil = this.Now;
        msg.LockToken = null;
        return true;
    }

    public async DeadLetter(request: ServiceBusDeadLetterRequest): Promise<boolean> {
        this.record('DeadLetter', request.TopicName, request.SubscriptionName);
        const sub = this.requireSubscription(request.TopicName, request.SubscriptionName);
        const msg = this.ownedActive(request.TopicName, request.SubscriptionName, request.LockToken);
        if (!msg) {
            return false;
        }
        msg.DeadLettered = true;
        msg.Settled = true;
        const copy: FakeServiceBusMessage = {
            ...msg,
            ApplicationProperties: {
                ...msg.ApplicationProperties,
                ...(request.PropertiesToModify ?? {}),
            },
            Settled: false,
            DeadLettered: true,
            DeadLetterReason: request.Reason,
            DeadLetterErrorDescription: request.ErrorDescription,
            LockedUntil: this.Now,
            LockToken: null,
        };
        sub.DeadLetters.push(copy);
        return true;
    }

    public async RenewLock(request: ServiceBusSettleRequest): Promise<Date | null> {
        this.record('RenewLock', request.TopicName, request.SubscriptionName);
        const sub = this.requireSubscription(request.TopicName, request.SubscriptionName);
        const msg = this.ownedActive(request.TopicName, request.SubscriptionName, request.LockToken);
        if (!msg) {
            return null;
        }
        msg.LockedUntil = this.Now + sub.LockDurationSeconds * 1000;
        return new Date(msg.LockedUntil);
    }

    public async PeekDeadLetters(topicName: string, subscriptionName: string, maxMessages: number): Promise<ServiceBusReceivedRecord[]> {
        this.record('PeekDeadLetters', topicName, subscriptionName, maxMessages);
        const sub = this.requireSubscription(topicName, subscriptionName);
        return sub.DeadLetters
            .filter((m) => !m.Settled)
            .slice(0, Math.max(1, maxMessages))
            .map((m) => this.toReceivedRecord(m));
    }

    public async ReceiveDeadLetters(
        topicName: string,
        subscriptionName: string,
        maxMessages: number,
    ): Promise<ServiceBusReceivedRecord[]> {
        this.record('ReceiveDeadLetters', topicName, subscriptionName, maxMessages);
        const sub = this.requireSubscription(topicName, subscriptionName);
        const lockMs = sub.LockDurationSeconds * 1000;
        const received: ServiceBusReceivedRecord[] = [];
        for (const msg of sub.DeadLetters) {
            if (received.length >= maxMessages) {
                break;
            }
            if (msg.Settled || msg.LockedUntil > this.Now) {
                continue;
            }
            msg.LockToken = `dlq-lock-${++this.sequence}`;
            msg.LockedUntil = this.Now + lockMs;
            received.push(this.toReceivedRecord(msg));
        }
        return received;
    }

    public async CompleteDeadLetter(topicName: string, subscriptionName: string, lockToken: string): Promise<boolean> {
        this.record('CompleteDeadLetter', topicName, subscriptionName);
        const msg = this.ownedDeadLetter(topicName, subscriptionName, lockToken);
        if (!msg) {
            return false;
        }
        msg.Settled = true;
        return true;
    }

    public async AbandonDeadLetter(topicName: string, subscriptionName: string, lockToken: string): Promise<boolean> {
        this.record('AbandonDeadLetter', topicName, subscriptionName);
        const msg = this.ownedDeadLetter(topicName, subscriptionName, lockToken);
        if (!msg) {
            return false;
        }
        msg.LockedUntil = this.Now;
        msg.LockToken = null;
        return true;
    }

    public async Close(): Promise<void> {
        // No-op for in-memory fake.
    }

    // ── Management Plane (ServiceBusAdminGateway) ──

    public async GetNamespaceProperties(): Promise<AzureNamespaceProperties> {
        if (this.ThrowOnHealthCheck) {
            throw this.ThrowOnHealthCheck;
        }
        return { Name: this.Namespace, MessagingSku: 'Standard' };
    }

    public async GetTopic(topicName: string): Promise<AzureTopicProperties | null> {
        const topic = this.topics.get(topicName);
        if (!topic) {
            return null;
        }
        return {
            Name: topic.Name,
            RequiresDuplicateDetection: topic.RequiresDuplicateDetection,
            SupportOrdering: topic.SupportOrdering,
            DefaultMessageTimeToLive: topic.DefaultMessageTimeToLive,
        };
    }

    public async EnsureTopic(topicName: string, options: EnsureAzureTopicOptions = {}): Promise<AzureTopicProperties> {
        this.AddTopic(topicName, options);
        const props = await this.GetTopic(topicName);
        if (!props) {
            throw new Error(`FakeServiceBusGateway: failed to create topic ${topicName}`);
        }
        return props;
    }

    public async DeleteTopic(topicName: string): Promise<boolean> {
        return this.topics.delete(topicName);
    }

    public async GetSubscription(topicName: string, subscriptionName: string): Promise<AzureSubscriptionProperties | null> {
        const sub = this.topics.get(topicName)?.Subscriptions.get(subscriptionName);
        if (!sub) {
            return null;
        }
        return {
            TopicName: sub.TopicName,
            SubscriptionName: sub.SubscriptionName,
            RequiresSession: sub.RequiresSession,
            MaxDeliveryCount: sub.MaxDeliveryCount,
            LockDurationSeconds: sub.LockDurationSeconds,
            DeadLetteringOnMessageExpiration: sub.DeadLetteringOnMessageExpiration,
        };
    }

    public async GetSubscriptionRuntimeProperties(
        topicName: string,
        subscriptionName: string,
    ): Promise<AzureSubscriptionRuntimeProperties | null> {
        const sub = this.topics.get(topicName)?.Subscriptions.get(subscriptionName);
        if (!sub) {
            return null;
        }
        const active = sub.Messages.filter((m) => !m.Settled && !m.DeadLettered && m.AvailableAt <= this.Now).length;
        const scheduled = sub.Messages.filter((m) => !m.Settled && !m.DeadLettered && m.AvailableAt > this.Now).length;
        const dlq = sub.DeadLetters.filter((m) => !m.Settled).length;
        return {
            TopicName: topicName,
            SubscriptionName: subscriptionName,
            ActiveMessageCount: active,
            DeadLetterMessageCount: dlq,
            ScheduledMessageCount: scheduled,
            TotalMessageCount: active + scheduled + dlq,
        };
    }

    public async EnsureSubscription(
        topicName: string,
        subscriptionName: string,
        options: EnsureAzureSubscriptionOptions = {},
    ): Promise<AzureSubscriptionProperties> {
        this.AddSubscription(topicName, subscriptionName, options);
        const props = await this.GetSubscription(topicName, subscriptionName);
        if (!props) {
            throw new Error(`FakeServiceBusGateway: failed to create subscription ${topicName}/${subscriptionName}`);
        }
        return props;
    }

    public async DeleteSubscription(topicName: string, subscriptionName: string): Promise<boolean> {
        return this.topics.get(topicName)?.Subscriptions.delete(subscriptionName) ?? false;
    }

    public async ListRules(topicName: string, subscriptionName: string): Promise<AzureRuleProperties[]> {
        return [...(this.topics.get(topicName)?.Subscriptions.get(subscriptionName)?.Rules ?? [])];
    }

    public async EnsureRule(topicName: string, subscriptionName: string, ruleName: string, sqlExpression: string): Promise<void> {
        const sub = this.requireSubscription(topicName, subscriptionName);
        const existing = sub.Rules.findIndex((r) => r.Name === ruleName);
        if (existing >= 0) {
            sub.Rules[existing] = { Name: ruleName, SqlExpression: sqlExpression };
        } else {
            sub.Rules.push({ Name: ruleName, SqlExpression: sqlExpression });
        }
    }

    private fanOut(topicName: string, message: ServiceBusOutgoingMessage, availableAt: number, fixedSequence?: number): void {
        const topic = this.requireTopic(topicName);
        for (const sub of topic.Subscriptions.values()) {
            if (!this.matchesSubscription(sub, message.ApplicationProperties)) {
                continue;
            }
            sub.Messages.push({
                MessageId: message.MessageId,
                Body: message.Body,
                ApplicationProperties: { ...message.ApplicationProperties },
                SessionId: message.SessionId ?? null,
                SequenceNumber: fixedSequence ?? ++this.sequence,
                DeliveryCount: 0,
                AvailableAt: availableAt,
                LockedUntil: 0,
                LockToken: null,
                EnqueuedTimeUtc: this.Now,
                Settled: false,
                DeadLettered: false,
                DeadLetterReason: null,
                DeadLetterErrorDescription: null,
            });
        }
    }

    private matchesSubscription(sub: FakeSubscription, appProps: Record<string, string>): boolean {
        if (sub.Filter !== null) {
            return MatchesFilter(sub.Filter, appProps);
        }
        const defaultRule = sub.Rules.find((r) => r.Name === '$Default');
        if (!defaultRule || defaultRule.SqlExpression === null || defaultRule.SqlExpression === '1=1') {
            return true;
        }
        return evaluateSimpleSqlFilter(defaultRule.SqlExpression, appProps);
    }

    private record(op: FakeServiceBusOperation, topicName: string, subscriptionName?: string, count?: number): void {
        this.Calls.push({ Op: op, TopicName: topicName, SubscriptionName: subscriptionName, Count: count });
        const failure = this.failures.get(op);
        if (failure) {
            this.failures.delete(op);
            throw failure;
        }
    }

    private requireTopic(topicName: string): FakeTopic {
        const topic = this.topics.get(topicName);
        if (!topic) {
            throw new Error(`FakeServiceBusGateway: topic ${topicName} does not exist`);
        }
        return topic;
    }

    private requireSubscription(topicName: string, subscriptionName: string): FakeSubscription {
        const sub = this.requireTopic(topicName).Subscriptions.get(subscriptionName);
        if (!sub) {
            throw new Error(`FakeServiceBusGateway: subscription ${topicName}/${subscriptionName} does not exist`);
        }
        return sub;
    }

    private ownedActive(topicName: string, subscriptionName: string, lockToken: string): FakeServiceBusMessage | undefined {
        const sub = this.requireSubscription(topicName, subscriptionName);
        return sub.Messages.find((m) => !m.Settled && !m.DeadLettered && m.LockToken === lockToken && m.LockedUntil > this.Now);
    }

    private ownedDeadLetter(topicName: string, subscriptionName: string, lockToken: string): FakeServiceBusMessage | undefined {
        const sub = this.requireSubscription(topicName, subscriptionName);
        return sub.DeadLetters.find((m) => !m.Settled && m.LockToken === lockToken && m.LockedUntil > this.Now);
    }

    private toReceivedRecord(msg: FakeServiceBusMessage): ServiceBusReceivedRecord {
        return {
            MessageId: msg.MessageId,
            LockToken: msg.LockToken ?? `peek-${msg.SequenceNumber}`,
            SequenceNumber: String(msg.SequenceNumber),
            Body: msg.Body,
            DeliveryCount: msg.DeliveryCount,
            SessionId: msg.SessionId,
            EnqueuedTimeUtc: msg.EnqueuedTimeUtc,
            LockedUntilUtc: msg.LockedUntil > 0 ? msg.LockedUntil : null,
            ApplicationProperties: { ...msg.ApplicationProperties },
            DeadLetterReason: msg.DeadLetterReason,
            DeadLetterErrorDescription: msg.DeadLetterErrorDescription,
        };
    }
}

/** Minimal SQL92 subset evaluator matching ToAzureSqlFilter output for testing when Filter is not directly attached. */
function evaluateSimpleSqlFilter(expr: string, attrs: Record<string, string>): boolean {
    const clauses = expr.split(' AND ').map((c) => c.trim());
    return clauses.every((clause) => {
        const eqMatch = /^user\.\[([^\]]+)\]\s*=\s*'((?:[^']|'')*)'$/.exec(clause);
        if (eqMatch) {
            const val = eqMatch[2].replace(/''/g, "'");
            return attrs[eqMatch[1]] === val;
        }
        const existsMatch = /^EXISTS\(user\.\[([^\]]+)\]\)$/.exec(clause);
        if (existsMatch) {
            return Object.prototype.hasOwnProperty.call(attrs, existsMatch[1]);
        }
        const notExistsMatch = /^NOT EXISTS\(user\.\[([^\]]+)\]\)$/.exec(clause);
        if (notExistsMatch) {
            return !Object.prototype.hasOwnProperty.call(attrs, notExistsMatch[1]);
        }
        return true;
    });
}
