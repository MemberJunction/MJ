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
    AzureTransportDriver,
    type ServiceBusMessagePump,
    type ServiceBusMessagePumpOptions,
} from '@memberjunction/work-queue-azure';

export interface InvoiceProcessResult {
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
 * Sample Azure Service Bus consumer handler demonstrating idempotent processing,
 * automatic lease/lock extension via context.Heartbeat, transient retry, and fatal dead-lettering.
 */
export class AzureInvoiceWorkHandler implements WorkHandler {
    constructor(private readonly processed: InvoiceProcessResult[] = []) {}

    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        if (!isInvoicePayload(message.Payload)) {
            throw new FatalWorkError('Payload is not a valid SampleInvoicePayload');
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

export function StartAzureSampleConsumerPump(
    driver: AzureTransportDriver,
    subscription: SubscriptionBinding,
    processed: InvoiceProcessResult[],
    options: Omit<ServiceBusMessagePumpOptions, 'Log'> & { Log?: WorkLogger } = {},
): ServiceBusMessagePump {
    const pump = driver.OpenMessagePump(
        subscription,
        () => new AzureInvoiceWorkHandler(processed),
        options,
    );
    pump.Start();
    return pump;
}
