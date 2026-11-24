import type {
    ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkMessage, WorkProgress,
} from '@memberjunction/work-queue-core';
import { GCP_MAX_ACK_DEADLINE_SECONDS, ReadGcpSubscriptionConfig, type GcpSubscriptionConfig } from '../config';
import { OrderingKeyFor, ParseEnvelopeBody } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { PubSubGateway, PubSubReceivedRecord } from '../gateway/PubSubGateway';
import { RECEIVE_GUARD_MARGIN } from '../margins';
import { PublishToDeadLetterTopic, REPLAY_ATTRIBUTE } from './deadLetter';

export const PUBSUB_MAX_BATCH_PULL = 1_000;

export interface PubSubConsumerOptions {
    /** Clock, epoch ms. Defaults to Date.now. */
    Now?: () => number;
    /** Called when one received message could not be adopted (its ack deadline expires and Pub/Sub redelivers it). */
    OnAdoptError?: (message: PubSubReceivedRecord, error: Error) => void;
}

interface TrackedDelivery {
    Raw: PubSubReceivedRecord;
    Envelope: WorkMessage;
    ReceivedAt: number;
}

export class PubSubTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly config: GcpSubscriptionConfig;
    private readonly now: () => number;
    private readonly onAdoptError: (message: PubSubReceivedRecord, error: Error) => void;
    private readonly tracked = new Map<string, TrackedDelivery>();

    constructor(
        private readonly gateway: PubSubGateway,
        private readonly binding: SubscriptionBinding,
        options: PubSubConsumerOptions = {},
    ) {
        this.config = ReadGcpSubscriptionConfig(binding.Config);
        this.now = options.Now ?? Date.now;
        this.onAdoptError = options.OnAdoptError ?? (() => undefined);
    }

    public get TrackedCount(): number {
        return this.tracked.size;
    }

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const clampedMax = Math.min(Math.max(Math.floor(max), 1), PUBSUB_MAX_BATCH_PULL);
        const records = await this.gateway.Pull({
            TopicName: this.config.TopicName,
            SubscriptionName: this.config.SubscriptionName,
            MaxMessages: clampedMax,
            MaxWaitTimeMs: Math.max(0, waitSeconds) * 1000,
            AckDeadlineSeconds: this.config.AckDeadlineSeconds,
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
                this.onAdoptError(record, ToGatewayError(error, 'PubSub adopt'));
            }
        }
        return deliveries;
    }

    /** Turns a pulled/pushed Pub/Sub message into a delivery; poison and crash-looping messages are dead-lettered. */
    public async Adopt(record: PubSubReceivedRecord): Promise<ReceivedDelivery<TPayload> | null> {
        const attempt = Math.max(1, record.DeliveryAttempt);
        const envelope = ParseEnvelopeBody(record.Data);
        if (envelope === null) {
            await this.deadLetterPoison(record, 'InvalidEnvelope', 'Body is not a work-queue envelope', attempt);
            return null;
        }
        if (attempt > this.binding.Policy.MaxAttempts + RECEIVE_GUARD_MARGIN) {
            await this.deadLetterPoison(
                record,
                'MaxAttemptsExceeded',
                `Received ${attempt} times without being settled`,
                attempt,
                envelope,
            );
            return null;
        }
        const receivedAt = this.now();
        const deliveryKey = `${envelope.MessageID}:${record.AckId}`;
        this.tracked.set(deliveryKey, { Raw: record, Envelope: envelope, ReceivedAt: receivedAt });
        const ackExpiresMs = record.AckDeadlineExpiresAtMs ?? (receivedAt + this.binding.Policy.LeaseSeconds * 1000);
        return {
            Message: envelope as WorkMessage<TPayload>,
            DeliveryID: envelope.MessageID,
            LeaseToken: record.AckId,
            Attempt: attempt,
            IsReplay: record.Attributes[REPLAY_ATTRIBUTE] === '1',
            LeaseExpiresAt: new Date(ackExpiresMs),
        };
    }

    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, _progress?: WorkProgress): Promise<LeaseExtension> {
        const seconds = Math.max(1, Math.min(GCP_MAX_ACK_DEADLINE_SECONDS, Math.ceil(leaseSeconds)));
        try {
            const held = await this.gateway.ModifyAckDeadline({
                SubscriptionName: this.config.SubscriptionName,
                AckIds: [delivery.LeaseToken],
                AckDeadlineSeconds: seconds,
            });
            return held ? 'Held' : 'Lost';
        } catch (error) {
            const mapped = ToGatewayError(error, 'PubSub ModifyAckDeadline');
            if (mapped.Retryable) {
                throw mapped;
            }
            return 'Lost';
        }
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Completed', () =>
            this.gateway.Acknowledge({
                SubscriptionName: this.config.SubscriptionName,
                AckIds: [delivery.LeaseToken],
            }));
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, _error: string): Promise<SettleResult> {
        const seconds = Math.max(0, Math.min(GCP_MAX_ACK_DEADLINE_SECONDS, Math.ceil(delaySeconds)));
        return this.settle(delivery, 'Pending', () =>
            this.gateway.ModifyAckDeadline({
                SubscriptionName: this.config.SubscriptionName,
                AckIds: [delivery.LeaseToken],
                AckDeadlineSeconds: seconds,
            }));
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        const tracked = this.tracked.get(this.deliveryKey(delivery));
        if (!tracked) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: 'Delivery is not tracked by this consumer' };
        }
        try {
            await PublishToDeadLetterTopic(
                this.gateway,
                this.config,
                {
                    Message: tracked.Raw,
                    Reason: reason,
                    Error: error,
                    Attempts: delivery.Attempt,
                    SourceMessageId: tracked.Envelope.MessageID,
                    OrderingKey: this.config.EnableMessageOrdering ? OrderingKeyFor(tracked.Envelope) : undefined,
                },
                new Date(this.now()),
            );
        } catch (dlqError) {
            return {
                Kind: 'Failed',
                DeliveryID: delivery.DeliveryID,
                Error: ToGatewayError(dlqError, 'PubSub PublishDeadLetter').message,
            };
        }
        return this.settle(delivery, 'DeadLettered', () =>
            this.gateway.Acknowledge({
                SubscriptionName: this.config.SubscriptionName,
                AckIds: [delivery.LeaseToken],
            }));
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Pending', () =>
            this.gateway.ModifyAckDeadline({
                SubscriptionName: this.config.SubscriptionName,
                AckIds: [delivery.LeaseToken],
                AckDeadlineSeconds: 0,
            }));
    }

    /** CancelInFlight is false on Google Cloud Pub/Sub. */
    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.tracked.clear();
    }

    private deliveryKey(delivery: ReceivedDelivery<TPayload>): string {
        return `${delivery.DeliveryID}:${delivery.LeaseToken}`;
    }

    private async deadLetterPoison(
        record: PubSubReceivedRecord,
        reason: string,
        error: string,
        attempts: number,
        envelope?: WorkMessage,
    ): Promise<void> {
        if (this.config.DeadLetterTopicName) {
            await PublishToDeadLetterTopic(
                this.gateway,
                this.config,
                {
                    Message: record,
                    Reason: reason,
                    Error: error,
                    Attempts: attempts,
                    SourceMessageId: envelope?.MessageID ?? record.ServerMessageId,
                    OrderingKey: this.config.EnableMessageOrdering && envelope ? OrderingKeyFor(envelope) : undefined,
                },
                new Date(this.now()),
            );
        }
        await this.gateway.Acknowledge({
            SubscriptionName: this.config.SubscriptionName,
            AckIds: [record.AckId],
        });
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
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(error, 'PubSub settle').message };
        }
    }
}
