import { WorkQueueConfigurationError, type PublishResult, type TopicBinding, type WorkMessage } from '@memberjunction/work-queue-core';
import { ReadAzureTopicConfig } from '../config';
import { SerializeEnvelope, SessionIdFor } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { ServiceBusGateway, ServiceBusOutboundMessage } from '../gateway/ServiceBusGateway';

/** Service Bus accepts far larger batches; 100 keeps one failed call from rejecting more messages than that. */
export const SERVICE_BUS_BATCH_MAX_ENTRIES = 100;
/** Standard-tier message size: body plus properties. Premium allows more, but the envelope cap (03, W4) is the same everywhere. */
export const SERVICE_BUS_MESSAGE_MAX_BYTES = 262_144;
export const MAX_MESSAGE_ATTRIBUTES = 10;
const utf8 = new TextEncoder();

/** The outbound Service Bus message for an envelope. SessionId is set only on partitioned (IsFifo) topics (09a "Publish"). */
export function BuildOutboundMessage(message: WorkMessage, isFifo: boolean): ServiceBusOutboundMessage {
    const outbound: ServiceBusOutboundMessage = {
        MessageId: message.MessageID,
        Body: SerializeEnvelope(message),
        ApplicationProperties: { ...message.Attributes },
        ContentType: 'application/json',
    };
    if (isFifo) {
        outbound.SessionId = SessionIdFor(message);
    }
    if (message.CorrelationID !== undefined) {
        outbound.CorrelationId = message.CorrelationID;
    }
    return outbound;
}

/** Bytes Service Bus counts toward the message size: body plus property names and values. */
export function MessageBytes(message: ServiceBusOutboundMessage): number {
    return Object.entries(message.ApplicationProperties).reduce(
        (total, [name, value]) => total + utf8.encode(name).length + utf8.encode(value).length,
        utf8.encode(message.Body).length,
    );
}

/** Chunks by entry count and bytes; a chunk never exceeds one request's worth of bytes. */
export function ChunkMessages(messages: ServiceBusOutboundMessage[]): ServiceBusOutboundMessage[][] {
    const chunks: ServiceBusOutboundMessage[][] = [];
    let current: ServiceBusOutboundMessage[] = [];
    let currentBytes = 0;
    for (const message of messages) {
        const bytes = MessageBytes(message);
        if (current.length === SERVICE_BUS_BATCH_MAX_ENTRIES || (current.length > 0 && currentBytes + bytes > SERVICE_BUS_MESSAGE_MAX_BYTES)) {
            chunks.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(message);
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

function precheck(message: WorkMessage, outbound: ServiceBusOutboundMessage, topic: TopicBinding): PublishResult | null {
    if (Object.keys(message.Attributes).length > MAX_MESSAGE_ATTRIBUTES) {
        return rejected(message.MessageID, 'InvalidAttributes', `At most ${MAX_MESSAGE_ATTRIBUTES} attributes are allowed`, false);
    }
    const emptyKey = Object.entries(message.Attributes).find(([, value]) => value === '')?.[0];
    if (emptyKey !== undefined) {
        // An empty property value cannot be filtered on and would silently miss every subscription that tests it.
        return rejected(message.MessageID, 'InvalidAttributes', `Attribute '${emptyKey}' has an empty value`, false);
    }
    const limit = Math.min(topic.MaxPayloadBytes, SERVICE_BUS_MESSAGE_MAX_BYTES);
    const bytes = MessageBytes(outbound);
    return bytes > limit ? rejected(message.MessageID, 'PayloadTooLarge', `Envelope is ${bytes} bytes; the limit is ${limit}`, false) : null;
}

/**
 * Publishes envelopes to the topic's Service Bus topic. Results are positionally aligned with messages. A Service Bus
 * batch is atomic, so one failed call rejects every message in its chunk with the same error. Duplicate detection is
 * silent on Service Bus, so a republished MessageID is reported Accepted (DetectsMessageIDDuplicates is false).
 */
export async function PublishToServiceBus(gateway: ServiceBusGateway, topic: TopicBinding, messages: WorkMessage[]): Promise<PublishResult[]> {
    let topicName: string;
    try {
        topicName = ReadAzureTopicConfig(topic.Config).TopicName;
    } catch (error) {
        const reason = error instanceof WorkQueueConfigurationError ? error.message : String(error);
        return messages.map((m) => rejected(m.MessageID, 'TopicUnbound', reason, true));
    }
    const results = new Map<string, PublishResult>();
    const sendable: ServiceBusOutboundMessage[] = [];
    for (const message of messages) {
        const outbound = BuildOutboundMessage(message, topic.IsFifo);
        const failure = precheck(message, outbound, topic);
        if (failure) {
            results.set(message.MessageID, failure);
        } else {
            sendable.push(outbound);
        }
    }
    for (const chunk of ChunkMessages(sendable)) {
        try {
            await gateway.Send(topicName, chunk);
            chunk.forEach((m) => results.set(m.MessageId, { MessageID: m.MessageId, Status: 'Accepted' }));
        } catch (error) {
            const mapped = ToGatewayError(error, 'Service Bus sendMessages');
            const code = mapped.Retryable ? 'TransportUnavailable' : 'TransportRejected';
            chunk.forEach((m) => results.set(m.MessageId, rejected(m.MessageId, code, mapped.message, mapped.Retryable)));
        }
    }
    return messages.map((message) => results.get(message.MessageID) ?? rejected(message.MessageID, 'TransportUnavailable', 'No result', true));
}
