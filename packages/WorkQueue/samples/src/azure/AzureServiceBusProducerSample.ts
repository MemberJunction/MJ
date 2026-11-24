import { randomUUID } from 'node:crypto';
import type { PublishResult, TopicBinding, WorkJson, WorkMessage } from '@memberjunction/work-queue-core';
import { AzureTransportDriver, ParseAzureTransportConfig, type AzureCredentialsOption } from '@memberjunction/work-queue-azure';

export interface SampleInvoicePayload {
    InvoiceID: string;
    TenantID: string;
    AmountCents: number;
    Currency: string;
}

export interface PublishInvoiceSampleInput {
    Topic: TopicBinding;
    Invoices: SampleInvoicePayload[];
    Driver?: AzureTransportDriver;
    Credentials?: AzureCredentialsOption;
    NamespaceConfigJson?: string;
}

/**
 * Sample producer demonstrating single and batched publishing to Azure Service Bus
 * using deterministic PartitionKey (SessionId) mapping and envelope attributes.
 */
export async function PublishSampleInvoicesToAzure(input: PublishInvoiceSampleInput): Promise<PublishResult[]> {
    const ownsDriver = input.Driver === undefined;
    const driver = input.Driver ?? AzureTransportDriver.Create(
        ParseAzureTransportConfig(input.NamespaceConfigJson ?? '{"Namespace":"mj-wq-sample.servicebus.windows.net"}'),
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
