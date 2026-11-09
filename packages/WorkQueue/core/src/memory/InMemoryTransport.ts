import type { WorkJson, WorkMessage } from '../envelope';
import { WORK_QUEUE_FILTER_SUPPORT } from '../filter';
import type { ITransportOperator } from '../operator';
import type { PublishResult } from '../publishing';
import type {
    BindingValidationIssue,
    DatabasePublishOptions,
    ITransportConsumer,
    ITransportDriver,
    SubscriptionBinding,
    TopicBinding,
    TransportCapabilities,
} from '../transport';
import { InMemoryConsumer } from './InMemoryConsumer';
import { InMemoryOperator } from './InMemoryOperator';
import { InMemoryStore } from './InMemoryStore';
import type { InMemoryDeliverySnapshot } from './InMemoryStore';

/** Identical to the Database transport's capabilities, so it can stand in for it in tests. */
export const IN_MEMORY_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    Filters: WORK_QUEUE_FILTER_SUPPORT,
    DetectsMessageIDDuplicates: true,
    PersistsProgress: true,
    SupportsOrdered: true,
    SupportsExternalHosts: false,
    CancelPending: true,
    CancelInFlight: true,
    ListPartitions: true,
    PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true,
    CompletedCounts: true,
    MaxRetryDelaySeconds: 2147483647,
};

export interface InMemoryTransportOptions {
    Now?: () => number;
    NewId?: () => string;
}

/** Reference transport with full Database-transport semantics, held in process memory. */
export class InMemoryTransport implements ITransportDriver {
    public readonly Name = 'InMemory';
    public readonly Capabilities: TransportCapabilities = IN_MEMORY_TRANSPORT_CAPABILITIES;
    private readonly store: InMemoryStore;

    constructor(options: InMemoryTransportOptions = {}) {
        this.store = new InMemoryStore(options.Now ?? (() => Date.now()), options.NewId ?? (() => crypto.randomUUID()));
    }

    public async Publish(
        topic: TopicBinding,
        messages: WorkMessage[],
        subscriptions: SubscriptionBinding[],
        _opts?: DatabasePublishOptions,
    ): Promise<PublishResult[]> {
        return this.store.Publish(topic, messages, subscriptions);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new InMemoryConsumer<TPayload>(this.store, subscription);
    }

    public Operator(): ITransportOperator {
        return new InMemoryOperator(this.store);
    }

    public async ValidateBindings(_topic: TopicBinding, _subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return [];
    }

    /** Expire leases everywhere (the sweeper's job). */
    public RunSweep(): { ExpiredLeases: number } {
        return this.store.RunSweep();
    }

    /** Test/diagnostic view of one subscription's deliveries, in claim order. */
    public Snapshot(subscriptionName: string): InMemoryDeliverySnapshot[] {
        return this.store.Snapshot(subscriptionName);
    }
}
