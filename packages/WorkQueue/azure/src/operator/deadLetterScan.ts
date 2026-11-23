import type { DeadLetterRecord, WorkMessage } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES } from '../consumer/deadLetter';
import { ParseEnvelopeBody } from '../envelope';
import type { ServiceBusReceivedRecord } from '../gateway/ServiceBusGateway';

export const DEAD_LETTER_SCAN_LIMIT = 100;
export const DEAD_LETTER_RECEIVE_WAIT_MS = 1000;
export const INVALID_ENVELOPE_ID_PREFIX = 'asb:';
const RAW_BODY_PREVIEW_CHARS = 1000;

export interface ScannedDeadLetter {
    Raw: ServiceBusReceivedRecord;
    Envelope: WorkMessage | null;
}

export function ToScannedDeadLetter(raw: ServiceBusReceivedRecord): ScannedDeadLetter {
    return { Raw: raw, Envelope: ParseEnvelopeBody(raw.Body) };
}

/** Operator-facing ID: envelope MessageID, or 'asb:<ServiceBus MessageId>' when the body is not an envelope. */
export function DeadLetterIdOf(item: ScannedDeadLetter): string {
    return item.Envelope?.MessageID ?? `${INVALID_ENVELOPE_ID_PREFIX}${item.Raw.MessageId}`;
}

export function ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord {
    const props = item.Raw.ApplicationProperties;
    const lastError = props[DEAD_LETTER_ATTRIBUTES.LastError] ?? item.Raw.DeadLetterErrorDescription ?? null;
    const attempts = Number(props[DEAD_LETTER_ATTRIBUTES.Attempts] ?? String(item.Raw.DeliveryCount ?? 0));
    const reason = props[DEAD_LETTER_ATTRIBUTES.Reason] ?? item.Raw.DeadLetterReason ?? 'MaxDeliveryCountExceeded';
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
    const preview = `raw body: ${item.Raw.Body.slice(0, RAW_BODY_PREVIEW_CHARS)}`;
    return {
        ...base,
        Message: { MessageID: base.DeliveryID, Topic: '', Attributes: {}, Payload: null, PublishedAt: '' },
        PartitionKey: null,
        LastError: lastError ? `${lastError}; ${preview}` : preview,
    };
}
