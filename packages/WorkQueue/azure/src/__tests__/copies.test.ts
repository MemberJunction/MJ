import { describe, it, expect } from 'vitest';
import { AttemptOf, BuildTargetedCopy, IsReplayCopy } from '../consumer/copies';
import type { ServiceBusReceivedEnvelope } from '../gateway/ServiceBusGateway';
import { RUNTIME_PROPERTIES } from '../properties';
import { TestMessage } from '../testing/fixtures';

function received(properties: Record<string, unknown>, deliveryCount: number, sessionId: string | null = null): ServiceBusReceivedEnvelope {
    return {
        MessageId: 'm', Body: '', ApplicationProperties: properties, SessionId: sessionId, CorrelationId: null, DeliveryCount: deliveryCount,
        EnqueuedTimeUtc: null, LockedUntilUtc: null, LockToken: 'lt', SequenceNumber: '1', DeadLetterReason: null, DeadLetterErrorDescription: null, Receiver: 'r',
    };
}

describe('AttemptOf', () => {
    it('starts at one, counts service redeliveries, and continues from a copy base', () => {
        expect(AttemptOf(received({}, 1))).toBe(1);
        expect(AttemptOf(received({}, 3))).toBe(3);
        expect(AttemptOf(received({ [RUNTIME_PROPERTIES.Attempt]: '4' }, 1))).toBe(4);
        expect(AttemptOf(received({ [RUNTIME_PROPERTIES.Attempt]: 4 }, 2))).toBe(5);
        expect(AttemptOf(received({ [RUNTIME_PROPERTIES.Attempt]: 'junk' }, 1))).toBe(1);
        expect(IsReplayCopy(received({ [RUNTIME_PROPERTIES.Replay]: '1' }, 1))).toBe(true);
    });
});

describe('BuildTargetedCopy', () => {
    it('targets one subscription, keeps the session and the replay flag, and renames the Service Bus message', () => {
        const envelope = TestMessage(1, { PartitionKey: 'k', CorrelationID: 'c' });
        const copy = BuildTargetedCopy(envelope, received({ [RUNTIME_PROPERTIES.Replay]: '1' }, 1, 'k'), 'email.unsubscribe', 2, 'a2', { extra: 'x' });
        expect(copy).toEqual({
            MessageId: `${envelope.MessageID}:a2`, Body: JSON.stringify(envelope), ContentType: 'application/json', SessionId: 'k', CorrelationId: 'c',
            ApplicationProperties: { eventType: 'unsubscribe', [RUNTIME_PROPERTIES.Target]: 'email.unsubscribe', [RUNTIME_PROPERTIES.Attempt]: '2', [RUNTIME_PROPERTIES.Replay]: '1', extra: 'x' },
        });
    });

    it('derives the session from the partition key when the original had none', () => {
        const envelope = TestMessage(2, { PartitionKey: 'p' });
        expect(BuildTargetedCopy(envelope, received({}, 1), 's', 1, 'x').SessionId).toBe('p');
        expect(BuildTargetedCopy(TestMessage(3), received({}, 1), 's', 1, 'x').SessionId).toBeUndefined();
    });
});
