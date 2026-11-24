import { describe, it, expect } from 'vitest';
import { GcpTransportDriver } from '@memberjunction/work-queue-gcp';
import {
    FakePubSubGateway,
    SeedValidGcpResources,
    TestGcpResources,
    TestGcpSubscriptionBinding,
    TestGcpTopicBinding,
} from '@memberjunction/work-queue-gcp/testing';
import {
    CreateSampleCloudRunWorker,
    PublishSampleInvoicesToGcp,
    StartGcpSampleConsumerPump,
    type GcpInvoiceProcessResult,
} from '../gcp';

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

describe('Google Cloud Pub/Sub samples suite', () => {
    it('publishes and consumes invoices end-to-end via GcpPubSubProducerSample and GcpPubSubConsumerSample', async () => {
        const fake = new FakePubSubGateway();
        const topic = TestGcpTopicBinding(true);
        const sub = TestGcpSubscriptionBinding(true);
        SeedValidGcpResources(fake, topic, sub);
        const driver = new GcpTransportDriver(fake, fake, { Now: () => fake.Now, ProjectId: fake.ProjectId });

        const pubResults = await PublishSampleInvoicesToGcp({
            Topic: topic,
            Driver: driver,
            Invoices: [
                { InvoiceID: 'INV-1', TenantID: 'tenant-acme', AmountCents: 2500, Currency: 'USD' },
                { InvoiceID: 'INV-2', TenantID: 'tenant-beta', AmountCents: -10, Currency: 'USD' },
            ],
        });
        expect(pubResults.every((r) => r.Status === 'Accepted')).toBe(true);

        const processed: GcpInvoiceProcessResult[] = [];
        const pump = StartGcpSampleConsumerPump(driver, sub, processed, {
            Concurrency: 2,
            ReceiveBatchSize: 5,
            ReceiveWaitSeconds: 0,
            IdlePollMinMs: 10,
            IdlePollMaxMs: 50,
            ShutdownDrainMs: 500,
        });

        const res = TestGcpResources(true);
        await waitUntil(() =>
            processed.length === 1 && fake.Messages(res.DeadLetterSubscriptionName).length === 1,
        );
        await pump.Stop();
        expect(processed[0].InvoiceID).toBe('INV-1');
        expect(fake.Messages(res.DeadLetterSubscriptionName)[0].Attributes['mj_dead_letter_reason']).toBe(
            'Negative invoice amount is not valid',
        );
        await driver.Close();
    });

    it('processes HTTP Push payloads via GcpCloudRunWorkerSample with exact status codes', async () => {
        const fake = new FakePubSubGateway();
        const topic = TestGcpTopicBinding(false);
        const sub = TestGcpSubscriptionBinding(false);
        SeedValidGcpResources(fake, topic, sub);

        const delivered: string[] = [];
        const handler = CreateSampleCloudRunWorker(delivered, {
            Binding: sub,
            Gateway: fake,
            Now: () => fake.Now,
            EmitMetrics: () => undefined,
        });

        const okEnvelope = {
            MessageID: 'evt-ok',
            Topic: 'email.events',
            Attributes: {},
            Payload: { EventID: 'wh-1' },
            PublishedAt: '2026-09-16T12:00:00Z',
        };
        const retryEnvelope = {
            MessageID: 'evt-retry',
            Topic: 'email.events',
            Attributes: {},
            Payload: { EventID: 'wh-2', SimulateStatus: 503 },
            PublishedAt: '2026-09-16T12:00:00Z',
        };

        const okRes = await handler({
            Body: {
                message: {
                    data: Buffer.from(JSON.stringify(okEnvelope), 'utf8').toString('base64'),
                    messageId: 'evt-ok',
                },
                subscription: 'projects/mj-wq-test/subscriptions/email-sub',
                deliveryAttempt: 1,
            },
        });
        expect(okRes.StatusCode).toBe(200);

        const retryRes = await handler({
            Body: {
                message: {
                    data: Buffer.from(JSON.stringify(retryEnvelope), 'utf8').toString('base64'),
                    messageId: 'evt-retry',
                },
                subscription: 'projects/mj-wq-test/subscriptions/email-sub',
                deliveryAttempt: 1,
            },
        });
        expect(retryRes.StatusCode).toBe(503);
        expect(delivered).toEqual(['wh-1']);
    });
});
