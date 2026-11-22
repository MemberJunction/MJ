import {
    FatalWorkError,
    Outcome,
    TransientWorkError,
    type WorkContext,
    type WorkHandler,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import {
    CreateServiceBusFunctionHandler,
    type ServiceBusFunctionHandler,
    type ServiceBusFunctionHandlerOptions,
} from '@memberjunction/work-queue-azure/functions';

interface WebhookDispatchPayload {
    EventID: string;
    TargetUrl?: string;
    SimulateStatus?: number;
}

function readWebhookPayload(payload: WorkMessage['Payload']): WebhookDispatchPayload | null {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return null;
    }
    if (typeof payload['EventID'] !== 'string') {
        return null;
    }
    return {
        EventID: payload['EventID'],
        TargetUrl: typeof payload['TargetUrl'] === 'string' ? payload['TargetUrl'] : undefined,
        SimulateStatus: typeof payload['SimulateStatus'] === 'number' ? payload['SimulateStatus'] : undefined,
    };
}

/**
 * Sample Azure Functions Service Bus trigger worker using `@memberjunction/work-queue-azure/functions`.
 * Works identically for single-message and batch Service Bus trigger invocations.
 */
export class AzureFunctionWebhookHandler implements WorkHandler {
    constructor(private readonly deliveredEventIds: string[] = []) {}

    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        const parsed = readWebhookPayload(message.Payload);
        if (!parsed) {
            throw new FatalWorkError('Webhook payload must contain EventID');
        }
        if (context.Signal.aborted) {
            return Outcome.Retry(`Aborted: ${String(context.Signal.reason)}`, 10);
        }
        if (parsed.SimulateStatus === 503) {
            throw new TransientWorkError('Downstream webhook endpoint temporarily unavailable', 30);
        }
        if (parsed.SimulateStatus === 400) {
            return Outcome.DeadLetter('Downstream endpoint permanently rejected payload');
        }
        this.deliveredEventIds.push(parsed.EventID);
        return Outcome.Complete();
    }
}

export function CreateSampleAzureFunctionWorker(
    deliveredEventIds: string[] = [],
    options: ServiceBusFunctionHandlerOptions = {},
): ServiceBusFunctionHandler {
    return CreateServiceBusFunctionHandler(
        () => new AzureFunctionWebhookHandler(deliveredEventIds),
        options,
    );
}
