import type { AwsSubscriptionConfig } from '../config';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';

export const DEAD_LETTER_ATTRIBUTES = {
    Reason: 'mj_dead_letter_reason',
    LastError: 'mj_last_error',
    Attempts: 'mj_attempts',
    DeadLetteredAt: 'mj_dead_lettered_at',
    SourceQueue: 'mj_source_queue',
} as const;

/** Set to '1' on a message the operator replayed from the dead-letter queue. */
export const REPLAY_ATTRIBUTE = 'mj_replay';

export const DEAD_LETTER_REASON_MAX_CHARS = 500;
export const LAST_ERROR_MAX_CHARS = 2000;

export interface DeadLetterRequest {
    Message: SqsReceivedMessage;
    Reason: string;
    Error: string | null;
    Attempts: number;
}

/** Copies a received message to the subscription's dead-letter queue. Returns the copy's SQS MessageId. */
export async function SendToDeadLetterQueue(gateway: SqsGateway, config: AwsSubscriptionConfig, request: DeadLetterRequest, now: Date): Promise<string> {
    const attributes: Record<string, string> = {
        [DEAD_LETTER_ATTRIBUTES.Reason]: request.Reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS),
        [DEAD_LETTER_ATTRIBUTES.Attempts]: String(request.Attempts),
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: now.toISOString(),
        [DEAD_LETTER_ATTRIBUTES.SourceQueue]: config.QueueArn,
    };
    if (request.Error !== null && request.Error !== '') {
        attributes[DEAD_LETTER_ATTRIBUTES.LastError] = request.Error.slice(0, LAST_ERROR_MAX_CHARS);
    }
    return gateway.Send({
        QueueUrl: config.DeadLetterQueueUrl,
        Body: request.Message.Body,
        Attributes: attributes,
        // F6: every dead letter is its own message group, so a scan's in-flight receive never blocks the others.
        ...(config.IsFifo
            ? { MessageGroupId: request.Message.MessageId, MessageDeduplicationId: `${request.Message.MessageId}:dl` }
            : {}),
    });
}
