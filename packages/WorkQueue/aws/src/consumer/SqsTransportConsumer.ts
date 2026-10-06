import type {
    ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkMessage, WorkProgress,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig, type AwsSubscriptionConfig } from '../config';
import { RECEIVE_GUARD_MARGIN } from '../margins';
import { ParseEnvelopeBody } from '../envelope';
import { ToGatewayError } from '../gateway/errors';
import type { SqsGateway, SqsReceivedMessage } from '../gateway/SqsGateway';
import { REPLAY_ATTRIBUTE, SendToDeadLetterQueue } from './deadLetter';

export const SQS_MAX_INVISIBLE_SECONDS = 43200;
export const SQS_STANDARD_MAX_BATCH = 10;

export interface SqsConsumerOptions {
    /** Clock, epoch ms. Defaults to Date.now. */
    Now?: () => number;
    /** Called when one received message could not be adopted (it stays on the queue and is redelivered). */
    OnAdoptError?: (message: SqsReceivedMessage, error: Error) => void;
}

interface Tracked {
    Raw: SqsReceivedMessage;
    ReceivedAt: number;
}

export class SqsTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly config: AwsSubscriptionConfig;
    private readonly now: () => number;
    private readonly onAdoptError: (message: SqsReceivedMessage, error: Error) => void;
    private readonly tracked = new Map<string, Tracked>();

    constructor(private readonly gateway: SqsGateway, private readonly binding: SubscriptionBinding, options: SqsConsumerOptions = {}) {
        this.config = ReadAwsSubscriptionConfig(binding.Config);
        this.now = options.Now ?? Date.now;
        this.onAdoptError = options.OnAdoptError ?? (() => undefined);
    }

    public get TrackedCount(): number {
        return this.tracked.size;
    }

    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        const messages = this.config.IsFifo
            ? await this.receiveOnePerCall(max, waitSeconds, signal)
            : await this.receiveCall(Math.min(Math.max(max, 1), SQS_STANDARD_MAX_BATCH), waitSeconds, signal);
        const deliveries: ReceivedDelivery<TPayload>[] = [];
        for (const message of messages) {
            try {
                const delivery = await this.Adopt(message);
                if (delivery) {
                    deliveries.push(delivery);
                }
            } catch (error) {
                // One message failing to adopt must not lose the ones already adopted: it was not deleted,
                // so SQS redelivers it after its visibility timeout (and the redrive policy is the backstop).
                this.onAdoptError(message, ToGatewayError(error, 'SQS adopt'));
            }
        }
        return deliveries;
    }

    /** Turns a received SQS message into a delivery; poison and crash-looping messages are dead-lettered and yield null. */
    public async Adopt(message: SqsReceivedMessage): Promise<ReceivedDelivery<TPayload> | null> {
        const envelope = ParseEnvelopeBody(message.Body);
        if (envelope === null) {
            await this.deadLetterAndDelete(message, 'InvalidEnvelope', 'Body is not a work-queue envelope');
            return null;
        }
        if (message.ReceiveCount > this.binding.Policy.MaxAttempts + RECEIVE_GUARD_MARGIN) {
            await this.deadLetterAndDelete(message, 'MaxAttemptsExceeded', `Received ${message.ReceiveCount} times without being settled`);
            return null;
        }
        const receivedAt = this.now();
        this.tracked.set(message.MessageId, { Raw: message, ReceivedAt: receivedAt });
        return {
            // Trust boundary: the envelope shape is validated; the payload's shape is the handler's to validate.
            Message: envelope as WorkMessage<TPayload>,
            DeliveryID: message.MessageId,
            LeaseToken: message.ReceiptHandle,
            Attempt: message.ReceiveCount,
            IsReplay: message.Attributes[REPLAY_ATTRIBUTE] === '1',
            LeaseExpiresAt: new Date(receivedAt + this.binding.Policy.LeaseSeconds * 1000),
        };
    }

    /** Throws on a retryable SQS error: the runtime retries on its next heartbeat tick (03 §3.2). Never 'Cancelled'. */
    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, _progress?: WorkProgress): Promise<LeaseExtension> {
        const seconds = Math.min(leaseSeconds, this.windowLeftSeconds(delivery));
        if (seconds <= 0) {
            return 'Lost';
        }
        try {
            return (await this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, seconds)) ? 'Held' : 'Lost';
        } catch (error) {
            const mapped = ToGatewayError(error, 'SQS ChangeMessageVisibility');
            if (mapped.Retryable) {
                throw mapped;
            }
            return 'Lost';
        }
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Completed', () => this.gateway.Delete(this.config.QueueUrl, delivery.LeaseToken));
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, _error: string): Promise<SettleResult> {
        const seconds = Math.max(0, Math.min(Math.ceil(delaySeconds), this.windowLeftSeconds(delivery)));
        return this.settle(delivery, 'Pending', () => this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, seconds));
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        const tracked = this.tracked.get(delivery.DeliveryID);
        if (!tracked) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: 'Delivery is not tracked by this consumer' };
        }
        try {
            await SendToDeadLetterQueue(this.gateway, this.config, { Message: tracked.Raw, Reason: reason, Error: error, Attempts: delivery.Attempt }, new Date(this.now()));
        } catch (sendError) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(sendError, 'SQS SendMessage').message };
        }
        return this.settle(delivery, 'DeadLettered', () => this.gateway.Delete(this.config.QueueUrl, delivery.LeaseToken));
    }

    /** Visibility 0. SQS has already counted this receive; the receive margins (Task 4) absorb it. */
    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settle(delivery, 'Pending', () => this.gateway.ChangeVisibility(this.config.QueueUrl, delivery.LeaseToken, 0));
    }

    /** CancelInFlight is false on this transport: there is no cancel flag to acknowledge (03 §5). */
    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.tracked.clear();
    }

    /** FIFO: parallel single-message receives. SQS's group lock makes them return different keys (03 §5.1, F5). */
    private async receiveOnePerCall(max: number, waitSeconds: number, signal: AbortSignal): Promise<SqsReceivedMessage[]> {
        const calls = Math.min(Math.max(max, 1), SQS_STANDARD_MAX_BATCH);
        const settled = await Promise.allSettled(Array.from({ length: calls }, () => this.receiveCall(1, waitSeconds, signal)));
        const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failures.length === calls) {
            throw ToGatewayError(failures[0].reason, 'SQS ReceiveMessage');
        }
        return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    }

    private receiveCall(maxMessages: number, waitSeconds: number, signal: AbortSignal): Promise<SqsReceivedMessage[]> {
        return this.gateway.Receive({
            QueueUrl: this.config.QueueUrl, MaxMessages: maxMessages, WaitTimeSeconds: waitSeconds,
            VisibilityTimeoutSeconds: this.binding.Policy.LeaseSeconds, Signal: signal,
        });
    }

    private windowLeftSeconds(delivery: ReceivedDelivery<TPayload>): number {
        const receivedAt = this.tracked.get(delivery.DeliveryID)?.ReceivedAt ?? this.now();
        return SQS_MAX_INVISIBLE_SECONDS - Math.floor((this.now() - receivedAt) / 1000);
    }

    private async settle(delivery: ReceivedDelivery<TPayload>, status: 'Completed' | 'Pending' | 'DeadLettered', write: () => Promise<boolean>): Promise<SettleResult> {
        try {
            const owned = await write();
            this.tracked.delete(delivery.DeliveryID);
            return owned
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ToGatewayError(error, 'SQS settle').message };
        }
    }

    private async deadLetterAndDelete(message: SqsReceivedMessage, reason: string, error: string): Promise<void> {
        await SendToDeadLetterQueue(this.gateway, this.config, { Message: message, Reason: reason, Error: error, Attempts: message.ReceiveCount }, new Date(this.now()));
        await this.gateway.Delete(this.config.QueueUrl, message.ReceiptHandle);
    }
}
