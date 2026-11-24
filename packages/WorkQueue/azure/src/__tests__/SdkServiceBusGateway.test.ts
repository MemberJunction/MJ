import { describe, it, expect, vi } from 'vitest';
import type {
    ServiceBusMessage,
    ServiceBusMessageBatch,
    ServiceBusReceivedMessage,
    ServiceBusReceiver,
    ServiceBusSender,
    ServiceBusSessionReceiver,
} from '@azure/service-bus';
import { ServiceBusError } from '@azure/service-bus';
import { SdkServiceBusGateway, type ServiceBusClientLike } from '../gateway/SdkServiceBusGateway';

function makeBatch(maxMessages: number): ServiceBusMessageBatch & { Added: ServiceBusMessage[] } {
    const added: ServiceBusMessage[] = [];
    return {
        Added: added,
        get count(): number { return added.length; },
        get maxSizeInBytes(): number { return 262_144; },
        get sizeInBytes(): number { return added.length * 100; },
        tryAddMessage(message: ServiceBusMessage): boolean {
            if (typeof message.body === 'string' && message.body.length > 262_144) {
                return false;
            }
            if (added.length >= maxMessages) {
                return false;
            }
            added.push(message);
            return true;
        },
        _generateMessage: () => Buffer.alloc(0),
        _messageSpanContexts: [],
    };
}

function makeReceivedMessage(overrides: Partial<ServiceBusReceivedMessage> = {}): ServiceBusReceivedMessage {
    return {
        body: '{"MessageID":"m-1","Topic":"t","Attributes":{},"PublishedAt":"2026-09-16T00:00:00Z"}',
        messageId: 'm-1',
        lockToken: 'lt-1',
        deliveryCount: 0,
        enqueuedTimeUtc: new Date(1_800_000_000_000),
        lockedUntilUtc: new Date(1_800_000_060_000),
        applicationProperties: { eventType: 'click' },
        state: 'active',
        _rawAmqpMessage: { body: null },
        ...overrides,
    };
}

describe('SdkServiceBusGateway', () => {
    it('batches messages across multiple ServiceBusMessageBatch calls and reports oversized messages', async () => {
        const sentBatches: ServiceBusMessageBatch[] = [];
        const sender: ServiceBusSender = {
            identifier: 'sender-1',
            entityPath: 'topic-a',
            isClosed: false,
            sendMessages: vi.fn(async (batch) => { sentBatches.push(batch as ServiceBusMessageBatch); }),
            createMessageBatch: vi.fn(async () => makeBatch(2)),
            scheduleMessages: vi.fn(async () => []),
            cancelScheduledMessages: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
        };
        const client: ServiceBusClientLike = {
            createSender: () => sender,
            createReceiver: vi.fn(),
            acceptNextSession: vi.fn(),
            close: vi.fn(async () => undefined),
        };

        const gateway = new SdkServiceBusGateway(client);
        const oversizedBody = 'x'.repeat(300_000);
        const results = await gateway.SendBatch('topic-a', [
            { MessageId: 'm-1', Body: '{"a":1}', ApplicationProperties: { k: 'v' }, SessionId: 's-1' },
            { MessageId: 'm-2', Body: '{"a":2}', ApplicationProperties: {} },
            { MessageId: 'm-3', Body: '{"a":3}', ApplicationProperties: {} },
            { MessageId: 'm-big', Body: oversizedBody, ApplicationProperties: {} },
        ]);

        expect(results).toEqual([
            { Id: 'm-1', Kind: 'Published' },
            { Id: 'm-2', Kind: 'Published' },
            { Id: 'm-3', Kind: 'Published' },
            { Id: 'm-big', Kind: 'Failed', Code: 'MessageSizeExceeded', Message: 'Message exceeds Azure Service Bus batch size limit', SenderFault: true },
        ]);
        expect(sentBatches).toHaveLength(2);
    });

    it('schedules delayed messages and sends single messages', async () => {
        const scheduleMock = vi.fn(async () => []);
        const sendMock = vi.fn(async () => undefined);
        const sender: ServiceBusSender = {
            identifier: 'sender-1',
            entityPath: 'topic-a',
            isClosed: false,
            sendMessages: sendMock,
            createMessageBatch: vi.fn(async () => makeBatch(10)),
            scheduleMessages: scheduleMock,
            cancelScheduledMessages: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
        };
        const client: ServiceBusClientLike = {
            createSender: () => sender,
            createReceiver: vi.fn(),
            acceptNextSession: vi.fn(),
            close: vi.fn(async () => undefined),
        };

        const gateway = new SdkServiceBusGateway(client);
        expect(await gateway.Send('topic-a', { MessageId: 'm-1', Body: '{}', ApplicationProperties: {} })).toBe('m-1');
        expect(sendMock).toHaveBeenCalledTimes(1);

        const when = new Date('2026-09-16T12:05:00.000Z');
        const seq = await gateway.Schedule({
            TopicName: 'topic-a',
            ScheduledEnqueueTimeUtc: when,
            Message: { MessageId: 'm-1', Body: '{}', ApplicationProperties: { mj_retry_attempts: '1' } },
        });
        expect(seq).toBe('0');
        expect(scheduleMock).toHaveBeenCalledTimes(1);
    });

    it('receives, renews lock, settles, and handles stale MessageLockLost errors', async () => {
        const msg = makeReceivedMessage();
        const completeMessage = vi.fn(async () => undefined);
        const abandonMessage = vi.fn(async () => undefined);
        const deadLetterMessage = vi.fn(async () => undefined);
        const renewMessageLock = vi.fn(async () => new Date(1_800_000_120_000));
        const receiver: ServiceBusReceiver = {
            identifier: 'rx-1',
            entityPath: 'topic-a/Subscriptions/sub-a',
            receiveMode: 'peekLock',
            isClosed: false,
            subscribe: vi.fn(),
            getMessageIterator: vi.fn(),
            receiveMessages: vi.fn(async () => [msg]),
            receiveDeferredMessages: vi.fn(async () => []),
            peekMessages: vi.fn(async () => [msg]),
            close: vi.fn(async () => undefined),
            completeMessage,
            abandonMessage,
            deferMessage: vi.fn(async () => undefined),
            deadLetterMessage,
            renewMessageLock,
        };
        const client: ServiceBusClientLike = {
            createSender: vi.fn(),
            createReceiver: () => receiver,
            acceptNextSession: vi.fn(),
            close: vi.fn(async () => undefined),
        };

        const gateway = new SdkServiceBusGateway(client);
        const received = await gateway.Receive({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            RequiresSession: false,
            MaxMessages: 5,
            MaxWaitTimeMs: 1000,
        });
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({
            MessageId: 'm-1',
            LockToken: 'lt-1',
            DeliveryCount: 1,
            ApplicationProperties: { eventType: 'click' },
        });

        const renewed = await gateway.RenewLock({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            RequiresSession: false,
            LockToken: 'lt-1',
            SessionId: null,
        });
        expect(renewed?.getTime()).toBe(1_800_000_120_000);

        expect(await gateway.Complete({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            RequiresSession: false,
            LockToken: 'lt-1',
            SessionId: null,
        })).toBe(true);
        expect(completeMessage).toHaveBeenCalledWith(msg);

        // Stale token returns false
        expect(await gateway.Complete({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            RequiresSession: false,
            LockToken: 'lt-1',
            SessionId: null,
        })).toBe(false);

        // MessageLockLost maps to false / null
        const msg2 = makeReceivedMessage({ messageId: 'm-2', lockToken: 'lt-2' });
        vi.mocked(receiver.receiveMessages).mockResolvedValueOnce([msg2]);
        await gateway.Receive({ TopicName: 'topic-a', SubscriptionName: 'sub-a', RequiresSession: false, MaxMessages: 1, MaxWaitTimeMs: 0 });
        renewMessageLock.mockRejectedValueOnce(new ServiceBusError('expired', 'MessageLockLost'));
        expect(await gateway.RenewLock({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            RequiresSession: false,
            LockToken: 'lt-2',
            SessionId: null,
        })).toBeNull();
    });

    it('accepts sessions, renews session lock, and closes session receiver once settled', async () => {
        const msg = makeReceivedMessage({ sessionId: 'sess-1', lockToken: 'lt-sess' });
        const sessionClose = vi.fn(async () => undefined);
        const renewSessionLock = vi.fn(async () => new Date(1_800_000_120_000));
        const sessionReceiver: ServiceBusSessionReceiver = {
            sessionId: 'sess-1',
            sessionLockedUntilUtc: new Date(1_800_000_060_000),
            identifier: 'srx-1',
            entityPath: 'topic-a/Subscriptions/sub-sess',
            receiveMode: 'peekLock',
            isClosed: false,
            subscribe: vi.fn(),
            getMessageIterator: vi.fn(),
            receiveMessages: vi.fn(async () => [msg]),
            receiveDeferredMessages: vi.fn(async () => []),
            peekMessages: vi.fn(async () => []),
            close: sessionClose,
            completeMessage: vi.fn(async () => undefined),
            abandonMessage: vi.fn(async () => undefined),
            deferMessage: vi.fn(async () => undefined),
            deadLetterMessage: vi.fn(async () => undefined),
            renewMessageLock: vi.fn(async () => new Date()),
            renewSessionLock,
            getSessionState: vi.fn(async () => undefined),
            setSessionState: vi.fn(async () => undefined),
        };
        const acceptNextSession = vi.fn()
            .mockResolvedValueOnce(sessionReceiver)
            .mockRejectedValueOnce(new ServiceBusError('none', 'SessionCannotBeLocked'));

        const client: ServiceBusClientLike = {
            createSender: vi.fn(),
            createReceiver: vi.fn(),
            acceptNextSession,
            close: vi.fn(async () => undefined),
        };

        const gateway = new SdkServiceBusGateway(client);
        const received = await gateway.Receive({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-sess',
            RequiresSession: true,
            MaxMessages: 2,
            MaxWaitTimeMs: 500,
        });
        expect(received).toHaveLength(1);
        expect(received[0].SessionId).toBe('sess-1');

        await gateway.RenewLock({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-sess',
            RequiresSession: true,
            LockToken: 'lt-sess',
            SessionId: 'sess-1',
        });
        expect(renewSessionLock).toHaveBeenCalledTimes(1);

        await gateway.Complete({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-sess',
            RequiresSession: true,
            LockToken: 'lt-sess',
            SessionId: 'sess-1',
        });
        expect(sessionClose).toHaveBeenCalledTimes(1);
        await gateway.Close();
    });
});
