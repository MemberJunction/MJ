import type { WorkJson, WorkPayloadRef } from '../envelope';
import type { PublishError, PublishRequest, PublishResult, PublishStatus } from '../publishing';
import { CreatePublishError } from '../publishing';

export const MAX_REST_PUBLISH_BATCH = 100;

export interface RestPayloadRefJson {
    uri: string;
    contentType?: string;
    sizeBytes?: number;
    checksum?: string;
}

export interface RestPublishRequestJson {
    messageId?: string;
    partitionKey?: string;
    attributes?: Record<string, string>;
    payload?: WorkJson;
    payloadRef?: RestPayloadRefJson;
    correlationId?: string;
    deduplicationKey?: string;
    deduplicationTtlSeconds?: number;
}

export interface RestPublishBodyJson {
    messages: RestPublishRequestJson[];
}

export interface RestPublishErrorJson {
    code: string;
    message: string;
    retryable: boolean;
}

export interface RestPublishResultJson {
    messageId: string;
    status: PublishStatus;
    error?: RestPublishErrorJson;
}

export interface RestPublishResponseJson {
    results: RestPublishResultJson[];
}

export type RestPublishBodyParseResult = { Kind: 'Parsed'; Requests: PublishRequest[] } | { Kind: 'Invalid'; Error: string };

type Field<T> = { Valid: true; Value: T | undefined } | { Valid: false };

const STATUS_BY_LOWER_NAME: ReadonlyMap<string, PublishStatus> = new Map<string, PublishStatus>([
    ['accepted', 'Accepted'],
    ['duplicate', 'Duplicate'],
    ['rejected', 'Rejected'],
]);

export function ToRestPublishRequest(request: PublishRequest): RestPublishRequestJson {
    return {
        ...(request.MessageID !== undefined ? { messageId: request.MessageID } : {}),
        ...(request.PartitionKey !== undefined ? { partitionKey: request.PartitionKey } : {}),
        ...(request.Attributes !== undefined ? { attributes: { ...request.Attributes } } : {}),
        ...(request.Payload !== undefined ? { payload: request.Payload } : {}),
        ...(request.PayloadRef !== undefined ? { payloadRef: toRestPayloadRef(request.PayloadRef) } : {}),
        ...(request.CorrelationID !== undefined ? { correlationId: request.CorrelationID } : {}),
        ...(request.DeduplicationKey !== undefined ? { deduplicationKey: request.DeduplicationKey } : {}),
        ...(request.DeduplicationTTLSeconds !== undefined ? { deduplicationTtlSeconds: request.DeduplicationTTLSeconds } : {}),
    };
}

export function FromRestPublishRequest(json: RestPublishRequestJson): PublishRequest {
    return {
        ...(json.messageId !== undefined ? { MessageID: json.messageId } : {}),
        ...(json.partitionKey !== undefined ? { PartitionKey: json.partitionKey } : {}),
        ...(json.attributes !== undefined ? { Attributes: { ...json.attributes } } : {}),
        ...(json.payload !== undefined ? { Payload: json.payload } : {}),
        ...(json.payloadRef !== undefined ? { PayloadRef: fromRestPayloadRef(json.payloadRef) } : {}),
        ...(json.correlationId !== undefined ? { CorrelationID: json.correlationId } : {}),
        ...(json.deduplicationKey !== undefined ? { DeduplicationKey: json.deduplicationKey } : {}),
        ...(json.deduplicationTtlSeconds !== undefined ? { DeduplicationTTLSeconds: json.deduplicationTtlSeconds } : {}),
    };
}

export function ToRestPublishResult(result: PublishResult): RestPublishResultJson {
    return {
        messageId: result.MessageID,
        status: result.Status,
        ...(result.Error !== undefined
            ? { error: { code: result.Error.Code, message: result.Error.Message, retryable: result.Error.Retryable } }
            : {}),
    };
}

/** Checks the body's shape and maps it to PublishRequests. Envelope rules are ValidatePublishRequest's job. */
export function ParseRestPublishBody(value: unknown): RestPublishBodyParseResult {
    if (!isRecord(value) || !Array.isArray(value['messages'])) {
        return { Kind: 'Invalid', Error: 'Body must be an object with a "messages" array' };
    }
    const messages: unknown[] = value['messages'];
    if (messages.length === 0 || messages.length > MAX_REST_PUBLISH_BATCH) {
        return { Kind: 'Invalid', Error: `"messages" must contain 1-${MAX_REST_PUBLISH_BATCH} items` };
    }
    const requests: PublishRequest[] = [];
    for (let index = 0; index < messages.length; index += 1) {
        const parsed = parseRequestJson(messages[index]);
        if (typeof parsed === 'string') {
            return { Kind: 'Invalid', Error: `messages[${index}]: ${parsed}` };
        }
        requests.push(FromRestPublishRequest(parsed));
    }
    return { Kind: 'Parsed', Requests: requests };
}

export function ParseRestPublishResponse(value: unknown, expectedCount: number): PublishResult[] | null {
    if (!isRecord(value) || !Array.isArray(value['results'])) {
        return null;
    }
    const items: unknown[] = value['results'];
    if (items.length !== expectedCount) {
        return null;
    }
    const results: PublishResult[] = [];
    for (const item of items) {
        const result = parseResult(item);
        if (result === null) {
            return null;
        }
        results.push(result);
    }
    return results;
}

export function IsWorkJson(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every((item) => IsWorkJson(item));
    }
    return isRecord(value) && Object.values(value).every((item) => IsWorkJson(item));
}

function parseRequestJson(value: unknown): RestPublishRequestJson | string {
    if (!isRecord(value)) {
        return 'must be an object';
    }
    const scalar = parseScalarFields(value);
    if (typeof scalar === 'string') {
        return scalar;
    }
    const attributes = attributesField(value);
    if (!attributes.Valid) {
        return '"attributes" must be an object of string values';
    }
    const rawPayload = value['payload'];
    let payload: WorkJson | undefined;
    if (rawPayload !== undefined) {
        if (!IsWorkJson(rawPayload)) {
            return '"payload" must be JSON';
        }
        payload = rawPayload;
    }
    const payloadRef = payloadRefField(value);
    if (!payloadRef.Valid) {
        return '"payloadRef" must be an object with a string "uri"';
    }
    return {
        ...scalar,
        ...(attributes.Value !== undefined ? { attributes: attributes.Value } : {}),
        ...(payload !== undefined ? { payload } : {}),
        ...(payloadRef.Value !== undefined ? { payloadRef: payloadRef.Value } : {}),
    };
}

function parseScalarFields(value: Record<string, unknown>): RestPublishRequestJson | string {
    const strings = ['messageId', 'partitionKey', 'correlationId', 'deduplicationKey'] as const;
    const numbers = ['deduplicationTtlSeconds'] as const;
    const result: RestPublishRequestJson = {};
    for (const name of strings) {
        const field = typedField(value, name, 'string');
        if (!field.Valid) {
            return `"${name}" must be a string`;
        }
        if (typeof field.Value === 'string') {
            result[name] = field.Value;
        }
    }
    for (const name of numbers) {
        const field = typedField(value, name, 'number');
        if (!field.Valid) {
            return `"${name}" must be a number`;
        }
        if (typeof field.Value === 'number') {
            result[name] = field.Value;
        }
    }
    return result;
}

function typedField(source: Record<string, unknown>, name: string, type: 'string' | 'number'): Field<string | number> {
    const value = source[name];
    if (value === undefined) {
        return { Valid: true, Value: undefined };
    }
    if (type === 'string' && typeof value === 'string') {
        return { Valid: true, Value: value };
    }
    if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
        return { Valid: true, Value: value };
    }
    return { Valid: false };
}

function attributesField(source: Record<string, unknown>): Field<Record<string, string>> {
    const value = source['attributes'];
    if (value === undefined) {
        return { Valid: true, Value: undefined };
    }
    if (!isRecord(value)) {
        return { Valid: false };
    }
    const attributes: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string') {
            return { Valid: false };
        }
        attributes[key] = item;
    }
    return { Valid: true, Value: attributes };
}

function payloadRefField(source: Record<string, unknown>): Field<RestPayloadRefJson> {
    const value = source['payloadRef'];
    if (value === undefined) {
        return { Valid: true, Value: undefined };
    }
    if (!isRecord(value) || typeof value['uri'] !== 'string') {
        return { Valid: false };
    }
    const contentType = value['contentType'];
    const sizeBytes = value['sizeBytes'];
    const checksum = value['checksum'];
    const optionalOk =
        (contentType === undefined || typeof contentType === 'string') &&
        (sizeBytes === undefined || typeof sizeBytes === 'number') &&
        (checksum === undefined || typeof checksum === 'string');
    if (!optionalOk) {
        return { Valid: false };
    }
    return {
        Valid: true,
        Value: {
            uri: String(value['uri']),
            ...(typeof contentType === 'string' ? { contentType } : {}),
            ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
            ...(typeof checksum === 'string' ? { checksum } : {}),
        },
    };
}

function parseResult(value: unknown): PublishResult | null {
    if (!isRecord(value)) {
        return null;
    }
    const messageId = value['messageId'];
    const statusText = value['status'];
    const status = typeof statusText === 'string' ? STATUS_BY_LOWER_NAME.get(statusText.toLowerCase()) : undefined;
    if (typeof messageId !== 'string' || status === undefined) {
        return null;
    }
    const error = parseError(value['error']);
    return { MessageID: messageId, Status: status, ...(error !== undefined ? { Error: error } : {}) };
}

function parseError(value: unknown): PublishError | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const code = value['code'];
    const message = value['message'];
    const retryable = value['retryable'];
    if (typeof code !== 'string') {
        return undefined;
    }
    const error = CreatePublishError(code, typeof message === 'string' ? message : code);
    return typeof retryable === 'boolean' ? { ...error, Retryable: retryable } : error;
}

function toRestPayloadRef(ref: WorkPayloadRef): RestPayloadRefJson {
    return {
        uri: ref.Uri,
        ...(ref.ContentType !== undefined ? { contentType: ref.ContentType } : {}),
        ...(ref.SizeBytes !== undefined ? { sizeBytes: ref.SizeBytes } : {}),
        ...(ref.Checksum !== undefined ? { checksum: ref.Checksum } : {}),
    };
}

function fromRestPayloadRef(ref: RestPayloadRefJson): WorkPayloadRef {
    return {
        Uri: ref.uri,
        ...(ref.contentType !== undefined ? { ContentType: ref.contentType } : {}),
        ...(ref.sizeBytes !== undefined ? { SizeBytes: ref.sizeBytes } : {}),
        ...(ref.checksum !== undefined ? { Checksum: ref.checksum } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
