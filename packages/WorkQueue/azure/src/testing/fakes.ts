import { MatchesFilter, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { ServiceBusRuleSqlFor, SERVICE_BUS_RULE_NAME } from '../filterSql';
import type {
    ServiceBusAdminGateway, ServiceBusRuleInfo, ServiceBusSubscriptionCounts, ServiceBusSubscriptionInfo, ServiceBusTopicInfo,
} from '../gateway/ServiceBusAdminGateway';
import type {
    ServiceBusDeadLetterRequest, ServiceBusGateway, ServiceBusOutboundMessage, ServiceBusPeekRequest, ServiceBusReceivedEnvelope, ServiceBusReceiveRequest,
} from '../gateway/ServiceBusGateway';
import { RUNTIME_PROPERTIES, SERVICE_BUS_MAX_DELIVERY_REASON, StringProperty, UserAttributes } from '../properties';

export interface FakeServiceBusMessage {
    SequenceNumber: number;
    MessageId: string;
    Body: string;
    Properties: Record<string, string>;
    SessionId: string | null;
    CorrelationId: string | null;
    DeliveryCount: number;
    /** Epoch ms. */
    EnqueuedAt: number;
    /** Epoch ms; scheduled messages are invisible before it. */
    VisibleAt: number;
    LockToken: string | null;
    LockOwner: string | null;
    /** Epoch ms. */
    LockedUntil: number | null;
    Settled: boolean;
    DeadLetterReason: string | null;
    DeadLetterErrorDescription: string | null;
}

export interface FakeSubscriptionOptions {
    /** The MJ subscription name the targeting clause compares against. */
    MjSubscriptionName: string;
    RequiresSession: boolean;
    LockDurationSeconds?: number;
    MaxDeliveryCount?: number;
    Filter?: SubscriptionFilter | null;
    /** Rules reported by ListRules; defaults to the one MJ rule for the filter. */
    Rules?: ServiceBusRuleInfo[];
    Status?: string;
}

interface FakeSubscription extends Required<Omit<FakeSubscriptionOptions, 'Rules' | 'Filter'>> {
    Filter: SubscriptionFilter | null;
    Rules: ServiceBusRuleInfo[] | null;
    Messages: FakeServiceBusMessage[];
    DeadLetters: FakeServiceBusMessage[];
}

interface FakeTopic {
    SupportOrdering: boolean;
    RequiresDuplicateDetection: boolean;
    Subscriptions: Map<string, FakeSubscription>;
    /** MessageId → enqueue time, for duplicate detection. */
    Seen: Map<string, number>;
}

export type FakeServiceBusOperation = 'Send' | 'Schedule' | 'Receive' | 'Complete' | 'Abandon' | 'DeadLetter' | 'RenewLock' | 'Peek' | 'ReleaseReceiver' | 'GetTopic' | 'GetSubscription' | 'GetSubscriptionCounts' | 'ListRules';

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * In-memory Service Bus: topics with subscription rules (targeting + the MJ filter), peek-lock with lock expiry,
 * DeliveryCount, MaxDeliveryCount dead-lettering, scheduled messages, sessions (one receiver per session, one
 * message per accepted session), a dead-letter subqueue with non-destructive peek, and duplicate detection.
 */
export class FakeServiceBus implements ServiceBusGateway, ServiceBusAdminGateway {
    /** Fake clock, epoch ms. */
    public Now = 1_800_000_000_000;
    public readonly Calls: { Op: FakeServiceBusOperation; Topic: string; Subscription?: string }[] = [];
    private readonly topics = new Map<string, FakeTopic>();
    private readonly failures = new Map<FakeServiceBusOperation, Error>();
    /** Session receiver handle → { topic, subscription, sessionId }. */
    private readonly sessions = new Map<string, { Topic: string; Subscription: string; SessionId: string }>();
    private sequence = 0;
    private handleSequence = 0;

    public AddTopic(name: string, options: { SupportOrdering?: boolean; RequiresDuplicateDetection?: boolean } = {}): this {
        this.topics.set(name, {
            SupportOrdering: options.SupportOrdering ?? false,
            RequiresDuplicateDetection: options.RequiresDuplicateDetection ?? true,
            Subscriptions: new Map(),
            Seen: new Map(),
        });
        return this;
    }

    public AddSubscription(topicName: string, name: string, options: FakeSubscriptionOptions): this {
        this.topic(topicName).Subscriptions.set(name, {
            MjSubscriptionName: options.MjSubscriptionName,
            RequiresSession: options.RequiresSession,
            LockDurationSeconds: options.LockDurationSeconds ?? 60,
            MaxDeliveryCount: options.MaxDeliveryCount ?? 10,
            Filter: options.Filter ?? null,
            Rules: options.Rules ?? null,
            Status: options.Status ?? 'Active',
            Messages: [],
            DeadLetters: [],
        });
        return this;
    }

    /** Unsettled messages of the subscription, in sequence order. */
    public Messages(topicName: string, subscriptionName: string): FakeServiceBusMessage[] {
        return this.subscription(topicName, subscriptionName).Messages.filter((m) => !m.Settled);
    }

    public DeadLetters(topicName: string, subscriptionName: string): FakeServiceBusMessage[] {
        return this.subscription(topicName, subscriptionName).DeadLetters.filter((m) => !m.Settled);
    }

    /** Session receivers currently open (one per accepted session). */
    public get OpenSessions(): number {
        return this.sessions.size;
    }

    public Advance(seconds: number): void {
        this.Now += seconds * 1000;
    }

    public FailNext(op: FakeServiceBusOperation, error: Error): void {
        this.failures.set(op, error);
    }

    public async Send(topicName: string, messages: ServiceBusOutboundMessage[]): Promise<void> {
        this.record('Send', topicName);
        this.enqueue(topicName, messages, this.Now);
    }

    public async Schedule(topicName: string, messages: ServiceBusOutboundMessage[], enqueueAt: Date): Promise<void> {
        this.record('Schedule', topicName);
        this.enqueue(topicName, messages, Math.max(this.Now, enqueueAt.getTime()));
    }

    public async Receive(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedEnvelope[]> {
        this.record('Receive', request.TopicName, request.SubscriptionName);
        const subscription = this.subscription(request.TopicName, request.SubscriptionName);
        const max = Math.min(Math.max(request.MaxMessages, 1), 100);
        if (request.RequiresSession && !request.DeadLetter) {
            return this.receiveSessions(request.TopicName, request.SubscriptionName, subscription, max);
        }
        const handle = `r:${request.TopicName}|${request.SubscriptionName}|${request.DeadLetter ? 'dlq' : 'main'}`;
        const source = request.DeadLetter ? subscription.DeadLetters : subscription.Messages;
        const received: ServiceBusReceivedEnvelope[] = [];
        for (const message of source) {
            if (received.length >= max) {
                break;
            }
            if (this.available(message)) {
                const locked = this.lock(message, subscription, handle, request.DeadLetter === true);
                if (locked) {
                    received.push(locked);
                }
            }
        }
        return received;
    }

    public async Complete(message: ServiceBusReceivedEnvelope): Promise<boolean> {
        this.record('Complete', '');
        const owned = this.owned(message);
        if (!owned) {
            return false;
        }
        owned.Settled = true;
        owned.LockToken = null;
        return true;
    }

    public async Abandon(message: ServiceBusReceivedEnvelope): Promise<boolean> {
        this.record('Abandon', '');
        const owned = this.owned(message);
        if (!owned) {
            return false;
        }
        owned.LockToken = null;
        owned.LockOwner = null;
        owned.LockedUntil = null;
        return true;
    }

    public async DeadLetter(message: ServiceBusReceivedEnvelope, request: ServiceBusDeadLetterRequest): Promise<boolean> {
        this.record('DeadLetter', '');
        const owned = this.owned(message);
        if (!owned) {
            return false;
        }
        const location = this.locate(message);
        owned.Settled = true;
        owned.LockToken = null;
        location.Subscription.DeadLetters.push({
            ...owned, SequenceNumber: ++this.sequence, Properties: { ...owned.Properties, ...request.Properties }, DeliveryCount: 0,
            LockToken: null, LockOwner: null, LockedUntil: null, Settled: false, VisibleAt: this.Now,
            DeadLetterReason: request.Reason, DeadLetterErrorDescription: request.Description,
        });
        return true;
    }

    public async RenewLock(message: ServiceBusReceivedEnvelope): Promise<number | null> {
        this.record('RenewLock', '');
        const owned = this.owned(message);
        if (!owned) {
            return null;
        }
        owned.LockedUntil = this.Now + this.locate(message).Subscription.LockDurationSeconds * 1000;
        return owned.LockedUntil;
    }

    public async Peek(request: ServiceBusPeekRequest): Promise<ServiceBusReceivedEnvelope[]> {
        this.record('Peek', request.TopicName, request.SubscriptionName);
        const subscription = this.subscription(request.TopicName, request.SubscriptionName);
        const from = request.FromSequenceNumber === null ? 0 : Number(request.FromSequenceNumber);
        const source = request.DeadLetter ? subscription.DeadLetters : subscription.Messages;
        return source
            .filter((m) => !m.Settled && m.SequenceNumber >= from)
            .slice(0, Math.max(1, request.MaxMessages))
            .map((m) => this.envelope(m, `peek:${request.TopicName}|${request.SubscriptionName}`, false));
    }

    public async ReleaseReceiver(handle: string): Promise<void> {
        this.record('ReleaseReceiver', '');
        const session = this.sessions.get(handle);
        if (!session) {
            return;
        }
        this.sessions.delete(handle);
        // Closing a session receiver drops its message locks: an unsettled message becomes receivable again.
        for (const message of this.subscription(session.Topic, session.Subscription).Messages) {
            if (message.LockOwner === handle && !message.Settled) {
                message.LockToken = null;
                message.LockOwner = null;
                message.LockedUntil = null;
            }
        }
    }

    public async GetTopic(topicName: string): Promise<ServiceBusTopicInfo | null> {
        this.record('GetTopic', topicName);
        const topic = this.topics.get(topicName);
        return topic ? { Name: topicName, SupportOrdering: topic.SupportOrdering, RequiresDuplicateDetection: topic.RequiresDuplicateDetection, MaxMessageSizeInKilobytes: 256, Status: 'Active' } : null;
    }

    public async GetSubscription(topicName: string, subscriptionName: string): Promise<ServiceBusSubscriptionInfo | null> {
        this.record('GetSubscription', topicName, subscriptionName);
        const subscription = this.topics.get(topicName)?.Subscriptions.get(subscriptionName);
        return subscription
            ? {
                TopicName: topicName, Name: subscriptionName, RequiresSession: subscription.RequiresSession, LockDurationSeconds: subscription.LockDurationSeconds,
                MaxDeliveryCount: subscription.MaxDeliveryCount, DeadLetteringOnMessageExpiration: true, Status: subscription.Status,
            }
            : null;
    }

    public async GetSubscriptionCounts(topicName: string, subscriptionName: string): Promise<ServiceBusSubscriptionCounts | null> {
        this.record('GetSubscriptionCounts', topicName, subscriptionName);
        const subscription = this.topics.get(topicName)?.Subscriptions.get(subscriptionName);
        if (!subscription) {
            return null;
        }
        return {
            Active: subscription.Messages.filter((m) => !m.Settled && m.VisibleAt <= this.Now).length,
            DeadLettered: subscription.DeadLetters.filter((m) => !m.Settled).length,
        };
    }

    public async ListRules(topicName: string, subscriptionName: string): Promise<ServiceBusRuleInfo[]> {
        this.record('ListRules', topicName, subscriptionName);
        const subscription = this.topics.get(topicName)?.Subscriptions.get(subscriptionName);
        if (!subscription) {
            return [];
        }
        return subscription.Rules ?? [{ Name: SERVICE_BUS_RULE_NAME, Sql: ServiceBusRuleSqlFor(subscription.Filter, subscription.MjSubscriptionName) }];
    }

    private enqueue(topicName: string, messages: ServiceBusOutboundMessage[], visibleAt: number): void {
        const topic = this.topic(topicName);
        for (const message of messages) {
            if (topic.RequiresDuplicateDetection) {
                const seenAt = topic.Seen.get(message.MessageId);
                if (seenAt !== undefined && seenAt > this.Now - DUPLICATE_WINDOW_MS) {
                    continue;
                }
                topic.Seen.set(message.MessageId, this.Now);
            }
            const target = StringProperty(message.ApplicationProperties, RUNTIME_PROPERTIES.Target);
            for (const subscription of topic.Subscriptions.values()) {
                if (target !== undefined && target !== subscription.MjSubscriptionName) {
                    continue;
                }
                if (!MatchesFilter(subscription.Filter, UserAttributes(message.ApplicationProperties))) {
                    continue;
                }
                subscription.Messages.push({
                    SequenceNumber: ++this.sequence, MessageId: message.MessageId, Body: message.Body, Properties: { ...message.ApplicationProperties },
                    SessionId: message.SessionId ?? null, CorrelationId: message.CorrelationId ?? null, DeliveryCount: 0,
                    EnqueuedAt: this.Now, VisibleAt: visibleAt, LockToken: null, LockOwner: null, LockedUntil: null, Settled: false,
                    DeadLetterReason: null, DeadLetterErrorDescription: null,
                });
            }
        }
    }

    private receiveSessions(topicName: string, subscriptionName: string, subscription: FakeSubscription, max: number): ServiceBusReceivedEnvelope[] {
        const lockedSessions = new Set([...this.sessions.values()]
            .filter((s) => s.Topic === topicName && s.Subscription === subscriptionName)
            .map((s) => s.SessionId));
        const received: ServiceBusReceivedEnvelope[] = [];
        for (const message of subscription.Messages) {
            if (received.length >= max) {
                break;
            }
            const sessionId = message.SessionId ?? message.MessageId;
            if (lockedSessions.has(sessionId) || !this.available(message)) {
                continue;
            }
            const handle = `s:${++this.handleSequence}`;
            const locked = this.lock(message, subscription, handle, false);
            if (locked) {
                this.sessions.set(handle, { Topic: topicName, Subscription: subscriptionName, SessionId: sessionId });
                lockedSessions.add(sessionId);
                received.push(locked);
            }
        }
        return received;
    }

    private available(message: FakeServiceBusMessage): boolean {
        return !message.Settled && message.VisibleAt <= this.Now && (message.LockedUntil === null || message.LockedUntil <= this.Now);
    }

    /** Locks the message for the receiver; a message past MaxDeliveryCount is dead-lettered by the service instead. */
    private lock(message: FakeServiceBusMessage, subscription: FakeSubscription, handle: string, deadLetterQueue: boolean): ServiceBusReceivedEnvelope | null {
        message.DeliveryCount += 1;
        if (!deadLetterQueue && message.DeliveryCount > subscription.MaxDeliveryCount) {
            message.Settled = true;
            subscription.DeadLetters.push({
                ...message, SequenceNumber: ++this.sequence, DeliveryCount: 0, LockToken: null, LockOwner: null, LockedUntil: null,
                Settled: false, DeadLetterReason: SERVICE_BUS_MAX_DELIVERY_REASON, DeadLetterErrorDescription: 'Message could not be consumed after maximum delivery attempts.',
            });
            return null;
        }
        message.LockToken = `lt-${++this.handleSequence}`;
        message.LockOwner = handle;
        message.LockedUntil = this.Now + subscription.LockDurationSeconds * 1000;
        return this.envelope(message, handle, true);
    }

    private owned(message: ServiceBusReceivedEnvelope): FakeServiceBusMessage | null {
        const location = this.locate(message);
        const source = message.Receiver.endsWith('|dlq') ? location.Subscription.DeadLetters : location.Subscription.Messages;
        const found = source.find((m) => !m.Settled && m.LockToken !== null && m.LockToken === message.LockToken && m.LockOwner === message.Receiver);
        return found && found.LockedUntil !== null && found.LockedUntil > this.Now ? found : null;
    }

    /** Which subscription a received envelope came from, by its receiver handle. */
    private locate(message: ServiceBusReceivedEnvelope): { Subscription: FakeSubscription } {
        const session = this.sessions.get(message.Receiver);
        if (session) {
            return { Subscription: this.subscription(session.Topic, session.Subscription) };
        }
        const match = /^r:([^|]+)\|([^|]+)\|(?:main|dlq)$/.exec(message.Receiver) ?? /^peek:([^|]+)\|([^|]+)$/.exec(message.Receiver);
        if (!match) {
            throw new Error(`FakeServiceBus: unknown receiver handle ${message.Receiver}`);
        }
        return { Subscription: this.subscription(match[1], match[2]) };
    }

    private envelope(message: FakeServiceBusMessage, handle: string, locked: boolean): ServiceBusReceivedEnvelope {
        return {
            MessageId: message.MessageId, Body: message.Body, ApplicationProperties: { ...message.Properties }, SessionId: message.SessionId,
            CorrelationId: message.CorrelationId, DeliveryCount: message.DeliveryCount, EnqueuedTimeUtc: message.EnqueuedAt,
            LockedUntilUtc: locked ? message.LockedUntil : null, LockToken: locked ? message.LockToken : null,
            SequenceNumber: String(message.SequenceNumber), DeadLetterReason: message.DeadLetterReason,
            DeadLetterErrorDescription: message.DeadLetterErrorDescription, Receiver: handle,
        };
    }

    private record(op: FakeServiceBusOperation, topic: string, subscription?: string): void {
        this.Calls.push({ Op: op, Topic: topic, ...(subscription ? { Subscription: subscription } : {}) });
        const failure = this.failures.get(op);
        if (failure) {
            this.failures.delete(op);
            throw failure;
        }
    }

    private topic(name: string): FakeTopic {
        const topic = this.topics.get(name);
        if (!topic) {
            throw new Error(`FakeServiceBus: no topic ${name}`);
        }
        return topic;
    }

    private subscription(topicName: string, name: string): FakeSubscription {
        const subscription = this.topic(topicName).Subscriptions.get(name);
        if (!subscription) {
            throw new Error(`FakeServiceBus: no subscription ${topicName}/${name}`);
        }
        return subscription;
    }
}
