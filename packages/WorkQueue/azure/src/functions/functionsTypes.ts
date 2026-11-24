import { BodyAsString } from '../envelope';
import type { ServiceBusReceivedRecord } from '../gateway/ServiceBusGateway';

export type AzurePropertyValue = string | number | boolean | Date | null | undefined;

/**
 * Azure Functions Service Bus trigger message shape (v3 / v4 isolated & in-process Node.js).
 * Kept dependency-free so `@memberjunction/work-queue-azure/functions` never requires `@azure/functions`.
 */
export interface AzureFunctionServiceBusMessage {
    body?: unknown;
    messageId?: string;
    lockToken?: string;
    deliveryCount?: number;
    sequenceNumber?: string | number;
    sessionId?: string;
    correlationId?: string;
    enqueuedTimeUtc?: string | Date;
    lockedUntilUtc?: string | Date;
    applicationProperties?: Record<string, AzurePropertyValue>;
    userProperties?: Record<string, AzurePropertyValue>;
    deadLetterReason?: string;
    deadLetterErrorDescription?: string;
}

export interface AzureFunctionLogger {
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
}

/** Optional settlement actions exposed by Azure Functions Service Bus extensions when `autoCompleteMessages` is false. */
export interface AzureFunctionMessageActions {
    completeMessage?(message: AzureFunctionServiceBusMessage): Promise<void>;
    abandonMessage?(message: AzureFunctionServiceBusMessage, propertiesToModify?: Record<string, AzurePropertyValue>): Promise<void>;
    deadLetterMessage?(
        message: AzureFunctionServiceBusMessage,
        options?: { deadLetterReason?: string; deadLetterErrorDescription?: string },
    ): Promise<void>;
    renewMessageLock?(message: AzureFunctionServiceBusMessage): Promise<Date | void>;
}

export interface AzureFunctionInvocationContext {
    invocationId?: string;
    functionName?: string;
    triggerMetadata?: Record<string, unknown>;
    log?: AzureFunctionLogger;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    abortSignal?: AbortSignal;
    getRemainingTimeInMillis?: () => number;
    actions?: AzureFunctionMessageActions;
}

/** Partial batch failure response compatible with Azure Functions Service Bus `batchItemFailures`. */
export interface AzureFunctionBatchResponse {
    batchItemFailures: { itemIdentifier: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTriggerEnvelopeShape(value: unknown): value is AzureFunctionServiceBusMessage {
    if (!isRecord(value)) {
        return false;
    }
    return 'body' in value && ('messageId' in value || 'lockToken' in value || 'deliveryCount' in value || 'applicationProperties' in value || 'userProperties' in value);
}

function normalizeProperties(source: unknown): Record<string, string> {
    if (!isRecord(source)) {
        return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
        if (value !== undefined && value !== null) {
            result[key] = value instanceof Date ? value.toISOString() : String(value);
        }
    }
    return result;
}

function readMetaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
    const val = meta?.[key];
    return typeof val === 'string' && val !== '' ? val : undefined;
}

function readMetaNumber(meta: Record<string, unknown> | undefined, key: string): number | undefined {
    const val = meta?.[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
        return val;
    }
    if (typeof val === 'string' && val !== '' && Number.isFinite(Number(val))) {
        return Number(val);
    }
    return undefined;
}

function parseTimestamp(value: unknown): number | null {
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === 'string' && value !== '') {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return null;
}

/**
 * Converts either an Azure Functions Service Bus trigger message envelope OR a raw trigger body
 * paired with `context.triggerMetadata` into a `ServiceBusReceivedRecord`.
 */
export function ToServiceBusReceivedRecord(
    input: AzureFunctionServiceBusMessage | unknown,
    context?: AzureFunctionInvocationContext,
    index = 0,
): ServiceBusReceivedRecord {
    const meta = context?.triggerMetadata;
    const envelope: AzureFunctionServiceBusMessage = isTriggerEnvelopeShape(input) ? input : { body: input };
    const messageId = envelope.messageId ?? readMetaString(meta, 'messageId') ?? `azfn-msg-${index}`;
    const lockToken = envelope.lockToken ?? readMetaString(meta, 'lockToken') ?? `azfn-lock-${messageId}`;
    const deliveryCount = envelope.deliveryCount ?? readMetaNumber(meta, 'deliveryCount') ?? 1;
    const sessionId = envelope.sessionId ?? readMetaString(meta, 'sessionId') ?? null;
    const enqueued = parseTimestamp(envelope.enqueuedTimeUtc ?? meta?.['enqueuedTimeUtc']);
    const lockedUntil = parseTimestamp(envelope.lockedUntilUtc ?? meta?.['lockedUntilUtc']);
    const appProps = normalizeProperties(
        envelope.applicationProperties
        ?? envelope.userProperties
        ?? meta?.['applicationProperties']
        ?? meta?.['userProperties'],
    );
    return {
        MessageId: messageId,
        LockToken: lockToken,
        SequenceNumber: String(envelope.sequenceNumber ?? readMetaString(meta, 'sequenceNumber') ?? index),
        Body: BodyAsString(envelope.body),
        DeliveryCount: Math.max(1, deliveryCount),
        SessionId: sessionId,
        EnqueuedTimeUtc: enqueued,
        LockedUntilUtc: lockedUntil,
        ApplicationProperties: appProps,
        DeadLetterReason: envelope.deadLetterReason ?? readMetaString(meta, 'deadLetterReason') ?? null,
        DeadLetterErrorDescription: envelope.deadLetterErrorDescription ?? readMetaString(meta, 'deadLetterErrorDescription') ?? null,
    };
}
