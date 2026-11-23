import { describe, it, expect } from 'vitest';
import {
    FatalWorkError,
    Outcome,
    TransientWorkError,
    type WorkContext,
    type WorkHandler,
    type WorkJson,
    type WorkLogger,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import { FakeServiceBusGateway } from '../testing/fakes';
import {
    SeedValidAzureResources,
    TestAzureResources,
    TestAzureSubscriptionBinding,
    TestAzureTopicBinding,
    TestMessage,
} from '../testing/fixtures';

class RecordingLogger implements WorkLogger {
    public readonly Logs: string[] = [];
    public Info(message: string): void { this.Logs.push(`info:${message}`); }
    public Warn(message: string): void { this.Logs.push(`warn:${message}`); }
    public Error(message: string): void { this.Logs.push(`error:${message}`); }
}

function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = (): void => {
            if (predicate()) {
                resolve();
                return;
            }
            if (Date.now() - started > timeoutMs) {
                reject(new Error('Timed out waiting for pump condition'));
                return;
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

describe('ServiceBusMessagePump', () => {
    it('processes batches with bounded concurrency, retries transiently, dead-letters fatals, and drains cleanly', async () => {
        const fake = new FakeServiceBusGateway();
        const topic = TestAzureTopicBinding(false);
        const subscription = TestAzureSubscriptionBinding(false, {
            Policy: { MaxAttempts: 2, BackoffBaseSeconds: 0, BackoffMaxSeconds: 0, LeaseSeconds: 30 },
        });
        SeedValidAzureResources(fake, topic, subscription);

        const driver = new AzureTransportDriver(fake, fake, { Now: () => fake.Now });
        const completed: string[] = [];
        let maxObservedConcurrent = 0;
        let currentConcurrent = 0;
        const attemptsById = new Map<string, number>();

        class DemoHandler implements WorkHandler {
            public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
                currentConcurrent += 1;
                maxObservedConcurrent = Math.max(maxObservedConcurrent, currentConcurrent);
                try {
                    const count = (attemptsById.get(message.MessageID) ?? 0) + 1;
                    attemptsById.set(message.MessageID, count);
                    const payload = message.Payload as Record<string, WorkJson>;
                    if (payload['mode'] === 'fatal') {
                        throw new FatalWorkError('bad record');
                    }
                    if (payload['mode'] === 'flaky' && count === 1) {
                        throw new TransientWorkError('retry once', 0);
                    }
                    await context.Heartbeat({ Percent: 100, Message: 'done' });
                    await new Promise((r) => setTimeout(r, 15));
                    completed.push(message.MessageID);
                    return Outcome.Complete();
                } finally {
                    currentConcurrent -= 1;
                }
            }
        }

        const messages = [
            TestMessage(1, { Payload: { mode: 'ok' } }),
            TestMessage(2, { Payload: { mode: 'ok' } }),
            TestMessage(3, { Payload: { mode: 'ok' } }),
            TestMessage(4, { Payload: { mode: 'flaky' } }),
            TestMessage(5, { Payload: { mode: 'fatal' } }),
        ];
        await driver.Publish(topic, messages, [subscription]);

        const logger = new RecordingLogger();
        const pump = driver.OpenMessagePump(subscription, () => new DemoHandler(), {
            Concurrency: 2,
            ReceiveBatchSize: 5,
            ReceiveWaitSeconds: 0,
            IdlePollMinMs: 10,
            IdlePollMaxMs: 50,
            ShutdownDrainMs: 1000,
            Log: logger,
        });

        pump.Start();
        expect(pump.IsRunning).toBe(true);
        const res = TestAzureResources(false);
        await waitUntil(() =>
            completed.length === 4 && fake.DeadLetters(res.ServiceBusTopicName, res.SubscriptionName).length === 1,
        );

        await pump.Stop();
        expect(pump.IsRunning).toBe(false);
        expect(pump.InFlightCount).toBe(0);
        expect(maxObservedConcurrent).toBeLessThanOrEqual(2);
        expect(fake.Messages(res.ServiceBusTopicName, res.SubscriptionName)).toHaveLength(0);
        expect(fake.DeadLetters(res.ServiceBusTopicName, res.SubscriptionName)[0].DeadLetterReason).toBe('bad record');
        await driver.Close();
    });
});
