import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Outcome } from '@memberjunction/work-queue-core';
import type {
    BindingValidationIssue, FilterSupport, ITransportConsumer, ITransportDriver, ITransportOperator, LeaseExtension, PublishResult,
    ReceivedDelivery, SettleResult, SubscriptionBinding, SubscriptionPolicy, TopicBinding, TransportCapabilities,
    WorkContext, WorkJson, WorkLogger, WorkMessage, WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import type { WorkQueueHostEngine } from '../host/HostedSubscriptionPlanner';
import type { HostRuntime, HostRuntimeArgs } from '../host/WorkQueueHost';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export const TEST_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', Email: 'system@memberjunction.org' } as UserInfo;
export const TEST_PROVIDER = { Name: 'test-provider' } as unknown as IMetadataProvider;

export function MakeMessage(overrides: Partial<WorkMessage> = {}): WorkMessage {
    return {
        MessageID: 'BBBBBBBB-2222-4222-8222-000000000001',
        Topic: 'test.topic',
        Attributes: {},
        PublishedAt: '2026-09-16T12:00:00.000Z',
        ...overrides,
    };
}

export function MakeContext(overrides: Partial<WorkContext> = {}): WorkContext {
    return {
        SubscriptionName: 'test.subscription',
        DeliveryID: 'CCCCCCCC-3333-4333-8333-000000000001',
        Attempt: 1,
        MaxAttempts: 5,
        IsReplay: false,
        Signal: new AbortController().signal,
        Heartbeat: async () => true,
        Log: new SilentLogger(),
        ...overrides,
    };
}

/** Collects log lines instead of printing them. */
export class SilentLogger implements WorkLogger {
    public readonly Lines: string[] = [];

    public Info(message: string, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`info:${message}`);
    }

    public Warn(message: string, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`warn:${message}`);
    }

    public Error(message: string, error?: Error, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`error:${message}${error ? `:${error.message}` : ''}`);
    }
}

/** Mirrors plan 05's DATABASE_TRANSPORT_CAPABILITIES (03 §4.1, §5). Keep both in step. */
const QUEUE_FILTER_SUPPORT: FilterSupport = {
    Operators: ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'], SingleFieldOrGroups: true, MaxFields: 5, MaxValues: 50,
};

export const DATABASE_CAPABILITIES: TransportCapabilities = {
    Filters: QUEUE_FILTER_SUPPORT, DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true,
    SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true, CompletedCounts: true, MaxRetryDelaySeconds: 2147483647,
};

export const AWS_CAPABILITIES: TransportCapabilities = {
    Filters: QUEUE_FILTER_SUPPORT, DetectsMessageIDDuplicates: false, PersistsProgress: false, SupportsOrdered: false,
    SupportsExternalHosts: true, CancelPending: false, CancelInFlight: false, ListPartitions: false, PeekDeadLetters: 'BestEffort',
    ReplaySingleDeadLetter: true, CompletedCounts: false, MaxRetryDelaySeconds: 43200,
};

export const IDS = {
    DatabaseTransport: '10000000-0000-4000-8000-000000000001',
    AwsTransport: '10000000-0000-4000-8000-000000000002',
    EmailTopic: '20000000-0000-4000-8000-000000000001',
    IntegrationTopic: '20000000-0000-4000-8000-000000000002',
    IntegrationSubscription: '30000000-0000-4000-8000-000000000004',
    UnknownSubscription: '30000000-0000-4000-8000-0000000000ff',
    DeliveryA: '40000000-0000-4000-8000-000000000001',
    DeliveryB: '40000000-0000-4000-8000-000000000002',
} as const;

interface FakeTransportFields { ID: string; Name: string; DriverClass: string; Status?: 'Active' | 'Disabled' }
interface FakeTopicFields { ID: string; Name: string; TransportID: string; Status?: 'Active' | 'Disabled' }
interface FakeSubscriptionFields {
    ID: string;
    Name: string;
    TopicID: string;
    HostType?: 'MJWorker' | 'External';
    HandlerKey?: string | null;
    Status?: 'Active' | 'Paused' | 'Disabled';
    PartitionMode?: 'None' | 'Exclusive' | 'Ordered';
    LeaseSeconds?: number;
}

export function FakeTransport(fields: FakeTransportFields): MJWorkQueueTransportEntity {
    return { Status: 'Active', ...fields } as unknown as MJWorkQueueTransportEntity;
}

export function FakeTopic(fields: FakeTopicFields): MJWorkQueueTopicEntity {
    return { Status: 'Active', AllowExternalPublish: false, RetentionDays: 7, ...fields } as unknown as MJWorkQueueTopicEntity;
}

export function FakeSubscription(fields: FakeSubscriptionFields): MJWorkQueueSubscriptionEntity {
    return {
        HostType: 'MJWorker', HandlerKey: 'handler.ok', Status: 'Active', PartitionMode: 'None', MaxAttempts: 5,
        BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto',
        ...fields,
    } as unknown as MJWorkQueueSubscriptionEntity;
}

/** A consumer that never receives anything and settles whatever it is given. Counts Close() calls. */
export class InertConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    public Closed = 0;

    public async Receive(): Promise<ReceivedDelivery<TPayload>[]> {
        return [];
    }

    public async ExtendLease(): Promise<LeaseExtension> {
        return 'Held';
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' };
    }

    public async Retry(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'DeadLettered' };
    }

    public async Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Pending' };
    }

    public async AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.Closed++;
    }
}

export class FakeTransportDriver implements ITransportDriver {
    public readonly OpenedBindings: SubscriptionBinding[] = [];
    public readonly OpenedConsumers: InertConsumer[] = [];
    public OpenError: Error | null = null;

    constructor(public readonly Name: string, public readonly Capabilities: TransportCapabilities) {}

    public async Publish(): Promise<PublishResult[]> {
        throw new Error('FakeTransportDriver.Publish is not used by host tests');
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        if (this.OpenError) {
            throw this.OpenError;
        }
        this.OpenedBindings.push(subscription);
        const consumer = new InertConsumer<TPayload>();
        this.OpenedConsumers.push(consumer as unknown as InertConsumer);
        return consumer;
    }

    public Operator(): ITransportOperator {
        throw new Error('FakeTransportDriver.Operator is not used by host tests');
    }

    public async ValidateBindings(_topic: TopicBinding, _subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return [];
    }
}

export class FakeHostEngine implements WorkQueueHostEngine {
    public Transports: MJWorkQueueTransportEntity[] = [];
    public Topics: MJWorkQueueTopicEntity[] = [];
    public Subscriptions: MJWorkQueueSubscriptionEntity[] = [];
    public readonly Drivers = new Map<string, ITransportDriver>();
    public readonly DriverErrors = new Map<string, Error>();
    public GetDriverCalls = 0;
    /** Dead-letter events the sweeper raised through the engine (03 §11). */
    public readonly DeadLettered: DeadLetteredEvent[] = [];
    private readonly listeners = new Set<(topicName: string) => void>();

    public NotifyDeadLettered(event: DeadLetteredEvent): void {
        this.DeadLettered.push(event);
    }

    public async GetDriver(transportID: string): Promise<ITransportDriver> {
        this.GetDriverCalls++;
        const error = this.DriverErrors.get(transportID);
        if (error) {
            throw error;
        }
        const driver = this.Drivers.get(transportID);
        if (!driver) {
            throw new Error(`No fake driver for transport ${transportID}`);
        }
        return driver;
    }

    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding {
        const topic = this.Topics.find(t => UUIDsEqual(t.ID, subscription.TopicID));
        const policy: SubscriptionPolicy = {
            SubscriptionName: subscription.Name,
            TopicName: topic?.Name ?? 'unknown',
            PartitionMode: subscription.PartitionMode,
            MaxAttempts: subscription.MaxAttempts,
            BackoffBaseSeconds: subscription.BackoffBaseSeconds,
            BackoffMaxSeconds: subscription.BackoffMaxSeconds,
            LeaseSeconds: subscription.LeaseSeconds,
            HeartbeatMode: subscription.HeartbeatMode,
        };
        // Filter: null matches everything (03 §4). Real bindings carry MJ CompositeFilterDescriptor JSON parsed by
        // WorkQueueEngineBase.ParseFilter; the host never inspects it, so the fakes leave it null.
        return { Policy: policy, Filter: null, HostType: subscription.HostType, Config: {} };
    }

    public OnPublished(listener: (topicName: string) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public EmitPublished(topicName: string): void {
        for (const listener of this.listeners) {
            listener(topicName);
        }
    }

    public get ListenerCount(): number {
        return this.listeners.size;
    }

    public Subscription(name: string): MJWorkQueueSubscriptionEntity {
        const subscription = this.Subscriptions.find(s => s.Name === name);
        if (!subscription) {
            throw new Error(`No fake subscription ${name}`);
        }
        return subscription;
    }
}

/** Completes every delivery and remembers who it was bound to. Counts constructions. */
export class RecordingWorkHandler extends BaseWorkHandler {
    public static LastBoundUserID: string | null = null;
    public static Constructed = 0;

    constructor() {
        super();
        RecordingWorkHandler.Constructed++;
    }

    public async Handle(): Promise<WorkOutcome> {
        RecordingWorkHandler.LastBoundUserID = this.ContextUser.ID;
        return Outcome.Complete();
    }
}

export function TestHandlerResolver(handlerKey: string): BaseWorkHandler | null {
    return handlerKey === 'handler.ok' ? new RecordingWorkHandler() : null;
}

/** Registration probe for planner tests: answers without constructing a handler. */
export function TestHandlerProbe(handlerKey: string): boolean {
    return handlerKey === 'handler.ok';
}

export interface HostScenario {
    Engine: FakeHostEngine;
    DatabaseDriver: FakeTransportDriver;
    AwsDriver: FakeTransportDriver;
}

/**
 * Two transports, two topics and six subscriptions covering every planning outcome:
 * email.subscriber-update (AWS, Exclusive, runnable) · email.dashboard (External) ·
 * email.ordered (AWS, Ordered → Unsupported: Ordered requires the Database transport) ·
 * integration.apply (Database, Ordered, runnable) · integration.audit (unregistered handler) ·
 * integration.paused (Paused).
 */
export function BuildHostScenario(): HostScenario {
    const engine = new FakeHostEngine();
    const databaseDriver = new FakeTransportDriver('Database', DATABASE_CAPABILITIES);
    const awsDriver = new FakeTransportDriver('AWS', AWS_CAPABILITIES);
    engine.Transports = [
        FakeTransport({ ID: IDS.DatabaseTransport, Name: 'Database', DriverClass: 'Database' }),
        FakeTransport({ ID: IDS.AwsTransport, Name: 'AWS-test', DriverClass: 'AWS' }),
    ];
    engine.Topics = [
        FakeTopic({ ID: IDS.EmailTopic, Name: 'email.events', TransportID: IDS.AwsTransport }),
        FakeTopic({ ID: IDS.IntegrationTopic, Name: 'integration.batch-ready', TransportID: IDS.DatabaseTransport }),
    ];
    engine.Subscriptions = [
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000001', Name: 'email.subscriber-update', TopicID: IDS.EmailTopic, PartitionMode: 'Exclusive' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000002', Name: 'email.dashboard', TopicID: IDS.EmailTopic, HostType: 'External', HandlerKey: null }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000003', Name: 'email.ordered', TopicID: IDS.EmailTopic, PartitionMode: 'Ordered' }),
        FakeSubscription({ ID: IDS.IntegrationSubscription, Name: 'integration.apply', TopicID: IDS.IntegrationTopic, PartitionMode: 'Ordered' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000005', Name: 'integration.audit', TopicID: IDS.IntegrationTopic, HandlerKey: 'handler.missing' }),
        FakeSubscription({ ID: '30000000-0000-4000-8000-000000000006', Name: 'integration.paused', TopicID: IDS.IntegrationTopic, Status: 'Paused' }),
    ];
    engine.Drivers.set(IDS.DatabaseTransport, databaseDriver);
    engine.Drivers.set(IDS.AwsTransport, awsDriver);
    return { Engine: engine, DatabaseDriver: databaseDriver, AwsDriver: awsDriver };
}

export class FakeRuntime implements HostRuntime {
    public Started = 0;
    public Stopped = 0;
    public Kicks = 0;
    public InFlightCount = 0;
    /** When set, Stop() waits for it — lets a test hold a shutdown open. */
    public StopGate: Promise<void> | null = null;

    constructor(public readonly Args: HostRuntimeArgs) {}

    public Start(): void {
        this.Started++;
    }

    public async Stop(): Promise<void> {
        this.Stopped++;
        if (this.StopGate) {
            await this.StopGate;
        }
    }

    public Kick(): void {
        this.Kicks++;
    }

    public get SubscriptionName(): string {
        return this.Args.Policy.SubscriptionName;
    }
}
