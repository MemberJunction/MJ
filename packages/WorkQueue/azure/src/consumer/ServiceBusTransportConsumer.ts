import type {
    ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkMessage, WorkProgress,
} from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig, type AzureSubscriptionConfig } from '../config';
import { ParseEnvelopeBody } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { ServiceBusGateway, ServiceBusReceivedEnvelope } from '../gateway/ServiceBusGateway';
import { RECEIVE_GUARD_MARGIN } from '../margins';
import { DEAD_LETTER_PROPERTIES, DEAD_LETTER_REASON_MAX_CHARS, LAST_ERROR_MAX_CHARS } from '../properties';
import { AttemptOf, BuildTargetedCopy, IsReplayCopy } from './copies';

export interface ServiceBusConsumerOptions {
    /** Clock, epoch ms. Defaults to Date.now. */
    Now?: () => number;
    /** Called when one received message could not be adopted (it stays locked until its lock expires, then is redelivered). */
    OnAdoptError?: (message: ServiceBusReceivedEnvelope, error: Error) => void;
}

interface Tracked {
    Raw: ServiceBusReceivedEnvelope;
    Envelope: WorkMessage;
}

/**
 * ITransportConsumer over one Service Bus subscription (09a "Consumer"). DeliveryID and LeaseToken are the lock
 * token; a retry is a scheduled, targeted copy followed by completing the original; a dead letter uses the
 * subscription's own dead-letter subqueue. On session subscriptions each delivery owns its session receiver until it
 * settles, which is what makes Exclusive single-flight per key.
 */
export class ServiceBusTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly config: AzureSubscriptionConfig;
    private readonly now: () => number;
    private readonly onAdoptError: (message: ServiceBusReceivedEnvelope, error: Error) => void;
    private readonly tracked = new Map<string, Tracked>();

    constructor(private readonly gateway: ServiceBusGateway, private readonly binding: SubscriptionBinding, options: ServiceBusConsumerOptions = {}) {
        this.config = ReadAzureSubscriptionConfig(binding.Config);
        this.now = options.Now ?? Date.now;
        this.onAdoptError = options.OnAdoptError ?? (() => undefined);
    }

    public get TrackedCount(): number {
        return this.tracked.size;
    }

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const messages = await this.gateway.Receive({
            TopicName: this.config.TopicName, SubscriptionName: this.config.SubscriptionName, RequiresSession: this.config.RequiresSession,
            MaxMessages: Math.max(max, 1), WaitMs: Math.max(0, waitSeconds) * 1000, Signal: signal,
        });
        const deliveries: ReceivedDelivery<TPayload>[] = [];
        for (const message of messages) {
            try {
                const delivery = await this.Adopt(message);
                if (delivery) {
                    deliveries.push(delivery);
                }
            } catch (error) {
                this.onAdoptError(message, ToGatewayError(error, 'Service Bus adopt'));
            }
        }
        return deliveries;
    }

    /** Turns a received message into a delivery; poison and crash-looping messages are dead-lettered and yield null. */
    public async Adopt(message: ServiceBusReceivedEnvelope): Promise<ReceivedDelivery<TPayload> | null> {
        const envelope = ParseEnvelopeBody(message.Body);
        if (envelope === null) {
            await this.deadLetterRaw(message, 'InvalidEnvelope', 'Body is not a work-queue envelope', message.DeliveryCount);
            return null;
        }
        const attempt = AttemptOf(message);
        if (message.DeliveryCount > this.binding.Policy.MaxAttempts + RECEIVE_GUARD_MARGIN) {
            await this.deadLetterRaw(message, 'MaxAttemptsExceeded', `Delivered ${message.DeliveryCount} times without being settled`, attempt);
            return null;
        }
        const deliveryID = message.LockToken ?? `${message.Receiver}|${message.SequenceNumber}`;
        this.tracked.set(deliveryID, { Raw: message, Envelope: envelope });
        return {
            // Trust boundary: the envelope shape is validated; the payload's shape is the handler's to validate.
            Message: envelope as WorkMessage<TPayload>,
            DeliveryID: deliveryID,
            LeaseToken: deliveryID,
            Attempt: attempt,
            IsReplay: IsReplayCopy(message),
            LeaseExpiresAt: new Date(message.LockedUntilUtc ?? this.now() + this.binding.Policy.LeaseSeconds * 1000),
        };
    }

    /** Throws on a retryable Service Bus error: the runtime retries on its next heartbeat tick (03 §3.2). Never 'Cancelled'. */
    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, _leaseSeconds: number, _progress?: WorkProgress): Promise<LeaseExtension> {
        const entry = this.tracked.get(delivery.DeliveryID);
        if (!entry) {
            return 'Lost';
        }
        try {
            const lockedUntil = await this.gateway.RenewLock(entry.Raw);
            if (lockedUntil === null) {
                return 'Lost';
            }
            entry.Raw.LockedUntilUtc = lockedUntil;
            return 'Held';
        } catch (error) {
            const mapped = ToGatewayError(error, 'Service Bus renewMessageLock');
            if (mapped.Retryable) {
                throw mapped;
            }
            return 'Lost';
        }
    }

    public Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Completed', (raw) => this.gateway.Complete(raw));
    }

    /**
     * Schedules a targeted copy for `delaySeconds` ahead (attempt + 1), then completes the original. abandonMessage
     * has no delay, so this is the only way to honour backoff (09a). A crash between the two calls yields one duplicate
     * delivery, which at-least-once allows.
     */
    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, _error: string): Promise<SettleResult> {
        const entry = this.tracked.get(delivery.DeliveryID);
        if (!entry) {
            return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        }
        const copy = BuildTargetedCopy(entry.Envelope, entry.Raw, this.binding.Policy.SubscriptionName, delivery.Attempt + 1, `a${delivery.Attempt + 1}`);
        const delayMs = Math.max(0, Math.ceil(delaySeconds)) * 1000;
        try {
            if (delayMs === 0) {
                await this.gateway.Send(this.config.TopicName, [copy]);
            } else {
                await this.gateway.Schedule(this.config.TopicName, [copy], new Date(this.now() + delayMs));
            }
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(error, 'Service Bus schedule retry').message };
        }
        return this.settle(delivery, 'Pending', (raw) => this.gateway.Complete(raw));
    }

    public DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        return this.settle(delivery, 'DeadLettered', (raw) => this.gateway.DeadLetter(raw, {
            Reason: reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS), Description: (error ?? '').slice(0, LAST_ERROR_MAX_CHARS),
            Properties: this.deadLetterProperties(reason, error, delivery.Attempt),
        }));
    }

    /** Abandon: the service redelivers at once and counts the delivery (ReleaseConsumesAttempt, like SQS). */
    public Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Pending', (raw) => this.gateway.Abandon(raw));
    }

    /** CancelInFlight is false on this transport: a peek-lock cannot be revoked from outside the receiver (03 §5). */
    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        const handles = new Set([...this.tracked.values()].map((entry) => entry.Raw.Receiver));
        this.tracked.clear();
        for (const handle of handles) {
            await this.gateway.ReleaseReceiver(handle);
        }
    }

    private deadLetterProperties(reason: string, error: string | null, attempts: number): Record<string, string> {
        const properties: Record<string, string> = {
            [DEAD_LETTER_PROPERTIES.Reason]: reason.slice(0, DEAD_LETTER_REASON_MAX_CHARS),
            [DEAD_LETTER_PROPERTIES.Attempts]: String(attempts),
            [DEAD_LETTER_PROPERTIES.DeadLetteredAt]: new Date(this.now()).toISOString(),
        };
        if (error !== null && error !== '') {
            properties[DEAD_LETTER_PROPERTIES.LastError] = error.slice(0, LAST_ERROR_MAX_CHARS);
        }
        return properties;
    }

    private async settle(delivery: ReceivedDelivery<TPayload>, status: 'Completed' | 'Pending' | 'DeadLettered', write: (raw: ServiceBusReceivedEnvelope) => Promise<boolean>): Promise<SettleResult> {
        const entry = this.tracked.get(delivery.DeliveryID);
        if (!entry) {
            return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        }
        try {
            const owned = await write(entry.Raw);
            this.tracked.delete(delivery.DeliveryID);
            await this.gateway.ReleaseReceiver(entry.Raw.Receiver);
            return owned
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(error, 'Service Bus settle').message };
        }
    }

    private async deadLetterRaw(message: ServiceBusReceivedEnvelope, reason: string, error: string, attempts: number): Promise<void> {
        await this.gateway.DeadLetter(message, { Reason: reason, Description: error, Properties: this.deadLetterProperties(reason, error, attempts) });
        await this.gateway.ReleaseReceiver(message.Receiver);
    }
}
