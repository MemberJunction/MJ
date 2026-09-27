import type { WorkMessage } from '@memberjunction/work-queue-core';
import { SerializeEnvelope, SessionIdFor } from '../envelope';
import type { ServiceBusOutboundMessage, ServiceBusReceivedEnvelope } from '../gateway/ServiceBusGateway';
import { RUNTIME_PROPERTIES, StringProperty } from '../properties';

/**
 * The attempt number a received message represents (03 §3.2). A first publish carries no mj_attempt and starts at 1;
 * a retry copy carries the attempt its first delivery is; every service redelivery (abandon, lost lock, crash)
 * raises DeliveryCount, so attempt = base + DeliveryCount - 1.
 */
export function AttemptOf(message: ServiceBusReceivedEnvelope): number {
    const base = Number(StringProperty(message.ApplicationProperties, RUNTIME_PROPERTIES.Attempt) ?? '1');
    return (Number.isFinite(base) && base >= 1 ? base : 1) + Math.max(0, message.DeliveryCount - 1);
}

export function IsReplayCopy(message: ServiceBusReceivedEnvelope): boolean {
    return StringProperty(message.ApplicationProperties, RUNTIME_PROPERTIES.Replay) === '1';
}

/**
 * A copy of the envelope aimed at one subscription (mj_target), with a fresh Service Bus MessageId so the topic's
 * duplicate detection does not swallow it. The envelope's own MessageID (inside the body) is unchanged.
 */
export function BuildTargetedCopy(
    envelope: WorkMessage,
    original: ServiceBusReceivedEnvelope,
    subscriptionName: string,
    attempt: number,
    suffix: string,
    extra: Record<string, string> = {},
): ServiceBusOutboundMessage {
    const properties: Record<string, string> = {
        ...envelope.Attributes,
        [RUNTIME_PROPERTIES.Target]: subscriptionName,
        [RUNTIME_PROPERTIES.Attempt]: String(attempt),
        ...(IsReplayCopy(original) ? { [RUNTIME_PROPERTIES.Replay]: '1' } : {}),
        ...extra,
    };
    const copy: ServiceBusOutboundMessage = {
        MessageId: `${envelope.MessageID}:${suffix}`,
        Body: SerializeEnvelope(envelope),
        ApplicationProperties: properties,
        ContentType: 'application/json',
    };
    if (original.SessionId !== null) {
        copy.SessionId = original.SessionId;
    } else if (envelope.PartitionKey !== undefined) {
        copy.SessionId = SessionIdFor(envelope);
    }
    if (envelope.CorrelationID !== undefined) {
        copy.CorrelationId = envelope.CorrelationID;
    }
    return copy;
}
