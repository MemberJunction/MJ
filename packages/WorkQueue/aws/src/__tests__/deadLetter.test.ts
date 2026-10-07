import { describe, it, expect } from 'vitest';
import { ReadAwsSubscriptionConfig } from '../config';
import { DEAD_LETTER_ATTRIBUTES, LAST_ERROR_MAX_CHARS, SendToDeadLetterQueue } from '../consumer/deadLetter';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestSubscriptionBinding } from '../testing/fixtures';

describe('SendToDeadLetterQueue', () => {
    it('copies the body with reason attributes, in a message group of its own', async () => {
        const r = TestAwsResources(true);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(true).Config);
        const message = { MessageId: 'sqs-1', ReceiptHandle: 'rh', Body: '{"x":1}', ReceiveCount: 3, MessageGroupId: 'subscriber-9', SentTimestamp: 1, Attributes: {} };
        await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'Fatal', Error: 'e'.repeat(5000), Attempts: 3 }, new Date('2026-09-16T12:00:00.000Z'));
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.Body).toBe('{"x":1}');
        expect(copy.GroupId).toBe('sqs-1');
        expect(copy.DeduplicationId).toBe('sqs-1:dl');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('Fatal');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toHaveLength(LAST_ERROR_MAX_CHARS);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Attempts]).toBe('3');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]).toBe('2026-09-16T12:00:00.000Z');
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.SourceQueue]).toBe(r.QueueArn);
    });

    it('lets a scan reach every dead letter of one poison key', async () => {
        const r = TestAwsResources(true);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: true });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(true).Config);
        for (const id of ['sqs-1', 'sqs-2', 'sqs-3']) {
            const message = { MessageId: id, ReceiptHandle: 'rh', Body: id, ReceiveCount: 6, MessageGroupId: 'poison-key', SentTimestamp: 1, Attributes: {} };
            await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'Fatal', Error: null, Attempts: 6 }, new Date());
        }
        const first = await sqs.Receive({ QueueUrl: r.DeadLetterQueueUrl, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        const rest = await sqs.Receive({ QueueUrl: r.DeadLetterQueueUrl, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect([...first, ...rest].map((m) => m.Body).sort()).toEqual(['sqs-1', 'sqs-2', 'sqs-3']);
    });

    it('omits FIFO IDs and the last error on a standard queue when there is no error', async () => {
        const r = TestAwsResources(false);
        const sqs = new FakeSqsGateway().AddQueue(r.DeadLetterQueueUrl, { Fifo: false });
        const config = ReadAwsSubscriptionConfig(TestSubscriptionBinding(false).Config);
        const message = { MessageId: 'sqs-2', ReceiptHandle: 'rh', Body: 'raw', ReceiveCount: 1, MessageGroupId: null, SentTimestamp: 1, Attributes: {} };
        await SendToDeadLetterQueue(sqs, config, { Message: message, Reason: 'InvalidEnvelope', Error: null, Attempts: 1 }, new Date());
        const [copy] = sqs.Messages(r.DeadLetterQueueUrl);
        expect(copy.GroupId).toBeNull();
        expect(copy.DeduplicationId).toBeNull();
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.LastError]).toBeUndefined();
    });
});
