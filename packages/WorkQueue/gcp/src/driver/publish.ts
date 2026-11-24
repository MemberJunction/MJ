import {
    WorkQueueConfigurationError, type PublishResult, type TopicBinding, type WorkMessage,
} from '@memberjunction/work-queue-core';
import { ReadGcpTopicConfig } from '../config';
import { OrderingKeyFor, SerializeEnvelope } from '../envelope';
import { GcpGatewayError, ToGatewayError } from '../gateway/errors';
import type {
    PubSubGateway,
    PubSubOutgoingMessage,
    PubSubPublishEntryResult,
} from '../gateway/PubSubGateway';

/** Pub/Sub single-message & publish-request byte ceiling (10 MB). */
export const PUBSUB_MAX_MESSAGE_BYTES = 10_000_000;
/** Pub/Sub maximum messages per Publish RPC request. */
export const PUBSUB_BATCH_MAX_COUNT = 1_000;
/** Pub/Sub maximum attributes per message. */
export const MAX_PUBSUB_ATTRIBUTES = 100;

export function BuildOutgoingMessage(message: WorkMessage, enableOrdering: boolean): PubSubOutgoingMessage {
    const outgoing: PubSubOutgoingMessage = {
        MessageId: message.MessageID,
        Data: SerializeEnvelope(message),
        Attributes: {
            ...message.Attributes,
            ...(message.CorrelationID ? { mj_correlation_id: message.CorrelationID } : {}),
        },
    };
    if (enableOrdering) {
        outgoing.OrderingKey = OrderingKeyFor(message);
    }
    return outgoing;
}

/** Approximate Pub/Sub payload + attribute bytes for precheck and batch chunking. */
export function OutgoingMessageBytes(message: PubSubOutgoingMessage): number {
    return Object.entries(message.Attributes).reduce(
        (total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength(value),
        Buffer.byteLength(message.Data) + (message.OrderingKey ? Buffer.byteLength(message.OrderingKey) : 0),
    );
}

/** Chunks outgoing messages by Pub/Sub batch count, byte ceiling, and optional single-entry-per-ordering-key safety. */
export function ChunkOutgoingMessages(
    messages: PubSubOutgoingMessage[],
    oneEntryPerOrderingKey = false,
): PubSubOutgoingMessage[][] {
    const chunks: PubSubOutgoingMessage[][] = [];
    let current: PubSubOutgoingMessage[] = [];
    let currentBytes = 0;
    for (const msg of messages) {
        const bytes = OutgoingMessageBytes(msg);
        const keyTaken = oneEntryPerOrderingKey
            && msg.OrderingKey !== undefined
            && current.some((other) => other.OrderingKey === msg.OrderingKey);
        if (
            keyTaken
            || current.length >= PUBSUB_BATCH_MAX_COUNT
            || (current.length > 0 && currentBytes + bytes > PUBSUB_MAX_MESSAGE_BYTES)
        ) {
            chunks.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(msg);
        currentBytes += bytes;
    }
    if (current.length > 0) {
        chunks.push(current);
    }
    return chunks;
}

function rejected(messageID: string, code: string, message: string, retryable: boolean): PublishResult {
    return { MessageID: messageID, Status: 'Rejected', Error: { Code: code, Message: message, Retryable: retryable } };
}

function fromEntryResult(messageID: string, result: PubSubPublishEntryResult): PublishResult {
    if (result.Kind === 'Published') {
        return { MessageID: messageID, Status: 'Accepted' };
    }
    return result.SenderFault
        ? rejected(messageID, 'TransportRejected', `PubSub ${result.Code}: ${result.Message}`, false)
        : rejected(messageID, 'TransportUnavailable', `PubSub ${result.Code}: ${result.Message}`, true);
}

function precheck(message: WorkMessage, outgoing: PubSubOutgoingMessage, topic: TopicBinding): PublishResult | null {
    const attrCount = Object.keys(outgoing.Attributes).length;
    if (attrCount > MAX_PUBSUB_ATTRIBUTES) {
        return rejected(message.MessageID, 'InvalidAttributes', `At most ${MAX_PUBSUB_ATTRIBUTES} attributes are allowed`, false);
    }
    const reservedGoogKey = Object.keys(message.Attributes).find((k) => k.toLowerCase().startsWith('goog'));
    if (reservedGoogKey !== undefined) {
        return rejected(message.MessageID, 'InvalidAttributes', `Attribute '${reservedGoogKey}' uses reserved 'goog' prefix`, false);
    }
    const emptyKey = Object.entries(message.Attributes).find(([, value]) => value === '')?.[0];
    if (emptyKey !== undefined) {
        return rejected(message.MessageID, 'InvalidAttributes', `Attribute '${emptyKey}' has an empty value`, false);
    }
    const limit = Math.min(topic.MaxPayloadBytes, PUBSUB_MAX_MESSAGE_BYTES);
    const bytes = OutgoingMessageBytes(outgoing);
    return bytes > limit ? rejected(message.MessageID, 'PayloadTooLarge', `Envelope is ${bytes} bytes; the limit is ${limit}`, false) : null;
}

async function publishChunk(
    gateway: PubSubGateway,
    topicName: string,
    chunk: PubSubOutgoingMessage[],
): Promise<PublishResult[]> {
    try {
        const results = await gateway.PublishBatch(topicName, chunk);
        return results.map((result, idx) => fromEntryResult(chunk[idx]?.MessageId ?? result.Id, result));
    } catch (error) {
        const mapped: GcpGatewayError = ToGatewayError(error, 'PubSub PublishBatch');
        return chunk.map((entry) => rejected(entry.MessageId, 'TransportUnavailable', mapped.message, mapped.Retryable));
    }
}

function holdBack(
    entry: PubSubOutgoingMessage,
    failedOrderingKeys: Set<string>,
    results: Map<string, PublishResult>,
): boolean {
    if (entry.OrderingKey === undefined || !failedOrderingKeys.has(entry.OrderingKey)) {
        return false;
    }
    results.set(entry.MessageId, rejected(
        entry.MessageId,
        'TransportUnavailable',
        'Not sent: an earlier message of this partition key failed in the same publish call',
        true,
    ));
    return true;
}

/** Publishes envelopes to the Google Cloud Pub/Sub topic. Results are positionally aligned with messages. */
export async function PublishToPubSub(
    gateway: PubSubGateway,
    topic: TopicBinding,
    messages: WorkMessage[],
): Promise<PublishResult[]> {
    let gcpTopicName: string;
    try {
        gcpTopicName = ReadGcpTopicConfig(topic.Config).TopicName;
    } catch (error) {
        const reason = error instanceof WorkQueueConfigurationError ? error.message : String(error);
        return messages.map((m) => rejected(m.MessageID, 'TopicUnbound', reason, true));
    }

    const results = new Map<string, PublishResult>();
    const sendable: PubSubOutgoingMessage[] = [];
    for (const message of messages) {
        const outgoing = BuildOutgoingMessage(message, topic.IsFifo);
        const failure = precheck(message, outgoing, topic);
        if (failure) {
            results.set(message.MessageID, failure);
        } else {
            sendable.push(outgoing);
        }
    }

    const failedOrderingKeys = new Set<string>();
    for (const chunk of ChunkOutgoingMessages(sendable, topic.IsFifo)) {
        const live = chunk.filter((entry) => !holdBack(entry, failedOrderingKeys, results));
        if (live.length === 0) {
            continue;
        }
        const chunkResults = await publishChunk(gateway, gcpTopicName, live);
        live.forEach((entry, index) => {
            const res = chunkResults[index];
            results.set(entry.MessageId, res);
            if (res.Status === 'Rejected' && entry.OrderingKey !== undefined) {
                failedOrderingKeys.add(entry.OrderingKey);
            }
        });
    }

    return messages.map((message) => results.get(message.MessageID) ?? rejected(message.MessageID, 'TransportUnavailable', 'No result', true));
}
