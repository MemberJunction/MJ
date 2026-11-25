import type { GcpSubscriptionConfig } from '../config';
import { OrderingKeyFor, SerializeEnvelope } from '../envelope';
import type { PubSubGateway, PubSubReceivedRecord } from '../gateway/PubSubGateway';

export const DEAD_LETTER_ATTRIBUTES = {
    Reason: 'mj_dead_letter_reason',
    LastError: 'mj_last_error',
    Attempts: 'mj_attempts',
    DeadLetteredAt: 'mj_dead_lettered_at',
    SourceSubscription: 'mj_source_subscription',
    SourceMessageId: 'mj_source_message_id',
} as const;

/** Set to '1' on a message the operator replayed from the dead-letter topic. */
export const REPLAY_ATTRIBUTE = 'mj_replay';

export const DEAD_LETTER_REASON_MAX_CHARS = 500;
export const LAST_ERROR_MAX_CHARS = 2000;

export interface DeadLetterPublishRequest {
    Message: PubSubReceivedRecord;
    Reason: string;
    Error: string | null;
    Attempts: number;
    SourceMessageId?: string;
    OrderingKey?: string;
}

/** Publishes a dead-lettered Pub/Sub message copy to the configured DeadLetterTopicName with diagnostic metadata. */
export async function PublishToDeadLetterTopic(
    gateway: PubSubGateway,
    config: GcpSubscriptionConfig,
    request: DeadLetterPublishRequest,
    now: Date,
): Promise<string> {
    if (!config.DeadLetterTopicName) {
        throw new Error(`Subscription '${config.SubscriptionName}' has no DeadLetterTopicName configured`);
    }
    const reason = request.Reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS);
    const errorDesc = (request.Error ?? request.Reason).slice(0, LAST_ERROR_MAX_CHARS);
    const sourceMessageId = request.SourceMessageId ?? request.Message.ServerMessageId;
    const attributes: Record<string, string> = {
        ...request.Message.Attributes,
        [DEAD_LETTER_ATTRIBUTES.Reason]: reason,
        [DEAD_LETTER_ATTRIBUTES.Attempts]: String(request.Attempts),
        [DEAD_LETTER_ATTRIBUTES.DeadLetteredAt]: now.toISOString(),
        [DEAD_LETTER_ATTRIBUTES.SourceSubscription]: config.SubscriptionName,
        [DEAD_LETTER_ATTRIBUTES.SourceMessageId]: sourceMessageId,
    };
    if (request.Error !== null && request.Error !== '') {
        attributes[DEAD_LETTER_ATTRIBUTES.LastError] = errorDesc;
    }
    const orderingKey = request.OrderingKey ?? request.Message.OrderingKey ?? undefined;
    return gateway.Publish(config.DeadLetterTopicName, {
        MessageId: sourceMessageId,
        Data: request.Message.Data,
        Attributes: attributes,
        ...(orderingKey ? { OrderingKey: orderingKey } : {}),
    });
}

export function DeadLetterOrderingKey(
    enableOrdering: boolean,
    fallbackMessage: { MessageID: string; Topic: string; Attributes: Record<string, string>; PublishedAt: string; PartitionKey?: string } | null,
    record: PubSubReceivedRecord,
): string | undefined {
    if (!enableOrdering) {
        return undefined;
    }
    if (record.OrderingKey) {
        return record.OrderingKey;
    }
    if (fallbackMessage) {
        return OrderingKeyFor({ ...fallbackMessage, PublishedAt: fallbackMessage.PublishedAt || SerializeEnvelope(fallbackMessage) });
    }
    return record.ServerMessageId;
}
