import { FatalWorkError, Outcome, TransientWorkError, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateSqsLambdaHandler } from '@memberjunction/work-queue-aws/lambda';

interface UnsubscribeEvent {
    providerEventId: string;
    email: string;
    occurredAt: string;
}

function isUnsubscribeEvent(value: WorkMessage['Payload']): value is UnsubscribeEvent & { [key: string]: string } {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && typeof value['providerEventId'] === 'string' && typeof value['email'] === 'string' && typeof value['occurredAt'] === 'string';
}

/** Records a one-click unsubscribe in a suppression service. Idempotent on providerEventId. No MemberJunction runtime. */
class UnsubscribeRecorder implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        if (!isUnsubscribeEvent(message.Payload)) {
            throw new FatalWorkError('Payload is not an unsubscribe event');
        }
        const url = process.env.SUPPRESSION_API_URL;
        if (!url) {
            throw new FatalWorkError('SUPPRESSION_API_URL is not configured');
        }
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', 'idempotency-key': message.Payload.providerEventId },
            body: JSON.stringify(message.Payload),
            signal: context.Signal,
        });
        if (response.status >= 500 || response.status === 429) {
            throw new TransientWorkError(`Suppression service returned ${response.status}`, 30);
        }
        return response.ok ? Outcome.Complete() : Outcome.DeadLetter(`Suppression service rejected the event: ${response.status}`);
    }
}

export const handler = CreateSqsLambdaHandler(() => new UnsubscribeRecorder());
