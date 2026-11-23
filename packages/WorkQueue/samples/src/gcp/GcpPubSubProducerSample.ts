import { randomUUID } from 'node:crypto';
import type { PublishResult, TopicBinding, WorkJson, WorkMessage } from '@memberjunction/work-queue-core';
import { GcpTransportDriver, ParseGcpTransportConfig, type GcpCredentialsOption } from '@memberjunction/work-queue-gcp';

export interface GcpSampleInvoicePayload {
    InvoiceID: string;
    TenantID: string;
    AmountCents: number;
    Currency: string;
}

export interface PublishGcpInvoiceSampleInput {
    Topic: TopicBinding;
    Invoices: GcpSampleInvoicePayload[];
    Driver?: GcpTransportDriver;
    Credentials?: GcpCredentialsOption;
    TransportConfigJson?: string;
}

/**
 * Sample producer demonstrating single and batched publishing to Google Cloud Pub/Sub
 * using deterministic PartitionKey -> OrderingKey mapping and envelope attributes.
 */
export async function PublishSampleInvoicesToGcp(input: PublishGcpInvoiceSampleInput): Promise<PublishResult[]> {
    const ownsDriver = input.Driver === undefined;
    const driver = input.Driver ?? GcpTransportDriver.Create(
        ParseGcpTransportConfig(input.TransportConfigJson ?? '{"ProjectId":"mj-wq-sample"}'),
        input.Credentials,
    );
    const nowIso = new Date().toISOString();
    const messages: WorkMessage[] = input.Invoices.map((invoice) => ({
        MessageID: randomUUID(),
        Topic: input.Topic.TopicName,
        PartitionKey: invoice.TenantID,
        Attributes: {
            eventType: 'invoice.created',
            currency: invoice.Currency,
        },
        Payload: {
            InvoiceID: invoice.InvoiceID,
            TenantID: invoice.TenantID,
            AmountCents: invoice.AmountCents,
            Currency: invoice.Currency,
        } satisfies Record<string, WorkJson>,
        CorrelationID: invoice.InvoiceID,
        PublishedAt: nowIso,
    }));

    try {
        return await driver.Publish(input.Topic, messages, []);
    } finally {
        if (ownsDriver) {
            await driver.Close();
        }
    }
}
