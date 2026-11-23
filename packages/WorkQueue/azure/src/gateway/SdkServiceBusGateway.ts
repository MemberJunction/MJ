import type {
    ServiceBusClient,
    ServiceBusMessage,
    ServiceBusMessageBatch,
    ServiceBusReceivedMessage,
    ServiceBusReceiver,
    ServiceBusSender,
    ServiceBusSessionReceiver,
} from '@azure/service-bus';
import { BodyAsString } from '../envelope';
import { ErrorCode, IsAbortError, IsStaleLockError, ToGatewayError } from './errors';
import type {
    ServiceBusDeadLetterRequest,
    ServiceBusGateway,
    ServiceBusOutgoingMessage,
    ServiceBusReceivedRecord,
    ServiceBusReceiveRequest,
    ServiceBusScheduleRequest,
    ServiceBusSendEntryResult,
    ServiceBusSettleRequest,
} from './ServiceBusGateway';

const SESSION_ACCEPT_PROBE_WAIT_MS = 250;

interface TrackedHandle {
    Key: string;
    Receiver: ServiceBusReceiver;
    Message: ServiceBusReceivedMessage;
    SessionKey: string | null;
}

interface ActiveSession {
    Receiver: ServiceBusSessionReceiver;
    InFlightCount: number;
}

function toApplicationProperties(source: Record<string, string>): Record<string, string> {
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
        props[key] = value;
    }
    return props;
}

function readApplicationProperties(source: ServiceBusReceivedMessage['applicationProperties']): Record<string, string> {
    const props: Record<string, string> = {};
    if (!source) {
        return props;
    }
    for (const [key, value] of Object.entries(source)) {
        if (value !== undefined && value !== null) {
            props[key] = String(value);
        }
    }
    return props;
}

function toSdkMessage(message: ServiceBusOutgoingMessage): ServiceBusMessage {
    return {
        messageId: message.MessageId,
        body: message.Body,
        contentType: message.ContentType ?? 'application/json',
        applicationProperties: toApplicationProperties(message.ApplicationProperties),
        ...(message.SessionId ? { sessionId: message.SessionId } : {}),
        ...(message.PartitionKey ? { partitionKey: message.PartitionKey } : {}),
        ...(message.CorrelationId ? { correlationId: message.CorrelationId } : {}),
        ...(message.ScheduledEnqueueTimeUtc ? { scheduledEnqueueTimeUtc: message.ScheduledEnqueueTimeUtc } : {}),
    };
}

function toReceivedRecord(message: ServiceBusReceivedMessage, fallbackIndex: number): ServiceBusReceivedRecord {
    const lockToken = message.lockToken ?? `peek-${message.sequenceNumber?.toString() ?? String(fallbackIndex)}`;
    const messageId = message.messageId !== undefined ? String(message.messageId) : lockToken;
    return {
        MessageId: messageId,
        LockToken: lockToken,
        SequenceNumber: message.sequenceNumber ? message.sequenceNumber.toString() : '0',
        Body: BodyAsString(message.body),
        DeliveryCount: (message.deliveryCount ?? 0) + 1,
        SessionId: message.sessionId ?? null,
        EnqueuedTimeUtc: message.enqueuedTimeUtc ? message.enqueuedTimeUtc.getTime() : null,
        LockedUntilUtc: message.lockedUntilUtc ? message.lockedUntilUtc.getTime() : null,
        ApplicationProperties: readApplicationProperties(message.applicationProperties),
        DeadLetterReason: message.deadLetterReason ?? null,
        DeadLetterErrorDescription: message.deadLetterErrorDescription ?? null,
    };
}

function isNoSessionAvailable(error: unknown): boolean {
    const code = ErrorCode(error);
    return code === 'SessionCannotBeLocked' || code === 'ServiceTimeout' || IsAbortError(error);
}

export type ServiceBusClientLike = Pick<
    ServiceBusClient,
    'createSender' | 'createReceiver' | 'acceptNextSession' | 'close'
>;

export class SdkServiceBusGateway implements ServiceBusGateway {
    private readonly senders = new Map<string, ServiceBusSender>();
    private readonly receivers = new Map<string, ServiceBusReceiver>();
    private readonly dlqReceivers = new Map<string, ServiceBusReceiver>();
    private readonly tracked = new Map<string, TrackedHandle>();
    private readonly dlqTracked = new Map<string, TrackedHandle>();
    private readonly activeSessions = new Map<string, ActiveSession>();

    constructor(private readonly client: ServiceBusClientLike) {}

    public async SendBatch(topicName: string, messages: ServiceBusOutgoingMessage[]): Promise<ServiceBusSendEntryResult[]> {
        if (messages.length === 0) {
            return [];
        }
        const sender = this.getSender(topicName);
        const results = new Map<string, ServiceBusSendEntryResult>();
        try {
            let batch: ServiceBusMessageBatch = await sender.createMessageBatch();
            let batchIds: string[] = [];

            const flush = async (): Promise<void> => {
                if (batchIds.length === 0) {
                    return;
                }
                await sender.sendMessages(batch);
                for (const id of batchIds) {
                    results.set(id, { Id: id, Kind: 'Published' });
                }
                batch = await sender.createMessageBatch();
                batchIds = [];
            };

            for (const msg of messages) {
                const sdkMsg = toSdkMessage(msg);
                if (!batch.tryAddMessage(sdkMsg)) {
                    if (batch.count === 0) {
                        results.set(msg.MessageId, {
                            Id: msg.MessageId,
                            Kind: 'Failed',
                            Code: 'MessageSizeExceeded',
                            Message: 'Message exceeds Azure Service Bus batch size limit',
                            SenderFault: true,
                        });
                        continue;
                    }
                    await flush();
                    if (!batch.tryAddMessage(sdkMsg)) {
                        results.set(msg.MessageId, {
                            Id: msg.MessageId,
                            Kind: 'Failed',
                            Code: 'MessageSizeExceeded',
                            Message: 'Message exceeds Azure Service Bus batch size limit',
                            SenderFault: true,
                        });
                        continue;
                    }
                }
                batchIds.push(msg.MessageId);
            }
            await flush();
            return messages.map((msg) => results.get(msg.MessageId) ?? {
                Id: msg.MessageId,
                Kind: 'Failed',
                Code: 'Unreported',
                Message: 'Azure Service Bus batch did not report status',
                SenderFault: false,
            });
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus sendMessages');
        }
    }

    public async Send(topicName: string, message: ServiceBusOutgoingMessage): Promise<string> {
        const sender = this.getSender(topicName);
        try {
            await sender.sendMessages(toSdkMessage(message));
            return message.MessageId;
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus sendMessages');
        }
    }

    public async Schedule(request: ServiceBusScheduleRequest): Promise<string> {
        const sender = this.getSender(request.TopicName);
        try {
            const seqs = await sender.scheduleMessages(toSdkMessage(request.Message), request.ScheduledEnqueueTimeUtc);
            return seqs[0]?.toString() ?? '0';
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus scheduleMessages');
        }
    }

    public async Receive(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedRecord[]> {
        if (request.Signal?.aborted) {
            return [];
        }
        const maxMessages = Math.max(1, Math.floor(request.MaxMessages));
        if (request.RequiresSession) {
            return this.receiveFromSessions(request, maxMessages);
        }
        const receiver = this.getReceiver(request.TopicName, request.SubscriptionName);
        try {
            const messages = await receiver.receiveMessages(maxMessages, {
                maxWaitTimeInMs: Math.max(0, request.MaxWaitTimeMs),
                abortSignal: request.Signal,
            });
            return this.trackReceived(request.TopicName, request.SubscriptionName, receiver, messages, null);
        } catch (error) {
            if (IsAbortError(error) || request.Signal?.aborted) {
                return [];
            }
            throw ToGatewayError(error, 'ServiceBus receiveMessages');
        }
    }

    public async Complete(request: ServiceBusSettleRequest): Promise<boolean> {
        return this.settleHandle(request, async (handle) => {
            await handle.Receiver.completeMessage(handle.Message);
        }, 'ServiceBus completeMessage');
    }

    public async Abandon(request: ServiceBusSettleRequest): Promise<boolean> {
        return this.settleHandle(request, async (handle) => {
            await handle.Receiver.abandonMessage(handle.Message, request.PropertiesToModify);
        }, 'ServiceBus abandonMessage');
    }

    public async DeadLetter(request: ServiceBusDeadLetterRequest): Promise<boolean> {
        return this.settleHandle(request, async (handle) => {
            await handle.Receiver.deadLetterMessage(handle.Message, {
                deadLetterReason: request.Reason,
                deadLetterErrorDescription: request.ErrorDescription,
                ...(request.PropertiesToModify ?? {}),
            });
        }, 'ServiceBus deadLetterMessage');
    }

    public async RenewLock(request: ServiceBusSettleRequest): Promise<Date | null> {
        const key = this.handleKey(request.TopicName, request.SubscriptionName, request.LockToken);
        const handle = this.tracked.get(key);
        if (!handle) {
            return null;
        }
        try {
            if (handle.SessionKey) {
                const session = this.activeSessions.get(handle.SessionKey);
                if (!session) {
                    return null;
                }
                return await session.Receiver.renewSessionLock();
            }
            return await handle.Receiver.renewMessageLock(handle.Message);
        } catch (error) {
            if (IsStaleLockError(error)) {
                this.releaseHandle(handle);
                return null;
            }
            throw ToGatewayError(error, 'ServiceBus renewLock');
        }
    }

    public async PeekDeadLetters(topicName: string, subscriptionName: string, maxMessages: number): Promise<ServiceBusReceivedRecord[]> {
        const receiver = this.getDlqReceiver(topicName, subscriptionName);
        try {
            const peeked = await receiver.peekMessages(Math.max(1, Math.floor(maxMessages)));
            return peeked.map((message, index) => toReceivedRecord(message, index));
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus peekDeadLetters');
        }
    }

    public async ReceiveDeadLetters(
        topicName: string,
        subscriptionName: string,
        maxMessages: number,
        maxWaitTimeMs: number,
    ): Promise<ServiceBusReceivedRecord[]> {
        const receiver = this.getDlqReceiver(topicName, subscriptionName);
        try {
            const messages = await receiver.receiveMessages(Math.max(1, Math.floor(maxMessages)), {
                maxWaitTimeInMs: Math.max(0, maxWaitTimeMs),
            });
            return messages.map((message, index) => {
                const record = toReceivedRecord(message, index);
                const key = this.handleKey(topicName, subscriptionName, record.LockToken);
                this.dlqTracked.set(key, { Key: key, Receiver: receiver, Message: message, SessionKey: null });
                return record;
            });
        } catch (error) {
            throw ToGatewayError(error, 'ServiceBus receiveDeadLetters');
        }
    }

    public async CompleteDeadLetter(topicName: string, subscriptionName: string, lockToken: string): Promise<boolean> {
        const key = this.handleKey(topicName, subscriptionName, lockToken);
        const handle = this.dlqTracked.get(key);
        if (!handle) {
            return false;
        }
        try {
            await handle.Receiver.completeMessage(handle.Message);
            this.dlqTracked.delete(key);
            return true;
        } catch (error) {
            if (IsStaleLockError(error)) {
                this.dlqTracked.delete(key);
                return false;
            }
            throw ToGatewayError(error, 'ServiceBus completeDeadLetter');
        }
    }

    public async AbandonDeadLetter(topicName: string, subscriptionName: string, lockToken: string): Promise<boolean> {
        const key = this.handleKey(topicName, subscriptionName, lockToken);
        const handle = this.dlqTracked.get(key);
        if (!handle) {
            return false;
        }
        try {
            await handle.Receiver.abandonMessage(handle.Message);
            this.dlqTracked.delete(key);
            return true;
        } catch (error) {
            if (IsStaleLockError(error)) {
                this.dlqTracked.delete(key);
                return false;
            }
            throw ToGatewayError(error, 'ServiceBus abandonDeadLetter');
        }
    }

    public async Close(): Promise<void> {
        const closeTasks: Promise<void>[] = [];
        for (const sender of this.senders.values()) {
            closeTasks.push(sender.close().catch(() => undefined));
        }
        for (const receiver of this.receivers.values()) {
            closeTasks.push(receiver.close().catch(() => undefined));
        }
        for (const receiver of this.dlqReceivers.values()) {
            closeTasks.push(receiver.close().catch(() => undefined));
        }
        for (const session of this.activeSessions.values()) {
            closeTasks.push(session.Receiver.close().catch(() => undefined));
        }
        await Promise.all(closeTasks);
        this.senders.clear();
        this.receivers.clear();
        this.dlqReceivers.clear();
        this.tracked.clear();
        this.dlqTracked.clear();
        this.activeSessions.clear();
        await this.client.close();
    }

    private async receiveFromSessions(request: ServiceBusReceiveRequest, maxMessages: number): Promise<ServiceBusReceivedRecord[]> {
        const collected: ServiceBusReceivedRecord[] = [];
        const firstWait = Math.max(SESSION_ACCEPT_PROBE_WAIT_MS, request.MaxWaitTimeMs);
        for (let i = 0; i < maxMessages; i++) {
            if (request.Signal?.aborted) {
                break;
            }
            const waitMs = i === 0 ? firstWait : SESSION_ACCEPT_PROBE_WAIT_MS;
            let sessionReceiver: ServiceBusSessionReceiver;
            try {
                sessionReceiver = await this.client.acceptNextSession(request.TopicName, request.SubscriptionName, {
                    maxAutoLockRenewalDurationInMs: 0,
                    abortSignal: request.Signal,
                });
            } catch (error) {
                if (isNoSessionAvailable(error) || request.Signal?.aborted) {
                    break;
                }
                throw ToGatewayError(error, 'ServiceBus acceptNextSession');
            }
            const sessionKey = this.sessionKey(request.TopicName, request.SubscriptionName, sessionReceiver.sessionId);
            try {
                const messages = await sessionReceiver.receiveMessages(1, {
                    maxWaitTimeInMs: waitMs,
                    abortSignal: request.Signal,
                });
                if (messages.length === 0) {
                    await sessionReceiver.close().catch(() => undefined);
                    break;
                }
                this.activeSessions.set(sessionKey, { Receiver: sessionReceiver, InFlightCount: messages.length });
                collected.push(...this.trackReceived(request.TopicName, request.SubscriptionName, sessionReceiver, messages, sessionKey));
            } catch (error) {
                await sessionReceiver.close().catch(() => undefined);
                if (IsAbortError(error) || request.Signal?.aborted) {
                    break;
                }
                throw ToGatewayError(error, 'ServiceBus session.receiveMessages');
            }
        }
        return collected;
    }

    private trackReceived(
        topicName: string,
        subscriptionName: string,
        receiver: ServiceBusReceiver,
        messages: ServiceBusReceivedMessage[],
        sessionKey: string | null,
    ): ServiceBusReceivedRecord[] {
        return messages.map((message, index) => {
            const record = toReceivedRecord(message, index);
            const key = this.handleKey(topicName, subscriptionName, record.LockToken);
            this.tracked.set(key, { Key: key, Receiver: receiver, Message: message, SessionKey: sessionKey });
            return record;
        });
    }

    private async settleHandle(
        request: ServiceBusSettleRequest,
        operation: (handle: TrackedHandle) => Promise<void>,
        operationName: string,
    ): Promise<boolean> {
        const key = this.handleKey(request.TopicName, request.SubscriptionName, request.LockToken);
        const handle = this.tracked.get(key);
        if (!handle) {
            return false;
        }
        try {
            await operation(handle);
            this.releaseHandle(handle);
            return true;
        } catch (error) {
            if (IsStaleLockError(error)) {
                this.releaseHandle(handle);
                return false;
            }
            throw ToGatewayError(error, operationName);
        }
    }

    private releaseHandle(handle: TrackedHandle): void {
        this.tracked.delete(handle.Key);
        if (!handle.SessionKey) {
            return;
        }
        const session = this.activeSessions.get(handle.SessionKey);
        if (!session) {
            return;
        }
        session.InFlightCount -= 1;
        if (session.InFlightCount <= 0) {
            this.activeSessions.delete(handle.SessionKey);
            void session.Receiver.close().catch(() => undefined);
        }
    }

    private getSender(topicName: string): ServiceBusSender {
        let sender = this.senders.get(topicName);
        if (!sender || sender.isClosed) {
            sender = this.client.createSender(topicName);
            this.senders.set(topicName, sender);
        }
        return sender;
    }

    private getReceiver(topicName: string, subscriptionName: string): ServiceBusReceiver {
        const key = `${topicName}\0${subscriptionName}`;
        let receiver = this.receivers.get(key);
        if (!receiver || receiver.isClosed) {
            receiver = this.client.createReceiver(topicName, subscriptionName, {
                receiveMode: 'peekLock',
                maxAutoLockRenewalDurationInMs: 0,
            });
            this.receivers.set(key, receiver);
        }
        return receiver;
    }

    private getDlqReceiver(topicName: string, subscriptionName: string): ServiceBusReceiver {
        const key = `${topicName}\0${subscriptionName}`;
        let receiver = this.dlqReceivers.get(key);
        if (!receiver || receiver.isClosed) {
            receiver = this.client.createReceiver(topicName, subscriptionName, {
                receiveMode: 'peekLock',
                subQueueType: 'deadLetter',
                maxAutoLockRenewalDurationInMs: 0,
            });
            this.dlqReceivers.set(key, receiver);
        }
        return receiver;
    }

    private handleKey(topicName: string, subscriptionName: string, lockToken: string): string {
        return `${topicName}\0${subscriptionName}\0${lockToken}`;
    }

    private sessionKey(topicName: string, subscriptionName: string, sessionId: string): string {
        return `${topicName}\0${subscriptionName}\0${sessionId}`;
    }
}
