import type { AzureSubscriptionConfig } from '../config';
import type { ServiceBusGateway, ServiceBusReceivedRecord } from '../gateway/ServiceBusGateway';

export const DEAD_LETTER_ATTRIBUTES = {
    Reason: 'mj_dead_letter_reason',
    LastError: 'mj_last_error',
    Attempts: 'mj_attempts',
    DeadLetteredAt: 'mj_dead_lettered_at',
    SourceSubscription: 'mj_source_subscription',
    SourceMessageId: 'mj_source_message_id',
} as const;

/** Set to '1' on a message the operator replayed from the dead-letter subqueue. */
export const REPLAY_ATTRIBUTE = 'mj_replay';
/** Carries prior attempt counts across scheduled-retry messages so Attempt remains monotonic. */
export const RETRY_ATTEMPTS_ATTRIBUTE = 'mj_retry_attempts';

export const DEAD_LETTER_REASON_MAX_CHARS = 500;
export const LAST_ERROR_MAX_CHARS = 2000;

export interface DeadLetterMoveRequest {
    Message: ServiceBusReceivedRecord;
    Reason: string;
    Error: string | null;
    Attempts: number;
}

/** Moves a peek-locked Service Bus message into the subscription's $DeadLetterQueue subqueue. */
export async function MoveToDeadLetterSubqueue(
    gateway: ServiceBusGateway,
    config: AzureSubscriptionConfig,
    request: DeadLetterMoveRequest,
    now: Date,
): Promise<boolean> {
    const reason = request.Reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS);
    const errorDesc = (request.Error ?? request.Reason).slice(0, LAST_ERROR_MAX_CHARS);
    const properties: Record<string, string> = {
        [DEAD_LETTER_ATTRIBUTES.Reason]: reason,
        [DEAD_LETTER_ATTRIBUTES.Attempts]: String(request.Attempts),
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: now.toISOString(),
        [DEAD_LETTER_ATTRIBUTES.SourceSubscription]: `${config.ServiceBusTopicName}/${config.SubscriptionName}`,
        [DEAD_LETTER_ATTRIBUTES.SourceMessageId]: request.Message.MessageId,
    };
    if (request.Error !== null && request.Error !== '') {
        properties[DEAD_LETTER_ATTRIBUTES.LastError] = errorDesc;
    }
    return gateway.DeadLetter({
        TopicName: config.ServiceBusTopicName,
        SubscriptionName: config.SubscriptionName,
        RequiresSession: config.RequiresSession,
        LockToken: request.Message.LockToken,
        SessionId: request.Message.SessionId,
        Reason: reason,
        ErrorDescription: errorDesc,
        PropertiesToModify: properties,
    });
}
