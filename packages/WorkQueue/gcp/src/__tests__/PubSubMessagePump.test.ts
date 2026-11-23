import { describe, it, expect } from 'vitest';
import { Outcome, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { PubSubMessagePump } from '../consumer/PubSubMessagePump';
import { FakePubSubGateway } from '../testing/fakes';
import {
    SeedValidGcpResources,
    TestGcpResources,
    TestGcpSubscriptionBinding,
    TestGcpTopicBinding,
    TestMessage,
} from '../testing/fixtures';

function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = (): void => {
            if (predicate()) {
                resolve();
                return;
            }
            if (Date.now() - started > timeoutMs) {
                reject(new Error('Timed out waiting for PubSubMessagePump'));
                return;
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

describe('PubSubMessagePump', () => {
    it('pumps deliveries with bounded concurrency, dead-letters fatal outcomes, and drains cleanly', async () => {
        const fake = new FakePubSubGateway();
        const topic = TestGcpTopicBinding(true);
        const sub = TestGcpSubscriptionBinding(true);
        SeedValidGcpResources(fake, topic, sub);
        const r = TestGcpResources(true);

        const completed: string[] = [];
        class TestHandler implements WorkHandler {
            public async Handle(message: WorkMessage): Promise<WorkOutcome> {
                const payload = message.Payload as { index?: number };
                if (payload.index === 2) {
                    return Outcome.DeadLetter('bad item');
                }
                completed.push(message.MessageID);
                return Outcome.Complete();
            }
        }

        await fake.PublishBatch(r.TopicName, [
            { MessageId: TestMessage(1).MessageID, Data: JSON.stringify(TestMessage(1, { PartitionKey: 'k1' })), Attributes: {}, OrderingKey: 'k1' },
            { MessageId: TestMessage(2).MessageID, Data: JSON.stringify(TestMessage(2, { PartitionKey: 'k2' })), Attributes: {}, OrderingKey: 'k2' },
        ]);

        const pump = new PubSubMessagePump(fake, sub, () => new TestHandler(), {
            Concurrency: 2,
            ReceiveBatchSize: 5,
            ReceiveWaitSeconds: 0,
            IdlePollMinMs: 10,
            IdlePollMaxMs: 50,
            ShutdownDrainMs: 500,
            Now: () => fake.Now,
        });
        pump.Start();
        expect(pump.IsRunning).toBe(true);
        pump.Kick();

        await waitUntil(() => completed.length === 1 && fake.Messages(r.DeadLetterSubscriptionName).length === 1);
        expect(pump.InFlightCount).toBe(0);
        await pump.Stop();
        expect(pump.IsRunning).toBe(false);
        expect(completed).toEqual([TestMessage(1).MessageID]);
        expect(fake.Messages(r.SubscriptionName)).toHaveLength(0);
    });
});
