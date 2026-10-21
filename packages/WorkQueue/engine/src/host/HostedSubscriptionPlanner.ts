import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { SubscriptionUnsupportedReason } from '@memberjunction/work-queue-core';
import type { ITransportDriver, SubscriptionBinding } from '@memberjunction/work-queue-core';
import type { WorkHandlerProbe } from '../handlers/ResolveWorkHandler';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error';

export interface HostSubscriptionRequest {
    /** Subscription name, or '*' for every MJWorker subscription. */
    Name: string;
    Concurrency: number;
}

/**
 * The structural subset of the server `WorkQueueEngine` this host needs; `WorkQueueEngine` satisfies it. The metadata
 * members are proxies the server engine forwards to `WorkQueueEngineBase` (03 §11), so the base/engine split is
 * invisible to the host.
 */
export interface WorkQueueHostEngine {
    readonly Transports: MJWorkQueueTransportEntity[];
    readonly Topics: MJWorkQueueTopicEntity[];
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    /** One cached driver instance per transport (03 §11). */
    GetDriver(transportID: string): Promise<ITransportDriver>;
    BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
    OnPublished(listener: (topicName: string) => void): () => void;
    /** Raises a dead-letter event to the engine's OnDeadLettered listeners (03 §11); the sweeper calls it. */
    NotifyDeadLettered(event: DeadLetteredEvent): void;
}

export interface ExpandedSubscriptionRequest {
    Name: string;
    Concurrency: number;
    Subscription: MJWorkQueueSubscriptionEntity | null;
}

export interface RunnableSubscriptionPlan {
    Kind: 'Runnable';
    Name: string;
    Concurrency: number;
    Subscription: MJWorkQueueSubscriptionEntity;
    Topic: MJWorkQueueTopicEntity;
    Transport: MJWorkQueueTransportEntity;
    Binding: SubscriptionBinding;
    ConsumerDriver: ITransportDriver;
    HandlerKey: string;
    /** Changes whenever anything that shapes the runtime changes; the host restarts on a change. */
    Signature: string;
}

export interface BlockedSubscriptionPlan {
    Kind: 'Blocked';
    Name: string;
    State: Exclude<HostedSubscriptionState, 'Running'>;
    Reason: string;
}

export type HostedSubscriptionPlan = RunnableSubscriptionPlan | BlockedSubscriptionPlan;

/** '*' expands to every MJWorker subscription (any status) at the wildcard's concurrency; explicit entries override. */
export function ExpandSubscriptionRequests(requests: HostSubscriptionRequest[], engine: WorkQueueHostEngine): ExpandedSubscriptionRequest[] {
    const byName = new Map<string, ExpandedSubscriptionRequest>();
    const wildcard = requests.find(r => r.Name.trim() === '*');
    if (wildcard) {
        for (const subscription of engine.Subscriptions.filter(s => s.HostType === 'MJWorker')) {
            byName.set(Key(subscription.Name), { Name: subscription.Name, Concurrency: wildcard.Concurrency, Subscription: subscription });
        }
    }
    for (const request of requests) {
        const name = request.Name.trim();
        if (name === '*') {
            continue;
        }
        const subscription = engine.Subscriptions.find(s => Key(s.Name) === Key(name)) ?? null;
        byName.set(Key(name), { Name: subscription?.Name ?? name, Concurrency: request.Concurrency, Subscription: subscription });
    }
    return [...byName.values()].sort((a, b) => a.Name.localeCompare(b.Name));
}

/**
 * Decides, per requested subscription, whether this host may run it (03 §11): host type, row status, driver
 * availability, capability gating through core's SubscriptionUnsupportedReason, and handler registration. Runs on
 * every reconcile, so it never constructs a handler.
 */
export async function PlanHostedSubscriptions(
    requests: HostSubscriptionRequest[],
    engine: WorkQueueHostEngine,
    handlerRegistered: WorkHandlerProbe,
): Promise<HostedSubscriptionPlan[]> {
    const plans: HostedSubscriptionPlan[] = [];
    for (const request of ExpandSubscriptionRequests(requests, engine)) {
        plans.push(await PlanOne(request, engine, handlerRegistered));
    }
    return plans;
}

async function PlanOne(
    request: ExpandedSubscriptionRequest,
    engine: WorkQueueHostEngine,
    handlerRegistered: WorkHandlerProbe,
): Promise<HostedSubscriptionPlan> {
    const subscription = request.Subscription;
    if (!subscription) {
        return Blocked(request.Name, 'Error', `Subscription '${request.Name}' not found`);
    }
    if (subscription.HostType !== 'MJWorker') {
        return Blocked(subscription.Name, 'Unsupported', `HostType '${subscription.HostType}' subscriptions run outside MJ`);
    }
    const topic = engine.Topics.find(t => UUIDsEqual(t.ID, subscription.TopicID));
    if (!topic) {
        return Blocked(subscription.Name, 'Error', `Topic ${subscription.TopicID} for subscription '${subscription.Name}' not found`);
    }
    const transport = engine.Transports.find(t => UUIDsEqual(t.ID, topic.TransportID));
    if (!transport) {
        return Blocked(subscription.Name, 'Error', `Transport ${topic.TransportID} for topic '${topic.Name}' not found`);
    }
    const paused = PausedBecause(subscription, topic, transport);
    if (paused) {
        return Blocked(subscription.Name, 'Paused', paused);
    }
    return PlanActive(request, subscription, topic, transport, engine, handlerRegistered);
}

async function PlanActive(
    request: ExpandedSubscriptionRequest,
    subscription: MJWorkQueueSubscriptionEntity,
    topic: MJWorkQueueTopicEntity,
    transport: MJWorkQueueTransportEntity,
    engine: WorkQueueHostEngine,
    handlerRegistered: WorkHandlerProbe,
): Promise<HostedSubscriptionPlan> {
    let driver: ITransportDriver;
    try {
        driver = await engine.GetDriver(transport.ID);
    } catch (error) {
        return Blocked(subscription.Name, 'Error', `Transport driver unavailable: ${Describe(error)}`);
    }
    const binding = engine.BuildSubscriptionBinding(subscription);
    const unsupported = SubscriptionUnsupportedReason(binding, driver.Capabilities);
    if (unsupported) {
        return Blocked(subscription.Name, 'Unsupported', unsupported);
    }
    const handlerKey = subscription.HandlerKey?.trim() ?? '';
    if (handlerKey === '' || !handlerRegistered(handlerKey)) {
        return Blocked(subscription.Name, 'HandlerNotRegistered', `No BaseWorkHandler is registered for HandlerKey '${handlerKey || '(none)'}'`);
    }
    return {
        Kind: 'Runnable', Name: subscription.Name, Concurrency: request.Concurrency, Subscription: subscription, Topic: topic,
        Transport: transport, Binding: binding, ConsumerDriver: driver, HandlerKey: handlerKey,
        Signature: JSON.stringify([binding, handlerKey, transport.ID, request.Concurrency, driver.Name]),
    };
}

function PausedBecause(subscription: MJWorkQueueSubscriptionEntity, topic: MJWorkQueueTopicEntity, transport: MJWorkQueueTransportEntity): string | null {
    if (subscription.Status !== 'Active') {
        return `Subscription status is ${subscription.Status}`;
    }
    if (topic.Status !== 'Active') {
        return `Topic '${topic.Name}' is ${topic.Status}`;
    }
    if (transport.Status !== 'Active') {
        return `Transport '${transport.Name}' is ${transport.Status}`;
    }
    return null;
}

function Blocked(name: string, state: BlockedSubscriptionPlan['State'], reason: string): BlockedSubscriptionPlan {
    return { Kind: 'Blocked', Name: name, State: state, Reason: reason };
}

function Key(value: string): string {
    return value.trim().toLowerCase();
}

function Describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
