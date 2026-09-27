import Long from 'long';
import type { ServiceBusClient, ServiceBusReceivedMessage, ServiceBusReceiver, ServiceBusSender, ServiceBusSessionReceiver } from '@azure/service-bus';
import { IsAbortError, IsLockLost, ToGatewayError } from './errors';
import type {
    ServiceBusDeadLetterRequest, ServiceBusGateway, ServiceBusOutboundMessage, ServiceBusPeekRequest, ServiceBusReceivedEnvelope, ServiceBusReceiveRequest,
} from './ServiceBusGateway';

export const SERVICE_BUS_MAX_RECEIVE_BATCH = 100;
/** How long a session accept waits for a session to become available before the receive returns what it has. */
export const SESSION_ACCEPT_WAIT_MS = 2_000;
/** After a session is accepted, how long to wait for its first message (a session with nothing to deliver is released). */
export const SESSION_FIRST_MESSAGE_WAIT_MS = 1_000;

interface Tracked {
    Raw: ServiceBusReceivedMessage;
    Handle: string;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(Math.floor(value), min), max);
}

function toString(value: string | number | Buffer | undefined): string | null {
    if (value === undefined) {
        return null;
    }
    return typeof value === 'string' ? value : String(value);
}

/** Every application property, stringified where the type allows so filters and the envelope see one shape. */
function properties(raw: ServiceBusReceivedMessage): Record<string, unknown> {
    return { ...(raw.applicationProperties ?? {}) };
}

export function ToEnvelope(raw: ServiceBusReceivedMessage, handle: string): ServiceBusReceivedEnvelope {
    return {
        MessageId: toString(raw.messageId) ?? '',
        Body: raw.body,
        ApplicationProperties: properties(raw),
        SessionId: raw.sessionId ?? null,
        CorrelationId: toString(raw.correlationId),
        DeliveryCount: raw.deliveryCount ?? 1,
        EnqueuedTimeUtc: raw.enqueuedTimeUtc ? raw.enqueuedTimeUtc.getTime() : null,
        LockedUntilUtc: raw.lockedUntilUtc ? raw.lockedUntilUtc.getTime() : null,
        LockToken: raw.lockToken ?? null,
        SequenceNumber: raw.sequenceNumber ? raw.sequenceNumber.toString() : '0',
        DeadLetterReason: raw.deadLetterReason ?? null,
        DeadLetterErrorDescription: raw.deadLetterErrorDescription ?? null,
        Receiver: handle,
    };
}

function toSdkMessage(message: ServiceBusOutboundMessage): {
    body: string; messageId: string; applicationProperties: Record<string, string>; contentType: string; sessionId?: string; correlationId?: string;
} {
    return {
        body: message.Body,
        messageId: message.MessageId,
        applicationProperties: { ...message.ApplicationProperties },
        contentType: message.ContentType ?? 'application/json',
        ...(message.SessionId !== undefined ? { sessionId: message.SessionId } : {}),
        ...(message.CorrelationId !== undefined ? { correlationId: message.CorrelationId } : {}),
    };
}

/** Aborts after `ms`, or when the outer signal aborts. */
function timeoutSignal(ms: number, outer?: AbortSignal): { Signal: AbortSignal; Clear: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, ms));
    const onOuterAbort = (): void => controller.abort();
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    return {
        Signal: controller.signal,
        Clear: () => {
            clearTimeout(timer);
            outer?.removeEventListener('abort', onOuterAbort);
        },
    };
}

/**
 * ServiceBusGateway over the SDK. Senders and non-session receivers are opened once per entity and kept; session
 * receivers are opened per accepted session and closed by ReleaseReceiver. The SDK's automatic lock renewal is
 * disabled everywhere: the runtime heartbeats through RenewLock (03 §3.2).
 */
export class SdkServiceBusGateway implements ServiceBusGateway {
    private readonly senders = new Map<string, ServiceBusSender>();
    private readonly receivers = new Map<string, ServiceBusReceiver>();
    private readonly sessionReceivers = new Map<string, ServiceBusSessionReceiver>();
    private readonly tracked = new Map<string, Tracked>();
    private sessionSequence = 0;

    constructor(private readonly client: ServiceBusClient, private readonly options: { SessionAcceptWaitMs?: number } = {}) {}

    public async Send(topicName: string, messages: ServiceBusOutboundMessage[]): Promise<void> {
        try {
            await this.sender(topicName).sendMessages(messages.map(toSdkMessage));
        } catch (error) {
            throw ToGatewayError(error, 'Service Bus sendMessages');
        }
    }

    public async Schedule(topicName: string, messages: ServiceBusOutboundMessage[], enqueueAt: Date): Promise<void> {
        try {
            await this.sender(topicName).scheduleMessages(messages.map(toSdkMessage), enqueueAt);
        } catch (error) {
            throw ToGatewayError(error, 'Service Bus scheduleMessages');
        }
    }

    public async Receive(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedEnvelope[]> {
        if (request.RequiresSession && !request.DeadLetter) {
            return this.receiveSessions(request);
        }
        const handle = this.receiverHandle(request.TopicName, request.SubscriptionName, request.DeadLetter === true);
        const receiver = this.receiver(handle, request.TopicName, request.SubscriptionName, request.DeadLetter === true);
        try {
            const raw = await receiver.receiveMessages(clamp(request.MaxMessages, 1, SERVICE_BUS_MAX_RECEIVE_BATCH), {
                maxWaitTimeInMs: Math.max(0, request.WaitMs), ...(request.Signal ? { abortSignal: request.Signal } : {}),
            });
            return raw.map((message) => this.track(message, handle));
        } catch (error) {
            if (IsAbortError(error) || request.Signal?.aborted) {
                return [];
            }
            throw ToGatewayError(error, 'Service Bus receiveMessages');
        }
    }

    public Complete(message: ServiceBusReceivedEnvelope): Promise<boolean> {
        return this.settle(message, 'completeMessage', (receiver, raw) => receiver.completeMessage(raw));
    }

    public Abandon(message: ServiceBusReceivedEnvelope): Promise<boolean> {
        return this.settle(message, 'abandonMessage', (receiver, raw) => receiver.abandonMessage(raw));
    }

    public DeadLetter(message: ServiceBusReceivedEnvelope, request: ServiceBusDeadLetterRequest): Promise<boolean> {
        return this.settle(message, 'deadLetterMessage', (receiver, raw) =>
            receiver.deadLetterMessage(raw, { deadLetterReason: request.Reason, deadLetterErrorDescription: request.Description, ...request.Properties }));
    }

    public async RenewLock(message: ServiceBusReceivedEnvelope): Promise<number | null> {
        const entry = this.tracked.get(this.key(message));
        if (!entry) {
            return null;
        }
        try {
            const receiver = this.owner(entry.Handle);
            const lockedUntil = await receiver.renewMessageLock(entry.Raw);
            const session = this.sessionReceivers.get(entry.Handle);
            if (session) {
                await session.renewSessionLock();
            }
            return lockedUntil.getTime();
        } catch (error) {
            if (IsLockLost(error)) {
                this.tracked.delete(this.key(message));
                return null;
            }
            throw ToGatewayError(error, 'Service Bus renewMessageLock');
        }
    }

    public async Peek(request: ServiceBusPeekRequest): Promise<ServiceBusReceivedEnvelope[]> {
        const handle = this.receiverHandle(request.TopicName, request.SubscriptionName, request.DeadLetter);
        const receiver = this.receiver(handle, request.TopicName, request.SubscriptionName, request.DeadLetter);
        try {
            const raw = await receiver.peekMessages(clamp(request.MaxMessages, 1, SERVICE_BUS_MAX_RECEIVE_BATCH), {
                ...(request.FromSequenceNumber !== null ? { fromSequenceNumber: Long.fromString(request.FromSequenceNumber) } : {}),
            });
            return raw.map((message) => ToEnvelope(message, handle));
        } catch (error) {
            throw ToGatewayError(error, 'Service Bus peekMessages');
        }
    }

    public async ReleaseReceiver(handle: string): Promise<void> {
        const session = this.sessionReceivers.get(handle);
        if (!session) {
            return;
        }
        this.sessionReceivers.delete(handle);
        for (const [key, entry] of this.tracked) {
            if (entry.Handle === handle) {
                this.tracked.delete(key);
            }
        }
        await session.close().catch(() => undefined);
    }

    /** Closes every sender and receiver (tests and the conformance harness). */
    public async Close(): Promise<void> {
        const closers = [...this.senders.values(), ...this.receivers.values(), ...this.sessionReceivers.values()].map((c) => c.close().catch(() => undefined));
        this.senders.clear();
        this.receivers.clear();
        this.sessionReceivers.clear();
        this.tracked.clear();
        await Promise.all(closers);
    }

    private async receiveSessions(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedEnvelope[]> {
        const received: ServiceBusReceivedEnvelope[] = [];
        const sessions = clamp(request.MaxMessages, 1, SERVICE_BUS_MAX_RECEIVE_BATCH);
        for (let i = 0; i < sessions; i += 1) {
            const session = await this.acceptSession(request);
            if (session === null) {
                break;
            }
            const handle = `s:${++this.sessionSequence}`;
            this.sessionReceivers.set(handle, session);
            let raw: ServiceBusReceivedMessage[];
            try {
                raw = await session.receiveMessages(1, { maxWaitTimeInMs: SESSION_FIRST_MESSAGE_WAIT_MS });
            } catch (error) {
                await this.ReleaseReceiver(handle);
                throw ToGatewayError(error, 'Service Bus session receiveMessages');
            }
            if (raw.length === 0) {
                await this.ReleaseReceiver(handle);
                continue;
            }
            received.push(this.track(raw[0], handle));
        }
        return received;
    }

    /** Accepts the next session with available messages, or null when none becomes available within the wait. */
    private async acceptSession(request: ServiceBusReceiveRequest): Promise<ServiceBusSessionReceiver | null> {
        const wait = timeoutSignal(Math.max(request.WaitMs, this.options.SessionAcceptWaitMs ?? SESSION_ACCEPT_WAIT_MS), request.Signal);
        try {
            return await this.client.acceptNextSession(request.TopicName, request.SubscriptionName, {
                receiveMode: 'peekLock', maxAutoLockRenewalDurationInMs: 0, abortSignal: wait.Signal,
            });
        } catch (error) {
            if (IsAbortError(error) || wait.Signal.aborted || ['SessionCannotBeLocked', 'ServiceTimeout'].includes(String(Reflect.get(error as object, 'code')))) {
                return null;
            }
            throw ToGatewayError(error, 'Service Bus acceptNextSession');
        } finally {
            wait.Clear();
        }
    }

    private async settle(message: ServiceBusReceivedEnvelope, operation: string, write: (receiver: ServiceBusReceiver, raw: ServiceBusReceivedMessage) => Promise<void>): Promise<boolean> {
        const key = this.key(message);
        const entry = this.tracked.get(key);
        if (!entry) {
            return false;
        }
        try {
            await write(this.owner(entry.Handle), entry.Raw);
            this.tracked.delete(key);
            return true;
        } catch (error) {
            if (IsLockLost(error)) {
                this.tracked.delete(key);
                return false;
            }
            throw ToGatewayError(error, `Service Bus ${operation}`);
        }
    }

    private track(raw: ServiceBusReceivedMessage, handle: string): ServiceBusReceivedEnvelope {
        const envelope = ToEnvelope(raw, handle);
        this.tracked.set(this.key(envelope), { Raw: raw, Handle: handle });
        return envelope;
    }

    private key(message: ServiceBusReceivedEnvelope): string {
        return `${message.Receiver}|${message.LockToken ?? ''}`;
    }

    private owner(handle: string): ServiceBusReceiver {
        const receiver = this.sessionReceivers.get(handle) ?? this.receivers.get(handle);
        if (!receiver) {
            throw ToGatewayError(new Error(`Receiver ${handle} is closed`), 'Service Bus settle');
        }
        return receiver;
    }

    private receiverHandle(topic: string, subscription: string, deadLetter: boolean): string {
        return `r:${topic}|${subscription}|${deadLetter ? 'dlq' : 'main'}`;
    }

    private receiver(handle: string, topic: string, subscription: string, deadLetter: boolean): ServiceBusReceiver {
        let receiver = this.receivers.get(handle);
        if (!receiver) {
            receiver = this.client.createReceiver(topic, subscription, {
                receiveMode: 'peekLock', maxAutoLockRenewalDurationInMs: 0, ...(deadLetter ? { subQueueType: 'deadLetter' } : {}),
            });
            this.receivers.set(handle, receiver);
        }
        return receiver;
    }

    private sender(topic: string): ServiceBusSender {
        let sender = this.senders.get(topic);
        if (!sender) {
            sender = this.client.createSender(topic);
            this.senders.set(topic, sender);
        }
        return sender;
    }
}
