import { describe, it, expect } from 'vitest';
import { AzureTransportDriver } from '@memberjunction/work-queue-azure';
import {
    FakeServiceBusGateway,
    SeedValidAzureResources,
    TestAzureResources,
    TestAzureSubscriptionBinding,
    TestAzureTopicBinding,
} from '@memberjunction/work-queue-azure/testing';
import {
    CreateSampleAzureFunctionWorker,
    PublishSampleInvoicesToAzure,
    StartAzureSampleConsumerPump,
    type InvoiceProcessResult,
} from '../azure';

function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = (): void => {
            if (predicate()) {
                resolve();
                return;
            }
            if (Date.now() - started > timeoutMs) {
                reject(new Error('Timed out waiting for sample pump'));
                return;
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

describe('Azure Service Bus samples suite', () => {
    it('publishes and consumes invoices end-to-end via AzureServiceBusProducerSample and AzureServiceBusConsumerSample', async () => {
        const fake = new FakeServiceBusGateway();
        const topic = TestAzureTopicBinding(true);
        const sub = TestAzureSubscriptionBinding(true);
        SeedValidAzureResources(fake, topic, sub);
        const driver = new AzureTransportDriver(fake, fake, { Now: () => fake.Now });

        const pubResults = await PublishSampleInvoicesToAzure({
            Topic: topic,
            Driver: driver,
            Invoices: [
                { InvoiceID: 'INV-1', TenantID: 'tenant-acme', AmountCents: 2500, Currency: 'USD' },
                { InvoiceID: 'INV-2', TenantID: 'tenant-beta', AmountCents: -10, Currency: 'USD' },
            ],
        });
        expect(pubResults.every((r) => r.Status === 'Accepted')).toBe(true);

        const processed: InvoiceProcessResult[] = [];
        const pump = StartAzureSampleConsumerPump(driver, sub, processed, {
            Concurrency: 2,
            ReceiveBatchSize: 5,
            ReceiveWaitSeconds: 0,
            IdlePollMinMs: 10,
            IdlePollMaxMs: 50,
            ShutdownDrainMs: 500,
        });

        const res = TestAzureResources(true);
        await waitUntil(() =>
            processed.length === 1 && fake.DeadLetters(res.ServiceBusTopicName, res.SubscriptionName).length === 1,
        );
        await pump.Stop();
        expect(processed[0].InvoiceID).toBe('INV-1');
        expect(fake.DeadLetters(res.ServiceBusTopicName, res.SubscriptionName)[0].DeadLetterReason).toBe(
            'Negative invoice amount is not valid',
        );
        await driver.Close();
    });

    it('processes single and batch webhook triggers via AzureFunctionsWorkerSample', async () => {
        const fake = new FakeServiceBusGateway();
        const topic = TestAzureTopicBinding(false);
        const sub = TestAzureSubscriptionBinding(false);
        SeedValidAzureResources(fake, topic, sub);

        const delivered: string[] = [];
        const fn = CreateSampleAzureFunctionWorker(delivered, {
            Binding: sub,
            Gateway: fake,
            Now: () => fake.Now,
            EmitMetrics: () => undefined,
        });

        const res = TestAzureResources(false);
        await fake.Send(res.ServiceBusTopicName, {
            MessageId: 'evt-ok',
            Body: JSON.stringify({
                MessageID: 'evt-ok',
                Topic: 'email.events',
                Attributes: {},
                Payload: { EventID: 'wh-1' },
                PublishedAt: '2026-09-16T12:00:00Z',
            }),
            ApplicationProperties: {},
        });
        await fake.Send(res.ServiceBusTopicName, {
            MessageId: 'evt-retry',
            Body: JSON.stringify({
                MessageID: 'evt-retry',
                Topic: 'email.events',
                Attributes: {},
                Payload: { EventID: 'wh-2', SimulateStatus: 503 },
                PublishedAt: '2026-09-16T12:00:00Z',
            }),
            ApplicationProperties: {},
        });
        const received = await fake.Receive({
            TopicName: res.ServiceBusTopicName,
            SubscriptionName: res.SubscriptionName,
            RequiresSession: false,
            MaxMessages: 10,
            MaxWaitTimeMs: 0,
        });

        const result = await fn(received.map((m) => ({
            messageId: m.MessageId,
            lockToken: m.LockToken,
            deliveryCount: m.DeliveryCount,
            body: m.Body,
            applicationProperties: m.ApplicationProperties,
        })), { getRemainingTimeInMillis: () => 60_000 });

        expect(delivered).toEqual(['wh-1']);
        expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'evt-retry' }]);
    });
});
