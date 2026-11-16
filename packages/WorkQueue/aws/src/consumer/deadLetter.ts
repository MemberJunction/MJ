import type { AwsSubscriptionConfig } from '../config';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';

export const DEAD_LETTER_ATTRIBUTES = {
    Reason: 'mj_dead_letter_reason',
    LastError: 'mj_last_error',
    Attempts: 'mj_attempts',
    DeadLetteredAt: 'mj_dead_lettered_at',
    SourceQueue: 'mj_source_queue',
    /**
     * SQS MessageId of the source message this dead letter copies (#5143). The copy is sent before the source is
     * deleted; when that delete fails on a lost lease, a standard queue redelivers the source and a second copy is
     * written. Both copies carry the same value, which is how a listing recognises the duplicate.
     */
    SourceMessageId: 'mj_source_message_id',
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

/**
 * Copies a received message to the subscription's dead-letter queue. Returns the copy's SQS MessageId.
 *
 * The copy is sent first and the source deleted after. If that delete fails because the lease was lost, a standard
 * queue redelivers the source and it can be dead-lettered again, so the dead-letter queue may hold two copies of one
 * message. Each copy carries {@link DEAD_LETTER_ATTRIBUTES.SourceMessageId}; the operator listing shows one per value.
 * A FIFO queue deduplicates the second send itself.
 */
export async function SendToDeadLetterQueue(gateway: SqsGateway, config: AwsSubscriptionConfig, request: DeadLetterRequest, now: Date): Promise<string> {
    const attributes: Record<string, string> = {
        [DEAD_LETTER_ATTRIBUTES.Reason]: request.Reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS),
        [DEAD_LETTER_ATTRIBUTES.Attempts]: String(request.Attempts),
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: now.toISOString(),
        [DEAD_LETTER_ATTRIBUTES.SourceQueue]: config.QueueArn,
        [DEAD_LETTER_ATTRIBUTES.SourceMessageId]: request.Message.MessageId,
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
