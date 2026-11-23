import {
    WorkQueueConfigurationError, type PublishResult, type TopicBinding, type WorkMessage,
} from '@memberjunction/work-queue-core';
import { ReadAzureTopicConfig } from '../config';
import { SerializeEnvelope, SessionIdFor } from '../envelope';
import { AzureGatewayError, ToGatewayError } from '../gateway/errors';
import type {
    ServiceBusGateway,
    ServiceBusOutgoingMessage,
    ServiceBusSendEntryResult,
} from '../gateway/ServiceBusGateway';

/** Standard-tier Azure Service Bus max message/batch payload size (256 KB). */
export const SERVICE_BUS_STANDARD_MAX_BYTES = 262_144;
/** Count cap per gateway batch chunk so large fan-outs chunk predictably. */
export const SERVICE_BUS_BATCH_MAX_COUNT = 100;
export const MAX_APPLICATION_PROPERTIES = 50;

export function BuildOutgoingMessage(message: WorkMessage, isFifo: boolean): ServiceBusOutgoingMessage {
    const outgoing: ServiceBusOutgoingMessage = {
        MessageId: message.MessageID,
        Body: SerializeEnvelope(message),
        ApplicationProperties: { ...message.Attributes },
        ContentType: 'application/json',
        ...(message.CorrelationID ? { CorrelationId: message.CorrelationID } : {}),
    };
    if (isFifo) {
        const sessionId = SessionIdFor(message);
        outgoing.SessionId = sessionId;
        outgoing.PartitionKey = sessionId;
    } else if (message.PartitionKey) {
        outgoing.PartitionKey = message.PartitionKey;
    }
    return outgoing;
}

/** Approximate AMQP frame bytes for precheck and chunking. */
export function OutgoingMessageBytes(message: ServiceBusOutgoingMessage): number {
    return Object.entries(message.ApplicationProperties).reduce(
        (total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength(value),
        Buffer.byteLength(message.Body),
    );
}

/** Chunks outgoing messages by batch count, byte ceiling, and optional single-entry-per-session safety. */
export function ChunkOutgoingMessages(
    messages: ServiceBusOutgoingMessage[],
    oneEntryPerSession = false,
): ServiceBusOutgoingMessage[][] {
    const chunks: ServiceBusOutgoingMessage[][] = [];
    let current: ServiceBusOutgoingMessage[] = [];
    let currentBytes = 0;
    for (const msg of messages) {
        const bytes = OutgoingMessageBytes(msg);
        const sessionTaken = oneEntryPerSession
            && msg.SessionId !== undefined
            && current.some((other) => other.SessionId === msg.SessionId);
        if (
            sessionTaken
            || current.length >= SERVICE_BUS_BATCH_MAX_COUNT
            || (current.length > 0 && currentBytes + bytes > SERVICE_BUS_STANDARD_MAX_BYTES)
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

function fromEntryResult(messageID: string, result: ServiceBusSendEntryResult): PublishResult {
    if (result.Kind === 'Published') {
        return { MessageID: messageID, Status: 'Accepted' };
    }
    return result.SenderFault
        ? rejected(messageID, 'TransportRejected', `ServiceBus ${result.Code}: ${result.Message}`, false)
        : rejected(messageID, 'TransportUnavailable', `ServiceBus ${result.Code}: ${result.Message}`, true);
}

function precheck(message: WorkMessage, outgoing: ServiceBusOutgoingMessage, topic: TopicBinding): PublishResult | null {
    if (Object.keys(message.Attributes).length > MAX_APPLICATION_PROPERTIES) {
        return rejected(message.MessageID, 'InvalidAttributes', `At most ${MAX_APPLICATION_PROPERTIES} attributes are allowed`, false);
    }
    const emptyKey = Object.entries(message.Attributes).find(([, value]) => value === '')?.[0];
    if (emptyKey !== undefined) {
        return rejected(message.MessageID, 'InvalidAttributes', `Attribute '${emptyKey}' has an empty value`, false);
    }
    const limit = Math.min(topic.MaxPayloadBytes, SERVICE_BUS_STANDARD_MAX_BYTES);
    const bytes = OutgoingMessageBytes(outgoing);
    return bytes > limit ? rejected(message.MessageID, 'PayloadTooLarge', `Envelope is ${bytes} bytes; the limit is ${limit}`, false) : null;
}

async function publishChunk(
    gateway: ServiceBusGateway,
    topicName: string,
    chunk: ServiceBusOutgoingMessage[],
): Promise<PublishResult[]> {
    try {
        const results = await gateway.SendBatch(topicName, chunk);
        return results.map((result, idx) => fromEntryResult(chunk[idx]?.MessageId ?? result.Id, result));
    } catch (error) {
        const mapped: AzureGatewayError = ToGatewayError(error, 'ServiceBus SendBatch');
        return chunk.map((entry) => rejected(entry.MessageId, 'TransportUnavailable', mapped.message, mapped.Retryable));
    }
}

function holdBack(
    entry: ServiceBusOutgoingMessage,
    failedSessions: Set<string>,
    results: Map<string, PublishResult>,
): boolean {
    if (entry.SessionId === undefined || !failedSessions.has(entry.SessionId)) {
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

/** Publishes envelopes to the Azure Service Bus topic. Results are positionally aligned with messages. */
export async function PublishToServiceBus(
    gateway: ServiceBusGateway,
    topic: TopicBinding,
    messages: WorkMessage[],
): Promise<PublishResult[]> {
    let sbTopicName: string;
    try {
        sbTopicName = ReadAzureTopicConfig(topic.Config).ServiceBusTopicName;
    } catch (error) {
        const reason = error instanceof WorkQueueConfigurationError ? error.message : String(error);
        return messages.map((m) => rejected(m.MessageID, 'TopicUnbound', reason, true));
    }

    const results = new Map<string, PublishResult>();
    const sendable: ServiceBusOutgoingMessage[] = [];
    for (const message of messages) {
        const outgoing = BuildOutgoingMessage(message, topic.IsFifo);
        const failure = precheck(message, outgoing, topic);
        if (failure) {
            results.set(message.MessageID, failure);
        } else {
            sendable.push(outgoing);
        }
    }

    const failedSessions = new Set<string>();
    for (const chunk of ChunkOutgoingMessages(sendable, topic.IsFifo)) {
        const live = chunk.filter((entry) => !holdBack(entry, failedSessions, results));
        if (live.length === 0) {
            continue;
        }
        const chunkResults = await publishChunk(gateway, sbTopicName, live);
        live.forEach((entry, index) => {
            const res = chunkResults[index];
            results.set(entry.MessageId, res);
            if (res.Status === 'Rejected' && entry.SessionId !== undefined) {
                failedSessions.add(entry.SessionId);
            }
        });
    }

    return messages.map((message) => results.get(message.MessageID) ?? rejected(message.MessageID, 'TransportUnavailable', 'No result', true));
}
