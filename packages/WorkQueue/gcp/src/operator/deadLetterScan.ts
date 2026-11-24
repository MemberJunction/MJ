import type { DeadLetterRecord, WorkMessage } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES } from '../consumer/deadLetter';
import { ParseEnvelopeBody } from '../envelope';
import type { PubSubGateway, PubSubReceivedRecord } from '../gateway/PubSubGateway';

export const DEAD_LETTER_SCAN_LIMIT = 100;
export const INVALID_ENVELOPE_ID_PREFIX = 'gcp:';
const RAW_BODY_PREVIEW_CHARS = 1000;

export interface ScannedDeadLetter {
    Raw: PubSubReceivedRecord;
    Envelope: WorkMessage | null;
}

export function ToScannedDeadLetter(raw: PubSubReceivedRecord): ScannedDeadLetter {
    return { Raw: raw, Envelope: ParseEnvelopeBody(raw.Data) };
}

/** Operator-facing ID: envelope MessageID, or 'gcp:<ServerMessageId>' when the body is not an envelope. */
export function DeadLetterIdOf(item: ScannedDeadLetter): string {
    return item.Envelope?.MessageID ?? `${INVALID_ENVELOPE_ID_PREFIX}${item.Raw.ServerMessageId}`;
}

/** Keeps the first occurrence when scanning returns multiple copies of the same dead-letter DeliveryID. */
export function DistinctDeadLetters(items: ScannedDeadLetter[]): ScannedDeadLetter[] {
    const seen = new Set<string>();
    const unique: ScannedDeadLetter[] = [];
    for (const item of items) {
        const id = DeadLetterIdOf(item);
        if (!seen.has(id)) {
            seen.add(id);
            unique.push(item);
        }
    }
    return unique;
}

export function ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord {
    const props = item.Raw.Attributes;
    const lastError = props[DEAD_LETTER_ATTRIBUTES.LastError] ?? null;
    const attempts = Number(props[DEAD_LETTER_ATTRIBUTES.Attempts] ?? String(item.Raw.DeliveryAttempt ?? 0));
    const reason = props[DEAD_LETTER_ATTRIBUTES.Reason] ?? 'MaxDeliveryAttemptsExceeded';
    const deadLetteredAt = props[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt] ?? null;

    const base = {
        DeliveryID: DeadLetterIdOf(item),
        Attempts: Number.isFinite(attempts) ? attempts : 0,
        Reason: reason,
        DeadLetteredAt: deadLetteredAt,
        BlocksKey: false,
    };
    if (item.Envelope !== null) {
        return { ...base, Message: item.Envelope, PartitionKey: item.Envelope.PartitionKey ?? null, LastError: lastError };
    }
    const preview = `raw body: ${item.Raw.Data.slice(0, RAW_BODY_PREVIEW_CHARS)}`;
    return {
        ...base,
        Message: { MessageID: base.DeliveryID, Topic: '', Attributes: {}, Payload: null, PublishedAt: '' },
        PartitionKey: null,
        LastError: lastError ? `${lastError}; ${preview}` : preview,
    };
}

/** Nacks any pulled dead-letter messages that were not explicitly acknowledged so they remain on the DLQ subscription. */
export async function RestoreDeadLetterVisibility(
    gateway: PubSubGateway,
    deadLetterSubscriptionName: string,
    items: ScannedDeadLetter[],
    ackedToken?: string,
): Promise<void> {
    for (const item of items) {
        if (item.Raw.AckId !== ackedToken) {
            await gateway.NackDeadLetter(deadLetterSubscriptionName, item.Raw.AckId).catch(() => false);
        }
    }
}
