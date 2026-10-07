import type { DeadLetterRecord, WorkMessage } from '@memberjunction/work-queue-core';
import { DEAD_LETTER_ATTRIBUTES } from '../consumer/deadLetter';
import { ParseEnvelopeBody } from '../envelope';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';

export const DEAD_LETTER_SCAN_LIMIT = 100;
export const PEEK_VISIBILITY_SECONDS = 30;
/** Long poll: WaitTimeSeconds 0 samples a subset of SQS servers and returns false empties (03 §5.1, F6). */
export const DEAD_LETTER_SCAN_WAIT_SECONDS = 1;
/** A scan ends after this many consecutive empty receives. */
export const DEAD_LETTER_SCAN_EMPTY_LIMIT = 3;
/** DeliveryID prefix of a dead letter whose body is not an envelope (it has no MessageID). */
export const INVALID_ENVELOPE_ID_PREFIX = 'sqs:';
const RAW_BODY_PREVIEW_CHARS = 1000;

export interface ScannedDeadLetter {
    Raw: SqsReceivedMessage;
    Envelope: WorkMessage | null;
}

/** Receives up to `limit` dead letters with a short visibility. Stops at the first item `isMatch` accepts, at the
 *  limit, or after DEAD_LETTER_SCAN_EMPTY_LIMIT consecutive empty receives. */
export async function ScanDeadLetters(
    gateway: SqsGateway,
    queueUrl: string,
    limit: number,
    isMatch?: (item: ScannedDeadLetter) => boolean,
): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
    const items: ScannedDeadLetter[] = [];
    const cap = Math.min(limit, DEAD_LETTER_SCAN_LIMIT);
    let consecutiveEmpties = 0;
    while (items.length < cap && consecutiveEmpties < DEAD_LETTER_SCAN_EMPTY_LIMIT) {
        const batch = await gateway.Receive({
            QueueUrl: queueUrl, MaxMessages: Math.min(10, cap - items.length),
            WaitTimeSeconds: DEAD_LETTER_SCAN_WAIT_SECONDS, VisibilityTimeoutSeconds: PEEK_VISIBILITY_SECONDS,
        });
        if (batch.length === 0) {
            consecutiveEmpties += 1;
            continue;
        }
        consecutiveEmpties = 0;
        // Keep every received item (even past a match) so the caller can restore all of their visibility.
        const scanned = batch.map((raw): ScannedDeadLetter => ({ Raw: raw, Envelope: ParseEnvelopeBody(raw.Body) }));
        items.push(...scanned);
        const match = isMatch ? scanned.find(isMatch) : undefined;
        if (match) {
            return { Items: items, Match: match };
        }
    }
    return { Items: items, Match: null };
}

/** Makes scanned dead letters visible again (best effort; a stale receipt is ignored). */
export async function RestoreVisibility(gateway: SqsGateway, queueUrl: string, items: ScannedDeadLetter[], exceptReceiptHandle?: string): Promise<void> {
    for (const item of items) {
        if (item.Raw.ReceiptHandle !== exceptReceiptHandle) {
            await gateway.ChangeVisibility(queueUrl, item.Raw.ReceiptHandle, 0);
        }
    }
}

/** The operator-facing ID: the envelope MessageID, or 'sqs:<SQS MessageId>' when the body is not an envelope. */
export function DeadLetterIdOf(item: ScannedDeadLetter): string {
    return item.Envelope?.MessageID ?? `${INVALID_ENVELOPE_ID_PREFIX}${item.Raw.MessageId}`;
}

export function ToDeadLetterRecord(item: ScannedDeadLetter): DeadLetterRecord {
    const attributes = item.Raw.Attributes;
    const lastError = attributes[DEAD_LETTER_ATTRIBUTES.LastError] ?? null;
    const base = {
        DeliveryID: DeadLetterIdOf(item),
        Attempts: Number(attributes[DEAD_LETTER_ATTRIBUTES.Attempts] ?? '0'),
        Reason: attributes[DEAD_LETTER_ATTRIBUTES.Reason] ?? 'RedrivePolicy',
        DeadLetteredAt: attributes[DEAD_LETTER_ATTRIBUTES.DeadLetteredAt] ?? null,
        BlocksKey: false,
    };
    if (item.Envelope !== null) {
        return { ...base, Message: item.Envelope, PartitionKey: item.Envelope.PartitionKey ?? null, LastError: lastError };
    }
    // Not an envelope: surface the raw body so an operator can see what arrived before discarding it.
    const preview = `raw body: ${item.Raw.Body.slice(0, RAW_BODY_PREVIEW_CHARS)}`;
    return {
        ...base,
        Message: { MessageID: base.DeliveryID, Topic: '', Attributes: {}, Payload: null, PublishedAt: '' },
        PartitionKey: null,
        LastError: lastError ? `${lastError}; ${preview}` : preview,
    };
}
