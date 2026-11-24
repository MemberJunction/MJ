import type { PubSubReceivedRecord } from '../gateway/PubSubGateway';

/** Standard Google Cloud Pub/Sub HTTP Push message shape. */
export interface PubSubPushMessagePayload {
    data?: string;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
    publish_time?: string;
    attributes?: Record<string, string>;
    orderingKey?: string;
    ordering_key?: string;
}

/** Standard Google Cloud Pub/Sub HTTP Push request JSON body. */
export interface PubSubPushEnvelope {
    message: PubSubPushMessagePayload;
    subscription?: string;
    deliveryAttempt?: number;
    delivery_attempt?: number;
}

export interface CloudRunPushHttpRequest {
    Body: unknown;
    Headers?: Record<string, string | string[] | undefined>;
    Signal?: AbortSignal;
}

export interface CloudRunPushResponseBody {
    Status: 'Completed' | 'DeadLettered' | 'Retry' | 'BadRequest' | 'Unauthorized' | 'Forbidden' | 'Error';
    MessageID?: string;
    Subscription?: string;
    Reason?: string;
    DurationMs: number;
}

export interface CloudRunPushHttpResponse {
    StatusCode: number;
    Headers: Record<string, string>;
    Body: CloudRunPushResponseBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function optionalPositiveInt(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined;
}

function normalizeAttributes(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'string') {
            attrs[k] = v;
        } else if (v !== null && v !== undefined) {
            attrs[k] = String(v);
        }
    }
    return attrs;
}

function parseRawBody(body: unknown): unknown {
    if (typeof body === 'string') {
        return JSON.parse(body);
    }
    if (Buffer.isBuffer(body)) {
        return JSON.parse(body.toString('utf8'));
    }
    return body;
}

/** Parses and validates an incoming Google Cloud Pub/Sub HTTP Push request body. */
export function ParsePubSubPushEnvelope(body: unknown): PubSubPushEnvelope | null {
    let raw: unknown;
    try {
        raw = parseRawBody(body);
    } catch {
        return null;
    }
    if (!isRecord(raw) || !isRecord(raw['message'])) {
        return null;
    }
    const msgRaw = raw['message'];
    const data = optionalString(msgRaw['data']);
    const messageId = optionalString(msgRaw['messageId']) ?? optionalString(msgRaw['message_id']);
    if (data === undefined && messageId === undefined && msgRaw['attributes'] === undefined) {
        return null;
    }
    return {
        message: {
            data,
            messageId,
            publishTime: optionalString(msgRaw['publishTime']) ?? optionalString(msgRaw['publish_time']),
            attributes: normalizeAttributes(msgRaw['attributes']),
            orderingKey: optionalString(msgRaw['orderingKey']) ?? optionalString(msgRaw['ordering_key']),
        },
        subscription: optionalString(raw['subscription']),
        deliveryAttempt: optionalPositiveInt(raw['deliveryAttempt']) ?? optionalPositiveInt(raw['delivery_attempt']),
    };
}

/** Extracts a case-insensitive `Authorization: Bearer <token>` header value. */
export function ExtractBearerToken(headers?: Record<string, string | string[] | undefined>): string | null {
    if (!headers) {
        return null;
    }
    for (const [name, rawVal] of Object.entries(headers)) {
        if (name.toLowerCase() !== 'authorization') {
            continue;
        }
        const val = Array.isArray(rawVal) ? rawVal[0] : rawVal;
        if (typeof val !== 'string') {
            return null;
        }
        const match = /^Bearer\s+(\S+)$/i.exec(val.trim());
        return match ? match[1] : null;
    }
    return null;
}

/** Converts a Pub/Sub HTTP Push envelope into a `PubSubReceivedRecord` for `PubSubTransportConsumer.Adopt`. */
export function ToPubSubReceivedRecord(envelope: PubSubPushEnvelope): PubSubReceivedRecord {
    const msg = envelope.message;
    const decodedData = typeof msg.data === 'string'
        ? Buffer.from(msg.data, 'base64').toString('utf8')
        : '';
    const serverMessageId = msg.messageId ?? msg.message_id ?? `cloudrun-push-${Date.now()}`;
    const publishTimeStr = msg.publishTime ?? msg.publish_time;
    const publishTimeMs = publishTimeStr ? Date.parse(publishTimeStr) : NaN;
    return {
        ServerMessageId: serverMessageId,
        AckId: `push-ack-${serverMessageId}`,
        Data: decodedData,
        DeliveryAttempt: envelope.deliveryAttempt ?? envelope.delivery_attempt ?? 1,
        OrderingKey: msg.orderingKey ?? msg.ordering_key ?? null,
        PublishTimeMs: Number.isFinite(publishTimeMs) ? publishTimeMs : null,
        AckDeadlineExpiresAtMs: null,
        Attributes: msg.attributes ? { ...msg.attributes } : {},
    };
}
