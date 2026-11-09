import { describe, it, expect } from 'vitest';
import { FakeSqsGateway } from '../testing/fakes';

const FIFO = 'https://sqs.us-east-1.amazonaws.com/123456789012/q.fifo';

describe('FakeSqsGateway', () => {
    it('blocks a FIFO group while its oldest message is in flight', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a1', MessageGroupId: 'a', MessageDeduplicationId: 'a1' });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a2', MessageGroupId: 'a', MessageDeduplicationId: 'a2' });
        await sqs.Send({ QueueUrl: FIFO, Body: 'b1', MessageGroupId: 'b', MessageDeduplicationId: 'b1' });
        const first = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(first.map((m) => m.Body)).toEqual(['a1']);
        const second = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(second.map((m) => m.Body)).toEqual(['b1']);
    });

    it('like real SQS, can return several messages of one group from a single batched receive', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a1', MessageGroupId: 'a', MessageDeduplicationId: 'a1' });
        await sqs.Send({ QueueUrl: FIFO, Body: 'a2', MessageGroupId: 'a', MessageDeduplicationId: 'a2' });
        const batch = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(batch.map((m) => m.Body)).toEqual(['a1', 'a2']);
        expect(sqs.Calls[sqs.Calls.length - 1]).toMatchObject({ Op: 'Receive', MaxMessages: 10, WaitTimeSeconds: 0 });
    });

    it('redelivers after the visibility timeout with a higher receive count and a new receipt handle', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'x' });
        const [first] = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        sqs.Advance(31);
        const [second] = await sqs.Receive({ QueueUrl: FIFO, MaxMessages: 1, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: 30 });
        expect(second.ReceiveCount).toBe(2);
        expect(second.ReceiptHandle).not.toBe(first.ReceiptHandle);
        expect(await sqs.Delete(FIFO, first.ReceiptHandle)).toBe(false);
        expect(await sqs.ChangeVisibility(FIFO, first.ReceiptHandle, 10)).toBe(false);
        expect(await sqs.Delete(FIFO, second.ReceiptHandle)).toBe(true);
        expect(sqs.Messages(FIFO)).toHaveLength(0);
    });

    it('suppresses a FIFO duplicate inside five minutes and accepts it after', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true });
        const first = await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'same' });
        expect(await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'same' })).toBe(first);
        sqs.Advance(301);
        expect(await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'same' })).not.toBe(first);
        expect(sqs.Messages(FIFO)).toHaveLength(2);
    });

    it('injects a failure once and reports queue counts', async () => {
        const sqs = new FakeSqsGateway().AddQueue(FIFO, { Fifo: true, Attributes: { VisibilityTimeout: '45' } });
        sqs.FailNext('Send', new Error('boom'));
        await expect(sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'x' })).rejects.toThrow('boom');
        await sqs.Send({ QueueUrl: FIFO, Body: 'x', MessageGroupId: 'g', MessageDeduplicationId: 'x' });
        expect(await sqs.GetAttributes(FIFO)).toMatchObject({ FifoQueue: 'true', VisibilityTimeout: '45', ApproximateNumberOfMessages: '1', ApproximateNumberOfMessagesNotVisible: '0' });
        expect(await sqs.GetAttributes('https://missing')).toBeNull();
    });
});
