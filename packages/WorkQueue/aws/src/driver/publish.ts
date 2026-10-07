import {
    WorkQueueConfigurationError, type PublishResult, type TopicBinding, type WorkMessage,
} from '@memberjunction/work-queue-core';
import { ReadAwsTopicConfig } from '../config';
import { MessageGroupIdFor, SerializeEnvelope } from '../envelope';
import { AwsGatewayError, ToGatewayError } from '../gateway/errors';
import type { SnsGateway, SnsPublishEntry, SnsPublishEntryResult } from '../gateway/SnsGateway';

export const SNS_BATCH_MAX_ENTRIES = 10;
export const SNS_REQUEST_MAX_BYTES = 262_144;
export const MAX_MESSAGE_ATTRIBUTES = 10;

export function BuildPublishEntry(message: WorkMessage, index: number, isFifo: boolean): SnsPublishEntry {
    const entry: SnsPublishEntry = { Id: String(index), Message: SerializeEnvelope(message), MessageAttributes: { ...message.Attributes } };
    if (isFifo) {
        entry.MessageGroupId = MessageGroupIdFor(message);
        entry.MessageDeduplicationId = message.MessageID;
    }
    return entry;
}

/** Bytes SNS counts toward the message size: body plus attribute names, data types and values. */
export function EntryBytes(entry: SnsPublishEntry): number {
    return Object.entries(entry.MessageAttributes).reduce(
        (total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength('String') + Buffer.byteLength(value),
        Buffer.byteLength(entry.Message),
    );
}

/** Chunks by entry count and request bytes. With `oneEntryPerGroup` (FIFO) a chunk never holds two entries of one group. */
export function ChunkEntries(entries: SnsPublishEntry[], oneEntryPerGroup = false): SnsPublishEntry[][] {
    const chunks: SnsPublishEntry[][] = [];
    let current: SnsPublishEntry[] = [];
    let currentBytes = 0;
    for (const entry of entries) {
        const bytes = EntryBytes(entry);
        const groupTaken = oneEntryPerGroup && current.some((other) => other.MessageGroupId === entry.MessageGroupId);
        if (groupTaken || current.length === SNS_BATCH_MAX_ENTRIES || (current.length > 0 && currentBytes + bytes > SNS_REQUEST_MAX_BYTES)) {
            chunks.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(entry);
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

function fromEntryResult(messageID: string, result: SnsPublishEntryResult): PublishResult {
    if (result.Kind === 'Published') {
        return { MessageID: messageID, Status: 'Accepted' };
    }
    return result.SenderFault
        ? rejected(messageID, 'TransportRejected', `SNS ${result.Code}: ${result.Message}`, false)
        : rejected(messageID, 'TransportUnavailable', `SNS ${result.Code}: ${result.Message}`, true);
}

function precheck(message: WorkMessage, entry: SnsPublishEntry, topic: TopicBinding): PublishResult | null {
    if (Object.keys(message.Attributes).length > MAX_MESSAGE_ATTRIBUTES) {
        return rejected(message.MessageID, 'InvalidAttributes', `At most ${MAX_MESSAGE_ATTRIBUTES} attributes are allowed`, false);
    }
    const emptyKey = Object.entries(message.Attributes).find(([, value]) => value === '')?.[0];
    if (emptyKey !== undefined) {
        // SNS fails the whole PublishBatch for an empty String attribute value, so it must never reach the call.
        return rejected(message.MessageID, 'InvalidAttributes', `Attribute '${emptyKey}' has an empty value`, false);
    }
    const limit = Math.min(topic.MaxPayloadBytes, SNS_REQUEST_MAX_BYTES);
    const bytes = EntryBytes(entry);
    return bytes > limit ? rejected(message.MessageID, 'PayloadTooLarge', `Envelope is ${bytes} bytes; the limit is ${limit}`, false) : null;
}

async function publishChunk(gateway: SnsGateway, topicArn: string, chunk: SnsPublishEntry[], ids: Map<string, string>): Promise<PublishResult[]> {
    try {
        const results = await gateway.PublishBatch(topicArn, chunk);
        return results.map((result) => fromEntryResult(ids.get(result.Id) ?? result.Id, result));
    } catch (error) {
        const mapped: AwsGatewayError = ToGatewayError(error, 'SNS PublishBatch');
        return chunk.map((entry) => rejected(ids.get(entry.Id) ?? entry.Id, 'TransportUnavailable', mapped.message, mapped.Retryable));
    }
}

/** FIFO: once a group has a rejected entry, its later entries are rejected unsent so a caller retry cannot reorder the key. */
function holdBack(entry: SnsPublishEntry, failedGroups: Set<string>, ids: Map<string, string>, results: Map<string, PublishResult>): boolean {
    if (entry.MessageGroupId === undefined || !failedGroups.has(entry.MessageGroupId)) {
        return false;
    }
    results.set(entry.Id, rejected(ids.get(entry.Id) ?? entry.Id, 'TransportUnavailable',
        'Not sent: an earlier message of this partition key failed in the same publish call', true));
    return true;
}

/** Publishes envelopes to the topic's SNS topic. Results are positionally aligned with messages. */
export async function PublishToSns(gateway: SnsGateway, topic: TopicBinding, messages: WorkMessage[]): Promise<PublishResult[]> {
    let topicArn: string;
    try {
        topicArn = ReadAwsTopicConfig(topic.Config).SnsTopicArn;
    } catch (error) {
        const reason = error instanceof WorkQueueConfigurationError ? error.message : String(error);
        return messages.map((m) => rejected(m.MessageID, 'TopicUnbound', reason, true));
    }
    const results = new Map<string, PublishResult>();
    const ids = new Map<string, string>();
    const sendable: SnsPublishEntry[] = [];
    messages.forEach((message, index) => {
        const entry = BuildPublishEntry(message, index, topic.IsFifo);
        const failure = precheck(message, entry, topic);
        if (failure) {
            results.set(entry.Id, failure);
        } else {
            ids.set(entry.Id, message.MessageID);
            sendable.push(entry);
        }
    });
    const failedGroups = new Set<string>();
    for (const chunk of ChunkEntries(sendable, topic.IsFifo)) {
        const live = chunk.filter((entry) => !holdBack(entry, failedGroups, ids, results));
        if (live.length === 0) {
            continue;
        }
        const chunkResults = await publishChunk(gateway, topicArn, live, ids);
        live.forEach((entry, i) => {
            results.set(entry.Id, chunkResults[i]);
            if (chunkResults[i].Status === 'Rejected' && entry.MessageGroupId !== undefined) {
                failedGroups.add(entry.MessageGroupId);
            }
        });
    }
    return messages.map((message, index) => results.get(String(index)) ?? rejected(message.MessageID, 'TransportUnavailable', 'No result', true));
}
