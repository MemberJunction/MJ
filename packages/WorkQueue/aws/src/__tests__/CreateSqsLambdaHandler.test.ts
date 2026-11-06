import { describe, it, expect, beforeEach } from 'vitest';
import { Outcome, type SubscriptionBinding, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES } from '../consumer/deadLetter';
import { CreateSqsLambdaHandler } from '../lambda/CreateSqsLambdaHandler';
import type { LambdaContextLike, SqsLambdaEvent, SqsLambdaRecord } from '../lambda/lambdaTypes';
import { FakeSqsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestSubscriptionBinding } from '../testing/fixtures';

let sqs: FakeSqsGateway;
let binding: SubscriptionBinding;
let calls: string[];
let script: Map<string, WorkOutcome>;
let metrics: string[];

class ScriptedHandler implements WorkHandler {
    public async Handle(message: WorkMessage): Promise<WorkOutcome> {
        calls.push(message.MessageID);
        return script.get(message.MessageID) ?? Outcome.Complete();
    }
}

function context(remainingMs: number): LambdaContextLike {
    return { getRemainingTimeInMillis: () => remainingMs, awsRequestId: 'req-1' };
}

function setup(isFifo: boolean): void {
    const r = TestAwsResources(isFifo);
    sqs = new FakeSqsGateway().AddQueue(r.QueueUrl, { Fifo: isFifo, VisibilityTimeoutSeconds: 360 }).AddQueue(r.DeadLetterQueueUrl, { Fifo: isFifo });
    binding = TestSubscriptionBinding(isFifo);
    calls = [];
    script = new Map();
    metrics = [];
}

/** Sends messages and receives them the way the Lambda poller does, shaped as an SQS event. */
async function event(isFifo: boolean, items: { index: number; group?: string; body?: string }[]): Promise<SqsLambdaEvent> {
    const r = TestAwsResources(isFifo);
    for (const item of items) {
        await sqs.Send({
            QueueUrl: r.QueueUrl, Body: item.body ?? JSON.stringify(TestMessage(item.index)),
            ...(isFifo ? { MessageGroupId: item.group ?? `g-${item.index}`, MessageDeduplicationId: `d-${item.index}` } : {}),
        });
    }
    const received = await sqs.Receive({ QueueUrl: r.QueueUrl, MaxMessages: 10, WaitTimeSeconds: 0, VisibilityTimeoutSeconds: null });
    const records: SqsLambdaRecord[] = received.map((m) => ({
        messageId: m.MessageId, receiptHandle: m.ReceiptHandle, body: m.Body,
        attributes: { ApproximateReceiveCount: String(m.ReceiveCount), SentTimestamp: String(m.SentTimestamp), ...(m.MessageGroupId ? { MessageGroupId: m.MessageGroupId } : {}) },
        messageAttributes: {}, eventSourceARN: r.QueueArn,
    }));
    return { Records: records };
}

function handler() {
    return CreateSqsLambdaHandler(() => new ScriptedHandler(), {
        Binding: binding, Gateway: sqs, Now: () => sqs.Now, EmitMetrics: (line) => metrics.push(line), TimeoutSafetyMs: 10_000,
    });
}

beforeEach(() => setup(true));

describe('CreateSqsLambdaHandler', () => {
    it('completes every record and reports no failures', async () => {
        const response = await handler()(await event(true, [{ index: 1 }, { index: 2 }]), context(60_000));
        expect(response).toEqual({ batchItemFailures: [] });
        expect(sqs.Messages(TestAwsResources(true).QueueUrl)).toHaveLength(0);
        expect(JSON.parse(metrics[0])).toMatchObject({ Subscription: 'email.unsubscribe', Processed: 2, Completed: 2 });
    });

    it('stops a FIFO group at a retry and releases the rest of that group unprocessed', async () => {
        const ev = await event(true, [{ index: 1, group: 'a' }, { index: 2, group: 'a' }, { index: 3, group: 'b' }]);
        script.set(TestMessage(1).MessageID, Outcome.Retry('not yet', 60));
        const response = await handler()(ev, context(60_000));
        expect(response.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([ev.Records[0].messageId, ev.Records[1].messageId]);
        expect(calls).toEqual(expect.arrayContaining([TestMessage(1).MessageID, TestMessage(3).MessageID]));
        expect(calls).not.toContain(TestMessage(2).MessageID);
        const a2 = sqs.Messages(TestAwsResources(true).QueueUrl).find((m) => m.Body === JSON.stringify(TestMessage(2)));
        expect(a2?.VisibleAt).toBe(sqs.Now);
        expect(JSON.parse(metrics[0])).toMatchObject({ Retried: 1, NotStarted: 1, Completed: 1 });
    });

    it('does not report dead-lettered records as failures', async () => {
        const ev = await event(true, [{ index: 1 }]);
        script.set(TestMessage(1).MessageID, Outcome.DeadLetter('bad address'));
        expect(await handler()(ev, context(60_000))).toEqual({ batchItemFailures: [] });
        const [copy] = sqs.Messages(TestAwsResources(true).DeadLetterQueueUrl);
        expect(copy.Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('bad address');
    });

    it('dead-letters a poison body without running the handler or failing the batch', async () => {
        const ev = await event(true, [{ index: 1, body: 'not an envelope' }]);
        expect(await handler()(ev, context(60_000))).toEqual({ batchItemFailures: [] });
        expect(calls).toEqual([]);
        expect(sqs.Messages(TestAwsResources(true).DeadLetterQueueUrl)[0].Attributes[DEAD_LETTER_ATTRIBUTES.Reason]).toBe('InvalidEnvelope');
    });

    it('treats every record of a standard queue independently', async () => {
        setup(false);
        const ev = await event(false, [{ index: 1 }, { index: 2 }, { index: 3 }]);
        script.set(TestMessage(2).MessageID, Outcome.Retry('later', 30));
        const response = await handler()(ev, context(60_000));
        expect(response.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([ev.Records[1].messageId]);
        expect(calls).toHaveLength(3);
    });

    it('starts nothing when too little time remains and releases every record', async () => {
        const ev = await event(true, [{ index: 1 }, { index: 2 }]);
        const response = await handler()(ev, context(5_000));
        expect(response.batchItemFailures).toHaveLength(2);
        expect(calls).toEqual([]);
        expect(sqs.Messages(TestAwsResources(true).QueueUrl).every((m) => m.VisibleAt <= sqs.Now)).toBe(true);
    });

    it('reads the binding from MJ_WQ_SUBSCRIPTION and fails the invocation when it is missing', async () => {
        const ev = await event(true, [{ index: 1 }]);
        const fromEnv = CreateSqsLambdaHandler(() => new ScriptedHandler(), {
            Env: { MJ_WQ_SUBSCRIPTION: JSON.stringify(binding) }, Gateway: sqs, Now: () => sqs.Now, EmitMetrics: () => undefined,
        });
        expect(await fromEnv(ev, context(60_000))).toEqual({ batchItemFailures: [] });
        const missing = CreateSqsLambdaHandler(() => new ScriptedHandler(), { Env: {}, Gateway: sqs, EmitMetrics: () => undefined });
        await expect(missing({ Records: [] }, context(60_000))).rejects.toThrow('MJ_WQ_SUBSCRIPTION');
    });
});
