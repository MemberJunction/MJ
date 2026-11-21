import type { WorkJson, WorkMessage, WorkPayloadRef } from './envelope';
import type { PublishError, PublishRequest } from './publishing';
import { CreatePublishError, PublishErrorCodes } from './publishing';
import type { TopicBinding } from './transport';

export const MAX_ENVELOPE_BYTES = 262144;
export const MAX_ATTRIBUTES = 10;
export const MAX_ATTRIBUTE_KEY_LENGTH = 64;
export const MAX_ATTRIBUTE_VALUE_LENGTH = 256;
export const MAX_PARTITION_KEY_LENGTH = 200;
export const MAX_DEDUPLICATION_KEY_LENGTH = 200;
export const MIN_DEDUPLICATION_TTL_SECONDS = 60;
export const MAX_DEDUPLICATION_TTL_SECONDS = 2592000;

/** No dot: a dotted name is MJ's `source.field` filter form, so a dotted attribute key could never be filtered. Shared with filter.ts so a filter can only name a key a producer could publish. */
export const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const RESERVED_ATTRIBUTE_PREFIXES = ['mj.', 'mj_'];
const SIZE_PLACEHOLDER_MESSAGE_ID = '00000000-0000-0000-0000-000000000000';
const SIZE_PLACEHOLDER_PUBLISHED_AT = new Date(Date.UTC(2000, 0, 1));
const utf8 = new TextEncoder();

export function IsWorkQueueUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

export function IsReservedAttributeKey(key: string): boolean {
    const lower = key.toLowerCase();
    return RESERVED_ATTRIBUTE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** First failing envelope rule (spec 03 §1.1) that core can check without MJ state, or null. */
export function ValidatePublishRequest(topic: TopicBinding, request: PublishRequest): PublishError | null {
    return (
        validateMessageID(request) ??
        validateAttributes(request) ??
        validatePayloadShape(request) ??
        validatePartitionKey(request) ??
        validateDeduplication(request) ??
        validateSize(topic, request)
    );
}

export function BuildWorkMessage<TPayload extends WorkJson = WorkJson>(
    topicName: string,
    request: PublishRequest<TPayload>,
    publishedAt: Date,
    newId: () => string,
): WorkMessage<TPayload> {
    return {
        MessageID: request.MessageID ?? newId(),
        Topic: topicName,
        ...(request.PartitionKey !== undefined ? { PartitionKey: request.PartitionKey } : {}),
        Attributes: { ...(request.Attributes ?? {}) },
        ...(request.Payload !== undefined ? { Payload: request.Payload } : {}),
        ...(request.PayloadRef !== undefined ? { PayloadRef: { ...request.PayloadRef } } : {}),
        ...(request.CorrelationID !== undefined ? { CorrelationID: request.CorrelationID } : {}),
        PublishedAt: publishedAt.toISOString(),
    };
}

export function SerializedEnvelopeBytes(message: WorkMessage): number {
    return utf8.encode(JSON.stringify(message)).length;
}

/**
 * Sorted-key JSON of the fields that identify a publish — never MessageID, Topic or PublishedAt (spec 03 §2.1).
 * Two publishes that reuse a MessageID are the same publish exactly when their canonical envelopes are equal,
 * however the producer ordered its object keys.
 */
export function CanonicalEnvelope(message: WorkMessage): string {
    const compared: { [key: string]: WorkJson } = {};
    if (message.PartitionKey !== undefined) {
        compared.PartitionKey = message.PartitionKey;
    }
    compared.Attributes = { ...message.Attributes };
    if (message.Payload !== undefined) {
        compared.Payload = message.Payload;
    }
    if (message.PayloadRef !== undefined) {
        compared.PayloadRef = payloadRefJson(message.PayloadRef);
    }
    if (message.CorrelationID !== undefined) {
        compared.CorrelationID = message.CorrelationID;
    }
    return JSON.stringify(sortKeys(compared));
}

/** Only the fields that are present: an optional property typed `undefined` is not a WorkJson value. */
function payloadRefJson(ref: WorkPayloadRef): { [key: string]: WorkJson } {
    const json: { [key: string]: WorkJson } = { Uri: ref.Uri };
    if (ref.ContentType !== undefined) {
        json.ContentType = ref.ContentType;
    }
    if (ref.SizeBytes !== undefined) {
        json.SizeBytes = ref.SizeBytes;
    }
    if (ref.Checksum !== undefined) {
        json.Checksum = ref.Checksum;
    }
    return json;
}

/** Object keys sorted recursively; array order is significant and kept. */
function sortKeys(value: WorkJson): WorkJson {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    const sorted: { [key: string]: WorkJson } = {};
    for (const key of Object.keys(value).sort()) {
        sorted[key] = sortKeys(value[key]);
    }
    return sorted;
}

function validateMessageID(request: PublishRequest): PublishError | null {
    if (request.MessageID === undefined || IsWorkQueueUuid(request.MessageID)) {
        return null;
    }
    return CreatePublishError(PublishErrorCodes.InvalidMessageID, `MessageID '${request.MessageID}' is not a UUID`);
}

function validateAttributes(request: PublishRequest): PublishError | null {
    if (request.Attributes === undefined) {
        return null;
    }
    const entries = Object.entries(request.Attributes);
    if (entries.length > MAX_ATTRIBUTES) {
        return invalidAttributes(`At most ${MAX_ATTRIBUTES} attributes are allowed; got ${entries.length}`);
    }
    for (const [key, value] of entries) {
        if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
            return invalidAttributes(`Attribute key '${key}' must be 1-${MAX_ATTRIBUTE_KEY_LENGTH} characters of A-Z a-z 0-9 _ - (no dots)`);
        }
        if (IsReservedAttributeKey(key)) {
            return invalidAttributes(`Attribute key '${key}' uses a reserved prefix (mj. or mj_)`);
        }
        if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
            return invalidAttributes(`Attribute '${key}' must be a string of 1-${MAX_ATTRIBUTE_VALUE_LENGTH} characters`);
        }
    }
    return null;
}

function validatePayloadShape(request: PublishRequest): PublishError | null {
    if (request.Payload !== undefined && request.PayloadRef !== undefined) {
        return CreatePublishError(PublishErrorCodes.InvalidPayload, 'Supply Payload or PayloadRef, not both');
    }
    if (request.PayloadRef !== undefined && (typeof request.PayloadRef.Uri !== 'string' || request.PayloadRef.Uri.length === 0)) {
        return CreatePublishError(PublishErrorCodes.InvalidPayload, 'PayloadRef.Uri must be a non-empty string');
    }
    return null;
}

function validatePartitionKey(request: PublishRequest): PublishError | null {
    const key = request.PartitionKey;
    if (key === undefined || (key.length > 0 && key.length <= MAX_PARTITION_KEY_LENGTH)) {
        return null;
    }
    return CreatePublishError(PublishErrorCodes.InvalidPartitionKey, `PartitionKey must be 1-${MAX_PARTITION_KEY_LENGTH} characters`);
}

function validateDeduplication(request: PublishRequest): PublishError | null {
    const key = request.DeduplicationKey;
    const ttl = request.DeduplicationTTLSeconds;
    if (key === undefined) {
        return ttl === undefined ? null : invalidDeduplication('DeduplicationTTLSeconds requires a DeduplicationKey');
    }
    if (key.length === 0 || key.length > MAX_DEDUPLICATION_KEY_LENGTH) {
        return invalidDeduplication(`DeduplicationKey must be 1-${MAX_DEDUPLICATION_KEY_LENGTH} characters`);
    }
    if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < MIN_DEDUPLICATION_TTL_SECONDS || ttl > MAX_DEDUPLICATION_TTL_SECONDS)) {
        return invalidDeduplication(
            `DeduplicationTTLSeconds must be an integer from ${MIN_DEDUPLICATION_TTL_SECONDS} to ${MAX_DEDUPLICATION_TTL_SECONDS}`,
        );
    }
    return null;
}

function validateSize(topic: TopicBinding, request: PublishRequest): PublishError | null {
    const limit = Math.min(topic.MaxPayloadBytes, MAX_ENVELOPE_BYTES);
    let bytes: number;
    try {
        const provisional = BuildWorkMessage(topic.TopicName, request, SIZE_PLACEHOLDER_PUBLISHED_AT, () => SIZE_PLACEHOLDER_MESSAGE_ID);
        bytes = SerializedEnvelopeBytes(provisional);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return CreatePublishError(PublishErrorCodes.InvalidPayload, `Payload is not serializable JSON: ${detail}`);
    }
    if (bytes > limit) {
        return CreatePublishError(PublishErrorCodes.PayloadTooLarge, `Envelope is ${bytes} bytes; the limit for '${topic.TopicName}' is ${limit}`);
    }
    return null;
}

function invalidAttributes(message: string): PublishError {
    return CreatePublishError(PublishErrorCodes.InvalidAttributes, message);
}

function invalidDeduplication(message: string): PublishError {
    return CreatePublishError(PublishErrorCodes.InvalidDeduplication, message);
}
