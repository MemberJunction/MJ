import type {
    ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkMessage, WorkProgress,
} from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig, type AzureSubscriptionConfig } from '../config';
import { ParseEnvelopeBody, SerializeEnvelope, SessionIdFor } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { ServiceBusGateway, ServiceBusReceivedRecord, ServiceBusSettleRequest } from '../gateway/ServiceBusGateway';
import { RECEIVE_GUARD_MARGIN } from '../margins';
import {
    LAST_ERROR_MAX_CHARS,
    MoveToDeadLetterSubqueue,
    REPLAY_ATTRIBUTE,
    RETRY_ATTEMPTS_ATTRIBUTE,
} from './deadLetter';

export const SERVICE_BUS_MAX_BATCH_RECEIVE = 32;

export interface ServiceBusConsumerOptions {
    /** Clock, epoch ms. Defaults to Date.now. */
    Now?: () => number;
    /** Called when one received message could not be adopted (its lock expires and Service Bus redelivers it). */
    OnAdoptError?: (message: ServiceBusReceivedRecord, error: Error) => void;
}

interface TrackedDelivery {
    Raw: ServiceBusReceivedRecord;
    Envelope: WorkMessage;
    ReceivedAt: number;
}

export class ServiceBusTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly config: AzureSubscriptionConfig;
    private readonly now: () => number;
    private readonly onAdoptError: (message: ServiceBusReceivedRecord, error: Error) => void;
    private readonly tracked = new Map<string, TrackedDelivery>();

    constructor(
        private readonly gateway: ServiceBusGateway,
        private readonly binding: SubscriptionBinding,
        options: ServiceBusConsumerOptions = {},
    ) {
        this.config = ReadAzureSubscriptionConfig(binding.Config);
        this.now = options.Now ?? Date.now;
        this.onAdoptError = options.OnAdoptError ?? (() => undefined);
    }

    public get TrackedCount(): number {
        return this.tracked.size;
    }

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const clampedMax = Math.min(Math.max(Math.floor(max), 1), SERVICE_BUS_MAX_BATCH_RECEIVE);
        const records = await this.gateway.Receive({
            TopicName: this.config.ServiceBusTopicName,
            SubscriptionName: this.config.SubscriptionName,
            RequiresSession: this.config.RequiresSession,
            MaxMessages: clampedMax,
            MaxWaitTimeMs: Math.max(0, waitSeconds) * 1000,
            Signal: signal,
        });
        const deliveries: ReceivedDelivery<TPayload>[] = [];
        for (const record of records) {
            try {
                const delivery = await this.Adopt(record);
                if (delivery) {
                    deliveries.push(delivery);
                }
            } catch (error) {
                this.onAdoptError(record, ToGatewayError(error, 'ServiceBus adopt'));
            }
        }
        return deliveries;
    }

    /** Turns a received Service Bus message into a delivery; poison and crash-looping messages are dead-lettered. */
    public async Adopt(record: ServiceBusReceivedRecord): Promise<ReceivedDelivery<TPayload> | null> {
        const attempt = this.totalAttempts(record);
        const envelope = ParseEnvelopeBody(record.Body);
        if (envelope === null) {
            await MoveToDeadLetterSubqueue(
                this.gateway,
                this.config,
                { Message: record, Reason: 'InvalidEnvelope', Error: 'Body is not a work-queue envelope', Attempts: attempt },
                new Date(this.now()),
            );
            return null;
        }
        if (attempt > this.binding.Policy.MaxAttempts + RECEIVE_GUARD_MARGIN) {
            await MoveToDeadLetterSubqueue(
                this.gateway,
                this.config,
                { Message: record, Reason: 'MaxAttemptsExceeded', Error: `Received ${attempt} times without being settled`, Attempts: attempt },
                new Date(this.now()),
            );
            return null;
        }
        const receivedAt = this.now();
        const deliveryKey = `${envelope.MessageID}:${record.LockToken}`;
        this.tracked.set(deliveryKey, { Raw: record, Envelope: envelope, ReceivedAt: receivedAt });
        const lockExpiresMs = record.LockedUntilUtc ?? (receivedAt + this.binding.Policy.LeaseSeconds * 1000);
        return {
            Message: envelope as WorkMessage<TPayload>,
            DeliveryID: envelope.MessageID,
            LeaseToken: record.LockToken,
            Attempt: attempt,
            IsReplay: record.ApplicationProperties[REPLAY_ATTRIBUTE] === '1',
            LeaseExpiresAt: new Date(lockExpiresMs),
        };
    }

    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, _leaseSeconds: number, _progress?: WorkProgress): Promise<LeaseExtension> {
        const settleReq = this.settleRequestFor(delivery);
        try {
            const renewedUntil = await this.gateway.RenewLock(settleReq);
            return renewedUntil !== null ? 'Held' : 'Lost';
        } catch (error) {
            const mapped = ToGatewayError(error, 'ServiceBus RenewLock');
            if (mapped.Retryable) {
                throw mapped;
            }
            return 'Lost';
        }
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        const settleReq = this.settleRequestFor(delivery);
        return this.settle(delivery, 'Completed', () => this.gateway.Complete(settleReq));
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult> {
        const tracked = this.tracked.get(this.deliveryKey(delivery));
        const settleReq = this.settleRequestFor(delivery);
        if (delaySeconds <= 0) {
            return this.settle(delivery, 'Pending', () => this.gateway.Abandon(settleReq));
        }
        if (!tracked) {
            return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        }
        const scheduledAt = new Date(this.now() + Math.ceil(delaySeconds) * 1000);
        const retryAttributes: Record<string, string> = {
            ...tracked.Envelope.Attributes,
            ...tracked.Raw.ApplicationProperties,
            [RETRY_ATTEMPTS_ATTRIBUTE]: String(delivery.Attempt),
            mj_last_retry_error: error.slice(0, LAST_ERROR_MAX_CHARS),
        };
        try {
            // Schedule the delayed redelivery first so a transient broker outage never drops the message,
            // then complete the current lock.
            await this.gateway.Schedule({
                TopicName: this.config.ServiceBusTopicName,
                ScheduledEnqueueTimeUtc: scheduledAt,
                Message: {
                    MessageId: tracked.Envelope.MessageID,
                    Body: SerializeEnvelope(tracked.Envelope),
                    ApplicationProperties: retryAttributes,
                    ContentType: 'application/json',
                    ...(this.config.RequiresSession ? { SessionId: SessionIdFor(tracked.Envelope) } : {}),
                    ...(tracked.Envelope.CorrelationID ? { CorrelationId: tracked.Envelope.CorrelationID } : {}),
                },
            });
        } catch (scheduleError) {
            return {
                Kind: 'Failed',
                DeliveryID: delivery.DeliveryID,
                Error: ToGatewayError(scheduleError, 'ServiceBus Schedule').message,
            };
        }
        return this.settle(delivery, 'Pending', () => this.gateway.Complete(settleReq));
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        const key = this.deliveryKey(delivery);
        const tracked = this.tracked.get(key);
        if (!tracked) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: 'Delivery is not tracked by this consumer' };
        }
        return this.settle(delivery, 'DeadLettered', () =>
            MoveToDeadLetterSubqueue(
                this.gateway,
                this.config,
                { Message: tracked.Raw, Reason: reason, Error: error, Attempts: delivery.Attempt },
                new Date(this.now()),
            ));
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        const settleReq = this.settleRequestFor(delivery);
        return this.settle(delivery, 'Pending', () => this.gateway.Abandon(settleReq));
    }

    /** CancelInFlight is false on Azure Service Bus. */
    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.tracked.clear();
    }

    private totalAttempts(record: ServiceBusReceivedRecord): number {
        const offsetRaw = Number(record.ApplicationProperties[RETRY_ATTEMPTS_ATTRIBUTE] ?? '0');
        const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
        return Math.max(1, record.DeliveryCount) + offset;
    }

    private deliveryKey(delivery: ReceivedDelivery<TPayload>): string {
        return `${delivery.DeliveryID}:${delivery.LeaseToken}`;
    }

    private settleRequestFor(delivery: ReceivedDelivery<TPayload>): ServiceBusSettleRequest {
        const tracked = this.tracked.get(this.deliveryKey(delivery));
        return {
            TopicName: this.config.ServiceBusTopicName,
            SubscriptionName: this.config.SubscriptionName,
            RequiresSession: this.config.RequiresSession,
            LockToken: delivery.LeaseToken,
            SessionId: tracked?.Raw.SessionId ?? (this.config.RequiresSession ? SessionIdFor(delivery.Message) : null),
        };
    }

    private async settle(
        delivery: ReceivedDelivery<TPayload>,
        status: 'Completed' | 'Pending' | 'DeadLettered',
        write: () => Promise<boolean>,
    ): Promise<SettleResult> {
        try {
            const owned = await write();
            this.tracked.delete(this.deliveryKey(delivery));
            return owned
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(error, 'ServiceBus settle').message };
        }
    }
}
