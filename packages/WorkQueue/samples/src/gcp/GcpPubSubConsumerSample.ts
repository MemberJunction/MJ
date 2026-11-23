import {
    FatalWorkError,
    Outcome,
    TransientWorkError,
    type SubscriptionBinding,
    type WorkContext,
    type WorkHandler,
    type WorkJson,
    type WorkLogger,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import {
    GcpTransportDriver,
    type PubSubMessagePump,
    type PubSubMessagePumpOptions,
} from '@memberjunction/work-queue-gcp';

export interface GcpInvoiceProcessResult {
    MessageID: string;
    InvoiceID: string;
    Attempt: number;
}

function isInvoicePayload(payload: WorkJson | undefined): payload is { InvoiceID: string; TenantID: string; AmountCents: number } {
    return typeof payload === 'object'
        && payload !== null
        && !Array.isArray(payload)
        && typeof payload['InvoiceID'] === 'string'
        && typeof payload['TenantID'] === 'string'
        && typeof payload['AmountCents'] === 'number';
}

/**
 * Sample Google Cloud Pub/Sub pull consumer handler demonstrating idempotent processing,
 * automatic ack-deadline lease extension via context.Heartbeat, transient retry, and fatal dead-lettering.
 */
export class GcpInvoiceWorkHandler implements WorkHandler {
    constructor(private readonly processed: GcpInvoiceProcessResult[] = []) {}

    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        if (!isInvoicePayload(message.Payload)) {
            throw new FatalWorkError('Payload is not a valid GcpSampleInvoicePayload');
        }
        if (message.Payload.AmountCents < 0) {
            return Outcome.DeadLetter('Negative invoice amount is not valid');
        }
        if (context.Signal.aborted) {
            throw new TransientWorkError(`Aborted before processing: ${String(context.Signal.reason)}`, 5);
        }
        await context.Heartbeat({ Percent: 50, Message: `Validating invoice ${message.Payload.InvoiceID}` });
        this.processed.push({
            MessageID: message.MessageID,
            InvoiceID: message.Payload.InvoiceID,
            Attempt: context.Attempt,
        });
        await context.Heartbeat({ Percent: 100, Message: `Completed invoice ${message.Payload.InvoiceID}` });
        return Outcome.Complete();
    }
}

export function StartGcpSampleConsumerPump(
    driver: GcpTransportDriver,
    subscription: SubscriptionBinding,
    processed: GcpInvoiceProcessResult[],
    options: Omit<PubSubMessagePumpOptions, 'Log'> & { Log?: WorkLogger } = {},
): PubSubMessagePump {
    const pump = driver.OpenMessagePump(
        subscription,
        () => new GcpInvoiceWorkHandler(processed),
        options,
    );
    pump.Start();
    return pump;
}
