import type { DeadLetterRecord, WorkMessage } from '@memberjunction/work-queue-core';
import { ParseEnvelopeBody } from '../envelope';
import type { ServiceBusReceivedEnvelope } from '../gateway/ServiceBusGateway';
import { DEAD_LETTER_PROPERTIES, REDRIVE_REASON, SERVICE_BUS_MAX_DELIVERY_REASON, StringProperty } from '../properties';

/** DeliveryID prefix of a dead letter whose body is not an envelope (it has no MessageID). */
export const INVALID_ENVELOPE_ID_PREFIX = 'sb:';
const RAW_BODY_PREVIEW_CHARS = 1000;

export interface ScannedDeadLetter {
    Raw: ServiceBusReceivedEnvelope;
    Envelope: WorkMessage | null;
}

export function Scan(raw: ServiceBusReceivedEnvelope): ScannedDeadLetter {
    return { Raw: raw, Envelope: ParseEnvelopeBody(raw.Body) };
}

/** The operator-facing ID: the envelope MessageID, or 'sb:<SequenceNumber>' when the body is not an envelope. */
export function DeadLetterIdOf(item: ScannedDeadLetter): string {
    return item.Envelope?.MessageID ?? `${INVALID_ENVELOPE_ID_PREFIX}${item.Raw.SequenceNumber}`;
}

/** The runtime's reason property when it dead-lettered the message; the service's own reason (MaxDeliveryCount → RedrivePolicy) otherwise. */
function reasonOf(raw: ServiceBusReceivedEnvelope): string {
    const runtime = StringProperty(raw.ApplicationProperties, DEAD_LETTER_PROPERTIES.Reason);
    if (runtime !== undefined) {
        return runtime;
    }
    if (raw.DeadLetterReason === SERVICE_BUS_MAX_DELIVERY_REASON || raw.DeadLetterReason === null) {
        return REDRIVE_REASON;
    }
    return raw.DeadLetterReason;
}

export function ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord {
    const properties = item.Raw.ApplicationProperties;
    const lastError = StringProperty(properties, DEAD_LETTER_PROPERTIES.LastError) ?? item.Raw.DeadLetterErrorDescription ?? null;
    const base = {
        DeliveryID: DeadLetterIdOf(item),
        Attempts: Number(StringProperty(properties, DEAD_LETTER_PROPERTIES.Attempts) ?? '0'),
        Reason: reasonOf(item.Raw),
        DeadLetteredAt: StringProperty(properties, DEAD_LETTER_PROPERTIES.DeadLetteredAt) ?? null,
        BlocksKey: false,
    };
    if (item.Envelope !== null) {
        return { ...base, Message: item.Envelope, PartitionKey: item.Envelope.PartitionKey ?? null, LastError: lastError === '' ? null : lastError };
    }
    const body = typeof item.Raw.Body === 'string' ? item.Raw.Body : JSON.stringify(item.Raw.Body);
    const preview = `raw body: ${(body ?? '').slice(0, RAW_BODY_PREVIEW_CHARS)}`;
    return {
        ...base,
        Message: { MessageID: base.DeliveryID, Topic: '', Attributes: {}, Payload: null, PublishedAt: '' },
        PartitionKey: null,
        LastError: lastError ? `${lastError}; ${preview}` : preview,
    };
}
