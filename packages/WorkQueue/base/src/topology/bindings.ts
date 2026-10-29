import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { ExhaustionBehavior, FilterSupport, SubscriptionBinding, SubscriptionPolicy, TopicBinding } from '@memberjunction/work-queue-core';
import { ParseJsonObject } from '../entities/validation';
import type { SubscriptionRow, TopicRow, TransportRow } from './rows';

export interface TopologySnapshot {
    Transports: TransportRow[];
    Topics: TopicRow[];
    Subscriptions: SubscriptionRow[];
}

export interface ResolvedTopic {
    Topic: TopicRow;
    Transport: TransportRow;
    Binding: TopicBinding;
    Subscriptions: SubscriptionBinding[];
}

export function FindByName<T extends { Name: string }>(rows: T[], name: string): T | undefined {
    const wanted = name.trim().toLowerCase();
    return rows.find(r => r.Name.trim().toLowerCase() === wanted);
}

export function FindByID<T extends { ID: string }>(rows: T[], id: string): T | undefined {
    const wanted = NormalizeUUID(id);
    return rows.find(r => NormalizeUUID(r.ID) === wanted);
}

/** Binding convention: Config always carries the row ID (cloud drivers ignore it; the Database driver requires it). */
export function ToTopicBinding(topic: TopicRow): TopicBinding {
    return {
        TopicName: topic.Name,
        IsFifo: topic.IsFifo,
        MaxPayloadBytes: topic.MaxPayloadBytes,
        Config: { ...ParseJsonObject(topic.BindingConfig, `Topic ${topic.Name} BindingConfig`), TopicID: topic.ID },
    };
}

/**
 * Resolves a subscription's optional `ExhaustionBehavior` (`'DeadLetter' | 'Discard'`), reading an explicit
 * `ExhaustionBehavior` property first and falling back to `BindingConfig.ExhaustionBehavior` when configured in JSON.
 */
export function ResolveSubscriptionExhaustionBehavior(
    subscription: Pick<SubscriptionRow, 'Name' | 'BindingConfig'> & { ExhaustionBehavior?: ExhaustionBehavior | null },
): ExhaustionBehavior | undefined {
    if (subscription.ExhaustionBehavior !== undefined && subscription.ExhaustionBehavior !== null) {
        if (subscription.ExhaustionBehavior !== 'DeadLetter' && subscription.ExhaustionBehavior !== 'Discard') {
            throw new WorkQueueConfigurationError(
                `Subscription '${subscription.Name}' has invalid ExhaustionBehavior '${String(subscription.ExhaustionBehavior)}'`,
            );
        }
        return subscription.ExhaustionBehavior;
    }
    if (typeof subscription.BindingConfig === 'string' && subscription.BindingConfig.trim() !== '') {
        const parsed = ParseJsonObject(subscription.BindingConfig, `Subscription ${subscription.Name} BindingConfig`);
        const raw = parsed.ExhaustionBehavior;
        if (raw === undefined) {
            return undefined;
        }
        if (raw === 'DeadLetter' || raw === 'Discard') {
            return raw;
        }
        throw new WorkQueueConfigurationError(
            `Subscription '${subscription.Name}' BindingConfig.ExhaustionBehavior must be 'DeadLetter' or 'Discard'`,
        );
    }
    return undefined;
}

export function ToSubscriptionPolicy(subscription: SubscriptionRow, topic: TopicRow): SubscriptionPolicy {
    const policy: SubscriptionPolicy = {
        SubscriptionName: subscription.Name,
        TopicName: topic.Name,
        PartitionMode: subscription.PartitionMode,
        MaxAttempts: subscription.MaxAttempts,
        BackoffBaseSeconds: subscription.BackoffBaseSeconds,
        BackoffMaxSeconds: subscription.BackoffMaxSeconds,
        LeaseSeconds: subscription.LeaseSeconds,
        HeartbeatMode: subscription.HeartbeatMode,
    };
    if (subscription.MaxProcessingSeconds !== null) {
        policy.MaxProcessingSeconds = subscription.MaxProcessingSeconds;
    }
    const exhaustionBehavior = ResolveSubscriptionExhaustionBehavior(subscription);
    if (exhaustionBehavior !== undefined) {
        policy.ExhaustionBehavior = exhaustionBehavior;
    }
    return policy;
}

/**
 * `support` defaults to the queue-wide subset (03 §4.1) so callers that only need the shape need not know the
 * transport. `ValidateTopologyRows` passes the transport's own `FilterSupport` to catch filters a broker cannot express.
 */
export function ToSubscriptionBinding(subscription: SubscriptionRow, topic: TopicRow,
                                      support: FilterSupport = WORK_QUEUE_FILTER_SUPPORT): SubscriptionBinding {
    return {
        Policy: ToSubscriptionPolicy(subscription, topic),
        Filter: ParseSubscriptionFilter(subscription.Filter, support),
        HostType: subscription.HostType,
        Config: {
            ...ParseJsonObject(subscription.BindingConfig, `Subscription ${subscription.Name} BindingConfig`),
            SubscriptionID: subscription.ID,
            TopicID: topic.ID,
        },
    };
}

/** Resolves a topic for publishing. Throws WorkQueueConfigurationError when its transport or a subscription is misconfigured. */
export function ResolveTopic(snapshot: TopologySnapshot, topicName: string): ResolvedTopic | undefined {
    const topic = FindByName(snapshot.Topics, topicName);
    if (!topic) {
        return undefined;
    }
    const transport = FindByID(snapshot.Transports, topic.TransportID);
    if (!transport) {
        throw new WorkQueueConfigurationError(`Topic '${topic.Name}' references a transport that does not exist`);
    }
    const subscriptions = snapshot.Subscriptions
        .filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled')
        .map(s => ToSubscriptionBinding(s, topic));
    return { Topic: topic, Transport: transport, Binding: ToTopicBinding(topic), Subscriptions: subscriptions };
}
