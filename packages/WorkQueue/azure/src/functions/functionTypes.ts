import type { ServiceBusReceivedEnvelope } from '../gateway/ServiceBusGateway';

/**
 * The fields of the message an Azure Functions Service Bus trigger delivers that the adapter reads (no dependency on
 * @azure/functions or its Service Bus extension; the SDK-binding message shape is a superset of this).
 */
export interface FunctionsServiceBusMessage {
    messageId?: string | number;
    body: unknown;
    applicationProperties?: Record<string, unknown>;
    deliveryCount?: number;
    sessionId?: string;
    correlationId?: string | number;
    lockToken?: string;
    enqueuedTimeUtc?: Date | string;
    lockedUntilUtc?: Date | string;
    sequenceNumber?: { toString(): string } | number | string;
}

/**
 * Settlement the Functions host exposes when `autoCompleteMessages` is false (the Service Bus SDK-type binding's
 * message actions). The adapter never completes a message it did not settle itself.
 */
export interface FunctionsMessageActions {
    complete(message: FunctionsServiceBusMessage): Promise<void>;
    abandon(message: FunctionsServiceBusMessage): Promise<void>;
    deadLetter(message: FunctionsServiceBusMessage, options: { deadLetterReason: string; deadLetterErrorDescription: string; propertiesToModify?: Record<string, string> }): Promise<void>;
    /** Optional: without it the adapter cannot renew the lock, so MaxProcessingSeconds must stay below the subscription's lock duration. */
    renewMessageLock?(message: FunctionsServiceBusMessage): Promise<Date | void>;
}

export interface FunctionsInvocationContextLike {
    /** Message settlement for this invocation. */
    actions: FunctionsMessageActions;
    /** Milliseconds until the host times out the invocation, when known. */
    remainingTimeMs?(): number;
    invocationId?: string;
}

function epoch(value: Date | string | undefined): number | null {
    if (value === undefined) {
        return null;
    }
    const ms = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/** The trigger's message in the gateway's envelope shape; `receiver` names the invocation that owns the lock. */
export function ToReceivedEnvelope(message: FunctionsServiceBusMessage, receiver: string): ServiceBusReceivedEnvelope {
    return {
        MessageId: message.messageId === undefined ? '' : String(message.messageId),
        Body: message.body,
        ApplicationProperties: { ...(message.applicationProperties ?? {}) },
        SessionId: message.sessionId ?? null,
        CorrelationId: message.correlationId === undefined ? null : String(message.correlationId),
        DeliveryCount: message.deliveryCount ?? 1,
        EnqueuedTimeUtc: epoch(message.enqueuedTimeUtc),
        LockedUntilUtc: epoch(message.lockedUntilUtc),
        LockToken: message.lockToken ?? `${receiver}:lock`,
        SequenceNumber: message.sequenceNumber === undefined ? '0' : String(message.sequenceNumber),
        DeadLetterReason: null,
        DeadLetterErrorDescription: null,
        Receiver: receiver,
    };
}
