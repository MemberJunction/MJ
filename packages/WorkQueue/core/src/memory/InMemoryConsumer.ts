import type { WorkJson } from '../envelope';
import type { WorkProgress } from '../handler';
import type { ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding } from '../transport';
import type { InMemoryStore } from './InMemoryStore';

export class InMemoryConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    constructor(
        private readonly store: InMemoryStore,
        private readonly binding: SubscriptionBinding,
    ) {
        store.RegisterBinding(binding);
    }

    public async Receive(max: number, _waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        if (signal.aborted) {
            return [];
        }
        // Like every transport, the in-memory store cannot verify that payloads match TPayload.
        return this.store.Claim(this.binding, max) as ReceivedDelivery<TPayload>[];
    }

    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension> {
        return this.store.ExtendLease(delivery, leaseSeconds, progress);
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.store.Complete(delivery);
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult> {
        return this.store.Retry(delivery, delaySeconds, error);
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        return this.store.DeadLetter(delivery, reason, error);
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.store.Release(delivery);
    }

    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.store.AcknowledgeCancel(delivery);
    }

    public async Close(): Promise<void> {
        return;
    }
}
