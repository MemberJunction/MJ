import { createHash } from 'node:crypto';
import type { WorkJson, WorkMessage, WorkPayloadRef } from '@memberjunction/work-queue-core';

const MAX_ORDERING_KEY_BYTES = 1024;

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

function parseRawEnvelope(body: unknown): unknown {
    if (typeof body === 'string') {
        return JSON.parse(body);
    }
    if (Buffer.isBuffer(body)) {
        return JSON.parse(body.toString('utf8'));
    }
    if (body instanceof Uint8Array) {
        return JSON.parse(Buffer.from(body).toString('utf8'));
    }
    return body;
}

/** Parses a Pub/Sub message payload (string, Buffer, Uint8Array, or JSON object) into a WorkMessage envelope. */
export function ParseEnvelopeBody(body: unknown): WorkMessage | null {
    let raw: unknown;
    try {
        raw = parseRawEnvelope(body);
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
    const messageId = raw['MessageID'];
    const topic = raw['Topic'];
    const attributes = raw['Attributes'];
    const publishedAt = raw['PublishedAt'];
    if (typeof messageId !== 'string' || typeof topic !== 'string' || !isStringMap(attributes) || typeof publishedAt !== 'string') {
        return null;
    }
    const message: WorkMessage = {
        MessageID: messageId,
        Topic: topic,
        Attributes: attributes,
        PublishedAt: publishedAt,
    };
    if (typeof raw['PartitionKey'] === 'string') message.PartitionKey = raw['PartitionKey'];
    if (raw['Payload'] !== undefined && IsWorkJson(raw['Payload'])) message.Payload = raw['Payload'];
    if (payloadRef) message.PayloadRef = payloadRef;
    if (typeof raw['CorrelationID'] === 'string') message.CorrelationID = raw['CorrelationID'];
    return message;
}

/** Converts a Pub/Sub message data buffer/string/object into a UTF-8 string for logging or dead-letter inspection. */
export function BodyAsString(body: unknown): string {
    if (typeof body === 'string') {
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body.toString('utf8');
    }
    if (body instanceof Uint8Array) {
        return Buffer.from(body).toString('utf8');
    }
    if (body === undefined) {
        return '';
    }
    try {
        return JSON.stringify(body);
    } catch {
        return String(body);
    }
}

/** Pub/Sub orderingKey for ordered/exclusive delivery: PartitionKey (or MessageID); hashes keys exceeding 1024 bytes. */
export function OrderingKeyFor(message: WorkMessage): string {
    const key = message.PartitionKey ?? message.MessageID;
    return Buffer.byteLength(key, 'utf8') <= MAX_ORDERING_KEY_BYTES
        ? key
        : `pk-${createHash('sha256').update(key).digest('hex')}`;
}
