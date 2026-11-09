import { createHash } from 'node:crypto';
import type { WorkJson, WorkMessage, WorkPayloadRef } from '@memberjunction/work-queue-core';

const GROUP_ID = /^[\x21-\x7e]{1,128}$/;

export function SerializeEnvelope(message: WorkMessage): string {
    return JSON.stringify(message);
}

export function IsWorkJson(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(IsWorkJson);
    }
    if (typeof value === 'object') {
        return Object.values(value).every(IsWorkJson);
    }
    return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMap(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every((v) => typeof v === 'string');
}

function optionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function readPayloadRef(value: unknown): WorkPayloadRef | undefined | null {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value) || typeof value['Uri'] !== 'string') {
        return null;
    }
    const ref: WorkPayloadRef = { Uri: value['Uri'] };
    if (typeof value['ContentType'] === 'string') ref.ContentType = value['ContentType'];
    if (typeof value['SizeBytes'] === 'number') ref.SizeBytes = value['SizeBytes'];
    if (typeof value['Checksum'] === 'string') ref.Checksum = value['Checksum'];
    return ref;
}

function hasValidScalars(raw: Record<string, unknown>): boolean {
    return typeof raw['MessageID'] === 'string' && raw['MessageID'] !== ''
        && typeof raw['Topic'] === 'string' && raw['Topic'] !== ''
        && typeof raw['PublishedAt'] === 'string'
        && isStringMap(raw['Attributes'])
        && optionalString(raw['PartitionKey']) && optionalString(raw['CorrelationID'])
        && (raw['Payload'] === undefined || IsWorkJson(raw['Payload']));
}

/** Parses an SQS body into an envelope. Null when the body is not a valid envelope (poison message). */
export function ParseEnvelopeBody(body: string): WorkMessage | null {
    let raw: unknown;
    try {
        raw = JSON.parse(body);
    } catch {
        return null;
    }
    if (!isRecord(raw) || !hasValidScalars(raw)) {
        return null;
    }
    const payloadRef = readPayloadRef(raw['PayloadRef']);
    if (payloadRef === null) {
        return null;
    }
    // The four casts are on fields hasValidScalars has just checked; TypeScript cannot carry that narrowing across the helper.
    const message: WorkMessage = {
        MessageID: raw['MessageID'] as string,
        Topic: raw['Topic'] as string,
        Attributes: raw['Attributes'] as Record<string, string>,
        PublishedAt: raw['PublishedAt'] as string,
    };
    if (typeof raw['PartitionKey'] === 'string') message.PartitionKey = raw['PartitionKey'];
    if (raw['Payload'] !== undefined && IsWorkJson(raw['Payload'])) message.Payload = raw['Payload'];
    if (payloadRef) message.PayloadRef = payloadRef;
    if (typeof raw['CorrelationID'] === 'string') message.CorrelationID = raw['CorrelationID'];
    return message;
}

/** FIFO MessageGroupId: the partition key (or MessageID); keys SQS/SNS cannot carry become 'pk-' + SHA-256 hex. */
export function MessageGroupIdFor(message: WorkMessage): string {
    const key = message.PartitionKey ?? message.MessageID;
    return GROUP_ID.test(key) ? key : `pk-${createHash('sha256').update(key).digest('hex')}`;
}
